// 픽 타이머 시작 — 공개 연출(추첨·픽 공개)이 끝난 뒤 호출
// 서버는 추첨 직후에도, 매 픽 직후에도 pick_deadline 을 비워 둔다.
// 연출이 닫힌 시점에 이 라우트가 불려야 다음 단장의 시계가 돈다.
// 멱등: in_progress + pick_deadline 없음일 때만 설정한다. 첫 픽 전후를 가리지 않는다
// (예전엔 total_picks=0 조건이 있어 2픽부터는 시계를 걸 수 없었다).
// 조건부 UPDATE(.is('pick_deadline', null))라 두 번째 호출은 0행 → 마감을 바꾸지 않고 200 으로 돌아간다.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { lookupDraftCode } from '@/lib/leagueDraftAuth'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
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

  // 권한: 이 분기 코드 또는 리그 편집 권한(어드민 회원 · 전환기 PIN)
  const plain = req.headers.get('X-Draft-Code')?.trim()
  const codeOk = plain ? !!(await lookupDraftCode(leagueId, d.quarter_id, plain)) : false
  if (!codeOk && !(await canEditLeague(req, leagueId))) {
    return NextResponse.json({ error: '권한 없음' }, { status: 401 })
  }

  if (d.status !== 'in_progress' || d.pick_deadline) {
    // 이미 시작되었거나 시작 불필요 — 멱등 응답
    return NextResponse.json({ ok: true, already: true, pick_deadline: d.pick_deadline })
  }

  const deadline = newPickDeadline(Date.now(), d.pick_seconds)
  const { data: rows, error } = await supabase
    .from('league_drafts')
    .update({ pick_deadline: deadline })
    .eq('id', draftId)
    .eq('status', 'in_progress')
    .is('pick_deadline', null)
    .select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rows || rows.length === 0) {
    // 경합 — 다른 클라이언트가 먼저 걸었다. 그 마감을 그대로 알려준다(덮어쓰지 않는다).
    const { data: fresh } = await supabase
      .from('league_drafts')
      .select('pick_deadline')
      .eq('id', draftId)
      .maybeSingle()
    return NextResponse.json({ ok: true, already: true, pick_deadline: (fresh as { pick_deadline: string | null } | null)?.pick_deadline ?? null })
  }
  return NextResponse.json({ ok: true, pick_deadline: deadline, draft: rows[0] })
}
