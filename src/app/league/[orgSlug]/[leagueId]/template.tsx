'use client'
// 리그 섹션 페이지 전환 — 내비게이션마다 재마운트되어 진입 애니메이션 + 전체 메뉴 스와이프 제공
import { useParams } from 'next/navigation'
import PageSwipeTransition, { type SwipeMenuItem } from '@/components/PageSwipeTransition'

// 스와이프 이동 순서 — 하단 탭바(홈 → 라커룸 → 경기 → 스탯 → 더보기) 순서의 평탄화.
// LeagueLayoutClient / LeagueSubTabs 메뉴 정의와 동기 유지 필요.
// 어워즈(스탯 우산), Stathead(아카이브 우산) 는 상위 나비게이션에서 서브탭으로 그룹핑됐지만
// URL 은 그대로라 스와이프 breadth-first 이동은 유지 (연속 스와이프로도 도달 가능).
const ORDER: SwipeMenuItem[] = [
  { seg: '', label: '홈' },
  { seg: 'roster', label: '선수 명단' },
  { seg: 'teams', label: '팀 구성' },
  { seg: 'schedule', label: '일정' },
  { seg: 'record', label: '경기 기록' },
  { seg: 'stats', label: '스탯' },
  { seg: 'awards', label: '어워즈' },
  { seg: 'columns', label: '매거진' },
  { seg: 'stathead', label: 'Stathead' },
  { seg: 'settings', label: '설정' },
]

export default function Template({ children }: { children: React.ReactNode }) {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  return (
    <PageSwipeTransition
      base={`/league/${params.orgSlug}/${params.leagueId}`}
      order={ORDER}
      // 경기 기록은 스탯 입력·드래그 UI 와 충돌 위험 → 스와이프로 들어갈 수만 있고 나갈 땐 탭 사용
      noSwipeFrom={['record']}
    >
      {children}
    </PageSwipeTransition>
  )
}
