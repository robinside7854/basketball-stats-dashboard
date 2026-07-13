// 인터랙티브 투어 스텝 정의.
// LeagueTour 컴포넌트가 이 배열을 받아 순차 spotlight + 팝오버로 안내한다.
// targetSelector 는 querySelector · 없으면 화면 중앙 팝오버 (welcome/finish 등)

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center'

export interface TourStep {
  id: string
  targetSelector?: string
  title: string
  description: string
  placement?: TourPlacement
  spotlightPadding?: number
  onEnter?: () => void
}

export const HOME_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    placement: 'center',
    title: '미라클모닝 라커룸에 오신 것을 환영합니다',
    description:
      '팀 · 선수 · 경기 · 스탯을 한눈에.\n\n둘러보기로 주요 기능을 안내해드릴게요.',
  },
  {
    id: 'nav',
    targetSelector: '[data-tour="top-nav"]',
    placement: 'bottom',
    title: '메뉴 구성',
    description:
      '홈 · 라커룸 · 경기 · 스탯 · 아카이브 5개 우산 메뉴로 정리했습니다.\n어워즈는 스탯 안, Stathead 는 아카이브 안에 있어요.',
  },
  {
    id: 'hero',
    targetSelector: '[data-tour="hero"]',
    placement: 'bottom',
    title: '이번 주 POTW',
    description:
      '주간 최고의 선수를 자동 선정합니다.\n좌우로 스와이프하면 최근 4주간의 POTW 를 볼 수 있어요.',
    spotlightPadding: 4,
  },
  {
    id: 'standings',
    targetSelector: '[data-tour="standings"]',
    placement: 'top',
    title: '팀 순위',
    description: '분기 기준 팀 순위와 최근 경기 결과가 표시됩니다.',
  },
  {
    id: 'rounds',
    targetSelector: '[data-tour="rounds"]',
    placement: 'top',
    title: '최근 라운드',
    description:
      '경기일 카드를 클릭하면 박스스코어 페이지로 이동합니다.\n박스스코어는 링크로 공유할 수 있어요.',
  },
  {
    id: 'stats-tab',
    targetSelector: '[data-tour="stats-tab"]',
    placement: 'bottom',
    title: '스탯 · 어워즈 · 시즌하이',
    description:
      '스탯 우산 아래 리더보드 · 시즌하이 · 어워즈가 모두 정리되어 있습니다.',
    spotlightPadding: 4,
  },
  {
    id: 'help',
    targetSelector: '[data-tour="tour-reopen"]',
    placement: 'bottom',
    title: '언제든 다시 보기',
    description:
      '헤더 우측 물음표 아이콘을 클릭하면 이 둘러보기를 언제든 다시 실행할 수 있어요.',
    spotlightPadding: 4,
  },
]
