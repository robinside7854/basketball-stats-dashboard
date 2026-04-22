import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { leagueId, pin } = await req.json()
  if (!leagueId || !pin) return NextResponse.json({ ok: false }, { status: 400 })
  const supabase = createClient()
  const { data } = await supabase
    .from('leagues')
    .select('id')
    .eq('id', leagueId)
    .eq('edit_pin', pin)
    .maybeSingle()
  if (!data) return NextResponse.json({ ok: false }, { status: 401 })
  return NextResponse.json({ ok: true })
}
