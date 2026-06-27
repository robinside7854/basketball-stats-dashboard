// 추첨 대기 화면 열기 — 감독관(또는 어드민/PIN)만 가능.
// 모든 참가자가 READY 상태이어야 진행 (force 옵션 있음).
// status: 'ready_check' → 'lottery_waiting'.
// 이 단계에서는 아직 추첨이 실행되지 않음 — 모두 대기 화면을 시청한 뒤
// 감독관이 다시 '추첨 시작' (/lottery) 을 눌러야 실제 추첨 진행.

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
  const body = await req.json().catch(() => ({})) as { force?: boolean }
  const supabase = createClient()

  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, quarter_id, status, ready_state')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
  const d = draft as { id: string; quarter_id: string; status: string; ready_state: Record<string, boolean> }

  // 권한: 어드민/감독관/PIN
  const session = await auth()
  if (!session) {
    const sup = await verifySupervisorCode(req, leagueId, d.quarter_id)
    if (!sup.valid && !await verifyLeaguePin(req, leagueId)) {
      return NextResponse.json({ error: '권한 없음 (어드민/감독관/PIN 전용)' }, { status: 401 })
    }
  }

  if (d.status !== 'ready_check') {
    return NextResponse.json({ error: `추첨 대기 진입 불가 — 현재 상태: ${d.status}` }, { status: 409 })
  }

  // 모두 준비 확인 (force 옵션)
  if (!body.force) {
    const { data: teams } = await supabase.from('league_teams').select('id').eq('league_id', leagueId)
    const teamIds = (teams ?? []).map(t => t.id)
    const { data: supCode } = await supabase
      .from('league_draft_codes')
      .select('id')
      .eq('league_id', leagueId)
      .eq('quarter_id', d.quarter_id)
      .eq('role', 'supervisor')
      .eq('is_active', true)
      .limit(1)
    const ready = d.ready_state ?? {}
    const notReady = teamIds.filter(tid => !ready[tid])
    const supMissing = !!(supCode && supCode.length > 0) && !ready['supervisor']
    if (notReady.length > 0 || supMissing) {
      return NextResponse.json(
        { error: '아직 모든 참가자가 준비되지 않았습니다', not_ready_teams: notReady, supervisor_missing: !!supMissing },
        { status: 409 },
      )
    }
  }

  const { data: updated, error } = await supabase
    .from('league_drafts')
    .update({ status: 'lottery_waiting' })
    .eq('id', draftId)
    .eq('status', 'ready_check')
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, draft: updated })
}
