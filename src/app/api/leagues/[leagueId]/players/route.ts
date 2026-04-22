import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_players')
    .select('*')
    .eq('league_id', leagueId)
    .order('number', { ascending: true, nullsFirst: false })
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
  const { name, number, position } = body
  if (!name?.trim()) return NextResponse.json({ error: '이름은 필수입니다' }, { status: 400 })
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_players')
    .insert({ league_id: leagueId, name: name.trim(), number: number ?? null, position: position ?? null })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const playerId = searchParams.get('playerId')
  if (!playerId) return NextResponse.json({ error: 'playerId is required' }, { status: 400 })
  const supabase = createClient()
  const { error } = await supabase
    .from('league_players')
    .delete()
    .eq('id', playerId)
    .eq('league_id', leagueId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
