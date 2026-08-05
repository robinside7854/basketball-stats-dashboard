import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/admin'
import { canViewStats } from '@/lib/auth/guard'
import { fetchTeamCompetitions } from '@/lib/league/competitions'
import { scorePoints, fetchScoringRules } from '@/lib/stats/scoring'

// GET /api/leagues/[leagueId]/players/[playerId]/career
//
// "기본 분리 + 커리어 합산" 중 합산 쪽. 스탯 자체는 이미 league_id 로 스코프돼
// 리그 시즌과 대회 묶음이 자동으로 갈린다(공짜) — 이 라우트가 새로 하는 일은
// 같은 팀의 형제 묶음들을 돌며 "이 사람"의 기록을 찾아 더하는 것뿐이다.
//
// ⚠️ 선수 식별 한계 (컬럼을 새로 만들지 않고 이 시험 범위에서 감수하는 것):
//   league_players 는 묶음마다 별도 행이고, 사람을 잇는 컬럼이 없다(id/league_id/name/
//   number/position/... — person_id 류 없음, 2026-08-05 기준 실측 확인). 그래서 여기서는
//   (팀, 이름, 등번호) 조합으로 "같은 사람"을 추정한다. 팀은 fetchTeamCompetitions 가 이미
//   같은 team_id 로 묶어주므로 실질적으로 (이름, 등번호) 매칭이다.
//   깨지는 경우: ① 동명이인 + 같은 등번호 — 먼저 매칭된 행 하나만 잡혀 다른 사람 기록이
//   섞이거나 누락된다. ② 선수가 대회 묶음에서 등번호를 바꿔 등록됐다 — 다른 사람으로 보여
//   그 묶음 기록이 통산에서 빠진다. 영구 해법은 사람 단위 id(person_id) 도입이고, 이 시험이
//   성공한 뒤 별도로 설계한다(브리프 명시 — 여기서 컬럼을 만들지 않는다).
const SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post'] as const

type CompetitionSummary = { gp: number; pts: number; reb: number; ast: number }

