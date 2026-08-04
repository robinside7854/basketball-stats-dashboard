import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { LeagueStanding, LeagueTeam } from '@/types/league'
import { loadIdentityResolver } from '@/lib/stats/teamIdentity'
import { canViewLeague } from '@/lib/auth/guard'

// GET /api/leagues/[leagueId]/standings?quarterId=...
//
// 프랜차이즈 분리:
//   quarterId 없음(전체) 이어도 락다운/굿모닝 등 정체성이 다른 팀은 별도 행으로 분리.
//   같은 team_id 여도 quarter override 로 이름이 다르면 프랜차이즈 별개로 취급.
//   → identityKey = `${team_id}::${display_name}` 로 그룹핑
export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  // 팀 비공개 전환 시 화면만 막으면 API 로 뚫린다 — 데이터 계층에서 재확인
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const quarterId = searchParams.get('quarterId')

  const supabase = createClient()

  const { data: teamsBase, error: teamsError } = await supabase
    .from('league_teams').select('*').eq('league_id', leagueId)
  if (teamsError) return NextResponse.json({ error: teamsError.message }, { status: 500 })
  if (!teamsBase || teamsBase.length === 0) return NextResponse.json([])

  // identity resolver 로드 (전체 override 포함)
  const identityResolver = await loadIdentityResolver(supabase, leagueId)

  let gQuery = supabase
    .from('league_games')
    .select('id, home_team_id, away_team_id, home_score, away_score, quarter_id')
    .eq('league_id', leagueId).eq('is_complete', true)
    .eq('is_exhibition', false)  // 친선전 제외
  if (quarterId) gQuery = gQuery.eq('quarter_id', quarterId)

  const { data: completedGames, error: gamesError } = await gQuery
  if (gamesError) return NextResponse.json({ error: gamesError.message }, { status: 500 })

  const gameIds = (completedGames ?? []).map(g => g.id)
  const eventScoreMap: Record<string, { home: number; away: number }> = {}

  if (gameIds.length > 0) {
    // 서버측 db-max-rows(=1000) 우회 위해 페이지네이션으로 청크 반복 조회.
    const PAGE = 1000
    const events: { league_game_id: string | null; team_id: string | null; points: number | null }[] = []
    for (let p = 0; ; p++) {
      const { data: chunk } = await supabase
        .from('league_game_events')
        .select('league_game_id, team_id, points')
        .in('league_game_id', gameIds)
        .not('team_id', 'is', null)
        .gt('points', 0)
        .order('id', { ascending: true })
        .range(p * PAGE, (p + 1) * PAGE - 1)
      if (!chunk || chunk.length === 0) break
      events.push(...chunk)
      if (chunk.length < PAGE) break
    }

    if (events.length > 0) {
      const gameTeamMap = Object.fromEntries(
        (completedGames ?? []).map(g => [g.id, { home: g.home_team_id, away: g.away_team_id }])
      )
      for (const e of events) {
        if (!e.league_game_id || e.points == null) continue
        if (!eventScoreMap[e.league_game_id]) eventScoreMap[e.league_game_id] = { home: 0, away: 0 }
        const gTeams = gameTeamMap[e.league_game_id]
        if (!gTeams) continue
        if (e.team_id === gTeams.home) eventScoreMap[e.league_game_id].home += e.points
        else if (e.team_id === gTeams.away) eventScoreMap[e.league_game_id].away += e.points
      }
    }
  }

  // identityKey 로 standing 그룹핑 (프랜차이즈 분리)
  //   예: team_A + Q1-Q2 → 락다운 identityKey, team_A + Q3+ → 굿모닝 identityKey
  //   → 완전히 별개 프랜차이즈로 카운트
  const standing: Record<string, LeagueStanding> = {}
  const ensureRow = (
    team_id: string,
    quarter_id: string | null,
  ): LeagueStanding | null => {
    const id = identityResolver(team_id, quarter_id)
    if (!id) return null
    if (!standing[id.key]) {
      // team 데이터를 identity 정보로 override 하여 반환
      const baseTeam = teamsBase.find(t => t.id === team_id) as LeagueTeam | undefined
      if (!baseTeam) return null
      const teamWithIdentity: LeagueTeam = {
        ...baseTeam,
        name: id.display_name,
        color: id.color,
        // identityKey 를 id 로 반환 (클라이언트가 unique key 로 사용)
        id: id.key,
      }
      standing[id.key] = {
        team: teamWithIdentity,
        played: 0, wins: 0, draws: 0, losses: 0, points: 0,
        goals_for: 0, goals_against: 0, goal_diff: 0,
      }
    }
    return standing[id.key]
  }

  for (const g of completedGames ?? []) {
    if (!g.home_team_id || !g.away_team_id) continue
    const h = ensureRow(g.home_team_id, g.quarter_id)
    const a = ensureRow(g.away_team_id, g.quarter_id)
    if (!h || !a) continue

    const es = eventScoreMap[g.id]
    const homeScore = (es && (es.home > 0 || es.away > 0)) ? es.home : g.home_score
    const awayScore = (es && (es.home > 0 || es.away > 0)) ? es.away : g.away_score

    h.played++; a.played++
    h.goals_for += homeScore; h.goals_against += awayScore
    a.goals_for += awayScore; a.goals_against += homeScore

    if (homeScore > awayScore) { h.wins++; h.points += 3; a.losses++ }
    else if (homeScore < awayScore) { a.wins++; a.points += 3; h.losses++ }
    else { h.draws++; h.points++; a.draws++; a.points++ }
  }

  for (const s of Object.values(standing)) s.goal_diff = s.goals_for - s.goals_against

  const result = Object.values(standing).sort((a, b) =>
    b.points - a.points || b.goal_diff - a.goal_diff || b.goals_for - a.goals_for
  )
  return NextResponse.json(result)
}
