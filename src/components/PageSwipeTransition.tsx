'use client'
// 전체 메뉴 좌우 스와이프 네비게이션 + 페이지 전환 애니메이션 래퍼
//
// 사용: 섹션의 template.tsx 에서 페이지 컨텐츠를 감싼다 (템플릿은 내비게이션마다 재마운트).
//   <PageSwipeTransition base="/league/org/id" order={ORDER} noSwipeFrom={['record']}>
//     {children}
//   </PageSwipeTransition>
//
// 동작:
//   - 진입 애니메이션: 스와이프 방향 우선, 아니면 메뉴 순서(order) 비교로 방향 결정.
//     클릭 내비게이션도 방향 슬라이드, 순서를 알 수 없으면 페이드.
//   - 가로 드래그 시 컨텐츠가 손가락을 따라 이동 + 이동할 메뉴 이름 힌트 배지
//   - 스와이프 확정 → 슬라이드 아웃 후 router.push
//   - 이동할 메뉴 없는 방향은 고무줄 저항(0.25배) 후 스냅백
//   - 축 잠금: 첫 이동이 세로면 그 제스처 동안 가로 반응 비활성 (세로 스크롤 보호)
//   - noSwipeFrom 세그먼트에서는 스와이프 시작 금지 (스탯 입력 등 드래그 UI 보호)
//   - 첫 방문 시 모바일(coarse pointer)에서 스와이프 안내 코치마크 1회 표시

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useSwipe } from '@/hooks/useSwipe'

export interface SwipeMenuItem {
  /** base 뒤 첫 경로 세그먼트 ('' = 홈) */
  seg: string
  label: string
}

// 클라이언트 라우팅 한정 방향 기억 (모듈 스코프 — 서버에서는 사용 안 함)
let pendingSwipeDir: 'left' | 'right' | null = null
let lastVisit: { base: string; idx: number } | null = null
let lastAnimResult: string | null = null

// 진입 애니메이션 클래스 결정. StrictMode 중복 호출에도 안전하도록 같은 (base, idx) 재호출 시 직전 결과 반환
function consumeEnterAnim(base: string, idx: number): string | null {
  if (lastVisit && lastVisit.base === base && lastVisit.idx === idx) return lastAnimResult
  const dir = pendingSwipeDir
  pendingSwipeDir = null
  const last = lastVisit
  lastVisit = { base, idx }
  if (dir) {
    lastAnimResult = dir === 'left' ? 'page-enter-from-right' : 'page-enter-from-left'
  } else if (!last || last.base !== base) {
    lastAnimResult = null  // 최초 로드 / 타 섹션에서 진입 — 애니메이션 없음
  } else if (idx === -1 || last.idx === -1) {
    lastAnimResult = 'page-enter-fade'  // 순서를 모르는 메뉴 (예: 드래프트)
  } else {
    lastAnimResult = idx > last.idx ? 'page-enter-from-right' : 'page-enter-from-left'
  }
  return lastAnimResult
}

const EXIT_MS = 160
const COACH_KEY = 'swipe-nav-coach-v1'

interface Props {
  /** 섹션 베이스 경로 (예: /league/paranalgae/2026) */
  base: string
  /** 스와이프 이동 순서 — 네비게이션 메뉴 순서와 동기 유지 */
  order: SwipeMenuItem[]
  /** 스와이프 시작을 금지할 세그먼트 (드래그/입력 UI 충돌 방지) */
  noSwipeFrom?: string[]
  children: React.ReactNode
}

