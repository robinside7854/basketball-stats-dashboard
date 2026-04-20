import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const { pin, org = 'paranalgae' } = await req.json()
  if (!pin) return NextResponse.json({ ok: false }, { status: 400 })

  const supabase = createServerClient()
  // org 내 어느 sub-team이든 PIN이 일치하면 OK
  const { data } = await supabase
    .from('teams')
    .select('edit_pin')
    .eq('org_slug', org)
    .eq('edit_pin', pin)
    .limit(1)
    .maybeSingle()

  if (!data) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  return NextResponse.json({ ok: true })
}
