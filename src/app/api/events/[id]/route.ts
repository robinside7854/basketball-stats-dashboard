import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'
import { resolveTeamIdForGameEvent, verifyTeamPinForTeam } from '@/lib/teamPinAuth'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const teamId = await resolveTeamIdForGameEvent(id)
  if (!(await verifyTeamPinForTeam(req, teamId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createClient()
  const { error } = await supabase.from('game_events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
