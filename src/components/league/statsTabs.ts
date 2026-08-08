// 스탯 우산 서브탭 — 리더보드 · 어워즈 · 선수 명단 · 팀 순위 (4개)
// 4개 페이지(stats/awards/roster/teams)가 각자 인라인 배열을 들고 있으면 한 곳이 빠질 때
// 그 화면만 탭이 달라지는 사고가 난다(2026-08-08, stats-umbrella-move 계획서 참고).
// 이 배열을 유일한 출처로 두고 각 페이지는 자신의 active 키만 넘긴다.
//
// href 는 상대 라우트(`${base}/stats` 등)만 붙이면 되도록 base 를 인자로 받는다 — base 계산
// 방식은 각 페이지가 기존에 쓰던 관례(useParams 의 orgSlug/leagueId 조합)를 그대로 따른다.
//
// 시즌하이는 별도 탭이었으나 2026-08-09 리더보드에 흡수됐다(정렬 지표를 따라가는 "시즌 최고"
// 줄로 대체 — stats/page.tsx 참고). `?tab=seasonHigh` 옛 링크는 stats 페이지 쪽에서 리더보드로
// 폴백 처리한다(이 파일은 더 이상 그 값을 만들지 않는다).
import type { LeagueGroupTab } from './LeagueGroupTabs'

export type StatsTabKey = 'leaderboard' | 'awards' | 'roster' | 'teams'

export function getStatsGroupTabs(base: string, active: StatsTabKey): LeagueGroupTab[] {
  return [
    { href: `${base}/stats`, label: '리더보드', active: active === 'leaderboard' },
    { href: `${base}/awards`, label: '어워즈', active: active === 'awards' },
    { href: `${base}/roster`, label: '선수 명단', active: active === 'roster' },
    { href: `${base}/teams`, label: '팀 순위', active: active === 'teams' },
  ]
}
