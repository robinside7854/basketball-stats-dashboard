// GET /api/leagues/[leagueId]/highlights/[date]
// 특정 라운드(YYYY-MM-DD)의 모든 하이라이트 클립 + 필터 옵션
// 쿼리: ?playerId=X → 클라이언트 필터링과 별도로 서버 필터도 지원 (공유 URL 용)
import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/admin'
import { loadRoundDetail } from '@/lib/highlights/loader'
import { canViewStats } from '@/lib/auth/guard'

const getCached = (leagueId: string, date: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      return loadRoundDetail(sb, leagueId, date)
    },
    ['highlights-round', leagueId, date],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`, `league-${leagueId}-events`], revalidate: 60 },
  )

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; date: string }> }
) {
  const { leagueId, date } = await params
  // 스탯 게이팅 — 승인 회원 또는 편집 PIN 전용 (2026-07-28)
  if (!(await canViewStats(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 })
  }
  try {
    const detail = await getCached(leagueId, date)()
    const url = new URL(req.url)
    const playerId = url.searchParams.get('playerId')
    if (playerId) {
      return NextResponse.json({
        ...detail,
        clips: detail.clips.filter(c => c.player_id === playerId),
      })
    }
    return NextResponse.json(detail)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
