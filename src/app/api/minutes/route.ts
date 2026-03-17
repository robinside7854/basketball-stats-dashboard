import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  const { data, error } = await supabase
    .from('player_minutes')
    .select('*')
    .eq('game_id', gameId)
    .order('quarter', { ascending: true })
    .order('in_time', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  const { error } = await supabase.from('player_minutes').delete().eq('game_id', gameId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function POST(req: Request) {
  const supabase = createClient()
  const body = await req.json()
  const { data, error } = await supabase.from('player_minutes').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: Request) {
  const supabase = createClient()
  const body = await req.json()
  const { id, out_time } = body
  const { data, error } = await supabase.from('player_minutes').update({ out_time }).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
