// 「기록」 탭(하단 메뉴) 서브탭 — 명단 · 리더보드 · 팀 (+ 운영진에게만 기록실).
// 페이지마다 인라인 배열을 들고 있으면 한 곳이 빠질 때 그 화면만 탭이 달라지는 사고가 난다
// (2026-08-08, stats-umbrella-move 계획서 참고). 이 배열을 유일한 출처로 두고 각 페이지는
// 자신의 active 키만 넘긴다(화면에서는 `StatsGroupTabs` 컴포넌트 — 운영진 판정을 거기서 한다).
//
// 연혁: 리더보드·팀·기록실(2026-10-16) → 리뉴얼 R2(10-31)에서 「스탯」 탭을 「선수」에 합침 →
//   2026-11 운영진: 하단 탭 이름을 「기록」으로, 서브탭은 리더보드(/stats) · 선수(/players) · 팀(/teams),
//   기록실(/records)은 운영진 전용으로 「영상」 탭 안에 →
//   2026-11-04 운영진: 순위는 리더보드 한 곳 · 선수 탭은 「명단」(맨 왼쪽), 기록실은 다시 「기록」 탭 안(운영진만).
import type { LeagueGroupTab } from './LeagueGroupTabs'

export type StatsTabKey = 'players' | 'leaderboard' | 'teams' | 'records'

export function getStatsGroupTabs(base: string, active: StatsTabKey, isAdmin = false): LeagueGroupTab[] {
  return [
    { href: `${base}/players`, label: '명단', active: active === 'players' },
    { href: `${base}/stats`, label: '리더보드', active: active === 'leaderboard' },
    { href: `${base}/teams`, label: '팀', active: active === 'teams' },
    ...(isAdmin ? [{ href: `${base}/records`, label: '기록실 (운영진)', active: active === 'records' }] : []),
  ]
}
