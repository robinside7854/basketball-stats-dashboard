import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canViewLeague } from '@/lib/auth/guard'
import { resolveTeamId } from '@/lib/league/teamScope'
import { loadIdentityResolver } from '@/lib/stats/teamIdentity'
import { scorePoints, fetchScoringRules, isPlusOneFor, type GamePlusOne } from '@/lib/stats/scoring'
import { emptyBoxLine, applyEventToBoxLine, isAssistEvent, addBoxLine, type BoxLine } from '@/lib/stats/boxLine'

/**
 * GET /api/leagues/[leagueId]/head-to-head?quarterId=<id|all>
 *
 * 누적 맞대결 (2026-10-10) — 날짜별 박스스코어의 「팀별 비교」를 분기·시즌 단위로 쌓은 것.
 * 두 팀이 **실제로 맞붙은 경기만** 모아 팀 합계와 전적을 낸다.
 *
 * - 마감(is_complete) + 정규전만. 친선전은 집계 제외 원칙 그대로.
 * - 팀은 `(team_id, quarter_id)` 정체성으로 묶는다(teamIdentity.ts). 미라클은 분기마다 팀이 바뀌므로
 *   「전체」에서 3분기 굿모닝과 1분기 락다운이 같은 team_id 라도 다른 팀으로 갈린다.
 * - 이벤트의 팀은 **이 경기의 두 팀 중 하나**로 고른다: 이벤트 team_id → 경기 한정 배정 → 분기 소속
 *   (daily-boxscore 와 같은 원칙 — 무관한 팀이 박히면 그 기록이 통째로 사라진다).
 * - 한 줄 누적·득점 규칙은 boxLine.ts / scoring.ts 공용.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const quarterId = new URL(req.url).searchParams.get('quarterId')
  const supabase = createClient()

  let gq = supabase
    .from('league_games')
    .select('id, date, home_team_id, away_team_id, home_score, away_score, quarter_id, plus_one_player_id, plus_one_extra_ids, plus_one_quarters')
    .eq('league_id', leagueId)
    .eq('is_complete', true)
    .eq('is_exhibition', false)
    .not('home_team_id', 'is', null)
    .not('away_team_id', 'is', null)
  if (quarterId && quarterId !== 'all') gq = gq.eq('quarter_id', quarterId)

  const [{ data: games, error: gErr }, resolver, scoringRules, teamId] = await Promise.all([
    gq,
    loadIdentityResolver(supabase, leagueId),
    fetchScoringRules(supabase, leagueId),
    resolveTeamId(leagueId),
  ])
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })
  if (!games || games.length === 0) return NextResponse.json({ pairs: [] })

  const gameIds = games.map(g => g.id as string)
  const PAGE = 1000
  type Ev = { league_game_id: string; league_player_id: string; related_player_id: string | null; team_id: string | null; type: string; result: string | null; quarter: number | null }
  const events: Ev[] = []
  for (let page = 0; ; page++) {
    const { data: chunk, error } = await supabase
      .from('league_game_events')
      .select('league_game_id, league_player_id, related_player_id, team_id, type, result, quarter')
      .in('league_game_id', gameIds)
      .not('league_player_id', 'is', null)
      // ⚠ ORDER BY 없으면 페이지네이션 중복/누락
      .order('id', { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (chunk) events.push(...(chunk as Ev[]))
    if (!chunk || chunk.length < PAGE) break
  }

  const [{ data: players }, { data: gpRows }, { data: memberships }] = await Promise.all([
    supabase.from('league_players').select('id, plus_one').eq('team_id', teamId),
    supabase.from('league_game_players').select('league_game_id, league_player_id, team_id').in('league_game_id', gameIds),
    supabase.from('league_player_quarters').select('league_player_id, quarter_id, team_id').eq('league_id', leagueId),
  ])
  const plusOneSet = new Set((players ?? []).filter(p => p.plus_one).map(p => p.id as string))
  const gpTeam = new Map<string, string>()
  for (const r of gpRows ?? []) gpTeam.set(`${r.league_game_id}:${r.league_player_id}`, r.team_id as string)
  const qTeam = new Map<string, string>()
  for (const m of memberships ?? []) if (m.quarter_id) qTeam.set(`${m.quarter_id}:${m.league_player_id}`, m.team_id as string)

  const gameById = new Map(games.map(g => [g.id as string, g]))
  // 경기별 팀 한 줄 — key `${gameId}:${teamId}`
  const lines = new Map<string, BoxLine>()
  const lineFor = (gid: string, tid: string) => {
    const k = `${gid}:${tid}`
    let l = lines.get(k)
    if (!l) { l = emptyBoxLine(); lines.set(k, l) }
    return l
  }
  const sideTeam = (g: (typeof games)[number], e: Ev): string | null => {
    const both = [g.home_team_id, g.away_team_id]
    const cands = [
      e.team_id,
      gpTeam.get(`${g.id}:${e.league_player_id}`),
      g.quarter_id ? qTeam.get(`${g.quarter_id}:${e.league_player_id}`) : undefined,
    ]
    return (cands.find(c => c && both.includes(c)) as string | undefined) ?? null
  }

  for (const e of events) {
    const g = gameById.get(e.league_game_id)
    if (!g) continue
    const tid = sideTeam(g, e)
    if (!tid) continue
    const isP1 = isPlusOneFor(e.league_player_id, g as GamePlusOne, plusOneSet, e.quarter ?? null)
    const pts = scorePoints(e.type, e.result, isP1, scoringRules)
    const line = lineFor(g.id as string, tid)
    applyEventToBoxLine(line, e.type, e.result, pts)
    if (isAssistEvent(e.type, e.result, e.related_player_id)) line.ast++
  }

  // 대진(정체성 쌍) 단위로 쌓는다
  type Side = { key: string; name: string; color: string; wins: number; totals: BoxLine }
  type Pair = { a: Side; b: Side; games: number; draws: number; lastDate: string }
  const pairs = new Map<string, Pair>()
  for (const g of games) {
    const h = resolver(g.home_team_id as string, g.quarter_id as string | null)
    const a = resolver(g.away_team_id as string, g.quarter_id as string | null)
    if (!h || !a || h.key === a.key) continue
    const [x, y, xTid, yTid, xs, ys] = h.key < a.key
      ? [h, a, g.home_team_id, g.away_team_id, g.home_score ?? 0, g.away_score ?? 0]
      : [a, h, g.away_team_id, g.home_team_id, g.away_score ?? 0, g.home_score ?? 0]
    const pk = `${x.key}|${y.key}`
    let p = pairs.get(pk)
    if (!p) {
      p = {
        a: { key: x.key, name: x.display_name, color: x.color, wins: 0, totals: emptyBoxLine() },
        b: { key: y.key, name: y.display_name, color: y.color, wins: 0, totals: emptyBoxLine() },
        games: 0, draws: 0, lastDate: '',
      }
      pairs.set(pk, p)
    }
    p.games++
    if (xs > ys) p.a.wins++
    else if (ys > xs) p.b.wins++
    else p.draws++
    if ((g.date as string) > p.lastDate) p.lastDate = g.date as string
    const lx = lines.get(`${g.id}:${xTid}`); if (lx) addBoxLine(p.a.totals, lx)
    const ly = lines.get(`${g.id}:${yTid}`); if (ly) addBoxLine(p.b.totals, ly)
  }

  // 최근에 맞붙은 대진부터
  const out = [...pairs.values()].sort((p, q) => q.lastDate.localeCompare(p.lastDate) || q.games - p.games)
  return NextResponse.json({ pairs: out })
}
