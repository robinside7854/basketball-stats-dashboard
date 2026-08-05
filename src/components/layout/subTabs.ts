// 서브탭 정의 — 경기/통계/영상 그룹. 경기·영상은 편집 모드에서 서브탭이 하나 더 늘어난다.
export interface SubTab { path: string; label: string }

export function gameSubTabs(isEditMode: boolean): SubTab[] {
  const base: SubTab[] = [
    { path: '/boxscore', label: '박스스코어' },
    { path: '/gamelog',  label: '게임 로그' },
  ]
  return isEditMode ? [...base, { path: '/record', label: '기록' }] : base
}

// 상대 분석(정찰) 서브탭은 2026-08-04 제거 — 4개월 미사용 · 멀티테넌트 통합 스키마에서
// 외부 팀은 is_external 팀으로 표현하므로 별도 스택을 유지할 이유가 없어졌다.
export const STATS_SUB_TABS: SubTab[] = [
  { path: '/stats', label: '시즌 스탯' },
]

// 영상 그룹 서브탭(videoSubTabs)은 2026-08-04 제거 — 코치 핀·리뷰를 걷어내니
// '하이라이트' 하나만 남아 탭 바 자체가 의미를 잃었다.
// 선수 '베스트샷 핀'(league_players.pinned_event_ids)은 별개 기능이며 그대로 유지된다.
