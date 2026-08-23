import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/admin'
import { canViewStats } from '@/lib/auth/guard'
import { fetchTeamCompetitions } from '@/lib/league/competitions'
import { resolveTeamId } from '@/lib/league/teamScope'
import { scorePoints, fetchScoringRules, isPlusOneFor, type GamePlusOne } from '@/lib/stats/scoring'

// GET /api/leagues/[leagueId]/players/[playerId]/career
//
// "기본 분리 + 커리어 합산" 중 합산 쪽. 스탯 자체는 이미 league_id 로 스코프돼
// 리그 시즌과 대회 묶음이 자동으로 갈린다(공짜) — 이 라우트가 새로 하는 일은
// 같은 팀의 형제 묶음들을 돌며 "이 사람"의 기록을 찾아 더하는 것뿐이다.
//
// 예전엔 여기서 (이름, 등번호) 로 "같은 사람"을 추정했다 — league_players 가 묶음마다
// 별도 행이라 사람을 잇는 컬럼이 없었기 때문이다(person_id 류 없음). 이번 작업(3/3)이
// 명단을 팀 소유로 바꾸면서 그 전제가 사라졌다: 이제 league_players.id 자체가 팀 전체에서
// 같은 사람을 가리키는 단일 행이다 — league_game_events.league_player_id 는 어느 경기묶음의
// 이벤트든 항상 이 하나의 id 를 참조한다. 그래서 이름·등번호 매칭 대신 playerId 로 직접
// 이벤트를 찾는다 — 동명이인·등번호 변경에 흔들리지 않고 더 정확하다.
const SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post'] as const

type CompetitionSummary = { gp: number; pts: number; reb: number; ast: number }

// 한 묶음(competitionLeagueId) 안에서 이 선수(playerId)의 gp(경기수)·pts·reb·ast 를 집계한다.
// 이 묶음에 이 선수의 이벤트가 하나도 없으면 { gp: 0, ... } (통산에서 빠짐 — 호출부가 gp===0 을 거른다).
//
// 이 집계는 선수카드 시즌 스탯(detail 라우트)만큼 정교하지 않다 — 분기 필터·순위·배지 등은
// 필요 없고 "통산 합계 4개 숫자"만 있으면 되므로 의도적으로 단순화했다. 득점만은 시즌 스탯과
// 동일하게 scorePoints() 단일 진실을 그대로 쓴다(용 리그마다 rules 가 다를 수 있어 하드코딩 금지).
async function summarizeInCompetition(
  sb: SupabaseClient,
  competitionLeagueId: string,
  playerId: string,
  defaultPlusOne: boolean,
): Promise<CompetitionSummary> {
  const { data: games, error: gamesErr } = await sb
    .from('league_games')
    .select('id, plus_one_player_id, plus_one_extra_ids')
    .eq('league_id', competitionLeagueId)
    .eq('is_started', true)
  if (gamesErr) {
    throw new Error(`league_games: leagueId=${competitionLeagueId} 조회 실패 — ${gamesErr.message}`)
  }
  const gameIds = (games ?? []).map(g => g.id as string)
  if (gameIds.length === 0) return { gp: 0, pts: 0, reb: 0, ast: 0 }

  const plusOneByGame: Record<string, GamePlusOne> = {}
  for (const g of games ?? []) plusOneByGame[g.id as string] = g as GamePlusOne

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
        .eq('league_player_id', playerId)
        .order('id', { ascending: true })
        .range(from, to),
      '본인 이벤트',
    ),
    fetchPaged((from, to) =>
      sb.from('league_game_events')
        .select('league_game_id, type, result')
        .in('league_game_id', gameIds)
        .eq('related_player_id', playerId)
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
    const isPlusOne = isPlusOneFor(
      playerId,
      plusOneByGame[e.league_game_id],
      defaultPlusOne ? new Set([playerId]) : new Set<string>(),
    )
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

  // 명단은 팀 소유다 — league_id 로 확인하면 이 선수 행의 출생 league_id 가 지금 보는
  // leagueId 와 다를 때(예: 대회에서 리그 선수의 카드를 열 때) 항상 404 가 난다.
  const teamId = await resolveTeamId(leagueId)
  const { data: self, error: selfErr } = await sb
    .from('league_players')
    .select('name, number, plus_one')
    .eq('id', playerId)
    .eq('team_id', teamId)
    .maybeSingle()
  if (selfErr) throw new Error(`league_players: playerId=${playerId} 조회 실패 — ${selfErr.message}`)
  if (!self) return NextResponse.json({ error: 'player_not_found' }, { status: 404 })

  // 이 묶음이 속한 팀의 모든 묶음(자기 자신 포함) — Task 1 헬퍼 재사용.
  const competitions = await fetchTeamCompetitions(leagueId)
  const defaultPlusOne = self.plus_one === true

  const perCompetition = await Promise.all(
    competitions.map(async c => {
      const summary = await summarizeInCompetition(sb, c.id, playerId, defaultPlusOne)
      if (summary.gp === 0) return null // 이 묶음엔 기록이 없다 — 통산에서 뺀다
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
