'use client'
// 인터랙티브 튜토리얼 투어 v4 — v2 안정성 + GSAP SVG mask + Beautiful shadow.
//
// 접근:
//   · 팝오버/ring 위치는 React state + CSS transition (안정적 · 충돌 없음)
//   · SVG mask rect 만 GSAP attr tween (브라우저 편차 해소)
//   · 팝오버 elevation 은 Beautiful md shadow (skill 기반)
//   · reduce-motion 대응 · aria-modal · focus-trap · 44px 터치

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { gsap } from 'gsap'
import type { TourStep, TourPlacement } from './tour/tourSteps'

interface Props {
  steps: TourStep[]
  storageKey: string
  autoOpen: boolean
  onFinish?: () => void
}

interface Rect { top: number; left: number; width: number; height: number }

const REOPEN_EVENT = 'mm-tour-open'
const POPOVER_MARGIN = 14
const POPOVER_MAX_WIDTH = 360
const POPOVER_MIN_HEIGHT = 180
const VIEWPORT_PADDING = 12

// Beautiful md shadow (6-layer neutral elevation · skill 표준)
const BEAUTIFUL_MD_SHADOW =
  '0px 0px 0px 1px rgba(0,0,0,0.06),' +
  '0px 1px 1px -0.5px rgba(0,0,0,0.06),' +
  '0px 3px 3px -1.5px rgba(0,0,0,0.06),' +
  '0px 6px 6px -3px rgba(0,0,0,0.06),' +
  '0px 12px 12px -6px rgba(0,0,0,0.06),' +
  '0px 24px 24px -12px rgba(0,0,0,0.06)'

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const DUR_SPOT_MS = 480
const DUR_POP_MS = 340
const DUR_MOUNT_MS = 260

