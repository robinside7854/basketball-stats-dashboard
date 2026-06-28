// 드래프트 픽 시간 변경 — 어드민/PIN/감독관 권한.
// 방(/draft/[token]) 내에서 채팅으로 단장들과 합의한 후 감독관이 변경.
//
// PATCH body: { pick_seconds: number, apply_now?: boolean }
// 30 ~ 600초 범위.
// apply_now=true 이면, 현재 픽이 진행 중(status=in_progress + pick_deadline 존재)일 때
//   pick_deadline = now + 새 pick_seconds 로 즉시 갱신. 단장들에게 새 시간이 바로 적용됨.
// 기본 false — 다음 픽부터 적용 (안전).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { isDraftSessionControllerByDraftId } from '@/lib/draftManagerAuth'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; draftId: string }> },
) {
  const { leagueId, draftId } = await params
  if (!await isDraftSessionControllerByDraftId(req, leagueId, draftId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null) as { pick_seconds?: number; apply_now?: boolean } | null
  const v = body?.pick_seconds
  const applyNow = body?.apply_now === true
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 30 || v > 600) {
    return NextResponse.json({ error: '픽 시간은 30~600초 사이여야 합니다' }, { status: 400 })
  }
  const supabase = createClient()
  const seconds = Math.floor(v)

  // 현재 픽 데드라인 즉시 갱신 옵션 — in_progress 이고 pick_deadline 존재할 때만
  let updatePayload: Record<string, unknown> = { pick_seconds: seconds }
  if (applyNow) {
    const { data: cur } = await supabase
      .from('league_drafts')
      .select('status, pick_deadline')
      .eq('id', draftId)
      .eq('league_id', leagueId)
      .maybeSingle()
    if (cur && (cur as { status: string }).status === 'in_progress' && (cur as { pick_deadline: string | null }).pick_deadline) {
      const newDeadline = new Date(Date.now() + seconds * 1000).toISOString()
      updatePayload = { pick_seconds: seconds, pick_deadline: newDeadline }
    }
  }

  const { data, error } = await supabase
    .from('league_drafts')
    .update(updatePayload)
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .select('id, pick_seconds, pick_deadline')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, applied_now: applyNow && 'pick_deadline' in updatePayload })
}
