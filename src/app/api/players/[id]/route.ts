import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'
import { resolveTeamIdForPlayer, verifyTeamPinForTeam } from '@/lib/teamPinAuth'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createClient()
  const { data, error } = await supabase.from('players').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const teamId = await resolveTeamIdForPlayer(id)
  if (!(await verifyTeamPinForTeam(req, teamId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createClient()
  const body = await req.json()
  // 소유권 컬럼은 받지 않는다 — body 로 team_id 를 덮어쓰게 두면 자기 PIN 으로
  // 선수를 남의 팀 명단에 밀어넣을 수 있다 (가드는 수정 전 소유 팀만 대조한다).
  const { team_id: _tid, ...rest } = body
  const { data, error } = await supabase.from('players').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const teamId = await resolveTeamIdForPlayer(id)
  if (!(await verifyTeamPinForTeam(req, teamId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createClient()
  const { error } = await supabase.from('players').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
