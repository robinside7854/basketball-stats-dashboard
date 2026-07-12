// 리그 전체 진행 중 연속 기록 (Streaks)
//
// 6 카테고리별 각 선수의 "최신 경기부터 역방향 walk 하여 조건 유지 중인 연속 경기일 수" 반환.
//
// 카테고리:
//   pts10   — 두 자릿수 득점 (PTS ≥ 10)
//   pts20   — 20+ 득점 (PTS ≥ 20)
//   tp1     — 3점 성공 (3PM ≥ 1)
//   dd      — 더블더블 (PTS/REB/AST 중 2개 이상 10+)
//   wins    — 참여 승리 (승수 > 패수)
//   stlblk3 — STL + BLK ≥ 3
//
// GET /api/leagues/[id]/streaks?minStreak=2
//   → { streaks: [{ player_id, name, number, category, count }, ...] } — count desc
//
// 실제 로직은 `@/lib/stats/streaks` 로 추출 — SSR 프리페치와 공유.
import { NextResponse } from 'next/server'
import { computeStreaks } from '@/lib/stats/streaks'

export type { StreakCategory } from '@/lib/stats/streaks'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const sp = new URL(req.url).searchParams
  const minStreak = Math.max(2, Number(sp.get('minStreak') ?? 2))

  const result = await computeStreaks(null, leagueId, { minStreak })
  return NextResponse.json(result)
}
