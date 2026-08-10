import { createClient } from '@/lib/supabase/admin'
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
  // 소유권 컬럼은 받지 않는다 — 가드가 "수정 전 소유 팀"만 대조하므로, body 로 team_id 를
  // 덮어쓰게 두면 자기 PIN 으로 대회(와 소속 경기·이벤트)를 남의 팀으로 옮길 수 있다.
  const { team_id: _tid, ...rest } = body
  const { data, error } = await supabase.from('tournaments').update(rest).eq('id', id).select().single()
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
