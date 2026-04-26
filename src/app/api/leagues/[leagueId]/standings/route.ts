import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { LeagueStanding, LeagueTeam } from '@/types/league'

// GET /api/leagues/[leagueId]/standings?quarterId=...
export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const { searchParams } = new URL(req.url)
  const quarterId = searchParams.get('quarterId')

  const supabase = createClient()

  const { data: teams, error: teamsError } = await supabase
    .from('league_teams').select('*').eq('league_id', leagueId)
  if (teamsError) return NextResponse.json({ error: teamsError.message }, { status: 500 })
  if (!teams || teams.length === 0) return NextResponse.json([])

  let gQuery = supabase
    .from('league_games')
    .select('id, home_team_id, away_team_id, home_score, away_score, quarter_id')
    .eq('league_id', leagueId).eq('is_complete', true)
  if (quarterId) gQuery = gQuery.eq('quarter_id', quarterId)

  const { data: completedGames, error: gamesError } = await gQuery
  if (gamesError) return NextResponse.json({ error: gamesError.message }, { status: 500 })

  const gameIds = (completedGames ?? []).map(g => g.id)
  const eventScoreMap: Record<string, { home: number; away: number }> = {}

  if (gameIds.length > 0) {
    const { data: events } = await supabase
      .from('league_game_events')
      .select('league_game_id, team_id, points')
      .in('league_game_id', gameIds)
      .not('team_id', 'is', null)
      .gt('points', 0)

    if (events && events.length > 0) {
      const gameTeamMap = Object.fromEntries(
        (completedGames ?? []).map(g => [g.id, { home: g.home_team_id, away: g.away_team_id }])
      )
      for (const e of events) {
        if (!eventScoreMap[e.league_game_id]) eventScoreMap[e.league_game_id] = { home: 0, away: 0 }
        const gTeams = gameTeamMap[e.league_game_id]
        if (!gTeams) continue
        if (e.team_id === gTeams.home) eventScoreMap[e.league_game_id].home += e.points
        else if (e.team_id === gTeams.away) eventScoreMap[e.league_game_id].away += e.points
      }
    }
  }

  const standing: Record<string, LeagueStanding> = {}
  for (const t of teams as LeagueTeam[]) {
    standing[t.id] = { team: t, played: 0, wins: 0, draws: 0, losses: 0, points: 0, goals_for: 0, goals_against: 0, goal_diff: 0 }
  }

  for (const g of completedGames ?? []) {
    if (!g.home_team_id || !g.away_team_id) continue
    const h = standing[g.home_team_id]
    const a = standing[g.away_team_id]
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
