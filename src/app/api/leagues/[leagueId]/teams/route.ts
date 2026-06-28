import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const { searchParams } = new URL(req.url)
  const quarterId = searchParams.get('quarterId')
  const supabase = createClient()

  const { data: teams, error } = await supabase
    .from('league_teams')
    .select('*')
    .eq('league_id', leagueId)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!teams || teams.length === 0) return NextResponse.json([])

  // 분기별 팀명·색상 override 적용 — quarterId 가 주어지면 해당 분기 override 우선
  let overrideMap: Record<string, { name: string | null; color: string | null }> = {}
  if (quarterId) {
    const { data: overrides } = await supabase
      .from('league_team_quarter_overrides')
      .select('team_id, name, color')
      .eq('league_id', leagueId)
      .eq('quarter_id', quarterId)
    overrideMap = Object.fromEntries((overrides ?? []).map(o => [o.team_id, { name: o.name, color: o.color }]))
  }

  const { data: assignments } = await supabase
    .from('league_team_players')
    .select('league_team_id, league_player_id, league_players(id, name, number, position)')
    .in('league_team_id', teams.map(t => t.id))

  const teamsWithPlayers = teams.map(team => {
    const ov = overrideMap[team.id]
    return {
      ...team,
      name: ov?.name ?? team.name,
      color: ov?.color ?? team.color,
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
    }
  })

  return NextResponse.json(teamsWithPlayers)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
