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
// 표시 정책:
//   - 각 카테고리별 count ≥ minStreak (기본 2) 인 선수만 포함
//   - count 는 최신 → 역순 walk 로 조건 위반 시점에서 중단
//   - 최신 경기에서 조건 미충족이면 count=0 (=streak 없음, 응답 제외)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { computePerDayStats, isDoubleDouble, fetchPlayerMeta } from '@/lib/stats/perDayStats'

export type StreakCategory = 'pts10' | 'pts20' | 'tp1' | 'dd' | 'wins' | 'stlblk3'

interface StreakEntry {
  player_id: string
  name: string
  number: number | null
  category: StreakCategory
  count: number
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const sp = new URL(req.url).searchParams
  const minStreak = Math.max(2, Number(sp.get('minStreak') ?? 2))

  const supabase = createClient()
  const [{ dayStats, dayWL }, playerMeta] = await Promise.all([
    computePerDayStats(supabase, leagueId),
    fetchPlayerMeta(supabase, leagueId),
  ])

  const streaks: StreakEntry[] = []

  for (const [pid, byDate] of dayStats) {
    // 참여 날짜 desc 정렬 (최신 → 과거)
    const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a))
    if (dates.length === 0) continue

    // 각 카테고리 별도 walk
    const cats: { key: StreakCategory; check: (date: string, stats: ReturnType<typeof byDate.get>) => boolean }[] = [
      { key: 'pts10',   check: (_, s) => (s?.pts ?? 0) >= 10 },
      { key: 'pts20',   check: (_, s) => (s?.pts ?? 0) >= 20 },
      { key: 'tp1',     check: (_, s) => (s?.fg3m ?? 0) >= 1 },
      { key: 'dd',      check: (_, s) => s ? isDoubleDouble(s) : false },
      { key: 'wins',    check: (date) => {
        const wl = dayWL.get(pid)?.get(date)
        return wl ? wl.wins > wl.losses : false
      }},
      { key: 'stlblk3', check: (_, s) => ((s?.stl ?? 0) + (s?.blk ?? 0)) >= 3 },
    ]

    for (const cat of cats) {
      let count = 0
      for (const date of dates) {
        const stats = byDate.get(date)
        if (cat.check(date, stats)) count++
        else break
      }
      if (count >= minStreak) {
        const meta = playerMeta[pid]
        streaks.push({
          player_id: pid,
          name: meta?.name ?? '알 수 없음',
          number: meta?.number ?? null,
          category: cat.key,
          count,
        })
      }
    }
  }

  // count desc 로 정렬
  streaks.sort((a, b) => b.count - a.count)

  return NextResponse.json({ streaks })
}
