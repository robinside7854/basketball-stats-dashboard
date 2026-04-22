import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const supabase = createClient()

  const { data: teams, error } = await supabase
    .from('league_teams')
    .select('*')
    .eq('league_id', leagueId)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!teams || teams.length === 0) return NextResponse.json([])

  const { data: assignments } = await supabase
    .from('league_team_players')
    .select('league_team_id, league_player_id, league_players(id, name, number, position)')
    .in('league_team_id', teams.map(t => t.id))

  const teamsWithPlayers = teams.map(team => ({
    ...team,
    players: (assignments ?? [])
      .filter(a => a.league_team_id === team.id)
      .map(a => {
        const p = (Array.isArray(a.league_players) ? a.league_players[0] : a.league_players) as { id: string; name: string; number: number | null; position: string | null } | null
        return {
          league_player_id: a.league_player_id,
          player_name: p?.name ?? '',
          player_number: p?.number ?? null,
          position: p?.position ?? null,
        }
      }),
  }))

  return NextResponse.json(teamsWithPlayers)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { leagueId } = await params
  const body = await req.json()
  const { name, color } = body
  if (!name) return NextResponse.json({ error: '팀 이름은 필수입니다' }, { status: 400 })
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_teams')
    .insert({ league_id: leagueId, name, color: color ?? '#3b82f6' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
