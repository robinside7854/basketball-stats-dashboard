// 준비 체크 단계 시작 — 어드민(NextAuth) 또는 감독관 코드
//   status: 'setup' → 'ready_check', ready_state 초기화
//
// 감독관/어드민이 "준비 체크 시작"을 누르면 단장들이 준비 버튼을 누를 수 있게 된다.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { auth } from '@/lib/auth'
import { verifySupervisorCode } from '@/lib/leagueDraftAuth'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; draftId: string }> },
) {
  const { leagueId, draftId } = await params
  const supabase = createClient()

  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, quarter_id, status')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
  const d = draft as { id: string; quarter_id: string; status: string }

  // 권한: 어드민 세션 OR 감독관 코드
  const session = await auth()
  if (!session) {
    const sup = await verifySupervisorCode(req, leagueId, d.quarter_id)
    if (!sup.valid) return NextResponse.json({ error: '권한 없음 (어드민/감독관 전용)' }, { status: 401 })
  }

  if (d.status !== 'setup' && d.status !== 'ready_check') {
    return NextResponse.json({ error: `준비 체크 시작 불가 — 현재 상태: ${d.status}` }, { status: 409 })
  }

  const { data: updated, error } = await supabase
    .from('league_drafts')
    .update({ status: 'ready_check', ready_state: {} })
    .eq('id', draftId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(updated)
}
