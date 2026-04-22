import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { LeagueStanding, LeagueTeam } from '@/types/league'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const supabase = createClient()

  const { data: teams, error: teamsError } = await supabase
    .from('league_teams')
    .select('*')
    .eq('league_id', leagueId)

  if (teamsError) return NextResponse.json({ error: teamsError.message }, { status: 500 })
  if (!teams || teams.length === 0) return NextResponse.json([])

  const { data: completedGames, error: gamesError } = await supabase
    .from('league_games')
    .select('*')
    .eq('league_id', leagueId)
    .eq('is_complete', true)

  if (gamesError) return NextResponse.json({ error: gamesError.message }, { status: 500 })

  const standing: Record<string, LeagueStanding> = {}
  for (const t of teams as LeagueTeam[]) {
    standing[t.id] = {
      team: t,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      goals_for: 0,
      goals_against: 0,
      goal_diff: 0,
    }
  }

  for (const g of completedGames ?? []) {
    const h = standing[g.home_team_id]
    const a = standing[g.away_team_id]
    if (!h || !a) continue
    h.played++
    a.played++
    h.goals_for += g.home_score
    h.goals_against += g.away_score
    a.goals_for += g.away_score
    a.goals_against += g.home_score
    if (g.home_score > g.away_score) {
      h.wins++
      h.points += 3
      a.losses++
    } else if (g.home_score < g.away_score) {
      a.wins++
      a.points += 3
      h.losses++
    } else {
      h.draws++
      h.points++
      a.draws++
      a.points++
    }
  }

  for (const s of Object.values(standing)) {
    s.goal_diff = s.goals_for - s.goals_against
  }

  const result = Object.values(standing).sort(
    (a, b) =>
      b.points - a.points ||
      b.goal_diff - a.goal_diff ||
      b.goals_for - a.goals_for
  )

  return NextResponse.json(result)
}