// 한 묶음(competitionLeagueId) 안에서 (이름, 등번호) 로 매칭되는 선수를 찾아
// gp(경기수)·pts·reb·ast 를 집계한다. 매칭되는 행이 없으면 null.
//
// 이 집계는 선수카드 시즌 스탯(detail 라우트)만큼 정교하지 않다 — 분기 필터·순위·배지 등은
// 필요 없고 "통산 합계 4개 숫자"만 있으면 되므로 의도적으로 단순화했다. 득점만은 시즌 스탯과
// 동일하게 scorePoints() 단일 진실을 그대로 쓴다(용 리그마다 rules 가 다를 수 있어 하드코딩 금지).
async function summarizeInCompetition(
  sb: SupabaseClient,
  competitionLeagueId: string,
  name: string,
  number: number | null,
): Promise<CompetitionSummary | null> {
  let matchQuery = sb
    .from('league_players')
    .select('id, plus_one')
    .eq('league_id', competitionLeagueId)
    .eq('name', name)
  matchQuery = number === null ? matchQuery.is('number', null) : matchQuery.eq('number', number)
  const { data: matches, error: matchErr } = await matchQuery
  if (matchErr) {
    throw new Error(`league_players: leagueId=${competitionLeagueId} 이름·등번호 매칭 실패 — ${matchErr.message}`)
  }
  // 동명이인 + 동일 등번호가 있으면(위 주석의 한계 ①) 첫 행만 쓴다 — 매칭이 여럿이면
  // 어차피 어느 쪽이 "이 사람"인지 판별할 근거가 이 스키마에 없다.
  const matched = matches?.[0]
  if (!matched) return null

  const { data: games, error: gamesErr } = await sb
    .from('league_games')
    .select('id, plus_one_player_id')
    .eq('league_id', competitionLeagueId)
    .eq('is_started', true)
  if (gamesErr) {
    throw new Error(`league_games: leagueId=${competitionLeagueId} 조회 실패 — ${gamesErr.message}`)
  }
  const gameIds = (games ?? []).map(g => g.id as string)
  if (gameIds.length === 0) return { gp: 0, pts: 0, reb: 0, ast: 0 }

  const plusOneByGame: Record<string, string | null> = {}
  for (const g of games ?? []) plusOneByGame[g.id as string] = (g as { plus_one_player_id: string | null }).plus_one_player_id
  const defaultPlusOne = matched.plus_one === true

  const scoringRules = await fetchScoringRules(sb, competitionLeagueId)

  // 서버측 1000행 상한 우회 — detail 라우트와 동일한 페이지네이션 패턴.
  const CHUNK = 1000
  type EvRow = { league_game_id: string; type: string; result: string | null }
  const fetchPaged = async (
    build: (from: number, to: number) => PromiseLike<{ data: EvRow[] | null; error: { message: string } | null }>,
    label: string,
  ): Promise<EvRow[]> => {
    const out: EvRow[] = []
    for (let pg = 0; ; pg++) {
      const { data: chunk, error } = await build(pg * CHUNK, (pg + 1) * CHUNK - 1)
      if (error) throw new Error(`league_game_events: ${label} 조회 실패(leagueId=${competitionLeagueId}) — ${error.message}`)
      if (!chunk || chunk.length === 0) break
      out.push(...chunk)
      if (chunk.length < CHUNK) break
    }
    return out
  }

  const [ownEvents, assistEvents] = await Promise.all([
    fetchPaged((from, to) =>
      sb.from('league_game_events')
        .select('league_game_id, type, result')
        .in('league_game_id', gameIds)
        .eq('league_player_id', matched.id)
        .order('id', { ascending: true })
        .range(from, to),
      '본인 이벤트',
    ),
    fetchPaged((from, to) =>
      sb.from('league_game_events')
        .select('league_game_id, type, result')
        .in('league_game_id', gameIds)
        .eq('related_player_id', matched.id)
        .eq('result', 'made')
        .in('type', SHOT_TYPES)
        .order('id', { ascending: true })
        .range(from, to),
      '어시스트 이벤트',
    ),
  ])

  const gpSet = new Set<string>()
  let pts = 0
  let reb = 0
  for (const e of ownEvents) {
    if (e.type === 'sub_in' || e.type === 'sub_out') continue
    gpSet.add(e.league_game_id)
    const isPlusOne = plusOneByGame[e.league_game_id] != null
      ? plusOneByGame[e.league_game_id] === matched.id
      : defaultPlusOne
    pts += scorePoints(e.type, e.result, isPlusOne, scoringRules)
    if (e.type === 'oreb' || e.type === 'dreb') reb++
  }

  return { gp: gpSet.size, pts, reb, ast: assistEvents.length }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; playerId: string }> }
) {
  const { leagueId, playerId } = await params
  // 개인 스탯이므로 승인 회원 전용 — 이 코드베이스의 스탯 게이팅 정책(2026-07-28)을 그대로 따른다.
  if (!(await canViewStats(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }

  const sb = createClient()

  const { data: self, error: selfErr } = await sb
    .from('league_players')
    .select('name, number')
    .eq('id', playerId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (selfErr) throw new Error(`league_players: playerId=${playerId} 조회 실패 — ${selfErr.message}`)
  if (!self) return NextResponse.json({ error: 'player_not_found' }, { status: 404 })

  // 이 묶음이 속한 팀의 모든 묶음(자기 자신 포함) — Task 1 헬퍼 재사용.
  const competitions = await fetchTeamCompetitions(leagueId)

  const perCompetition = await Promise.all(
    competitions.map(async c => {
      const summary = await summarizeInCompetition(sb, c.id, self.name, self.number)
      if (!summary || summary.gp === 0) return null // 이 묶음엔 기록이 없다 — 통산에서 뺀다
      return {
        leagueId: c.id,
        slug: c.slug,
        name: c.name,
        mode: c.mode,
        seasonYear: c.season_year,
        ...summary,
      }
    })
  )
  const byCompetition = perCompetition.filter((c): c is NonNullable<typeof c> => c !== null)

  const career = byCompetition.reduce(
    (acc, c) => ({ gp: acc.gp + c.gp, pts: acc.pts + c.pts, reb: acc.reb + c.reb, ast: acc.ast + c.ast }),
    { gp: 0, pts: 0, reb: 0, ast: 0 },
  )

  return NextResponse.json({ competitions: byCompetition, career })
}
