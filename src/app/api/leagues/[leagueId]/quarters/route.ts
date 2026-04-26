import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

// GET /api/leagues/[leagueId]/quarters
// Returns quarters with player memberships and team leaders
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const supabase = createClient()

  const { data: quarters, error } = await supabase
    .from('league_quarters')
    .select('*')
    .eq('league_id', leagueId)
    .order('year').order('quarter')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(quarters ?? [])
}

// POST /api/leagues/[leagueId]/quarters — create a quarter
export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { year, quarter, is_current, start_date, end_date } = await req.json()
  if (!year || !quarter) return NextResponse.json({ error: 'year, quarter 필수' }, { status: 400 })

  const supabase = createClient()

  if (is_current) {
    await supabase.from('league_quarters').update({ is_current: false }).eq('league_id', leagueId)
  }

  const { data, error } = await supabase
    .from('league_quarters')
    .upsert({
      league_id: leagueId,
      year,
      quarter,
      is_current: is_current ?? false,
      start_date: start_date ?? null,
      end_date: end_date ?? null,
    }, {
      onConflict: 'league_id,year,quarter',
      ignoreDuplicates: false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/leagues/[leagueId]/quarters — update quarter (start_date/end_date/is_current)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { quarterId, is_current, start_date, end_date } = await req.json()
  if (!quarterId) return NextResponse.json({ error: 'quarterId 필수' }, { status: 400 })

  const supabase = createClient()

  if (is_current) {
    await supabase.from('league_quarters').update({ is_current: false }).eq('league_id', leagueId)
  }

  const update: Record<string, unknown> = {}
  if (start_date !== undefined) update.start_date = start_date || null
  if (end_date !== undefined)   update.end_date   = end_date   || null
  if (is_current !== undefined) update.is_current = is_current

  const { data, error } = await supabase
    .from('league_quarters')
    .update(update)
    .eq('id', quarterId)
    .eq('league_id', leagueId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
