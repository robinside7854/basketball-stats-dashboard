import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'
import { resolveTeamIdForTournament, verifyTeamPinForTeam } from '@/lib/teamPinAuth'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const teamId = await resolveTeamIdForTournament(id)
  if (!(await verifyTeamPinForTeam(req, teamId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createClient()
  const body = await req.json()
  const { data, error } = await supabase.from('tournaments').update(body).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const teamId = await resolveTeamIdForTournament(id)
  if (!(await verifyTeamPinForTeam(req, teamId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createClient()
  const { error } = await supabase.from('tournaments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
