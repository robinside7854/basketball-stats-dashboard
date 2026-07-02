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

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { computePerDayStats, fetchPlayerMeta, type PerDayStats } from '@/lib/stats/perDayStats'

export type MilestoneCategory = 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK' | '3PM' | 'GP'

const THRESHOLDS: Record<MilestoneCategory, number[]> = {
  PTS: [100, 250, 500, 1000, 2000],
  REB: [50, 100, 250, 500, 1000],
  AST: [25, 50, 100, 250, 500],
  STL: [10, 25, 50, 100, 250],
  BLK: [5, 10, 25, 50, 100],
  '3PM': [10, 25, 50, 100, 250],
  GP:  [10, 25, 50, 100, 200],
}

interface UpcomingEntry {
  player_id: string
  name: string
  number: number | null
  category: MilestoneCategory
  current: number
  target: number
  distance: number
  percent: number  // 진행률 (0-100)
}

interface RecentEntry {
  player_id: string
  name: string
  number: number | null
  category: MilestoneCategory
  target: number
  achieved_at: string  // YYYY-MM-DD
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const sp = new URL(req.url).searchParams
  const horizonDays = Math.max(1, Number(sp.get('horizonDays') ?? 30))
  const maxUpcoming = Math.max(1, Number(sp.get('maxUpcoming') ?? 8))
  const maxRecent = Math.max(1, Number(sp.get('maxRecent') ?? 8))

  const supabase = createClient()
  const [{ dayStats }, playerMeta] = await Promise.all([
    computePerDayStats(supabase, leagueId),
    fetchPlayerMeta(supabase, leagueId),
  ])

  // 날짜 asc 로 누적 walk 하며 임계값 교차 시점 기록
  const upcoming: UpcomingEntry[] = []
  const recent: RecentEntry[] = []

  const today = new Date()
  const horizonStart = new Date(today.getTime() - horizonDays * 24 * 60 * 60 * 1000)
  const horizonStartIso = horizonStart.toISOString().slice(0, 10)

  const catValue = (cat: MilestoneCategory, s: PerDayStats): number => {
    switch (cat) {
      case 'PTS': return s.pts
      case 'REB': return s.reb
      case 'AST': return s.ast
      case 'STL': return s.stl
      case 'BLK': return s.blk
      case '3PM': return s.fg3m
      case 'GP':  return 1  // GP 는 날짜 1개당 +1
    }
  }

  for (const [pid, byDate] of dayStats) {
    const meta = playerMeta[pid]
    const dates = [...byDate.keys()].sort()  // asc

    // 각 카테고리별 누적 walk
    for (const cat of Object.keys(THRESHOLDS) as MilestoneCategory[]) {
      const thresholds = THRESHOLDS[cat]
      let cumul = 0
      let nextIdx = 0

      for (const date of dates) {
        const stats = byDate.get(date)
        if (!stats) continue
        const before = cumul
        cumul += catValue(cat, stats)

        // 교차한 임계값 모두 recent 로 기록 (최근 horizon 내만)
        while (nextIdx < thresholds.length && cumul >= thresholds[nextIdx]) {
          const t = thresholds[nextIdx]
          if (before < t && date >= horizonStartIso) {
            recent.push({
              player_id: pid,
              name: meta?.name ?? '알 수 없음',
              number: meta?.number ?? null,
              category: cat,
              target: t,
              achieved_at: date,
            })
          }
          nextIdx++
        }
      }

      // walk 종료 후 남은 nextIdx 가 다음 목표
      if (nextIdx < thresholds.length && cumul > 0) {
        const target = thresholds[nextIdx]
        const distance = target - cumul
        const percent = +(cumul / target * 100).toFixed(1)
        upcoming.push({
          player_id: pid,
          name: meta?.name ?? '알 수 없음',
          number: meta?.number ?? null,
          category: cat,
          current: cumul,
          target,
          distance,
          percent,
        })
      }
    }
  }

  // upcoming: 진행률 desc (임박 순) → 상위 maxUpcoming
  upcoming.sort((a, b) => b.percent - a.percent)
  const upcomingTop = upcoming.slice(0, maxUpcoming)

  // recent: achieved_at desc (최신 순) → 상위 maxRecent
  recent.sort((a, b) => b.achieved_at.localeCompare(a.achieved_at))
  const recentTop = recent.slice(0, maxRecent)

  return NextResponse.json({
    upcoming: upcomingTop,
    recent: recentTop,
  })
}
