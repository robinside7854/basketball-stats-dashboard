'use client'
// 홈 페이지(server component) 하단에서 client 튜어를 트리거하기 위한 얇은 래퍼.
// 스텝 정의는 tourSteps.ts 에 상수로 유지 → 이 파일은 단일 책임(마운트)만 담당.
//
// ?tour=1 쿼리 감지: 다른 페이지에서 물음표 버튼 클릭 → 홈으로 이동 후 자동 실행

import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { HOME_TOUR_STEPS } from './tour/tourSteps'

// LeagueTour(495줄, gsap 3.15 ~70KB) 는 첫방문 자동 실행 · 튜어 열기 트리거 시점에만 필요
// → 홈 초기 번들에서 완전히 제외
const LeagueTour = dynamic(() => import('./LeagueTour'), { ssr: false })

export default function LeagueTourTrigger() {
  const sp = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (sp.get('tour') !== '1') return
    // 짧은 지연 · DOM 마운트 완료 대기
    const t = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('mm-tour-open'))
      // URL 정리 · ?tour=1 제거 (뒤로가기 시 재실행 방지)
      router.replace(pathname)
    }, 400)
    return () => clearTimeout(t)
  }, [sp, router, pathname])

  return (
    <LeagueTour
      steps={HOME_TOUR_STEPS}
      storageKey="mm_tour_v1_seen"
      autoOpen
    />
  )
}
