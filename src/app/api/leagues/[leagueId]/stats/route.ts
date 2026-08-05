import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { computeLeagueStats, type LeagueStatsUnit } from '@/lib/stats/leagueStats'
import { canViewStats } from '@/lib/auth/guard'
import { fetchLeagueMode } from '@/lib/league/mode'

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
  // unit 기본값 — 리그형(미라클)은 하루=한 라운드=한 경기라 'round' 기본값이 맞지만,
  // 대회형(파란날개)은 토너먼트 특성상 하루에 여러 경기(8강+4강 등)가 몰릴 수 있어
  // 'round'(날짜 유니크 카운트)로 세면 실제 경기 수보다 훨씬 적게 잡힌다.
  // Task 4(옛 화면 대조)에서 실측 발견: 라운드 기본값으로는 선수당 games_played 가
  // 레거시 대비 최대 절반 수준으로 줄어들어(예: 14경기 → 6라운드) 경기당 평균이 부풀려짐.
  // 쿼리로 unit 을 명시하면 그 값을 그대로 쓰고, 생략된 경우에만 mode 로 기본값을 정한다.
  const unit = (sp.get('unit') as LeagueStatsUnit | null) ?? (
    (await fetchLeagueMode(leagueId)) === 'tournament' ? 'game' : 'round'
  )

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
