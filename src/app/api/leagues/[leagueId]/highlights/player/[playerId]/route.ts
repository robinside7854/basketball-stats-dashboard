// GET /api/leagues/[leagueId]/highlights/player/[playerId]
// 선수 한 명의 전체 성공 슛 클립 + 분기/유형 필터 옵션
// 필터는 클라이언트에서 처리 (전부 반환 · 60s 캐시)
import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/admin'
import { loadPlayerHighlights } from '@/lib/highlights/loader'

const getCached = (leagueId: string, playerId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      return loadPlayerHighlights(sb, leagueId, playerId)
    },
    ['highlights-player', leagueId, playerId],
    {
      tags: [
        `league-${leagueId}`,
        `league-${leagueId}-events`,
        `league-${leagueId}-players-${playerId}`,
      ],
      revalidate: 60,
    },
  )

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string; playerId: string }> }
) {
  const { leagueId, playerId } = await params
  try {
    const data = await getCached(leagueId, playerId)()
    if (!data) return NextResponse.json({ error: 'player not found' }, { status: 404 })
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
