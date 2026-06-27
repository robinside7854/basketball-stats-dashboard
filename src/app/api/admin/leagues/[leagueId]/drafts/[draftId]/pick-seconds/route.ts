// 드래프트 픽 시간 변경 — 어드민/PIN/감독관 권한.
// 방(/draft/[token]) 내에서 채팅으로 단장들과 합의한 후 감독관이 변경.
//
// PATCH body: { pick_seconds: number }
// 30 ~ 600초 범위.

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
  const body = await req.json().catch(() => null) as { pick_seconds?: number } | null
  const v = body?.pick_seconds
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 30 || v > 600) {
    return NextResponse.json({ error: '픽 시간은 30~600초 사이여야 합니다' }, { status: 400 })
  }
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_drafts')
    .update({ pick_seconds: Math.floor(v) })
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .select('id, pick_seconds')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
