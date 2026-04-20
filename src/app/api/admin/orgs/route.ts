import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { auth } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, org_slug, accent_color, edit_pin } = body

  if (!name || !org_slug || !edit_pin) {
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('teams')
    .insert({ name, org_slug, accent_color: accent_color ?? '#3b82f6', edit_pin, is_active: true })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: '이미 사용 중인 슬러그입니다' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
