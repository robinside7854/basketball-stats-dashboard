// GET /api/leagues/[leagueId]/highlights
// 하이라이트 라운드 목록 (최근 12개, 성공 슛 있는 라운드만)
import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/admin'
import { loadRecentRounds } from '@/lib/highlights/loader'
import { canViewStats } from '@/lib/auth/guard'

const getCached = (leagueId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      return loadRecentRounds(sb, leagueId, 24)
    },
    ['highlights-recent-rounds', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`, `league-${leagueId}-events`], revalidate: 60 },
  )

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  // 스탯 게이팅 — 승인 회원 또는 편집 PIN 전용 (2026-07-28)
  if (!(await canViewStats(_req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  try {
    const rounds = await getCached(leagueId)()
    return NextResponse.json(rounds.slice(0, 12))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
