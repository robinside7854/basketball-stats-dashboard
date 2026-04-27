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
    .order('name', { ascending: true })
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
  const { name, number, position, birth_date } = body
  if (!name?.trim()) return NextResponse.json({ error: '이름은 필수입니다' }, { status: 400 })
  // position may be an array (multi-position) → join to comma-separated string
  const positionStr = Array.isArray(position)
    ? position.join(',')
    : (position ?? null)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_players')
    .insert({
      league_id: leagueId,
      name: name.trim(),
      number: number ?? null,
      position: positionStr,
      birth_date: birth_date ?? null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const playerId = searchParams.get('playerId')
  if (!playerId) return NextResponse.json({ error: 'playerId is required' }, { status: 400 })
  const body = await req.json()
  const { name, position, birth_date, plus_one } = body
  if (name !== undefined && !String(name).trim()) return NextResponse.json({ error: '이름은 필수입니다' }, { status: 400 })
  // position may be an array → join to comma-separated string
  const positionStr = Array.isArray(position)
    ? position.join(',')
    : (position ?? null)
  const updatePayload: Record<string, string | null | boolean> = {}
  if (name !== undefined) updatePayload.name = String(name).trim()
  if (position !== undefined) updatePayload.position = positionStr
  if (birth_date !== undefined) updatePayload.birth_date = birth_date ?? null
  if (plus_one !== undefined) updatePayload.plus_one = Boolean(plus_one)
  if (Object.keys(updatePayload).length === 0) return NextResponse.json({ error: '수정할 값이 없습니다' }, { status: 400 })
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_players')
    .update(updatePayload)
    .eq('id', playerId)
    .eq('league_id', leagueId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
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
