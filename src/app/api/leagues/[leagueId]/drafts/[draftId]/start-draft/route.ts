// 드래프트 실제 시작 — 추첨 종료 후 감독관이 누름.
// status: 'lottery_done' → 'in_progress' + started_at = now()
// pick_deadline 은 클라이언트의 start-clock 호출로 별도 설정.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { auth } from '@/lib/auth'
import { verifySupervisorCode } from '@/lib/leagueDraftAuth'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; draftId: string }> },
) {
  const { leagueId, draftId } = await params
  const supabase = createClient()

  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, quarter_id, status, draft_order, lottery_done')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
  const d = draft as { id: string; quarter_id: string; status: string; draft_order: string[]; lottery_done: boolean }

  // 권한
  const session = await auth()
  if (!session) {
    const sup = await verifySupervisorCode(req, leagueId, d.quarter_id)
    if (!sup.valid && !await verifyLeaguePin(req, leagueId)) {
      return NextResponse.json({ error: '권한 없음 (어드민/감독관/PIN 전용)' }, { status: 401 })
    }
  }

  if (d.status !== 'lottery_done') {
    return NextResponse.json({ error: `시작 불가 — 현재 상태: ${d.status} (lottery_done 단계 필요)` }, { status: 409 })
  }
  if (!d.lottery_done || !d.draft_order || d.draft_order.length === 0) {
    return NextResponse.json({ error: '추첨이 완료되지 않았습니다' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('league_drafts')
    .update({
      status: 'in_progress',
      started_at: new Date().toISOString(),
      pick_deadline: null,
    })
    .eq('id', draftId)
    .eq('status', 'lottery_done')
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, draft: updated })
}
