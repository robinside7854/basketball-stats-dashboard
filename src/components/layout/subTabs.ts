// 서브탭 정의 — 경기/통계/영상 그룹. 경기·영상은 편집 모드에서 서브탭이 하나 더 늘어난다.
export interface SubTab { path: string; label: string }

export function gameSubTabs(isEditMode: boolean): SubTab[] {
  const base: SubTab[] = [
    { path: '/boxscore', label: '박스스코어' },
    { path: '/gamelog',  label: '게임 로그' },
  ]
  return isEditMode ? [...base, { path: '/record', label: '기록' }] : base
}

export const STATS_SUB_TABS: SubTab[] = [
  { path: '/stats',    label: '시즌 통계' },
  { path: '/opponent', label: '상대 분석' },
]

export function videoSubTabs(isEditMode: boolean): SubTab[] {
  const base: SubTab[] = [
    { path: '/highlights', label: '하이라이트' },
    { path: '/pins',       label: '코치 핀' },
  ]
  return isEditMode ? [...base, { path: '/review', label: '리뷰' }] : base
}
