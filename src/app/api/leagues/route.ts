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
  const { org_slug, name, edit_pin, season_year, start_date, match_day, season_type, games_per_round } = body
  if (!org_slug || !name) return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
  if (edit_pin && !/^\d{4}$/.test(edit_pin)) return NextResponse.json({ error: 'PIN은 숫자 4자리여야 합니다' }, { status: 400 })
  const supabase = createClient()
  const { data, error } = await supabase
    .from('leagues')
    .insert({
      org_slug,
      name,
      edit_pin: edit_pin ?? '0000',
      season_year: season_year ?? new Date().getFullYear(),
      start_date: start_date ?? new Date().toISOString().split('T')[0],
      match_day: match_day ?? 'saturday',
      season_type: season_type ?? 'annual',
      games_per_round: games_per_round ?? 1,
      status: 'upcoming',
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
