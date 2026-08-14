// GET /api/leagues/[leagueId]/classics — 월별 명경기
//
// 계산은 `@/lib/stats/classicGames` 가 한다. 여기는 게이팅·캐시만 맡는다.
//
// 캐시: 이벤트 전량 스캔이라 매 요청 계산하면 비싸다. 다른 스탯 화면과 같은
//   `league-{id}-games` 태그를 달아, 경기·이벤트 mutation 이 이미 부르는 revalidateTag 로
//   자동 무효화된다(배선 추가 없음).

import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { computeClassicGames } from '@/lib/stats/classicGames'
import { canViewStats } from '@/lib/auth/guard'

const getCached = (leagueId: string) =>
  unstable_cache(
    async () => computeClassicGames(null, leagueId),
    ['league-classics', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`], revalidate: 300 },
  )()

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  // 명경기는 경기 기록에서 파생된 스탯이다 — 스탯 게이팅과 같은 문을 쓴다.
  if (!(await canViewStats(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  try {
    return NextResponse.json(await getCached(leagueId))
  } catch (err) {
    // 빈 배열로 삼키지 않는다 — "명경기가 없다"와 "계산이 실패했다"는 화면에서 구분돼야 한다.
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
