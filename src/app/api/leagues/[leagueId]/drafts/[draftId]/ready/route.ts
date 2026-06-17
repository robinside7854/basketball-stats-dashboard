// 드래프트 준비 체크 — 참가자(단장/감독관)가 "준비" 토글
//
// POST body: { team_id?: string, ready?: boolean }
//   - team_id 있으면 단장(manager) 준비: X-Draft-Code 가 해당 팀 단장 코드여야 함
//   - team_id 없으면 감독관(supervisor) 준비: X-Draft-Code 가 감독관 코드여야 함
//   - ready 기본 true (false 면 준비 해제)
//
// status='ready_check' 일 때만 동작. ready_state JSONB 에 누적.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { verifyDraftCode, verifySupervisorCode } from '@/lib/leagueDraftAuth'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; draftId: string }> },
) {
  const { leagueId, draftId } = await params
  const body = await req.json().catch(() => ({})) as { team_id?: string; ready?: boolean }
  const ready = body.ready !== false

  const supabase = createClient()
  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, quarter_id, status, ready_state')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
  const d = draft as { id: string; quarter_id: string; status: string; ready_state: Record<string, boolean> }
  if (d.status !== 'ready_check') {
    return NextResponse.json({ error: `준비 단계가 아닙니다 (status=${d.status})` }, { status: 409 })
  }

  // 인증 + 참가자 키 결정
  let key: string
  if (body.team_id) {
    const auth = await verifyDraftCode(req, leagueId, d.quarter_id, body.team_id)
    if (!auth.valid) return NextResponse.json({ error: '단장 코드 인증 실패' }, { status: 401 })
    key = body.team_id
  } else {
    const auth = await verifySupervisorCode(req, leagueId, d.quarter_id)
    if (!auth.valid) return NextResponse.json({ error: '감독관 코드 인증 실패' }, { status: 401 })
    key = 'supervisor'
  }

  const nextState = { ...(d.ready_state ?? {}) }
  if (ready) nextState[key] = true
  else delete nextState[key]

  const { data: updated, error } = await supabase
    .from('league_drafts')
    .update({ ready_state: nextState })
    .eq('id', draftId)
    .eq('status', 'ready_check')
    .select('ready_state')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, ready_state: (updated as { ready_state: Record<string, boolean> }).ready_state })
}
