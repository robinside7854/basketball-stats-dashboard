'use client'
// 시트 — 모바일(<640px)에선 아래에서 올라오는 바텀시트, PC 에선 가운데 창 (리뉴얼 1단계, 2026-10-12).
//
// 배경: 모달마다 Esc·배경 클릭·스크롤 잠금·포커스·safe-area 를 따로 구현해 빠진 곳이 생겼다
//   (스크롤 잠금이 없어 배경이 같이 밀리는 창, 아이폰 홈바에 버튼이 걸리는 창).
//   모바일에서 가운데 뜨는 창은 엄지가 닿지 않는다 — 손가락이 있는 아래에서 올라온다.
// 규칙
//   · 등장 애니메이션은 globals.css 의 .mm-sheet-in 하나 — 미디어쿼리로 모바일 슬라이드 / PC 스케일이 갈린다.
//   · 열리면 패널에 포커스를 준다. 단, 안쪽 요소가 이미 autoFocus 로 포커스를 가져갔으면 뺏지 않는다.
//   · 닫히면 열기 전 포커스 위치로 돌려준다.
//   · aria-labelledby 는 title 을 주면 자동, 직접 제목을 그리면 labelledBy 로 그 id 를 넘긴다.

import { usePlayerCardOpen } from '@/contexts/PlayerCardContext'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

const WIDTH = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg', xl: 'sm:max-w-xl' } as const

interface Props {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** 주면 상단에 제목 + 닫기 버튼을 그린다 */
  title?: ReactNode
  /** title 없이 본문이 제목을 직접 그릴 때 그 요소의 id */
  labelledBy?: string
  /** PC 창 최대 폭 */
  width?: keyof typeof WIDTH
  /** 다른 오버레이 위에 띄울 때 — 기본 80 */
  zIndex?: number
  /** 테두리 색 — 위험 확인창 등 */
  borderColor?: string
  /** false 면 본문 패딩을 호출부가 직접 준다 */
  padded?: boolean
  className?: string
}

export default function Sheet({
  open, onClose, children, title, labelledBy, width = 'md', zIndex = 80, borderColor, padded = true, className = '',
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const autoId = useId()
  const titleId = title ? `${autoId}-title` : labelledBy
  // onClose 가 매 렌더 새 함수여도 리스너를 다시 달지 않도록 최신값만 참조한다
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  // 이 시트 위에 전역 선수 카드가 떠 있으면 Esc·Tab 은 카드 몫이다(2026-10-14) — 둘이 같이 닫히거나 Tab 을 빼앗지 않게
  const cardOpen = usePlayerCardOpen()
  const cardOpenRef = useRef(cardOpen)
  useEffect(() => { cardOpenRef.current = cardOpen }, [cardOpen])

  useEffect(() => {
    if (!open) return
    const prevFocus = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true })

    function onKey(e: KeyboardEvent) {
      if (cardOpenRef.current) return
      if (e.key === 'Escape') { onCloseRef.current(); return }
      if (e.key !== 'Tab' || !panel) return
      // 가벼운 포커스 가두기 — Tab 이 배경으로 새어 나가지 않게 처음/끝에서 순환
      const items = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (items.length === 0) { e.preventDefault(); return }
      const first = items[0], last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panel)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus({ preventScroll: true })
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-4"
      style={{ zIndex, paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
    >
      <div className="absolute inset-0 bg-black/70 mm-fade-in" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative w-full ${WIDTH[width]} max-h-[90dvh] overflow-y-auto overscroll-contain mm-sheet-in outline-none shadow-2xl rounded-t-[var(--mm-radius-card)] sm:rounded-[var(--mm-radius-card)] ${padded ? 'px-5 pt-3 sm:px-6 sm:pt-6 pb-safe-or-4' : ''} ${className}`}
        style={{ background: 'var(--mm-panel)', border: `1px solid ${borderColor ?? 'var(--mm-rule)'}` }}
      >
        {/* 모바일 손잡이 — 바텀시트임을 알려 주는 시각 단서(드래그 기능은 없다) */}
        <div aria-hidden className={`sm:hidden mx-auto mb-3 h-1 w-10 rounded-full ${padded ? '' : 'mt-3'}`} style={{ background: 'var(--mm-rule)' }} />
        {title && (
          <div className="flex items-start justify-between gap-3 mb-4">
            <h2 id={titleId} className="text-lg sm:text-xl font-black min-w-0 break-keep" style={{ color: 'var(--mm-ink)' }}>
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="-mr-2 -mt-1 inline-flex items-center justify-center min-h-11 min-w-11 rounded-full cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
              style={{ color: 'var(--mm-muted)' }}
            >
              <X size={20} aria-hidden />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
