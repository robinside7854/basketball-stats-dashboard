import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const supabase = createClient()

  const { data: games, error } = await supabase
    .from('league_games')
    .select(`
      *,
      home_team:league_teams!league_games_home_team_id_fkey(id, name, color),
      away_team:league_teams!league_games_away_team_id_fkey(id, name, color)
    `)
    .eq('league_id', leagueId)
    .order('round_num', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(games ?? [])
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId is required' }, { status: 400 })
  const body = await req.json()
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_games')
    .update(body)
    .eq('id', gameId)
    .eq('league_id', leagueId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
