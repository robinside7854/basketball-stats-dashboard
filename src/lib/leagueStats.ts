// 리그 분기 스탯 집계 (서버 전용) — 드래프트 자동픽/추천에 사용
// stats API(route)의 핵심 이벤트 집계 로직을 함수로 제공한다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadPeriodStats, quarterPeriod } from './stats/playerTotals'
import type { PlayerStat } from '@/types/league'

export interface PlayerAgg {
  player_id: string
  gp: number
  pts: number
  fgm: number; fga: number
  fg3m: number; fg3a: number
  ftm: number; fta: number
  oreb: number; dreb: number; reb: number
  ast: number; stl: number; blk: number; tov: number; pf: number
}

/**
 * 분기별 선수 누적 스탯 (gp = 출전한 날 수) — 드래프트 자동픽·추천.
 * (2026-11-10 리뷰) 따로 이벤트를 세던 것을 정본 computeLeagueStats(캐시)로 바꿨다 —
 *   종전엔 어시스트만 한 날도 출전일로 셌고 분기를 quarter_id 로 골라, 스탯 탭과 숫자가 갈렸다.
 *   분기는 기간이 있으면 날짜로(quarterPeriod), 게스트 줄도 포함한다.
 */
export async function aggregateQuarterStats(
  supabase: SupabaseClient,
  leagueId: string,
  quarterId: string,
): Promise<Record<string, PlayerAgg>> {
  const { data: q } = await supabase.from('league_quarters').select('id, start_date, end_date')
    .eq('id', quarterId).eq('league_id', leagueId).maybeSingle()
  if (!q) return {}
  const res = await loadPeriodStats(leagueId, quarterPeriod(q as { id: string; start_date: string | null; end_date: string | null }))
  const rows = [...(res.players ?? []), ...((res as { guests?: PlayerStat[] }).guests ?? [])]
  const out: Record<string, PlayerAgg> = {}
  for (const p of rows) {
    out[p.player_id] = {
      player_id: p.player_id, gp: p.gp, pts: p.pts,
      fgm: p.fgm, fga: p.fga, fg3m: p.fg3m, fg3a: p.fg3a, ftm: p.ftm, fta: p.fta,
      oreb: p.oreb, dreb: p.dreb, reb: p.reb, ast: p.ast, stl: p.stl, blk: p.blk, tov: p.tov, pf: p.pf ?? 0,
    }
  }
  return out
}

/** 종합 점수 (경기당) — 드래프트 자동픽/추천 일관 기준. 클라이언트와 동일 공식. */
export function overallScorePerGame(v: { ppg: number; rpg: number; apg: number; spg: number; bpg: number; topg: number }): number {
  return v.ppg + v.rpg * 1.2 + v.apg * 1.5 + v.spg * 2 + v.bpg * 2 - v.topg
}

/** 누적 → 경기당 + 종합 점수 */
export function aggToScore(a: PlayerAgg): number {
  if (a.gp <= 0) return 0
  return overallScorePerGame({
    ppg: a.pts / a.gp, rpg: a.reb / a.gp, apg: a.ast / a.gp,
    spg: a.stl / a.gp, bpg: a.blk / a.gp, topg: a.tov / a.gp,
  })
}

/** 이전 분기 id (year, quarter 정렬 기준 직전). 없으면 null. */
export async function getPreviousQuarterId(
  supabase: SupabaseClient,
  leagueId: string,
  quarterId: string,
): Promise<string | null> {
  const { data: quarters } = await supabase
    .from('league_quarters')
    .select('id, year, quarter')
    .eq('league_id', leagueId)
    .order('year', { ascending: true })
    .order('quarter', { ascending: true })
  const ordered = (quarters ?? []) as { id: string; year: number; quarter: number }[]
  const idx = ordered.findIndex(q => q.id === quarterId)
  return idx > 0 ? ordered[idx - 1].id : null
}
