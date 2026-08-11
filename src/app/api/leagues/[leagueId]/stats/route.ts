import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { computeLeagueStats, type LeagueStatsUnit } from '@/lib/stats/leagueStats'
import { canViewStats } from '@/lib/auth/guard'

// GET /api/leagues/[leagueId]/stats
// 쿼리 파라미터: quarterId, quarterIds(comma), teamId, playerId, from, to, unit
// 실제 집계 로직은 `@/lib/stats/leagueStats` 로 추출 — SSR 프리페치와 공유.
//
// 성능(2026-07-27): 스탯 탭 진입/분기·단위 토글마다 이벤트 전량 집계를 반복하던 것을
//   unstable_cache 로 감쌈. 홈 SSR(getCachedLeaderStats)과 동일한 `league-{id}-games` 태그를
//   달아, 경기/이벤트 mutation API 들의 기존 revalidateTag 호출로 자동 무효화된다(배선 공짜).
type StatOpts = {
  quarterId: string | null
  quarterIds: string[] | null
  teamId: string | null
  playerId: string | null
  from: string | null
  to: string | null
  unit: LeagueStatsUnit
}

const getCachedStats = (leagueId: string, opts: StatOpts) =>
  unstable_cache(
    async () => computeLeagueStats(null, leagueId, opts),
    [
      'api-league-stats', leagueId,
      opts.quarterId ?? '', (opts.quarterIds ?? []).join(','),
      opts.teamId ?? '', opts.playerId ?? '', opts.from ?? '', opts.to ?? '', opts.unit,
    ],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`], revalidate: 60 },
  )()

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  // 스탯 게이팅 — 승인 회원 또는 편집 PIN 전용 (2026-07-28)
  if (!(await canViewStats(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const sp = new URL(req.url).searchParams
  const quarterIdsRaw = sp.get('quarterIds')
  const quarterIds = quarterIdsRaw ? quarterIdsRaw.split(',').filter(Boolean) : null
  // unit 쿼리파라미터는 더 이상 받지 않는다 — 라운드(R) 기준 하나로 통일(2026-08-10).
  // 값을 읽어 쓰면 옛 화면이나 북마크된 URL 의 unit=game 이 살아나 다른 숫자를 만든다.
  const unit: LeagueStatsUnit = 'round'

  try {
    const result = await getCachedStats(leagueId, {
      quarterId: sp.get('quarterId'),
      quarterIds,
      teamId: sp.get('teamId'),
      playerId: sp.get('playerId'),
      from: sp.get('from'),
      to: sp.get('to'),
      unit,
    })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
