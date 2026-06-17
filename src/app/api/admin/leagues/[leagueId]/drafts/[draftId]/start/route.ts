// 드래프트 세션 시작 — 어드민 전용
//   status: 'setup' → 'in_progress'
//   started_at = now()
//
// 'in_progress' 또는 'completed' 상태에서는 충돌 응답.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { isDraftManager } from '@/lib/draftManagerAuth'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; draftId: string }> },
) {
  const { leagueId, draftId } = await params
  if (!await isDraftManager(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createClient()

  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, status, draft_order')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
  const d = draft as { id: string; status: string; draft_order: string[] }
  if (d.status !== 'setup') {
    return NextResponse.json({ error: `시작 불가 — 현재 상태: ${d.status}` }, { status: 409 })
  }
  if (!d.draft_order || d.draft_order.length === 0) {
    return NextResponse.json({ error: 'draft_order 가 비어있습니다' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('league_drafts')
    .update({ status: 'in_progress', started_at: new Date().toISOString() })
    .eq('id', draftId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
