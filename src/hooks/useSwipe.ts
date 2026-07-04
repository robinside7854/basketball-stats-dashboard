// 공용 스와이프 감지 훅
//
// 사용 사례:
//   1) 모달 스와이프-투-디스미스 (아래로 드래그하면 close)
//   2) 서브탭 간 좌우 스와이프 네비게이션
//
// 규칙 (UX 가이드 반영):
//   - 화면 가장자리 20px 는 브라우저 뒤로가기 제스처와 충돌 가능 → 시작점 제외 옵션
//   - 45도 이하 방향만 유효 (세로 스크롤 오작동 방지)
//   - 임계값 미만 이동은 무시 (실수 방지)

'use client'
import { useRef } from 'react'

export type SwipeDir = 'up' | 'down' | 'left' | 'right'

export interface UseSwipeOptions {
  /** 스와이프 확정 최소 이동 거리 (px). 기본 50 */
  threshold?: number
  /** 화면 좌우 엣지 몇 px 는 시작점 무효 (브라우저 back 제스처 충돌 방지). 0 이면 비활성. 기본 20 */
  edgeGuardPx?: number
  /** 가로 스크롤 가능한 컨테이너(테이블 등) 내부에서 시작한 터치는 무시. 기본 false */
  guardHorizontalScroll?: boolean
  /** 세로 스와이프 감지 시 콜백 */
  onSwipeUp?: () => void
  onSwipeDown?: (opts: { deltaY: number }) => void
  /** 가로 스와이프 감지 시 콜백 */
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  /** 드래그 중 실시간 콜백 (모달을 손가락 따라 움직이기 등) */
  onDrag?: (dx: number, dy: number) => void
  /** 드래그 종료 시 콜백 (트랜지션 원복 등) */
  onDragEnd?: () => void
}

/** target 부터 boundary 직전까지 올라가며 가로 스크롤이 실제로 발생하는 요소가 있는지 검사 */
function isInsideHorizontalScroller(target: EventTarget | null, boundary: Element): boolean {
  let el = target instanceof Element ? target : null
  while (el && el !== boundary) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflowX = getComputedStyle(el).overflowX
      if (overflowX === 'auto' || overflowX === 'scroll') return true
    }
    el = el.parentElement
  }
  return false
}

export interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
}

/**
 * 요소에 붙일 터치 이벤트 핸들러 세트를 반환
 * @example
 *   const swipe = useSwipe({ onSwipeDown: onClose })
 *   <div {...swipe}>...</div>
 */
export function useSwipe(opts: UseSwipeOptions): SwipeHandlers {
  const {
    threshold = 50,
    edgeGuardPx = 20,
    guardHorizontalScroll = false,
    onSwipeUp, onSwipeDown, onSwipeLeft, onSwipeRight,
    onDrag, onDragEnd,
  } = opts

  // ref 로 시작점 저장 (rerender 최소화)
  const startRef = useRef<{ x: number; y: number; time: number } | null>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    if (!t) return
    // 엣지 가드 — 시작점이 좌/우 엣지 근처면 트래킹 안 함 (브라우저 back 제스처 우선)
    if (edgeGuardPx > 0) {
      const w = window.innerWidth
      if (t.clientX < edgeGuardPx || t.clientX > w - edgeGuardPx) {
        startRef.current = null
        return
      }
    }
    // 가로 스크롤 컨테이너 가드 — 테이블 스크롤 중 손을 떼면 탭 전환이 오발동하는 것 방지
    if (guardHorizontalScroll && isInsideHorizontalScroller(e.target, e.currentTarget)) {
      startRef.current = null
      return
    }
    startRef.current = { x: t.clientX, y: t.clientY, time: Date.now() }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (!startRef.current) return
    const t = e.touches[0]
    if (!t) return
    const dx = t.clientX - startRef.current.x
    const dy = t.clientY - startRef.current.y
    onDrag?.(dx, dy)
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!startRef.current) { onDragEnd?.(); return }
    const t = e.changedTouches[0]
    if (!t) { startRef.current = null; onDragEnd?.(); return }
    const dx = t.clientX - startRef.current.x
    const dy = t.clientY - startRef.current.y
    startRef.current = null

    const absX = Math.abs(dx)
    const absY = Math.abs(dy)
    // 임계값 미만 → 스와이프 아님
    if (Math.max(absX, absY) < threshold) { onDragEnd?.(); return }

    // 세로가 우세 (수직 스와이프)
    if (absY > absX) {
      // 45도 이내 = 명확한 세로 스와이프
      if (dy > 0) onSwipeDown?.({ deltaY: dy })
      else onSwipeUp?.()
    } else {
      // 가로가 우세 (수평 스와이프)
      if (dx > 0) onSwipeRight?.()
      else onSwipeLeft?.()
    }
    onDragEnd?.()
  }

  return { onTouchStart, onTouchMove, onTouchEnd }
}
