'use client'
// 서브탭 간 좌우 스와이프 네비게이션 래퍼
//
// 사용:
//   <SubTabSwipeArea group="squad" current="roster">
//     {페이지 컨텐츠}
//   </SubTabSwipeArea>
//
// 동작:
//   - 좌우 스와이프 감지 시 group 내 다음/이전 탭으로 router.push
//   - 화면 좌우 엣지 20px 는 브라우저 back 제스처와 충돌 회피 (useSwipe 기본 edgeGuard)
//   - 세로 스크롤 우선 (touch-action: pan-y) — 세로 스크롤 방해 안 됨
//
// 그룹 정의는 LeagueSubTabs 와 동기 유지 필요

import { useRouter, useParams } from 'next/navigation'
import { useSwipe } from '@/hooks/useSwipe'

const GROUPS: Record<string, string[]> = {
  squad: ['roster', 'teams'],
  games: ['schedule', 'record'],
}

interface Props {
  group: 'squad' | 'games'
  /** 현재 활성 서브탭 세그먼트 (예: 'roster') */
  current: string
  children: React.ReactNode
}

export default function SubTabSwipeArea({ group, current, children }: Props) {
  const router = useRouter()
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const items = GROUPS[group]
  const idx = items.indexOf(current)

  const nextSeg = idx >= 0 && idx < items.length - 1 ? items[idx + 1] : null
  const prevSeg = idx > 0 ? items[idx - 1] : null

  const navigateTo = (seg: string) => {
    router.push(`/league/${params.orgSlug}/${params.leagueId}/${seg}`)
  }

  const swipe = useSwipe({
    threshold: 60,
    edgeGuardPx: 24,  // iOS 뒤로가기 스와이프 회피 (좌 엣지)
    onSwipeLeft: () => { if (nextSeg) navigateTo(nextSeg) },
    onSwipeRight: () => { if (prevSeg) navigateTo(prevSeg) },
  })

  return (
    // touch-pan-y — 세로 스크롤은 브라우저에 위임, 가로만 우리가 감지
    <div className="touch-pan-y" {...swipe}>
      {children}
    </div>
  )
}
