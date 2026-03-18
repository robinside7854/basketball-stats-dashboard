import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

// POST /api/events/split-quarter
// Body: { gameId, fromEventId, newQuarter }
// "fromEventId 이후의 같은 쿼터 이벤트를 newQuarter로 변경"
export async function POST(req: Request) {
  const { gameId, fromEventId, newQuarter } = await req.json()
  if (!gameId || !fromEventId || !newQuarter) {
    return NextResponse.json({ error: 'gameId, fromEventId, newQuarter 필수' }, { status: 400 })
  }

  const supabase = createClient()

  // 1. 분리 기점 이벤트 조회
  const { data: pivot, error: pivotErr } = await supabase
    .from('game_events')
    .select('id, quarter, created_at')
    .eq('id', fromEventId)
    .single()

  if (pivotErr || !pivot) {
    return NextResponse.json({ error: '이벤트를 찾을 수 없습니다' }, { status: 404 })
  }

  const oldQuarter = pivot.quarter

  // 2. 해당 경기에서 기점 이후 같은 쿼터 이벤트 모두 조회
  const { data: targets, error: fetchErr } = await supabase
    .from('game_events')
    .select('id')
    .eq('game_id', gameId)
    .eq('quarter', oldQuarter)
    .gte('created_at', pivot.created_at)

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  const ids = (targets ?? []).map(e => e.id)

  if (ids.length === 0) {
    return NextResponse.json({ updated: 0 })
  }

  // 3. 일괄 업데이트
  const { error: updateErr } = await supabase
    .from('game_events')
    .update({ quarter: newQuarter })
    .in('id', ids)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ updated: ids.length, oldQuarter, newQuarter })
}
