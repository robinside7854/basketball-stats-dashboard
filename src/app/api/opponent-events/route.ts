import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  const { data, error } = await supabase
    .from('opponent_game_events')
    .select('*, player:opponent_players!opponent_game_events_player_id_fkey(*)')
    .eq('game_id', gameId)
    .order('quarter', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = createClient()
  const body = await req.json()

  let points = 0
  if (body.result === 'made') {
    if (body.type === 'shot_3p') points = 3
    else if (['shot_2p_mid', 'shot_2p_drive', 'shot_layup', 'shot_post'].includes(body.type)) points = 2
    else if (body.type === 'free_throw') points = 1
  }

  const { data, error } = await supabase
    .from('opponent_game_events')
    .insert({ ...body, points })
    .select('*, player:opponent_players!opponent_game_events_player_id_fkey(*)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('opponent_game_events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
