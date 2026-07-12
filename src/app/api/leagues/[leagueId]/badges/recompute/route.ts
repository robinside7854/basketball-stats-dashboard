// POST /api/leagues/[leagueId]/badges/recompute
// 요청 바디: { gameId?: string }
//   - gameId 있으면 그 게임만 재계산
//   - 없으면 리그의 is_complete=true 게임 전체 재계산
// 인증: X-League-Pin 헤더 (편집 PIN, 어드민만)

import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'
import { syncBadgesForGame } from '@/lib/badges/computeBadges'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params

  if (!(await verifyLeaguePin(req, leagueId))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: { gameId?: string } = {}
  try { body = await req.json() } catch { /* empty body allowed */ }

  const supabase = createClient()

  // 처리 대상 게임 ID 목록
  let gameIds: string[] = []
  if (body.gameId) {
    // 요청된 게임이 리그 소속인지 검증
    const { data: g } = await supabase
      .from('league_games')
      .select('id, league_id, is_complete')
      .eq('id', body.gameId)
      .maybeSingle()
    if (!g || g.league_id !== leagueId) {
      return NextResponse.json({ ok: false, error: 'game not found in league' }, { status: 404 })
    }
    gameIds = [g.id as string]
  } else {
    const { data: games } = await supabase
      .from('league_games')
      .select('id')
      .eq('league_id', leagueId)
      .eq('is_complete', true)
    gameIds = (games ?? []).map(g => g.id as string)
  }

  let processedGames = 0
  let badgesCreated = 0
  let badgesRemoved = 0

  for (const gid of gameIds) {
    try {
      const r = await syncBadgesForGame(supabase, gid)
      badgesCreated += r.created
      badgesRemoved += r.removed
      processedGames++
    } catch (err) {
      // 개별 실패는 로그만 남기고 다음 게임 처리 진행
      console.error(`[badges/recompute] gameId=${gid} failed:`, err)
    }
  }

  return NextResponse.json({
    ok: true,
    processed_games: processedGames,
    badges_created: badgesCreated,
    badges_removed: badgesRemoved,
  })
}
