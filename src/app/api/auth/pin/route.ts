import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const { pin, org = 'paranalgae', team } = await req.json()
  if (!pin) return NextResponse.json({ ok: false }, { status: 400 })

  const supabase = createServerClient()
  let query = supabase
    .from('teams')
    .select('edit_pin')
    .eq('org_slug', org)
    .eq('edit_pin', pin)
  // sub-team 지정 시 해당 팀 PIN만 검증
  if (team) query = query.eq('sub_slug', team)

  const { data } = await query.limit(1).maybeSingle()
  if (!data) return NextResponse.json({ ok: false }, { status: 401 })
  return NextResponse.json({ ok: true })
}
