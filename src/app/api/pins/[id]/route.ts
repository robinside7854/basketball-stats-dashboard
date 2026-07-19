import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { verifyTeamPin } from '@/lib/teamPinAuth'

// 핀이 요청자의 팀 소속인지 확인. 통과하면 teamId 반환.
// PIN 만 맞으면 다른 팀 핀까지 지울 수 있는 구멍을 막는다.
async function authorize(req: Request, org: string | null, team: string | null, pinId: string) {
  if (!org || !team) return null
  const teamId = await verifyTeamPin(req, org, team)
  if (!teamId) return null
  const supabase = createClient()
  const { data } = await supabase
    .from('coach_pins').select('id, team_id').eq('id', pinId).maybeSingle()
  if (!data || data.team_id !== teamId) return null
  return teamId
}

// DELETE /api/pins/[id]?org=xxx&team=youth
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(req.url)

  const ok = await authorize(req, searchParams.get('org'), searchParams.get('team'), id)
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient()
  const { error } = await supabase.from('coach_pins').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
