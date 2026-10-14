// 선수 카드 「분기별 기록」 표 한 줄 — 순수 함수 (2026-10-14).
//
// 출처: kbl-stats `app/components/CareerTable` (시즌별 기록표 + 그 시즌 리그 1위 굵게) 를
//   이 리그의 「분기」 단위로 옮겼다.
//
// 규칙
//   · 입력은 그 분기 `computeLeagueStats()` 결과 그대로다 — 분기 경기는 호출부가 **날짜 범위**
//     (`gameDateRange`)로 고른다. quarter_id 로 고르면 뒤늦게 채워진 경기가 옛 분기로 들어간다.
//   · 값은 하루 평균(득점·리바·어시·스틸·블락)과 기간 성공률(야투율·3점 성공률).
//   · 「리그 최고」 = 그 분기 자격 선수(열린 날의 30% 이상 출전 — 선수 카드 순위와 같은 기준) 중 최댓값.
//     성공률은 `PCT_MIN_ATTEMPTS` 시도를 채운 선수끼리만. 출전일은 자격 없이 전원 중 최댓값.
//     이 선수가 그 최댓값과 같고(동점 포함) 자격을 채웠으면 굵게.

import type { PlayerStat } from '@/types/league'
import { PCT_MIN_ATTEMPTS } from './percentileBars'

export const QUARTER_TABLE_KEYS = ['gp', 'ppg', 'rpg', 'apg', 'spg', 'bpg', 'fg_pct', 'fg3_pct'] as const
export type QuarterTableKey = typeof QUARTER_TABLE_KEYS[number]

export interface QuarterTableRow {
  quarter_id: string
  /** `26.3Q` */
  label: string
  year: number
  quarter: number
  /** 값 — 성공률은 기준 미달이면 null(「–」) */
  values: Record<QuarterTableKey, number | null>
  /** 성공률 원자료 (툴팁·aria 용) */
  fgm: number; fga: number; fg3m: number; fg3a: number
  /** 그 분기 리그 최고인 칸 */
  best: QuarterTableKey[]
  /** 그 분기에 열린 날 수 */
  total_rounds: number
}

/** 최소 출전(일) — 선수 카드 순위(`detail` 라우트)와 같은 「열린 날의 30%」 */
export function quarterMinRounds(totalRounds: number, players: ReadonlyArray<{ gp: number }>): number {
  const base = totalRounds > 0 ? totalRounds : players.reduce((m, p) => Math.max(m, p.gp), 0)
  return Math.max(1, Math.ceil(base * 0.3))
}

function valueOf(p: PlayerStat, key: QuarterTableKey): number | null {
  switch (key) {
    case 'fg_pct':  return p.fga  >= PCT_MIN_ATTEMPTS.fg  ? p.fg_pct  : null
    case 'fg3_pct': return p.fg3a >= PCT_MIN_ATTEMPTS.fg3 ? p.fg3_pct : null
    default: return p[key]
  }
}

/** 그 분기 선수 전원 + 이 선수 → 한 줄. 이 선수가 그 분기에 안 뛰었으면 null. */
export function buildQuarterRow(
  q: { id: string; year: number; quarter: number },
  players: readonly PlayerStat[],
  totalRounds: number,
  playerId: string,
): QuarterTableRow | null {
  const me = players.find(p => p.player_id === playerId)
  if (!me || me.gp <= 0) return null
  const minGp = quarterMinRounds(totalRounds, players)
  const qualified = players.filter(p => p.gp >= minGp)
  const meQualified = me.gp >= minGp

  const values = {} as Record<QuarterTableKey, number | null>
  const best: QuarterTableKey[] = []
  for (const key of QUARTER_TABLE_KEYS) {
    const mine = valueOf(me, key)
    values[key] = mine
    if (mine === null || mine <= 0) continue
    const pool = key === 'gp' ? players : (meQualified ? qualified : [])
    let max = -Infinity
    for (const p of pool) {
      const v = valueOf(p, key)
      if (v !== null && v > max) max = v
    }
    if (max > -Infinity && mine >= max) best.push(key)
  }

  return {
    quarter_id: q.id,
    label: `${String(q.year).slice(2)}.${q.quarter}Q`,
    year: q.year,
    quarter: q.quarter,
    values,
    fgm: me.fgm, fga: me.fga, fg3m: me.fg3m, fg3a: me.fg3a,
    best,
    total_rounds: totalRounds,
  }
}
