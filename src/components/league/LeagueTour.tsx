'use client'
// 인터랙티브 튜토리얼 투어 — 외부 라이브러리 없이 커스텀 구현.
//
// 부드러움 (v2 리팩터):
//   · SVG mask cutout · CSS transition 으로 x/y/width/height 애니메이션 (chrome 62+, ff 68+, safari 14+)
//   · Spotlight ring 별도 div · transform + width/height transition
//   · 팝오버 이동은 top/left/right/bottom + transform 모두 transition
//   · 팝오버 등장: opacity 0 → 1 + scale 0.96 → 1 (spring cubic-bezier)
//   · 배경 backdrop-filter blur 로 프리미엄 느낌 (성능 여유 있을 때만)
//   · 260ms 지연 제거 → 즉시 rect 계산 + scroll 후 재계산 (transition 이 부드럽게 처리)
//
// 기능:
//   · localStorage 로 재방문 감지 (autoOpen && 미완료 → 첫 방문 자동 실행)
//   · 물음표 재실행 이벤트 'mm-tour-open' 리스너
//   · Skip / ESC / Finish 모두 완료 저장
//   · resize / scroll 시 target rect 실시간 재계산
//   · aria-modal · focus-trap · reduce-motion 대응 · 44px 터치 타겟

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import type { TourStep, TourPlacement } from './tour/tourSteps'

interface Props {
  steps: TourStep[]
  storageKey: string
  autoOpen: boolean
  onFinish?: () => void
}

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const REOPEN_EVENT = 'mm-tour-open'
const POPOVER_MARGIN = 14         // 팝오버 <-> spotlight 간격
const POPOVER_MAX_WIDTH = 360     // max-w-sm 근사
const POPOVER_MIN_HEIGHT = 180    // 팝오버 배치 계산용 대략 값
const VIEWPORT_PADDING = 12       // 화면 가장자리 여백

// spring-like ease-out (프리미엄 느낌)
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const DUR_SPOT = 420      // spotlight 이동/크기
const DUR_POP  = 320      // 팝오버 이동
const DUR_MOUNT = 240     // 첫 등장 fade+scale

