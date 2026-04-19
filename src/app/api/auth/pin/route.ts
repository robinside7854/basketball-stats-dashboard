import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const { pin, org = 'paranalgae' } = await req.json()
  if (!pin) return NextResponse.json({ ok: false }, { status: 400 })

  const supabase = createServerClient()
  const { data } = await supabase
    .from('teams')
    .select('edit_pin')
    .eq('org_slug', org)
    .maybeSingle()

  if (!data || data.edit_pin !== pin) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  return NextResponse.json({ ok: true })
}
