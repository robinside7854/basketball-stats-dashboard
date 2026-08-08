import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'
import { resolveTeamIdForGame, verifyTeamPinForTeam } from '@/lib/teamPinAuth'

export async function GET(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  const { data, error } = await supabase
    .from('game_events')
    .select('*, player:players!game_events_player_id_fkey(*), related_player:players!game_events_related_player_id_fkey(*)')
    .eq('game_id', gameId)
    .order('quarter', { ascending: true })
    .order('video_timestamp', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  const teamId = await resolveTeamIdForGame(gameId)
  if (!(await verifyTeamPinForTeam(req, teamId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createClient()
  const { error } = await supabase.from('game_events').delete().eq('game_id', gameId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function POST(req: Request) {
  const body = await req.json()
  const teamId = await resolveTeamIdForGame(body.game_id)
  if (!(await verifyTeamPinForTeam(req, teamId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createClient()

  // 득점 이벤트 points 자동 설정
  let points = 0
  if (body.result === 'made') {
    if (body.type === 'shot_3p') points = 3
    else if (['shot_2p_mid', 'shot_layup', 'shot_post'].includes(body.type)) points = 2
    else if (body.type === 'free_throw') points = 1
  }
  if (body.type === 'opp_score') points = body.points || 2

  const { data, error } = await supabase
    .from('game_events')
    .insert({ ...body, points })
    .select('*, player:players!game_events_player_id_fkey(*), related_player:players!game_events_related_player_id_fkey(*)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
