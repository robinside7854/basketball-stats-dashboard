// GET /api/cron/badges-recompute
// Vercel Cron 매일 실행 — 완료된(is_complete=true) 게임 전체의 배지를 재계산.
//   - 옵션 1(마감 API 훅) 이 누락되거나 실패했을 때의 안전망 (idempotent).
//   - Authorization: Bearer ${CRON_SECRET} 검증. Vercel Cron 은 자동으로 이 헤더를 주입.
//   - 사용자 트리거도 허용 (같은 헤더로 curl 호출 가능).
//
// Vercel Cron 설정: vercel.json 의 crons 항목 참고.
//   schedule "0 20 * * *" = 매일 UTC 20:00 = KST 05:00

import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { syncBadgesForGame } from '@/lib/badges/computeBadges'

// 배지 재계산은 게임당 수백ms · 리그당 수십~수백 게임 · 다중 리그 → 60초 초과 가능.
// Vercel Hobby 는 최대 300s, Pro 는 900s. 여유 있게 설정.
export const maxDuration = 300

interface GameLite { id: string; date: string | null; league_id: string }

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createClient()

  // 완료된 게임 전수 조회 (날짜 있는 것만 — 라운드 배지에 date 필요)
  const { data: games, error } = await supabase
    .from('league_games')
    .select('id, date, league_id')
    .eq('is_complete', true)
    .not('date', 'is', null)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const gameRows = (games ?? []) as GameLite[]
  let processed = 0
  let created = 0
  let removed = 0
  const failed: string[] = []

  // 게임별 순차 처리 (동시성 폭주 방지 · Supabase 커넥션 안정)
  for (const g of gameRows) {
    try {
      const r = await syncBadgesForGame(supabase, g.id)
      created += r.created
      removed += r.removed
      processed++
    } catch (err) {
      failed.push(g.id)
      console.error(`[cron/badges-recompute] gameId=${g.id} failed:`, err)
    }
  }

  console.log(`[cron/badges-recompute] processed=${processed}/${gameRows.length} created=${created} removed=${removed} failed=${failed.length}`)

  return NextResponse.json({
    ok: true,
    processed_games: processed,
    total_games: gameRows.length,
    badges_created: created,
    badges_removed: removed,
    failed_game_ids: failed,
  })
}
