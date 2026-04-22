import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; teamId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { teamId } = await params
  const body = await req.json()
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_teams')
    .update(body)
    .eq('id', teamId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string; teamId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { teamId } = await params
  const supabase = createClient()
  const { error } = await supabase.from('league_teams').delete().eq('id', teamId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
