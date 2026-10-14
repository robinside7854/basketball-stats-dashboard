// 선수 한 명의 기간 합계·하루 평균·순위 — 「선수 숫자는 한 벌」(2026-10-14).
//
// 왜 있나: 선수 카드 위쪽(누적)과 아래쪽(통산)이 서로 다른 숫자를 보였다. 위는 detail 라우트가
//   자기 이벤트 루프로, 아래는 career 라우트가 또 다른 루프로(친선 포함·대회 합산·경기 슬롯 수) 셌다.
//   같은 선수의 합계·평균·순위는 **computeLeagueStats 한 벌**에서만 나온다 — 스탯 탭과 같은 결과다.
//
// 규칙
//   · 기간 = 'all'(그 묶음 전체) | 날짜 범위(분기는 gameDateRange) | quarter_id(기간 없는 분기만 폴백)
//   · gp = 출전한 하루(라운드) 수 — 이벤트가 있는 날 + 출전시간(league_player_minutes)만 있는 날.
//   · 친선전 제외 · 외부(상대) 팀 이벤트 제외 · 득점은 scorePoints/isPlusOneFor — 전부 computeLeagueStats 안에 있다.
//   · 게스트는 순위 모집단(`players`)에서 빠지지만 본인 줄은 `guests` 에 있다 → pickPlayerRow 가 둘 다 본다.
//   · 대회(mode='tournament')는 별개 묶음이다. 리그 통산에 **절대 더하지 않는다** — 대회 기록은 따로 「통산 미포함」으로 보인다.

import type { PlayerStat } from '@/types/league'
import type { LeagueStatsResult } from './leagueStats'
import { getCachedLeagueStats } from './cachedLeagueStats'
import { periodOpts, pickPlayerRow, type StatsPeriod } from './playerPeriod'

export * from './playerPeriod'

/**
 * 그 기간 전원 스탯(순위 모집단 포함).
 *   (2026-10-14) unstable_cache 경유 — 스탯 탭과 같은 캐시 항목(cachedLeagueStats.ts). 선수 카드를 열 때마다
 *   리그 전체 집계를 새로 돌리지 않는다. 경기·이벤트가 바뀌면 `league-{id}-games` 태그로 풀린다.
 */
export function loadPeriodStats(leagueId: string, period: StatsPeriod): Promise<LeagueStatsResult> {
  return getCachedLeagueStats(leagueId, periodOpts(period))
}

/** 선수 한 명의 기간 줄 — 스탯 탭 그 선수 행과 같은 숫자. 안 뛰었으면 null */
export async function playerPeriodLine(
  leagueId: string,
  playerId: string,
  period: StatsPeriod,
): Promise<{ line: PlayerStat | null; total_rounds: number }> {
  const res = await loadPeriodStats(leagueId, period)
  return { line: pickPlayerRow(res, playerId), total_rounds: res.total_rounds ?? 0 }
}
