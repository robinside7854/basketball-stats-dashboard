import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { auth } from '@/lib/auth'

export async function PATCH(req: Request, { params }: { params: Promise<{ orgSlug: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orgSlug } = await params
  const body = await req.json()
  const { sub_slug, ...fields } = body

  const supabase = createClient()
  let query = supabase.from('teams').update(fields).eq('org_slug', orgSlug)
  if (sub_slug) query = query.eq('sub_slug', sub_slug)

  const { data, error } = await query.select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ orgSlug: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orgSlug } = await params
  const supabase = createClient()

  const { data: team } = await supabase.from('teams').select('id').eq('org_slug', orgSlug).maybeSingle()
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase.from('teams').delete().eq('org_slug', orgSlug)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
