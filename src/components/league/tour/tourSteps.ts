// 인터랙티브 투어 스텝 정의.
// LeagueTour 컴포넌트가 이 배열을 받아 순차 spotlight + 팝오버로 안내한다.
// 뷰포트가 다르면 (모바일 vs 데스크탑) targetSelectorMobile / descriptionMobile / placementMobile 로 우선 적용.
//
// ─────────────────────────────────────────────────────────────────
// 새 기능/탭 추가 시 투어에 반영하는 방법 (자동 반영 컨벤션)
// ─────────────────────────────────────────────────────────────────
// 1. 안내할 요소에 `data-tour="my-feature"` 속성을 부여
// 2. 아래 HOME_TOUR_STEPS 배열의 적절한 위치에 스텝 추가:
//    { id: 'my-feature', targetSelector: '[data-tour="my-feature"]',
//      title: '이름', description: '설명', optional: true }
// 3. `optional: true` 로 두면 해당 앵커가 DOM 에 없을 때 조용히 스킵됨
//    (다른 리그/조건부 렌더링 페이지에서도 오류 없이 동작)
// 4. 대규모 개편으로 유저에게 재실행을 유도하려면 LeagueTourTrigger 의
//    storageKey 를 v2 → v3 로 상향 (localStorage 리셋 효과)
// ─────────────────────────────────────────────────────────────────

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center'

export interface TourStep {
  id: string
  targetSelector?: string
  targetSelectorMobile?: string       // 모바일 (< lg 1024px) 우선 · 미지정 시 데스크탑 selector 사용
  title: string
  description: string
  descriptionMobile?: string           // 모바일용 문구 (미지정 시 데스크탑 문구 사용)
  placement?: TourPlacement
  placementMobile?: TourPlacement      // 모바일 우선 (예: 하단 탭바는 top placement)
  spotlightPadding?: number
  optional?: boolean                   // true 면 target DOM 미발견 시 자동 스킵 (기능 미배포/조건부 렌더링 대응)
  onEnter?: () => void
}

export const HOME_TOUR_STEPS: TourStep[] = [
  // 1. 시작 안내
  {
    id: 'welcome',
    placement: 'center',
    title: '미라클모닝 라커룸에 오신 것을 환영합니다',
    description:
      '팀 · 선수 · 경기 · 스탯 · 하이라이트 릴을 한눈에.\n\n최근 크게 업데이트된 기능들 위주로 짧게 안내해드릴게요.',
  },
  // 2. 상단/하단 네비게이션
  {
    id: 'nav',
    targetSelector: '[data-tour="top-nav"]',
    targetSelectorMobile: '[data-tour="bottom-nav"]',
    placement: 'bottom',
    placementMobile: 'top',
    title: '메뉴 구성',
    description:
      '홈 · 라커룸 · 경기 · 스탯 · 아카이브 5개 우산 메뉴.\n어워즈는 스탯 안, 매거진/Stathead/하이라이트/공지는 아카이브 안에 있어요.',
    descriptionMobile:
      '홈 · 라커룸 · 경기 · 스탯 · 더보기 5개 탭.\n아카이브 · 설정은 더보기에서.',
  },
  // 3. 공지 (신규 · 2026-07-15)
  {
    id: 'announcements',
    targetSelector: '[data-tour="announcements"]',
    placement: 'bottom',
    title: '공지 · 업데이트 노트',
    description:
      '리그 소식과 새 기능 안내가 홈 최상단에 뜹니다.\n댓글도 남길 수 있어요 (닉네임 자유, 비번 4자리).',
    spotlightPadding: 4,
    optional: true,
  },
  // 4. POTW
  {
    id: 'hero',
    targetSelector: '[data-tour="hero"]',
    placement: 'bottom',
    title: '이번 주 POTW',
    description:
      '주간 최고의 선수를 자동 선정합니다.\n좌우로 스와이프하면 최근 4주간의 POTW 를 볼 수 있어요.',
    spotlightPadding: 4,
    optional: true,
  },
  // 5. 이번 주 클러치샷 (신규 하이라이트 위젯)
  {
    id: 'clutch-widget',
    targetSelector: '[data-tour="highlights-home"]',
    placement: 'top',
    title: '이번 주 클러치샷',
    description:
      '경기 마지막 2분 · 2포제션 접전(6점차 이내)에서 이 슛으로 1포제션(3점차) 이내로 좁혀진 결정타를 모아 재생합니다.\n카드 클릭 → 팝업 플레이어에서 순차 재생.',
    spotlightPadding: 4,
    optional: true,
  },
  // 6. 팀 순위
  {
    id: 'standings',
    targetSelector: '[data-tour="standings"]',
    placement: 'top',
    title: '팀 순위',
    description: '분기 기준 팀 순위와 최근 경기 결과가 표시됩니다.',
    optional: true,
  },
  // 7. 최근 라운드 (2개 버튼 안내)
  {
    id: 'rounds',
    targetSelector: '[data-tour="rounds"]',
    placement: 'top',
    title: '최근 라운드 · 박스스코어 & 하이라이트',
    description:
      '경기일 카드에 두 개의 버튼 —\n· 박스스코어: 스탯 상세 페이지\n· 하이라이트: 그 날 득점 릴 자동재생',
    optional: true,
  },
  // 8. 스탯 · 어워즈 · 시즌하이 · POTM
  {
    id: 'stats-tab',
    targetSelector: '[data-tour="stats-tab"]',
    targetSelectorMobile: '[data-tour="stats-tab-mobile"]',
    placement: 'bottom',
    placementMobile: 'top',
    title: '스탯 · 어워즈 · 시즌하이',
    description:
      '스탯 우산 아래 리더보드 · 시즌하이 · 어워즈 · POTM 이 정리되어 있어요.',
    spotlightPadding: 4,
    optional: true,
  },
  // 9. 라커룸 (선수 페이지 · 위닝샷 릴 · 베스트샷 핀)
  {
    id: 'roster-tips',
    placement: 'center',
    title: '라커룸에서 할 수 있는 것',
    description:
      '· 선수 카드 → 위닝샷 배지 클릭 → 실제 결정타 장면 릴 재생\n· 선수 하이라이트 페이지 재생기 하단 농구공 슬롯(1/2/3) → 내 베스트샷 3개 핀\n· 핀한 베스트샷은 프로필카드 상단에서 바로 재생',
  },
  // 10. 아카이브 (매거진/Stathead/하이라이트/공지)
  {
    id: 'archive-tab',
    placement: 'center',
    title: '아카이브 우산',
    description:
      '· 매거진: AI 가 쓰는 주/월/분기 리그 컬럼\n· Stathead: 원하는 조건으로 스탯 검색\n· 하이라이트: 라운드/선수별 득점 릴\n· 공지: 지난 공지 전체 게시판',
  },
  // 11. 다시 보기 안내
  {
    id: 'help',
    targetSelector: '[data-tour="tour-reopen"]',
    placement: 'bottom',
    title: '언제든 다시 보기',
    description:
      '헤더 우측 물음표 아이콘을 클릭하면 이 둘러보기를 언제든 다시 실행할 수 있어요.',
    spotlightPadding: 4,
    optional: true,
  },
]
