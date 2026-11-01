// 「기록」 탭(하단 메뉴) 서브탭 — 리더보드 · 선수 · 팀 (2026-11 운영진).
// 페이지마다 인라인 배열을 들고 있으면 한 곳이 빠질 때 그 화면만 탭이 달라지는 사고가 난다
// (2026-08-08, stats-umbrella-move 계획서 참고). 이 배열을 유일한 출처로 두고 각 페이지는
// 자신의 active 키만 넘긴다.
//
// 연혁: 리더보드·팀·기록실(2026-10-16) → 리뉴얼 R2(10-31)에서 「스탯」 탭을 「선수」에 합침 →
//   2026-11 운영진: 하단 탭 이름을 「기록」으로, 서브탭은 리더보드(/stats) · 선수(/players) · 팀(/teams).
//   기록실(/records)은 운영진 전용으로 「영상」 탭 안으로 옮겼다(getVideoGroupTabs).
import type { LeagueGroupTab } from './LeagueGroupTabs'

export type StatsTabKey = 'leaderboard' | 'players' | 'teams'

export function getStatsGroupTabs(base: string, active: StatsTabKey): LeagueGroupTab[] {
  return [
    { href: `${base}/stats`, label: '리더보드', active: active === 'leaderboard' },
    { href: `${base}/players`, label: '선수', active: active === 'players' },
    { href: `${base}/teams`, label: '팀', active: active === 'teams' },
  ]
}

export type VideoTabKey = 'highlights' | 'records'

/** 「영상」 탭 서브탭 — 하이라이트 · 기록실(운영진 전용). 운영진이 아니면 빈 배열(탭 줄을 그리지 않는다). */
export function getVideoGroupTabs(base: string, active: VideoTabKey, isAdmin: boolean): LeagueGroupTab[] {
  if (!isAdmin) return []
  return [
    { href: `${base}/highlights`, label: '하이라이트', active: active === 'highlights' },
    { href: `${base}/records`, label: '기록실 (운영진)', active: active === 'records' },
  ]
}
