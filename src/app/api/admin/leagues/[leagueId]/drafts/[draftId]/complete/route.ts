// 드래프트 세션 강제 종료 — 어드민 전용
//   status: 'in_progress' → 'completed'
//   completed_at = now()
//
// 픽이 끝까지 가지 않은 상황에서도 어드민이 강제로 종료할 때 사용.

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
    .select('id, status')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
  const d = draft as { id: string; status: string }
  if (d.status === 'completed') {
    return NextResponse.json({ error: '이미 종료된 세션입니다' }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('league_drafts')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', draftId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
