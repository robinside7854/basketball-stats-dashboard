// 공용 focus trap 훅
//
// 목적:
//   모달이 열려 있을 때 Tab 키가 배경 페이지 요소로 새어나가는 접근성 문제 해결.
//   - 열린 시점: 모달 내부 첫 focusable 요소로 자동 이동
//   - 열려 있는 동안: Tab / Shift+Tab 이 모달 내부 요소끼리만 순환
//   - 닫힐 때: 모달이 뜨기 전 focus 를 잡고 있던 요소로 복원
//
// 사용처:
//   PlayerQuickViewModal, DailyBoxscoreModal, AwardDetailModal,
//   GlobalSearchModal, ColumnEditor (5개 모달 공용)
//
// 규칙:
//   - Focusable 셀렉터: button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])
//   - disabled / hidden 요소는 자동 제외
//   - isActive=false 로 바뀌면 즉시 모든 리스너 해제 + 이전 activeElement 복원
//   - 모달 내부에 아무 focusable 이 없을 때는 컨테이너 자체로 focus 이동 (tabIndex=-1 부여)
//
// prefers-reduced-motion 관련 처리는 이 훅의 책임이 아님 (별도 관리)

'use client'
import { useEffect, useRef } from 'react'

/** 모달 내부의 Tab 대상이 될 수 있는 요소 셀렉터 */
const FOCUSABLE_SELECTOR = [
  'button',
  '[href]',
  'input',
  'select',
  'textarea',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** disabled / aria-hidden / display:none 요소는 실제로 focus 불가능하므로 제외 */
function isReallyFocusable(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled')) return false
  if (el.getAttribute('aria-hidden') === 'true') return false
  // getClientRects().length === 0 → display:none 또는 hidden 상속
  if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false
  return true
}

/**
 * 모달 컨테이너에 부착하면 focus trap 이 자동 작동하는 훅.
 *
 * @param isActive 모달이 열려 있는 동안 true — false 로 바뀌면 이전 focus 복원
 * @returns 모달 컨테이너 div 에 붙일 ref
 *
 * @example
 *   // 실제 모달 통합 예시
 *   function PlayerQuickViewModal({ open, onClose, playerId }: Props) {
 *     const trapRef = useFocusTrap(open)
 *
 *     if (!open) return null
 *
 *     return (
 *       <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
 *         <div
 *           ref={trapRef}
 *           role="dialog"
 *           aria-modal="true"
 *           aria-labelledby="modal-title"
 *           className="bg-white rounded-lg p-6 max-w-md w-full"
 *         >
 *           <h2 id="modal-title">선수 정보</h2>
 *           <button onClick={onClose}>닫기</button>
 *           ...
 *         </div>
 *       </div>
 *     )
 *   }
 */
export function useFocusTrap(isActive: boolean): React.RefObject<HTMLDivElement> {
  // 컨테이너 ref — 훅 호출자가 모달 wrapper 에 부착
  const containerRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>

  // 모달이 열리기 직전에 focus 를 가지고 있던 요소 (unmount 시 여기로 복원)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isActive) return

    const container = containerRef.current
    if (!container) return

    // 1) 열린 시점 activeElement 백업 → 나중에 복원
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    // 2) 현재 focusable 목록을 계산하는 helper
    //    (모달 내부 DOM 이 동적으로 바뀔 수 있어 매번 새로 조회)
    const getFocusables = (): HTMLElement[] => {
      const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      return Array.from(nodes).filter(isReallyFocusable)
    }

    // 3) 첫 focusable 로 이동 — 없으면 컨테이너 자체로 (screen reader 를 위해 tabIndex=-1)
    const focusables = getFocusables()
    if (focusables.length > 0) {
      focusables[0].focus()
    } else {
      if (!container.hasAttribute('tabindex')) {
        container.setAttribute('tabindex', '-1')
      }
      container.focus()
    }

    // 4) Tab 순환 로직
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const currentFocusables = getFocusables()
      if (currentFocusables.length === 0) {
        // 내부에 아무것도 없으면 Tab 을 그냥 막아서 배경으로 새지 않게 함
        e.preventDefault()
        return
      }

      const first = currentFocusables[0]
      const last = currentFocusables[currentFocusables.length - 1]
      const active = document.activeElement as HTMLElement | null

      // 컨테이너 밖으로 focus 가 이미 나가 있으면(외부 클릭 등) 첫 요소로 되돌림
      if (!active || !container.contains(active)) {
        e.preventDefault()
        first.focus()
        return
      }

      if (e.shiftKey) {
        // Shift+Tab — 첫 요소에서 뒤로 가면 마지막으로 순환
        if (active === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        // Tab — 마지막 요소에서 앞으로 가면 첫 요소로 순환
        if (active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      // 5) 모달 닫힐 때 원래 focus 였던 요소로 복원
      const prev = previouslyFocusedRef.current
      if (prev && document.contains(prev)) {
        // requestAnimationFrame 없이 즉시 복원 — 모달 unmount 후 배경 요소가 이미 렌더링돼 있음
        prev.focus()
      }
      previouslyFocusedRef.current = null
    }
  }, [isActive])

  return containerRef
}
