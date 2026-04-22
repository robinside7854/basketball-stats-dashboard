import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const org_slug = searchParams.get('org_slug')
  const supabase = createClient()
  let q = supabase.from('leagues').select('*').order('created_at', { ascending: false })
  if (org_slug) q = q.eq('org_slug', org_slug)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { org_slug, name, season_year, start_date, match_day, total_rounds, games_per_round } = body
  if (!org_slug || !name || !start_date) return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
  const supabase = createClient()
  const { data, error } = await supabase
    .from('leagues')
    .insert({
      org_slug,
      name,
      season_year: season_year ?? new Date().getFullYear(),
      start_date,
      match_day: match_day ?? 'saturday',
      total_rounds: total_rounds ?? 9,
      games_per_round: games_per_round ?? 1,
      status: 'upcoming',
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
