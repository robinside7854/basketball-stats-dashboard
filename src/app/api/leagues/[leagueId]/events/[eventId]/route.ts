import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; eventId: string }> }
) {
  const { leagueId, eventId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { type, result, points, league_player_id, related_player_id, team_id } = body
  const payload: Record<string, unknown> = {}
  if (type !== undefined) payload.type = type
  if (result !== undefined) payload.result = result ?? null
  if (points !== undefined) payload.points = points ?? 0
  if (league_player_id !== undefined) payload.league_player_id = league_player_id ?? null
  if (related_player_id !== undefined) payload.related_player_id = related_player_id ?? null
  if (team_id !== undefined) payload.team_id = team_id ?? null
  if (Object.keys(payload).length === 0) return NextResponse.json({ error: '수정할 값이 없습니다' }, { status: 400 })
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_game_events')
    .update(payload)
    .eq('id', eventId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; eventId: string }> }
) {
  const { leagueId, eventId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createClient()
  const { error } = await supabase
    .from('league_game_events')
    .delete()
    .eq('id', eventId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
