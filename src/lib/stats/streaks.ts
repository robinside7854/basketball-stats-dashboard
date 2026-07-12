/**
 * 리그 진행 중 연속 기록 (Streaks) 계산 유틸.
 * `/api/leagues/[id]/streaks` route 와 홈 SSR 프리페치가 공유.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/admin'
import { computePerDayStats, isDoubleDouble, fetchPlayerMeta } from './perDayStats'

export type StreakCategory = 'pts10' | 'pts20' | 'tp1' | 'dd' | 'wins' | 'stlblk3'

export interface StreakEntry {
  player_id: string
  name: string
  number: number | null
  category: StreakCategory
  count: number
}

export interface StreaksResult {
  streaks: StreakEntry[]
}

export async function computeStreaks(
  supabase: SupabaseClient | null,
  leagueId: string,
  opts: { minStreak?: number } = {},
): Promise<StreaksResult> {
  const sb = supabase ?? createClient()
  const minStreak = Math.max(2, opts.minStreak ?? 2)

  const [{ dayStats, dayWL }, playerMeta] = await Promise.all([
    computePerDayStats(sb, leagueId),
    fetchPlayerMeta(sb, leagueId),
  ])

  const streaks: StreakEntry[] = []

  for (const [pid, byDate] of dayStats) {
    const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a))
    if (dates.length === 0) continue

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

  streaks.sort((a, b) => b.count - a.count)
  return { streaks }
}
