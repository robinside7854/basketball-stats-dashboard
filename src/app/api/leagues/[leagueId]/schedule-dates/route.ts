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
    .from('league_schedule_dates')
    .select('*')
    .eq('league_id', leagueId)
    .order('date', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { date } = await req.json()
  if (!date) return NextResponse.json({ error: '날짜를 입력하세요' }, { status: 400 })
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_schedule_dates')
    .upsert({ league_id: leagueId, date }, { onConflict: 'league_id,date' })
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
  const date = searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 })
  const supabase = createClient()
  await supabase.from('league_schedule_dates').delete().eq('league_id', leagueId).eq('date', date)
  return NextResponse.json({ success: true })
}
