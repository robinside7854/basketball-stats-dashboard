// 리그 공용 하루 집계 + 진행 중 연속 기록 — 캐시 한 벌 (2026-10-15, auth/dashboard 라우트에서 옮겨 왔다).
//
// 왜 여기로: 「진행 중 연속 기록」을 /me(auth/dashboard)와 선수 카드(players/[id]/detail)가 각자 셌다.
//   /me 는 computeStreaks(하루 단위 · 친선 제외), 카드는 detail 라우트 안 자체 루프 — 그래서 같은 선수의
//   「두 자릿수 득점 N」이 두 화면에서 달랐다. 이제 둘 다 이 캐시 하나를 읽고, 선수 한 명 몫은
//   ongoingStreaksFor() 하나로 고른다.
//
// 캐시: 리그 전체 집계라 보는 사람과 무관하다(개인 정보 없음). 1시간(2026-10-26) + 기록 편집 API 의 `league-{id}-games` 태그.
//   unstable_cache 는 JSON 으로 저장하므로 Map 대신 평범한 객체로 바꿔 담는다.
//   ⚠ 키·콜백을 이 파일 한 곳에만 둔다 — 두 라우트가 같은 캐시 항목을 쓰게.

import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/admin'
import { computePerDayStats } from './perDayStats'
import { computeStreaks, type StreakCategory, type StreaksResult } from './streaks'

export type DayPoint = { pts: number; reb: number; ast: number }
export type DashboardBase = {
  /** 정규(친선 제외) 경기일 전부 */
  allDates: string[]
  /** 선수 → 날짜 → 그날 득점·리바·어시 */
  days: Record<string, Record<string, DayPoint>>
  streaks: StreaksResult
}

/** 리그 공용 · 하루 집계(득점·리바·어시) + 스트릭. 하루 집계를 스트릭 계산에 넘겨 리그 이벤트를 한 번만 훑는다. */
export function getCachedDashboardBase(leagueId: string): Promise<DashboardBase> {
  return unstable_cache(
    async (): Promise<DashboardBase> => {
      const sb = createClient()
      const perDay = await computePerDayStats(sb, leagueId)
      const streaks = await computeStreaks(sb, leagueId, { minStreak: 2, perDay })
      const days: DashboardBase['days'] = {}
      for (const [p, byDate] of perDay.dayStats) {
        const row: Record<string, DayPoint> = {}
        for (const [d, st] of byDate) row[d] = { pts: st.pts, reb: st.reb, ast: st.ast }
        days[p] = row
      }
      return { allDates: perDay.allDates, days, streaks }
    },
    ['auth-dashboard-base-v1', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`], revalidate: 3600 },
  )()
}

/** 진행 중 연속 기록 라벨 — 선수 카드 칩과 같은 문구 */
export const STREAK_LABEL: Record<StreakCategory | 'attend', string> = {
  attend: '연속 출석',
  pts10: '두 자릿수 득점', pts20: '20+ 득점', tp1: '3점 성공',
  dd: '더블더블', wins: '이긴 날', stlblk3: '스틸+블록 3+',
}

export interface OngoingStreak {
  key: StreakCategory | 'attend'
  label: string
  count: number
  /** 단위는 늘 「일」 — 판정이 하루(라운드) 단위다. 「경기」라 쓰면 하루 여러 경기를 뛰는 리그에서 숫자를 오해한다 */
  unit: '일'
}

/**
 * 이 선수의 진행 중 연속 기록(2일 이상) — 연속 출석 먼저, 이어서 지표 기록 많은 순.
 *   「이긴 날」 = 그날 전적이 승 > 패인 날(무승부 날은 잇지 않는다) — detail 라우트 최근 경기의 승패 판정과 같은 뜻.
 */
export function ongoingStreaksFor(base: DashboardBase, playerId: string): OngoingStreak[] {
  const out: OngoingStreak[] = []
  const att = base.streaks.attendance.find(a => a.player_id === playerId)
  if (att && att.current_streak >= 2) {
    out.push({ key: 'attend', label: STREAK_LABEL.attend, count: att.current_streak, unit: '일' })
  }
  out.push(
    ...base.streaks.streaks
      .filter(s => s.player_id === playerId && s.count >= 2)
      .sort((a, b) => b.count - a.count)
      .map(s => ({ key: s.category, label: STREAK_LABEL[s.category] ?? s.category, count: s.count, unit: '일' as const })),
  )
  return out
}
