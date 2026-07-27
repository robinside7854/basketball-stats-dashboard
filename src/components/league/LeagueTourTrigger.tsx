'use client'
// 홈 페이지(server component) 하단에서 client 튜어를 트리거하기 위한 얇은 래퍼.
// 스텝 정의는 tourSteps.ts 에 상수로 유지 → 이 파일은 단일 책임(마운트)만 담당.
//
// ?tour=1 쿼리 감지: 다른 페이지에서 물음표 버튼 클릭 → 홈으로 이동 후 자동 실행

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { HOME_TOUR_STEPS, type TourStep } from './tour/tourSteps'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'

// LeagueTour(495줄, gsap 3.15 ~70KB) 는 첫방문 자동 실행 · 투어 열기 트리거 시점에만 필요
// → 홈 초기 번들에서 완전히 제외
const LeagueTour = dynamic(() => import('./LeagueTour'), { ssr: false })

// v3: 투어-탭 동기화 + 로그인 가치 스텝 반영 → 기존 사용자에게 1회 재노출
const SEEN_KEY = 'mm_tour_v3_seen'

// #6 비로그인 사용자에게만 삽입: 로그인 가치 안내 스텝
const LOGIN_STEP: TourStep = {
  id: 'login-value',
  placement: 'center',
  title: '로그인하면 내 대시보드가 열려요',
  description:
    '우리 팀 선수라면 로그인 후 홈 상단에서 내 시즌 스탯·랭킹·진행 중 스트릭·마일스톤을 볼 수 있어요.\n우측 상단 로그인 버튼에서 가입 요청도 가능합니다.',
}

export default function LeagueTourTrigger() {
  const sp = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useCurrentUser()

  // 성능(2026-07-27): 이미 투어를 본 사용자에게는 gsap 청크를 아예 안 받도록,
  //   실제로 투어가 필요할 때만 <LeagueTour> 를 마운트한다.
  //     · 미열람(첫 방문) → autoOpen 위해 즉시 마운트
  //     · ?tour=1 또는 도움말 버튼(mm-tour-open) → 마운트
  //     · 이미 열람 + 트리거 없음 → 마운트 안 함 (gsap 로드 스킵)
  const [armed, setArmed] = useState(false)
  const armedRef = useRef(false)
  useEffect(() => { armedRef.current = armed }, [armed])

  // 첫 방문(미열람) 또는 ?tour=1 이면 무장
  useEffect(() => {
    let seen = false
    try { seen = !!localStorage.getItem(SEEN_KEY) } catch { /* 무시 */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe: localStorage 는 클라이언트에서만 읽어 마운트 후 1회 동기화
    if (!seen || sp.get('tour') === '1') setArmed(true)
  }, [sp])

  // 도움말 버튼 등에서 mm-tour-open 이 오면 무장. 아직 마운트 전이었다면 이번 이벤트를
  // 놓치므로(리스너 미등록) 한 틱 뒤 재전파해 새로 뜬 LeagueTour 가 받도록 한다.
  useEffect(() => {
    const onOpen = () => {
      if (armedRef.current) return  // 이미 마운트됨 → LeagueTour 가 직접 수신
      setArmed(true)
      setTimeout(() => window.dispatchEvent(new CustomEvent('mm-tour-open')), 60)
    }
    window.addEventListener('mm-tour-open', onOpen)
    return () => window.removeEventListener('mm-tour-open', onOpen)
  }, [])

  // ?tour=1 → mm-tour-open 발사 (기존 동작 유지). 위에서 이미 무장돼 LeagueTour 가 처리.
  useEffect(() => {
    if (sp.get('tour') !== '1') return
    const t = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('mm-tour-open'))
      router.replace(pathname)  // ?tour=1 제거 (뒤로가기 재실행 방지)
    }, 400)
    return () => clearTimeout(t)
  }, [sp, router, pathname])

  if (!armed) return null

  // 비로그인 시 마지막(다시 보기) 스텝 앞에 로그인 가치 스텝 삽입
  const steps = user
    ? HOME_TOUR_STEPS
    : [...HOME_TOUR_STEPS.slice(0, -1), LOGIN_STEP, HOME_TOUR_STEPS[HOME_TOUR_STEPS.length - 1]]

  return (
    <LeagueTour
      steps={steps}
      storageKey={SEEN_KEY}
      autoOpen
    />
  )
}