export default function LeagueTour({ steps, storageKey, autoOpen, onFinish }: Props) {
  const [active, setActive] = useState(false)
  const [mounted, setMounted] = useState(false)   // fade-in 트리거
  const [stepIdx, setStepIdx] = useState(0)
  const [targetRect, setTargetRect] = useState<Rect | null>(null)
  const [tick, setTick] = useState(0)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  const step = steps[stepIdx]
  const isLast = stepIdx === steps.length - 1
  const isFirst = stepIdx === 0

  // reduce-motion 감지
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mq.matches)
    const h = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  const startTour = useCallback(() => {
    setStepIdx(0)
    setActive(true)
    setMounted(false)
    if (typeof document !== 'undefined') {
      previousFocus.current = document.activeElement as HTMLElement | null
    }
    // 다음 프레임에 mounted true → CSS transition 발동
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setMounted(true))
    })
  }, [])

  const markSeen = useCallback(() => {
    try { localStorage.setItem(storageKey, String(Date.now())) } catch { /* 무시 */ }
  }, [storageKey])

  const closeTour = useCallback((completed: boolean) => {
    setMounted(false)
    // fade-out 후 언마운트
    const t = setTimeout(() => {
      setActive(false)
      markSeen()
      if (previousFocus.current && typeof previousFocus.current.focus === 'function') {
        try { previousFocus.current.focus() } catch { /* 무시 */ }
      }
      if (completed && onFinish) onFinish()
    }, prefersReducedMotion ? 0 : DUR_MOUNT)
    return () => clearTimeout(t)
  }, [markSeen, onFinish, prefersReducedMotion])

  const nextStep = useCallback(() => {
    if (isLast) { closeTour(true); return }
    setStepIdx(i => i + 1)
  }, [isLast, closeTour])

  const prevStep = useCallback(() => {
    if (isFirst) return
    setStepIdx(i => i - 1)
  }, [isFirst])

  // 첫 방문 자동 시작 · 재실행 이벤트 리스너
  useEffect(() => {
    if (typeof window === 'undefined') return
    const reopen = () => startTour()
    window.addEventListener(REOPEN_EVENT, reopen)

    if (autoOpen) {
      let seen: string | null = null
      try { seen = localStorage.getItem(storageKey) } catch { /* 무시 */ }
      if (!seen) {
        const t = setTimeout(() => startTour(), 400)
        return () => {
          clearTimeout(t)
          window.removeEventListener(REOPEN_EVENT, reopen)
        }
      }
    }
    return () => window.removeEventListener(REOPEN_EVENT, reopen)
  }, [autoOpen, storageKey, startTour])

  // 스텝 진입 · target 찾기 · 즉시 rect 계산 (transition 이 부드럽게)
  useEffect(() => {
    if (!active || !step) return
    if (step.onEnter) {
      try { step.onEnter() } catch { /* 무시 */ }
    }
    if (!step.targetSelector) {
      setTargetRect(null)
      return
    }
    const el = document.querySelector<HTMLElement>(step.targetSelector)
    if (!el) {
      setTargetRect(null)
      return
    }
    // 즉시 rect 계산 → spotlight 시작 (transition 이 부드럽게 이동)
    const r0 = el.getBoundingClientRect()
    setTargetRect({ top: r0.top, left: r0.left, width: r0.width, height: r0.height })

    // 화면 중앙으로 부드럽게 스크롤
    try { el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion ? 'auto' : 'smooth' }) } catch { /* 무시 */ }

    // 스크롤 완료 후 rect 재계산 (다시 자연스럽게 transition)
    const t = setTimeout(() => {
      const r = el.getBoundingClientRect()
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }, prefersReducedMotion ? 0 : 350)
    return () => clearTimeout(t)
  }, [active, step, tick, prefersReducedMotion])

  // resize / scroll 리스너
  useEffect(() => {
    if (!active) return
    let rafId = 0
    const onChange = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => setTick(t => t + 1))
    }
    window.addEventListener('resize', onChange)
    window.addEventListener('scroll', onChange, true)
    return () => {
      window.removeEventListener('resize', onChange)
      window.removeEventListener('scroll', onChange, true)
      cancelAnimationFrame(rafId)
    }
  }, [active])

  // 키보드 조작 · focus-trap
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeTour(false) }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); nextStep() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prevStep() }
      else if (e.key === 'Tab') {
        const pop = popoverRef.current
        if (!pop) return
        const focusables = pop.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, closeTour, nextStep, prevStep])

  // 팝오버 마운트 시 초기 포커스 · 등장 애니메이션 후 실행
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => {
      const pop = popoverRef.current
      if (!pop) return
      const btn = pop.querySelector<HTMLButtonElement>('button[data-tour-primary]')
      btn?.focus({ preventScroll: true })
    }, prefersReducedMotion ? 0 : DUR_MOUNT + 50)
    return () => clearTimeout(t)
  }, [active, stepIdx, prefersReducedMotion])

  if (!active || !step) return null

  const padding = step.spotlightPadding ?? 8
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 720

  // spotlight rect (padding 포함)
  const spot = targetRect ? {
    top: Math.max(0, targetRect.top - padding),
    left: Math.max(0, targetRect.left - padding),
    width: Math.min(vw, targetRect.width + padding * 2),
    height: Math.min(vh, targetRect.height + padding * 2),
  } : null

  // 팝오버 위치 계산
  const placement: TourPlacement = step.placement ?? (spot ? 'bottom' : 'center')
  const popoverStyle: React.CSSProperties = (() => {
    if (!spot || placement === 'center') {
      return {
        top: '50%',
        left: '50%',
        transform: mounted ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.96)',
        opacity: mounted ? 1 : 0,
        maxWidth: `min(${POPOVER_MAX_WIDTH}px, calc(100vw - ${VIEWPORT_PADDING * 2}px))`,
      }
    }
    const centerX = spot.left + spot.width / 2

    const tryPlace = (p: TourPlacement): React.CSSProperties | null => {
      switch (p) {
        case 'bottom': {
          const top = spot.top + spot.height + POPOVER_MARGIN
          if (top + POPOVER_MIN_HEIGHT > vh - VIEWPORT_PADDING) return null
          const left = Math.max(VIEWPORT_PADDING, Math.min(vw - POPOVER_MAX_WIDTH - VIEWPORT_PADDING, centerX - POPOVER_MAX_WIDTH / 2))
          return { top, left, maxWidth: `min(${POPOVER_MAX_WIDTH}px, calc(100vw - ${VIEWPORT_PADDING * 2}px))` }
        }
        case 'top': {
          const bottom = vh - spot.top + POPOVER_MARGIN
          if (bottom + POPOVER_MIN_HEIGHT > vh - VIEWPORT_PADDING) return null
          const left = Math.max(VIEWPORT_PADDING, Math.min(vw - POPOVER_MAX_WIDTH - VIEWPORT_PADDING, centerX - POPOVER_MAX_WIDTH / 2))
          return { bottom, left, maxWidth: `min(${POPOVER_MAX_WIDTH}px, calc(100vw - ${VIEWPORT_PADDING * 2}px))` }
        }
        case 'right': {
          const left = spot.left + spot.width + POPOVER_MARGIN
          if (left + POPOVER_MAX_WIDTH > vw - VIEWPORT_PADDING) return null
          const top = Math.max(VIEWPORT_PADDING, Math.min(vh - POPOVER_MIN_HEIGHT - VIEWPORT_PADDING, spot.top + spot.height / 2 - POPOVER_MIN_HEIGHT / 2))
          return { top, left, maxWidth: `min(${POPOVER_MAX_WIDTH}px, calc(100vw - ${left}px - ${VIEWPORT_PADDING}px))` }
        }
        case 'left': {
          const right = vw - spot.left + POPOVER_MARGIN
          if (right + POPOVER_MAX_WIDTH > vw - VIEWPORT_PADDING) return null
          const top = Math.max(VIEWPORT_PADDING, Math.min(vh - POPOVER_MIN_HEIGHT - VIEWPORT_PADDING, spot.top + spot.height / 2 - POPOVER_MIN_HEIGHT / 2))
          return { top, right, maxWidth: `min(${POPOVER_MAX_WIDTH}px, calc(100vw - ${right}px - ${VIEWPORT_PADDING}px))` }
        }
        default: return null
      }
    }
    const opposite: Record<TourPlacement, TourPlacement> = {
      top: 'bottom', bottom: 'top', left: 'right', right: 'left', center: 'center',
    }
    const placed = tryPlace(placement) ?? tryPlace(opposite[placement]) ?? {
      top: '50%', left: '50%',
      maxWidth: `min(${POPOVER_MAX_WIDTH}px, calc(100vw - ${VIEWPORT_PADDING * 2}px))`,
    }
    // mount 애니메이션 — opacity + subtle scale
    return {
      ...placed,
      opacity: mounted ? 1 : 0,
      transform: mounted ? 'scale(1)' : 'scale(0.96)',
      transformOrigin: placement === 'top' ? 'bottom center' : placement === 'bottom' ? 'top center' : 'center center',
    }
  })()

  const overlayId = 'mm-tour-overlay-mask'

  // 배경 오버레이 opacity (mount 이후 부드럽게)
  const backdropOpacity = mounted ? 1 : 0

  return (
    <div
      className="mm-tour-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mm-tour-title"
      aria-describedby="mm-tour-desc"
      aria-live="polite"
      style={{ position: 'fixed', inset: 0, zIndex: 100, pointerEvents: 'none' }}
    >
      {/* SVG mask cutout — spot 이 있으면 컷아웃 */}
      <svg
        aria-hidden
        style={{
          position: 'fixed', inset: 0, width: '100vw', height: '100vh',
          pointerEvents: 'auto',
          opacity: backdropOpacity,
          transition: prefersReducedMotion ? 'none' : `opacity ${DUR_MOUNT}ms ${EASE}`,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeTour(false)
        }}
      >
        <defs>
          <mask id={overlayId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spot && (
              <rect
                x={spot.left}
                y={spot.top}
                width={spot.width}
                height={spot.height}
                rx={10}
                ry={10}
                fill="black"
                style={{
                  transition: prefersReducedMotion ? 'none'
                    : `x ${DUR_SPOT}ms ${EASE}, y ${DUR_SPOT}ms ${EASE}, width ${DUR_SPOT}ms ${EASE}, height ${DUR_SPOT}ms ${EASE}`,
                }}
              />
            )}
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="rgba(0, 0, 0, 0.62)"
          mask={`url(#${overlayId})`}
        />
      </svg>

      {/* Spotlight ring (별도 div · GPU-friendly · pulse 애니메이션) */}
      {spot && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            borderRadius: 10,
            border: '2px solid var(--mm-yellow)',
            boxShadow: '0 0 0 4px rgba(234, 179, 8, 0.18), 0 0 24px rgba(234, 179, 8, 0.32)',
            pointerEvents: 'none',
            opacity: backdropOpacity,
            transition: prefersReducedMotion ? 'none'
              : `top ${DUR_SPOT}ms ${EASE}, left ${DUR_SPOT}ms ${EASE}, width ${DUR_SPOT}ms ${EASE}, height ${DUR_SPOT}ms ${EASE}, opacity ${DUR_MOUNT}ms ${EASE}`,
          }}
        />
      )}

      {/* 팝오버 */}
      <div
        ref={popoverRef}
        className="mm-tour-popover"
        style={{
          position: 'fixed',
          pointerEvents: 'auto',
          background: 'var(--mm-panel)',
          color: 'var(--mm-ink)',
          border: '1px solid var(--mm-yellow)',
          borderRadius: 14,
          boxShadow: '0 24px 48px -16px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(234, 179, 8, 0.20)',
          padding: '18px 20px 16px',
          minWidth: 260,
          willChange: 'transform, top, left, right, bottom, opacity',
          transition: prefersReducedMotion ? 'none'
            : `top ${DUR_POP}ms ${EASE}, left ${DUR_POP}ms ${EASE}, right ${DUR_POP}ms ${EASE}, bottom ${DUR_POP}ms ${EASE}, transform ${DUR_MOUNT}ms ${EASE}, opacity ${DUR_MOUNT}ms ${EASE}`,
          ...popoverStyle,
        }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
          <div
            id="mm-tour-title"
            style={{
              fontSize: 16, fontWeight: 700, color: 'var(--mm-ink)',
              lineHeight: 1.35, flex: 1, minWidth: 0,
            }}
          >
            {step.title}
          </div>
          <button
            type="button"
            onClick={() => closeTour(false)}
            aria-label="둘러보기 건너뛰기"
            style={{
              minWidth: 44, minHeight: 44, marginTop: -8, marginRight: -8,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', color: 'var(--mm-muted)',
              border: 'none', cursor: 'pointer', borderRadius: 8,
              transition: prefersReducedMotion ? 'none' : `background 160ms ${EASE}`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--mm-panel-alt)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* 설명 */}
        <p
          id="mm-tour-desc"
          style={{
            fontSize: 14, lineHeight: 1.65, color: 'var(--mm-ink-soft)',
            margin: 0, marginBottom: 14, whiteSpace: 'pre-line',
          }}
        >
          {step.description}
        </p>

        {/* 스텝 인디케이터 + 컨트롤 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div aria-hidden style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {steps.map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === stepIdx ? 20 : 6,
                  height: 6,
                  borderRadius: 999,
                  background: i === stepIdx ? 'var(--mm-yellow)' : 'var(--mm-rule)',
                  transition: prefersReducedMotion ? 'none' : `width 240ms ${EASE}, background 240ms ${EASE}`,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {!isLast && (
              <button
                type="button"
                onClick={() => closeTour(false)}
                style={{
                  minHeight: 44, padding: '8px 12px',
                  fontSize: 13, fontWeight: 500,
                  color: 'var(--mm-muted)', background: 'transparent',
                  border: 'none', cursor: 'pointer', borderRadius: 8,
                  transition: prefersReducedMotion ? 'none' : `color 160ms ${EASE}`,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--mm-ink)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--mm-muted)' }}
              >
                건너뛰기
              </button>
            )}
            {!isFirst && (
              <button
                type="button"
                onClick={prevStep}
                aria-label="이전 단계"
                style={{
                  minHeight: 44, minWidth: 44, padding: '8px 12px',
                  fontSize: 13, fontWeight: 600,
                  color: 'var(--mm-ink)', background: 'var(--mm-panel-alt)',
                  border: '1px solid var(--mm-rule)', cursor: 'pointer', borderRadius: 8,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  transition: prefersReducedMotion ? 'none' : `background 160ms ${EASE}, border-color 160ms ${EASE}`,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--mm-ink-soft)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--mm-rule)' }}
              >
                <ChevronLeft size={14} /> 이전
              </button>
            )}
            <button
              type="button"
              data-tour-primary
              onClick={nextStep}
              style={{
                minHeight: 44, minWidth: 44, padding: '8px 14px',
                fontSize: 13, fontWeight: 700,
                color: 'var(--mm-black, #0A0A0A)', background: 'var(--mm-yellow)',
                border: '1px solid var(--mm-yellow)', cursor: 'pointer', borderRadius: 8,
                display: 'inline-flex', alignItems: 'center', gap: 4,
                boxShadow: '0 4px 12px -2px rgba(234, 179, 8, 0.4)',
                transition: prefersReducedMotion ? 'none' : `filter 160ms ${EASE}, transform 160ms ${EASE}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.05)' }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)' }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)' }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              {isLast ? '완료' : (<>다음 <ChevronRight size={14} /></>)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
