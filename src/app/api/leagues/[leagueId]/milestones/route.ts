// 커리어 마일스톤 트래커
//
// 리그 전체 참여 이력을 walk 하며 임박(다음 목표) + 최근 달성(30일 내) 마일스톤을 반환.
//
// 카테고리별 임계값 (누적):
//   PTS: 100, 250, 500, 1000, 2000
//   REB: 50, 100, 250, 500, 1000
//   AST: 25, 50, 100, 250, 500
//   STL: 10, 25, 50, 100, 250
//   BLK: 5, 10, 25, 50, 100
//   3PM: 10, 25, 50, 100, 250
//   GP:  10, 25, 50, 100, 200 (경기일 수)
//
// GET /api/leagues/[id]/milestones?horizonDays=30&maxUpcoming=8&maxRecent=8
//   → {
//       upcoming: [{ player_id, name, number, category, current, target, distance, percent }],
//       recent:   [{ player_id, name, number, category, target, achieved_at }]
//     }
//
// 실제 로직은 `@/lib/stats/milestones` 로 추출 — SSR 프리페치와 공유.
import { NextResponse } from 'next/server'
import { computeMilestones } from '@/lib/stats/milestones'

export type { MilestoneCategory } from '@/lib/stats/milestones'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const sp = new URL(req.url).searchParams
  const horizonDays = Math.max(1, Number(sp.get('horizonDays') ?? 30))
  const maxUpcoming = Math.max(1, Number(sp.get('maxUpcoming') ?? 8))
  const maxRecent = Math.max(1, Number(sp.get('maxRecent') ?? 8))

  const result = await computeMilestones(null, leagueId, { horizonDays, maxUpcoming, maxRecent })
  return NextResponse.json(result)
}
