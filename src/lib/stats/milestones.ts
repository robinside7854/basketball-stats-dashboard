/**
 * 커리어 마일스톤 (임박 + 최근 달성) 계산 유틸.
 * `/api/leagues/[id]/milestones` route 와 홈 SSR 프리페치가 공유.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/admin'
import { computePerDayStats, fetchPlayerMeta, type PerDayStats } from './perDayStats'

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

export interface UpcomingEntry {
  player_id: string
  name: string
  number: number | null
  category: MilestoneCategory
  current: number
  target: number
  distance: number
  percent: number
}

export interface RecentEntry {
  player_id: string
  name: string
  number: number | null
  category: MilestoneCategory
  target: number
  achieved_at: string
}

export interface MilestonesResult {
  upcoming: UpcomingEntry[]
  recent: RecentEntry[]
}

export async function computeMilestones(
  supabase: SupabaseClient | null,
  leagueId: string,
  opts: { horizonDays?: number; maxUpcoming?: number; maxRecent?: number } = {},
): Promise<MilestonesResult> {
  const sb = supabase ?? createClient()
  const horizonDays = Math.max(1, opts.horizonDays ?? 30)
  const maxUpcoming = Math.max(1, opts.maxUpcoming ?? 8)
  const maxRecent = Math.max(1, opts.maxRecent ?? 8)

  const [{ dayStats }, playerMeta] = await Promise.all([
    computePerDayStats(sb, leagueId),
    fetchPlayerMeta(sb, leagueId),
  ])

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
      case 'GP':  return 1
    }
  }

  for (const [pid, byDate] of dayStats) {
    const meta = playerMeta[pid]
    const dates = [...byDate.keys()].sort()

    for (const cat of Object.keys(THRESHOLDS) as MilestoneCategory[]) {
      const thresholds = THRESHOLDS[cat]
      let cumul = 0
      let nextIdx = 0

      for (const date of dates) {
        const stats = byDate.get(date)
        if (!stats) continue
        const before = cumul
        cumul += catValue(cat, stats)

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

  upcoming.sort((a, b) => b.percent - a.percent)
  const upcomingTop = upcoming.slice(0, maxUpcoming)

  recent.sort((a, b) => b.achieved_at.localeCompare(a.achieved_at))
  const recentTop = recent.slice(0, maxRecent)

  return { upcoming: upcomingTop, recent: recentTop }
}
