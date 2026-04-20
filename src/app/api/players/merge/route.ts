import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { keepId, mergeId } = await req.json()

  if (!keepId || !mergeId || keepId === mergeId) {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 })
  }

  const supabase = createClient()

  // 1. game_events.player_id 이전
  const { error: e1 } = await supabase
    .from('game_events')
    .update({ player_id: keepId })
    .eq('player_id', mergeId)

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

  // 2. game_events.related_player_id 이전 (어시스트 연결)
  const { error: e2 } = await supabase
    .from('game_events')
    .update({ related_player_id: keepId })
    .eq('related_player_id', mergeId)

  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  // 3. player_minutes 이전 (같은 game_id+player_id 중복 방지: upsert 불가 → 중복 row 발생 가능성 낮아 직접 update)
  const { error: e3 } = await supabase
    .from('player_minutes')
    .update({ player_id: keepId })
    .eq('player_id', mergeId)

  if (e3) return NextResponse.json({ error: e3.message }, { status: 500 })

  // 4. 통합된 선수 비활성화 (삭제 대신 is_active=false 처리)
  const { error: e4 } = await supabase
    .from('players')
    .update({ is_active: false })
    .eq('id', mergeId)

  if (e4) return NextResponse.json({ error: e4.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
