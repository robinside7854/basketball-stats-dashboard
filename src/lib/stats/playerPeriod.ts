// 「선수 숫자는 한 벌」의 순수 함수 — 기간·선수 줄 고르기·순위·리그 통산 합. DB 를 모른다(테스트용으로 분리).
//   설명과 규칙은 playerTotals.ts 머리 주석. 화면·라우트는 playerTotals.ts 에서 같이 가져다 쓴다.

import type { PlayerStat } from '@/types/league'
import type { LeagueStatsOpts, LeagueStatsResult } from './leagueStats'
import { leagueMinRounds } from './eligibility'

export type StatsPeriod =
  | 'all'
  | { from: string; to: string }
  | { quarterId: string }

/** 기간 → computeLeagueStats 옵션 (순수) */
export function periodOpts(period: StatsPeriod): LeagueStatsOpts {
  if (period === 'all') return {}
  if ('quarterId' in period) return { quarterId: period.quarterId }
  return { from: period.from, to: period.to }
}

/** 분기 행 → 기간. 시작·끝 날짜가 둘 다 있으면 날짜 범위, 아니면 quarter_id 폴백 (순수) */
export function quarterPeriod(q: { id: string; start_date: string | null; end_date: string | null }): StatsPeriod {
  return q.start_date && q.end_date ? { from: q.start_date, to: q.end_date } : { quarterId: q.id }
}

/** 날짜·분기가 이 기간에 드는가 — 집계 밖에서 경기를 고를 때(커리어 하이·최근 경기) 같은 경기 집합을 쓰려고 (순수) */
export function gameInPeriod(g: { date: string | null; quarter_id: string | null }, period: StatsPeriod): boolean {
  if (period === 'all') return true
  if ('quarterId' in period) return g.quarter_id === period.quarterId
  return !!g.date && g.date >= period.from && g.date <= period.to
}

/** 결과에서 이 선수 줄 — 게스트도 찾는다 (순수) */
export function pickPlayerRow(
  res: Pick<LeagueStatsResult, 'players' | 'guests'>,
  playerId: string,
): PlayerStat | null {
  return res.players.find(p => p.player_id === playerId)
    ?? res.guests?.find(p => p.player_id === playerId)
    ?? null
}

/** 순위 자격(최소 출전일) — 스탯 탭 리더보드와 같은 「열린 날의 30%」 (순수) */
export function rankMinRounds(totalRounds: number, players: ReadonlyArray<{ gp: number }>): number {
  // (2026-10-15) 순위 자격은 eligibility.ts leagueMinRounds 한 벌 — 홈 리더·스탯 탭·선수 카드가 같다
  return leagueMinRounds(totalRounds, players)
}

/**
 * 값 내림차순 정렬에서의 자리(1부터). 모집단에 없으면 0.
 *   같은 값은 먼저 온 쪽이 앞 — 종전 선수 카드 순위와 같은 규칙(정렬 안정성에 기댄다).
 */
export function rankOf<T extends { player_id: string }>(pool: readonly T[], playerId: string, value: (p: T) => number): number {
  const sorted = [...pool].sort((a, b) => value(b) - value(a))
  const idx = sorted.findIndex(p => p.player_id === playerId)
  return idx >= 0 ? idx + 1 : 0
}

export type CountingLine = { gp: number; pts: number; reb: number; ast: number; stl: number; blk: number }

/** 여러 기간(리그 시즌) 줄을 더한다 — 리그 통산용. ⚠ 대회 줄을 넣지 말 것 (순수) */
export function sumLines(lines: ReadonlyArray<CountingLine>): CountingLine {
  return lines.reduce(
    (acc, l) => ({
      gp: acc.gp + l.gp, pts: acc.pts + l.pts, reb: acc.reb + l.reb,
      ast: acc.ast + l.ast, stl: acc.stl + l.stl, blk: acc.blk + l.blk,
    }),
    { gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
  )
}
