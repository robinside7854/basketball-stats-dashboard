import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; teamId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { teamId } = await params
  const body = await req.json()
  const { player_id } = body
  if (!player_id) return NextResponse.json({ error: 'player_id is required' }, { status: 400 })
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_team_players')
    .insert({ league_team_id: teamId, player_id })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; teamId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { teamId } = await params
  const { searchParams } = new URL(req.url)
  const player_id = searchParams.get('player_id')
  if (!player_id) return NextResponse.json({ error: 'player_id is required' }, { status: 400 })
  const supabase = createClient()
  const { error } = await supabase
    .from('league_team_players')
    .delete()
    .eq('league_team_id', teamId)
    .eq('player_id', player_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
