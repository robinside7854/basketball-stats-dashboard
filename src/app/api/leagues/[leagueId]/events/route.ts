import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_game_events')
    .select('*')
    .eq('league_game_id', gameId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_game_events')
    .insert({
      league_game_id: body.league_game_id,
      quarter: body.quarter,
      video_timestamp: body.video_timestamp ?? null,
      type: body.type,
      league_player_id: body.league_player_id ?? null,
      result: body.result ?? null,
      related_player_id: body.related_player_id ?? null,
      points: body.points ?? 0,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
