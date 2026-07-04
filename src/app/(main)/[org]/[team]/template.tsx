'use client'
// 메인 팀 섹션 페이지 전환 — 내비게이션마다 재마운트되어 진입 애니메이션 + 전체 메뉴 스와이프 제공
import { useParams } from 'next/navigation'
import PageSwipeTransition, { type SwipeMenuItem } from '@/components/PageSwipeTransition'

// 스와이프 이동 순서 — components/layout/TabNav 의 TAB_DEFS 순서와 동기 유지 필요.
// gamelog / opponent / record 는 순서 미포함 → 진입 시 페이드, 스와이프 시작 불가
const ORDER: SwipeMenuItem[] = [
  { seg: '', label: '홈' },
  { seg: 'boxscore', label: '경기' },
  { seg: 'stats', label: '통계' },
  { seg: 'roster', label: '선수 명단' },
  { seg: 'tournaments', label: '대회 관리' },
]

export default function Template({ children }: { children: React.ReactNode }) {
  const params = useParams<{ org: string; team: string }>()
  return (
    <PageSwipeTransition base={`/${params.org}/${params.team}`} order={ORDER}>
      {children}
    </PageSwipeTransition>
  )
}
