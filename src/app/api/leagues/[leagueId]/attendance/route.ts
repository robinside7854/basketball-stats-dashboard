// GET /api/leagues/[leagueId]/attendance
// 각 선수의 라운드(=날짜) 참여 수 + 전체 스케줄 라운드 수 반환.
// 참여 판정: 그 날짜의 is_started 게임에 이벤트(sub_in/out 포함) 가 있으면 참여로 인정.
// 게스트도 동일 기준 (참여한 라운드만 카운트).
import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/admin'

interface AttendanceResponse {
  totalRounds: number
  perPlayer: Record<string, { rounds: number; rate: number }>
}

const getCached = (leagueId: string) =>
  unstable_cache(
    async (): Promise<AttendanceResponse> => {
      const sb = createClient()

      // 1) 전체 스케줄 라운드 (distinct date, is_started 만)
      const { data: games } = await sb
        .from('league_games')
        .select('id, date')
        .eq('league_id', leagueId)
        .eq('is_started', true)
        .not('date', 'is', null)
      const gameRows = (games ?? []) as Array<{ id: string; date: string }>
      const gameDate: Record<string, string> = {}
      const dateSet = new Set<string>()
      for (const g of gameRows) {
        gameDate[g.id] = g.date
        dateSet.add(g.date)
      }
      const totalRounds = dateSet.size

      // 2) 각 선수의 참여 라운드 — 이벤트 페이지네이션
      //    (game_id, league_player_id 만 select 해서 최소량 유지)
      const perPlayerDates: Record<string, Set<string>> = {}
      const gameIds = gameRows.map(g => g.id)
      if (gameIds.length > 0) {
        const PAGE = 1000
        for (let pg = 0; ; pg++) {
          const { data: chunk } = await sb
            .from('league_game_events')
            .select('league_game_id, league_player_id')
            .in('league_game_id', gameIds)
            .not('league_player_id', 'is', null)
            .range(pg * PAGE, (pg + 1) * PAGE - 1)
          if (!chunk || chunk.length === 0) break
          for (const r of chunk as Array<{ league_game_id: string; league_player_id: string }>) {
            const date = gameDate[r.league_game_id]
            if (!date) continue
            const set = perPlayerDates[r.league_player_id] ??= new Set()
            set.add(date)
          }
          if (chunk.length < PAGE) break
        }
      }

      const perPlayer: Record<string, { rounds: number; rate: number }> = {}
      for (const [pid, dates] of Object.entries(perPlayerDates)) {
        const rounds = dates.size
        const rate = totalRounds > 0 ? Math.round((rounds / totalRounds) * 1000) / 10  // 소수 1자리
          : 0
        perPlayer[pid] = { rounds, rate }
      }
      return { totalRounds, perPlayer }
    },
    ['league-attendance', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-events`, `league-${leagueId}-games`], revalidate: 300 },
  )

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  try {
    const data = await getCached(leagueId)()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