export default function PageSwipeTransition({ base, order, noSwipeFrom = [], children }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const seg = pathname.startsWith(base)
    ? (pathname.slice(base.length).split('/').filter(Boolean)[0] ?? '')
    : ''
  const idx = order.findIndex(t => t.seg === seg)
  const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null
  const prev = idx > 0 ? order[idx - 1] : null
  const swipeEnabled = idx >= 0 && !noSwipeFrom.includes(seg)

  // 진입 애니메이션 — 종료 후 클래스 제거 필수 (transform 이 남으면 하위 fixed 모달 기준이 틀어짐)
  const [enterAnim, setEnterAnim] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : consumeEnterAnim(base, idx)
  )

  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [exiting, setExiting] = useState(false)
  const exitingRef = useRef(false)
  // 첫 이동 방향으로 축 고정 — 세로 스크롤 중 컨텐츠가 좌우로 흔들리는 것 방지
  const axisRef = useRef<'x' | 'y' | null>(null)

  // 첫 방문 코치마크 — 모바일에서 1회
  const [showCoach, setShowCoach] = useState(false)
  useEffect(() => {
    if (!swipeEnabled) return
    if (!window.matchMedia?.('(pointer: coarse)').matches) return
    if (localStorage.getItem(COACH_KEY)) return
    // 페이지 안착 후 표시 → 5초 뒤 자동 소멸
    const show = setTimeout(() => setShowCoach(true), 600)
    const hide = setTimeout(() => {
      setShowCoach(false)
      localStorage.setItem(COACH_KEY, '1')
    }, 5600)
    return () => { clearTimeout(show); clearTimeout(hide) }
  }, [swipeEnabled])

  const confirmSwipe = (dir: 'left' | 'right') => {
    const target = dir === 'left' ? next : prev
    if (!target || axisRef.current !== 'x' || exitingRef.current) return
    exitingRef.current = true
    setExiting(true)
    setShowCoach(false)
    localStorage.setItem(COACH_KEY, '1')  // 스와이프를 해봤으면 코치마크 더 안 띄움
    setDragX(dir === 'left' ? -window.innerWidth : window.innerWidth)
    setTimeout(() => {
      pendingSwipeDir = dir
      router.push(target.seg ? `${base}/${target.seg}` : base)
    }, EXIT_MS)
  }

  const swipe = useSwipe({
    threshold: 60,
    edgeGuardPx: 24,  // iOS 뒤로가기 스와이프 회피 (좌 엣지)
    guardHorizontalScroll: true,  // 가로 스크롤 테이블/칩 목록 위 제스처와 충돌 방지
    onSwipeLeft: () => confirmSwipe('left'),
    onSwipeRight: () => confirmSwipe('right'),
    onDrag: (dx, dy) => {
      if (!axisRef.current && Math.max(Math.abs(dx), Math.abs(dy)) > 12) {
        axisRef.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      }
      if (axisRef.current !== 'x' || exitingRef.current) return
      setDragging(true)
      const target = dx < 0 ? next : prev
      setDragX(target ? dx : dx * 0.25)  // 이동할 메뉴 없으면 고무줄 저항
    },
    onDragEnd: () => {
      axisRef.current = null
      setDragging(false)
      if (!exitingRef.current) setDragX(0)  // 임계값 미달 → 원위치 스냅백
    },
  })

  // 드래그 중 이동할 메뉴 이름 힌트 (드래그가 깊어질수록 선명)
  const hintTarget = dragX < 0 ? next : prev
  const showHint = dragging && !!hintTarget && Math.abs(dragX) > 24

  return (
    // touch-pan-y — 세로 스크롤은 브라우저에 위임, 가로만 우리가 감지
    // min-h: 짧은 페이지에서도 스와이프 제스처 면적 확보
    <div className="touch-pan-y min-h-[60vh]" {...(swipeEnabled ? swipe : {})}>
      {showHint && hintTarget && (
        <div
          className={`fixed top-1/2 -translate-y-1/2 z-40 pointer-events-none flex items-center gap-1 px-3.5 py-2 rounded-full bg-gray-900/95 border border-gray-700 shadow-2xl text-sm font-bold text-white ${dragX < 0 ? 'right-2' : 'left-2'}`}
          style={{ opacity: Math.min(1, (Math.abs(dragX) - 24) / 50) }}
        >
          {dragX > 0 && <ChevronLeft size={15} className="text-blue-400" />}
          {hintTarget.label}
          {dragX < 0 && <ChevronRight size={15} className="text-blue-400" />}
        </div>
      )}
      {showCoach && !dragging && (
        <div className="fixed bottom-20 inset-x-0 z-40 flex justify-center pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gray-900/95 border border-gray-700 shadow-2xl text-xs font-semibold text-gray-200 page-coach-in">
            <ChevronLeft size={14} className="text-blue-400 page-coach-nudge-l" />
            좌우로 밀어서 메뉴 이동
            <ChevronRight size={14} className="text-blue-400 page-coach-nudge-r" />
          </div>
        </div>
      )}
      <div
        className={enterAnim ?? undefined}
        onAnimationEnd={() => setEnterAnim(null)}
        style={{
          // dragX=0 일 땐 transform 제거 — 남겨두면 하위 position:fixed 모달의 기준이 뷰포트가 아니게 됨
          transform: dragX !== 0 ? `translateX(${dragX}px)` : undefined,
          opacity: exiting ? 0 : undefined,
          transition: dragging ? 'none' : `transform ${EXIT_MS}ms ease-out, opacity ${EXIT_MS}ms ease-out`,
        }}
      >
        {children}
      </div>
    </div>
  )
}
