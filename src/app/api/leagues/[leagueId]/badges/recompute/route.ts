// POST /api/leagues/[leagueId]/badges/recompute
// 요청 바디: { gameId?: string }
//   - gameId 있으면 그 게임 + 그 날짜의 라운드 배지 재계산
//   - 없으면 리그의 is_complete=true 게임 전체 재계산 (게임 배지 + 각 날짜 라운드 배지 1회씩)
// 인증: X-League-Pin 헤더 (편집 PIN, 어드민만)

import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { syncBadgesForGame, computePerGameBadges, computeRoundBadges } from '@/lib/badges/computeBadges'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params

  if (!(await canEditLeague(req, leagueId))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: { gameId?: string } = {}
  try { body = await req.json() } catch { /* empty body allowed */ }

  const supabase = createClient()

  // 단일 게임 재계산 — syncBadgesForGame 이 게임 배지 + 그 날짜 라운드 배지 모두 처리
  if (body.gameId) {
    const { data: g } = await supabase
      .from('league_games')
      .select('id, league_id, is_complete')
      .eq('id', body.gameId)
      .maybeSingle()
    if (!g || g.league_id !== leagueId) {
      return NextResponse.json({ ok: false, error: 'game not found in league' }, { status: 404 })
    }
    try {
      const r = await syncBadgesForGame(supabase, g.id as string)
      return NextResponse.json({
        ok: true,
        processed_games: 1,
        badges_created: r.created,
        badges_removed: r.removed,
      })
    } catch (err) {
      console.error(`[badges/recompute] gameId=${body.gameId} failed:`, err)
      return NextResponse.json({ ok: false, error: 'recompute failed' }, { status: 500 })
    }
  }

  // 전 리그 재계산 — 게임 배지 각 게임별, 라운드 배지는 날짜별 1회
  const { data: games } = await supabase
    .from('league_games')
    .select('id, date')
    .eq('league_id', leagueId)
    .eq('is_complete', true)
    .not('date', 'is', null)

  const gameRows = (games ?? []) as Array<{ id: string; date: string }>
  let processedGames = 0
  let badgesCreated = 0
  let badgesRemoved = 0

  // ── STEP 1: 게임 단위 배지 ──
  for (const g of gameRows) {
    try {
      // 기존 게임 배지 삭제 (game_id 매치)
      const { data: existing } = await supabase
        .from('player_badges')
        .select('id')
        .eq('game_id', g.id)
      const removed = existing?.length ?? 0
      if (removed > 0) {
        await supabase.from('player_badges').delete().eq('game_id', g.id)
      }
      badgesRemoved += removed

      const payloads = await computePerGameBadges(supabase, g.id)
      if (payloads.length > 0) {
        const { error } = await supabase.from('player_badges').insert(payloads)
        if (error) throw new Error(error.message)
        badgesCreated += payloads.length
      }
      processedGames++
    } catch (err) {
      console.error(`[badges/recompute] per-game gameId=${g.id} failed:`, err)
    }
  }

  // ── STEP 2: 라운드 단위 배지 (날짜별 1회) ──
  const uniqueDates = Array.from(new Set(gameRows.map(g => g.date)))
  for (const date of uniqueDates) {
    try {
      // 기존 라운드 배지 삭제
      const { data: existing } = await supabase
        .from('player_badges')
        .select('id')
        .eq('league_id', leagueId)
        .eq('earned_at_date', date)
        .is('game_id', null)
      const removed = existing?.length ?? 0
      if (removed > 0) {
        await supabase
          .from('player_badges')
          .delete()
          .eq('league_id', leagueId)
          .eq('earned_at_date', date)
          .is('game_id', null)
      }
      badgesRemoved += removed

      const payloads = await computeRoundBadges(supabase, leagueId, date)
      if (payloads.length > 0) {
        const { error } = await supabase.from('player_badges').insert(payloads)
        if (error) throw new Error(error.message)
        badgesCreated += payloads.length
      }
    } catch (err) {
      console.error(`[badges/recompute] round date=${date} failed:`, err)
    }
  }

  return NextResponse.json({
    ok: true,
    processed_games: processedGames,
    badges_created: badgesCreated,
    badges_removed: badgesRemoved,
  })
}
