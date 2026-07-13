'use client'
// 인터랙티브 튜토리얼 투어 — 외부 라이브러리 없이 구현.
//
// 특징:
//   · SVG mask 기반 spotlight (전체 어두운 오버레이 + target rect 만 컷아웃)
//   · 팝오버는 placement 에 따라 target 인접 or 화면 중앙에 렌더 · 화면 밖이면 반대편 fallback
//   · localStorage 로 재방문 감지 (autoOpen && 미완료 → 첫 방문 자동 실행)
//   · 물음표 재실행 이벤트('mm-tour-open') 리스너로 언제든 강제 시작
//   · Skip / ESC / Finish 모두 완료 저장 (재실행 방지)
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
const POPOVER_MARGIN = 12         // 팝오버 <-> spotlight 간격
const POPOVER_MAX_WIDTH = 360     // max-w-sm 근사
const POPOVER_MIN_HEIGHT = 180    // 팝오버 배치 계산용 대략 값
const VIEWPORT_PADDING = 12       // 화면 가장자리 여백

export default function LeagueTour({ steps, storageKey, autoOpen, onFinish }: Props) {
  const [active, setActive] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [targetRect, setTargetRect] = useState<Rect | null>(null)
  const [tick, setTick] = useState(0)  // resize/scroll 강제 리렌더용
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
    if (typeof document !== 'undefined') {
      previousFocus.current = document.activeElement as HTMLElement | null
    }
  }, [])

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(storageKey, String(Date.now()))
    } catch { /* localStorage 차단 환경 무시 */ }
  }, [storageKey])

  const closeTour = useCallback((completed: boolean) => {
    setActive(false)
    markSeen()
    // 이전 포커스 복원
    if (previousFocus.current && typeof previousFocus.current.focus === 'function') {
      try { previousFocus.current.focus() } catch { /* 무시 */ }
    }
    if (completed && onFinish) onFinish()
  }, [markSeen, onFinish])

  const nextStep = useCallback(() => {
    if (isLast) {
      closeTour(true)
      return
    }
    setStepIdx(i => i + 1)
  }, [isLast, closeTour])

  const prevStep = useCallback(() => {
    if (isFirst) return
    setStepIdx(i => i - 1)
  }, [isFirst])

  // 첫 방문 자동 시작 · 재실행 이벤트 리스너
  useEffect(() => {
    if (typeof window === 'undefined') return
    // 재실행 이벤트 — localStorage 무시하고 강제 실행
    const reopen = () => startTour()
    window.addEventListener(REOPEN_EVENT, reopen)

    if (autoOpen) {
      let seen: string | null = null
      try { seen = localStorage.getItem(storageKey) } catch { /* 무시 */ }
      if (!seen) {
        const t = setTimeout(() => startTour(), 200)
        return () => {
          clearTimeout(t)
          window.removeEventListener(REOPEN_EVENT, reopen)
        }
      }
    }
    return () => window.removeEventListener(REOPEN_EVENT, reopen)
  }, [autoOpen, storageKey, startTour])

  // 스텝 진입 시 onEnter · target 찾기 · scrollIntoView
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
      // target 이 없는 스텝은 중앙 팝오버로 fallback
      setTargetRect(null)
      return
    }
    // 화면 중앙으로 스크롤 (뷰포트 벗어난 경우)
    try { el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion ? 'auto' : 'smooth' }) } catch { /* 무시 */ }

    // 스크롤 완료 후 rect 계산 (약간 지연)
    const t = setTimeout(() => {
      const r = el.getBoundingClientRect()
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }, prefersReducedMotion ? 0 : 260)
    return () => clearTimeout(t)
  }, [active, step, tick, prefersReducedMotion])

  // resize / scroll 리스너 — 실시간 rect 재계산
  useEffect(() => {
    if (!active) return
    const onResize = () => setTick(t => t + 1)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [active])

  // 키보드 조작 (ESC/좌우/Enter) · focus-trap
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeTour(false)
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        nextStep()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prevStep()
      } else if (e.key === 'Tab') {
        // 팝오버 밖으로 포커스 이탈 방지 — 팝오버 내부 focusable 만 순환
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

  // 팝오버 마운트 시 초기 포커스
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => {
      const pop = popoverRef.current
      if (!pop) return
      const btn = pop.querySelector<HTMLButtonElement>('button[data-tour-primary]')
      btn?.focus()
    }, prefersReducedMotion ? 0 : 300)
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
      // 화면 중앙
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: `min(${POPOVER_MAX_WIDTH}px, calc(100vw - ${VIEWPORT_PADDING * 2}px))`,
      }
    }
    const centerX = spot.left + spot.width / 2

    // placement fallback — 요청 placement 로 배치 시 화면 벗어나면 반대편으로
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
        default:
          return null
      }
    }
    const opposite: Record<TourPlacement, TourPlacement> = {
      top: 'bottom', bottom: 'top', left: 'right', right: 'left', center: 'center',
    }
    return tryPlace(placement) ?? tryPlace(opposite[placement]) ?? {
      top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      maxWidth: `min(${POPOVER_MAX_WIDTH}px, calc(100vw - ${VIEWPORT_PADDING * 2}px))`,
    }
  })()

  // SVG mask 로 spotlight — 전체 어두운 오버레이 + target rect 만 컷아웃
  const overlayId = 'mm-tour-overlay-mask'

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
      {/* SVG mask 오버레이 — spot 있으면 컷아웃, 없으면 전체 어둡게 */}
      <svg
        aria-hidden
        style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'auto' }}
        onClick={(e) => {
          // 오버레이 클릭 시 닫기 (spotlight 영역은 pointer-events 로 통과)
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
                rx={8}
                ry={8}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="rgba(0, 0, 0, 0.6)"
          mask={`url(#${overlayId})`}
          style={{ transition: prefersReducedMotion ? 'none' : 'opacity 200ms ease-out' }}
        />
        {/* spotlight border ring — mm-yellow */}
        {spot && (
          <rect
            x={spot.left}
            y={spot.top}
            width={spot.width}
            height={spot.height}
            rx={8}
            ry={8}
            fill="none"
            stroke="var(--mm-yellow)"
            strokeWidth={2}
            style={{ pointerEvents: 'none' }}
          />
        )}
      </svg>

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
          borderRadius: 12,
          boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.35)',
          padding: '18px 20px 16px',
          minWidth: 260,
          transition: prefersReducedMotion ? 'none' : 'opacity 180ms ease-out',
          ...popoverStyle,
        }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
          <div
            id="mm-tour-title"
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--mm-ink)',
              lineHeight: 1.35,
              flex: 1,
              minWidth: 0,
            }}
          >
            {step.title}
          </div>
          <button
            type="button"
            onClick={() => closeTour(false)}
            aria-label="둘러보기 건너뛰기"
            style={{
              minWidth: 44, minHeight: 44,
              marginTop: -8, marginRight: -8,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent',
              color: 'var(--mm-muted)',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 8,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* 설명 */}
        <p
          id="mm-tour-desc"
          style={{
            fontSize: 14,
            lineHeight: 1.65,
            color: 'var(--mm-ink-soft)',
            margin: 0,
            marginBottom: 14,
            whiteSpace: 'pre-line',
          }}
        >
          {step.description}
        </p>

        {/* 스텝 인디케이터 + 컨트롤 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          {/* 인디케이터 */}
          <div aria-hidden style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {steps.map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === stepIdx ? 18 : 6,
                  height: 6,
                  borderRadius: 999,
                  background: i === stepIdx ? 'var(--mm-yellow)' : 'var(--mm-rule)',
                  transition: prefersReducedMotion ? 'none' : 'all 180ms ease-out',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {/* Skip (마지막 스텝은 숨김 — 완료 버튼과 중복) */}
            {!isLast && (
              <button
                type="button"
                onClick={() => closeTour(false)}
                style={{
                  minHeight: 44,
                  padding: '8px 12px',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--mm-muted)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 8,
                }}
              >
                건너뛰기
              </button>
            )}
            {/* 이전 */}
            {!isFirst && (
              <button
                type="button"
                onClick={prevStep}
                aria-label="이전 단계"
                style={{
                  minHeight: 44, minWidth: 44,
                  padding: '8px 12px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--mm-ink)',
                  background: 'var(--mm-panel-alt)',
                  border: '1px solid var(--mm-rule)',
                  cursor: 'pointer',
                  borderRadius: 8,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                <ChevronLeft size={14} /> 이전
              </button>
            )}
            {/* 다음 · 완료 */}
            <button
              type="button"
              data-tour-primary
              onClick={nextStep}
              style={{
                minHeight: 44, minWidth: 44,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--mm-black, #0A0A0A)',
                background: 'var(--mm-yellow)',
                border: '1px solid var(--mm-yellow)',
                cursor: 'pointer',
                borderRadius: 8,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              {isLast ? '완료' : (<>다음 <ChevronRight size={14} /></>)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
