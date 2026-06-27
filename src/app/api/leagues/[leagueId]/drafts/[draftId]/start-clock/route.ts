// 첫 픽 타이머 시작 — 추첨 연출이 끝난 뒤 호출
// 추첨 시 pick_deadline 을 비워두고, 연출 종료 시점에 80초 타이머를 건다.
// 멱등: in_progress + pick_deadline 없음 + 아직 첫 픽 전(total_picks=0) 일 때만 설정.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { lookupDraftCode } from '@/lib/leagueDraftAuth'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'
import { newPickDeadline } from '@/lib/draftTimer'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; draftId: string }> },
) {
  const { leagueId, draftId } = await params
  const supabase = createClient()

  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, quarter_id, status, pick_deadline, total_picks, pick_seconds')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
  const d = draft as { id: string; quarter_id: string; status: string; pick_deadline: string | null; total_picks: number; pick_seconds: number }

  // 권한: 이 분기 코드 또는 리그 PIN
  const plain = req.headers.get('X-Draft-Code')?.trim()
  const codeOk = plain ? !!(await lookupDraftCode(leagueId, d.quarter_id, plain)) : false
  if (!codeOk && !(await verifyLeaguePin(req, leagueId))) {
    return NextResponse.json({ error: '권한 없음' }, { status: 401 })
  }

  if (d.status !== 'in_progress' || d.pick_deadline || d.total_picks > 0) {
    // 이미 시작되었거나 시작 불필요 — 멱등 응답
    return NextResponse.json({ ok: true, already: true })
  }

  const { data: updated, error } = await supabase
    .from('league_drafts')
    .update({ pick_deadline: newPickDeadline(Date.now(), d.pick_seconds) })
    .eq('id', draftId)
    .eq('status', 'in_progress')
    .is('pick_deadline', null)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, draft: updated })
}