export default function LeagueTour({ steps, storageKey, autoOpen, onFinish }: Props) {
  const [active, setActive] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [targetRect, setTargetRect] = useState<Rect | null>(null)
  const [tick, setTick] = useState(0)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const popoverRef = useRef<HTMLDivElement | null>(null)
  const maskRectRef = useRef<SVGRectElement | null>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  const step = steps[stepIdx]
  const isLast = stepIdx === steps.length - 1
  const isFirst = stepIdx === 0

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mq.matches)
    const h = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  // 뷰포트 감지 — 모바일(<1024px) 여부 (Tailwind lg 기준과 일치)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 1023.98px)')
    setIsMobile(mq.matches)
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
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
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setMounted(true))
    })
  }, [])

  const markSeen = useCallback(() => {
    try { localStorage.setItem(storageKey, String(Date.now())) } catch { /* 무시 */ }
  }, [storageKey])

  const closeTour = useCallback((completed: boolean) => {
    setMounted(false)
    const t = setTimeout(() => {
      setActive(false)
      markSeen()
      if (previousFocus.current && typeof previousFocus.current.focus === 'function') {
        try { previousFocus.current.focus() } catch { /* 무시 */ }
      }
      if (completed && onFinish) onFinish()
    }, prefersReducedMotion ? 0 : DUR_MOUNT_MS)
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

  // 뷰포트별 selector 결정 (모바일 우선 · 없으면 데스크탑 fallback)
  const activeSelector = step
    ? (isMobile && step.targetSelectorMobile ? step.targetSelectorMobile : step.targetSelector)
    : undefined

  useEffect(() => {
    if (!active || !step) return
    if (step.onEnter) { try { step.onEnter() } catch { /* 무시 */ } }
    if (!activeSelector) { setTargetRect(null); return }
    const el = document.querySelector<HTMLElement>(activeSelector)
    // optional 스텝 · 대상 DOM 이 없으면 자동으로 다음 스텝으로 건너뜀
    // (기능이 아직 배포 안 됐거나 조건부 노출인 경우 조용히 스킵)
    if (!el) {
      if (step.optional) {
        if (isLast) { closeTour(true); return }
        setStepIdx(i => i + 1)
        return
      }
      setTargetRect(null)
      return
    }
    const r0 = el.getBoundingClientRect()
    setTargetRect({ top: r0.top, left: r0.left, width: r0.width, height: r0.height })
    try { el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion ? 'auto' : 'smooth' }) } catch { /* 무시 */ }
    const t = setTimeout(() => {
      const r = el.getBoundingClientRect()
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }, prefersReducedMotion ? 0 : 350)
    return () => clearTimeout(t)
  }, [active, step, activeSelector, tick, prefersReducedMotion, isLast, closeTour])

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
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, closeTour, nextStep, prevStep])

  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => {
      const pop = popoverRef.current
      if (!pop) return
      const btn = pop.querySelector<HTMLButtonElement>('button[data-tour-primary]')
      btn?.focus({ preventScroll: true })
    }, prefersReducedMotion ? 0 : DUR_MOUNT_MS + 50)
    return () => clearTimeout(t)
  }, [active, stepIdx, prefersReducedMotion])

  // SVG mask rect 만 GSAP attr tween (브라우저 편차 해소)
  const padding = step?.spotlightPadding ?? 8
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 720
  const spot = targetRect ? {
    top: Math.max(0, targetRect.top - padding),
    left: Math.max(0, targetRect.left - padding),
    width: Math.min(vw, targetRect.width + padding * 2),
    height: Math.min(vh, targetRect.height + padding * 2),
  } : null

  useLayoutEffect(() => {
    if (!active || !spot) return
    const rect = maskRectRef.current
    if (!rect) return
    if (prefersReducedMotion) {
      gsap.set(rect, { attr: { x: spot.left, y: spot.top, width: spot.width, height: spot.height } })
      return
    }
    const tween = gsap.to(rect, {
      attr: { x: spot.left, y: spot.top, width: spot.width, height: spot.height },
      duration: DUR_SPOT_MS / 1000,
      ease: 'power3.out',
      overwrite: 'auto',
    })
    return () => { tween.kill() }
  }, [spot?.top, spot?.left, spot?.width, spot?.height, active, prefersReducedMotion])

  if (!active || !step) return null

  // 팝오버 위치 계산 · 뷰포트별 placement 우선 · 너비 뷰포트-safe
  // 실제 사용 가능한 팝오버 너비 (좁은 모바일에서 잘림 방지)
  const availableW = Math.min(POPOVER_MAX_WIDTH, vw - VIEWPORT_PADDING * 2)
  const maxWidthStyle = `${availableW}px`
  const placement: TourPlacement = (isMobile && step.placementMobile) ? step.placementMobile
    : (step.placement ?? (spot ? 'bottom' : 'center'))

  const popoverStyle: React.CSSProperties = (() => {
    if (!spot || placement === 'center') {
      return {
        top: '50%', left: '50%',
        transform: mounted ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.96)',
        opacity: mounted ? 1 : 0,
        maxWidth: maxWidthStyle,
      }
    }
    const centerX = spot.left + spot.width / 2
    // clamp: 실제 팝오버 너비 기준으로 left 계산 (뷰포트 초과 방지)
    const clampedLeft = Math.max(VIEWPORT_PADDING, Math.min(vw - availableW - VIEWPORT_PADDING, centerX - availableW / 2))

    const tryPlace = (p: TourPlacement): React.CSSProperties | null => {
      switch (p) {
        case 'bottom': {
          const top = spot.top + spot.height + POPOVER_MARGIN
          if (top + POPOVER_MIN_HEIGHT > vh - VIEWPORT_PADDING) return null
          return { top, left: clampedLeft, maxWidth: maxWidthStyle }
        }
        case 'top': {
          const bottom = vh - spot.top + POPOVER_MARGIN
          if (bottom + POPOVER_MIN_HEIGHT > vh - VIEWPORT_PADDING) return null
          return { bottom, left: clampedLeft, maxWidth: maxWidthStyle }
        }
        case 'right': {
          const left = spot.left + spot.width + POPOVER_MARGIN
          if (left + availableW > vw - VIEWPORT_PADDING) return null
          const top = Math.max(VIEWPORT_PADDING, Math.min(vh - POPOVER_MIN_HEIGHT - VIEWPORT_PADDING, spot.top + spot.height / 2 - POPOVER_MIN_HEIGHT / 2))
          return { top, left, maxWidth: `${Math.min(availableW, vw - left - VIEWPORT_PADDING)}px` }
        }
        case 'left': {
          const right = vw - spot.left + POPOVER_MARGIN
          if (right + availableW > vw - VIEWPORT_PADDING) return null
          const top = Math.max(VIEWPORT_PADDING, Math.min(vh - POPOVER_MIN_HEIGHT - VIEWPORT_PADDING, spot.top + spot.height / 2 - POPOVER_MIN_HEIGHT / 2))
          return { top, right, maxWidth: `${Math.min(availableW, vw - right - VIEWPORT_PADDING)}px` }
        }
        default: return null
      }
    }
    const opposite: Record<TourPlacement, TourPlacement> = {
      top: 'bottom', bottom: 'top', left: 'right', right: 'left', center: 'center',
    }
    const placed = tryPlace(placement) ?? tryPlace(opposite[placement])
    if (!placed) {
      // 두 방향 모두 실패 → 중앙 배치 (translate 로 진짜 센터링)
      return {
        top: '50%', left: '50%',
        transform: mounted ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.96)',
        opacity: mounted ? 1 : 0,
        maxWidth: maxWidthStyle,
      }
    }
    return {
      ...placed,
      opacity: mounted ? 1 : 0,
      transform: mounted ? 'scale(1)' : 'scale(0.96)',
      transformOrigin: placement === 'top' ? 'bottom center' : placement === 'bottom' ? 'top center' : 'center center',
    }
  })()

  const overlayId = 'mm-tour-overlay-mask'
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
      {/* SVG mask cutout — GSAP attr tween */}
      <svg
        aria-hidden
        style={{
          position: 'fixed', inset: 0, width: '100vw', height: '100vh',
          pointerEvents: 'auto',
          opacity: backdropOpacity,
          transition: prefersReducedMotion ? 'none' : `opacity ${DUR_MOUNT_MS}ms ${EASE}`,
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
                ref={maskRectRef}
                x={spot.left}
                y={spot.top}
                width={spot.width}
                height={spot.height}
                rx={10}
                ry={10}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(0, 0, 0, 0.62)" mask={`url(#${overlayId})`} />
      </svg>

      {/* Spotlight ring — CSS transition */}
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
            boxShadow: '0 0 0 4px rgba(234, 179, 8, 0.18), 0 0 32px rgba(234, 179, 8, 0.38)',
            pointerEvents: 'none',
            opacity: backdropOpacity,
            transition: prefersReducedMotion ? 'none'
              : `top ${DUR_SPOT_MS}ms ${EASE}, left ${DUR_SPOT_MS}ms ${EASE}, width ${DUR_SPOT_MS}ms ${EASE}, height ${DUR_SPOT_MS}ms ${EASE}, opacity ${DUR_MOUNT_MS}ms ${EASE}`,
          }}
        />
      )}

      {/* 팝오버 · Beautiful md shadow */}
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
          boxShadow: BEAUTIFUL_MD_SHADOW,
          padding: '18px 20px 16px',
          minWidth: 260,
          willChange: 'transform, top, left, right, bottom, opacity',
          transition: prefersReducedMotion ? 'none'
            : `top ${DUR_POP_MS}ms ${EASE}, left ${DUR_POP_MS}ms ${EASE}, right ${DUR_POP_MS}ms ${EASE}, bottom ${DUR_POP_MS}ms ${EASE}, transform ${DUR_MOUNT_MS}ms ${EASE}, opacity ${DUR_MOUNT_MS}ms ${EASE}`,
          ...popoverStyle,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
          <div id="mm-tour-title" style={{ fontSize: 16, fontWeight: 700, color: 'var(--mm-ink)', lineHeight: 1.35, flex: 1, minWidth: 0 }}>
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
              transition: 'background 160ms ease-out',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--mm-panel-alt)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <X size={18} />
          </button>
        </div>

        <p id="mm-tour-desc" style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--mm-ink-soft)', margin: 0, marginBottom: 14, whiteSpace: 'pre-line' }}>
          {(isMobile && step.descriptionMobile) ? step.descriptionMobile : step.description}
        </p>

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
                  transition: 'color 160ms',
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
                  transition: 'border-color 160ms',
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
                transition: 'filter 160ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.05)' }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)' }}
            >
              {isLast ? '완료' : (<>다음 <ChevronRight size={14} /></>)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
