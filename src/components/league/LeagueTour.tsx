'use client'
// 인터랙티브 튜토리얼 투어 v3 — GSAP 타임라인 + Beautiful shadows 적용.
//
// GSAP 개선:
//   · gsap.context() 로 React 언마운트 정리
//   · Timeline 으로 mount 시퀀스 (오버레이 → ring → 팝오버 순차)
//   · 스텝 전환 시 ring/mask/popover 를 하나의 timeline 으로 동기 이동 (power3.out)
//   · SVG mask rect 는 attr tween (`{ attr: { x, y, width, height } }`)
//   · reduce-motion: gsap.set 으로 즉시 반영
//
// Beautiful shadows md (팝오버):
//   · 6단계 레이어드 shadow · 노랑 border 는 별도로 유지
//
// 기타 유지:
//   · localStorage 재방문 감지 · 물음표 재실행 이벤트
//   · Skip / ESC / Finish 모두 완료 저장 · resize/scroll 실시간 반영
//   · aria-modal · focus-trap · 44px 터치 타겟

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

// Beautiful md shadow (레이어드 · 팝오버 · 모달 표준)
const BEAUTIFUL_MD_SHADOW =
  '0px 0px 0px 1px rgba(0,0,0,0.06),' +
  '0px 1px 1px -0.5px rgba(0,0,0,0.06),' +
  '0px 3px 3px -1.5px rgba(0,0,0,0.06),' +
  '0px 6px 6px -3px rgba(0,0,0,0.06),' +
  '0px 12px 12px -6px rgba(0,0,0,0.06),' +
  '0px 24px 24px -12px rgba(0,0,0,0.06)'

// GSAP 타이밍 (권장: power3.out · 자연스러운 스프링 감)
const DUR_SPOT_S = 0.55       // spotlight 이동 지속 (초)
const DUR_POP_S  = 0.42       // 팝오버 이동 지속
const DUR_MOUNT_S = 0.32      // mount fade+scale
const EASE_MOVE = 'power3.out'
const EASE_MOUNT = 'power2.out'

export default function LeagueTour({ steps, storageKey, autoOpen, onFinish }: Props) {
  const [active, setActive] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [targetRect, setTargetRect] = useState<Rect | null>(null)
  const [tick, setTick] = useState(0)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  // refs (GSAP 대상)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const overlaySvgRef = useRef<SVGSVGElement | null>(null)
  const maskRectRef = useRef<SVGRectElement | null>(null)
  const ringRef = useRef<HTMLDivElement | null>(null)
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
    try { localStorage.setItem(storageKey, String(Date.now())) } catch { /* 무시 */ }
  }, [storageKey])

  const closeTour = useCallback((completed: boolean) => {
    // fade-out 애니메이션 후 unmount
    const overlay = overlaySvgRef.current
    const pop = popoverRef.current
    const ring = ringRef.current
    const dur = prefersReducedMotion ? 0 : DUR_MOUNT_S
    const finish = () => {
      setActive(false)
      markSeen()
      if (previousFocus.current && typeof previousFocus.current.focus === 'function') {
        try { previousFocus.current.focus() } catch { /* 무시 */ }
      }
      if (completed && onFinish) onFinish()
    }
    if (dur === 0 || !overlay) { finish(); return }
    gsap.to([overlay, pop, ring].filter(Boolean), {
      autoAlpha: 0,
      scale: 0.98,
      duration: dur,
      ease: 'power2.in',
      onComplete: finish,
    })
  }, [markSeen, onFinish, prefersReducedMotion])

  const nextStep = useCallback(() => {
    if (isLast) { closeTour(true); return }
    setStepIdx(i => i + 1)
  }, [isLast, closeTour])

  const prevStep = useCallback(() => {
    if (isFirst) return
    setStepIdx(i => i - 1)
  }, [isFirst])

  // 첫 방문 자동 시작 · 재실행 이벤트
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

  // 스텝 진입 · target 찾기
  useEffect(() => {
    if (!active || !step) return
    if (step.onEnter) { try { step.onEnter() } catch { /* 무시 */ } }
    if (!step.targetSelector) { setTargetRect(null); return }
    const el = document.querySelector<HTMLElement>(step.targetSelector)
    if (!el) { setTargetRect(null); return }
    // 즉시 rect 계산
    const r0 = el.getBoundingClientRect()
    setTargetRect({ top: r0.top, left: r0.left, width: r0.width, height: r0.height })
    // 부드럽게 스크롤
    try { el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion ? 'auto' : 'smooth' }) } catch { /* 무시 */ }
    // 스크롤 완료 후 rect 재계산 (GSAP 이 두 위치 사이 부드럽게 이동)
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

  // 팝오버 마운트 시 초기 포커스
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => {
      const pop = popoverRef.current
      if (!pop) return
      const btn = pop.querySelector<HTMLButtonElement>('button[data-tour-primary]')
      btn?.focus({ preventScroll: true })
    }, prefersReducedMotion ? 0 : (DUR_MOUNT_S * 1000 + 50))
    return () => clearTimeout(t)
  }, [active, stepIdx, prefersReducedMotion])

  // ────────────────────────────────────────────────
  // GSAP 애니메이션 — gsap.context 로 스코프 정리
  // ────────────────────────────────────────────────

  // Mount 시퀀스 (active true 로 되는 순간 · overlay + popover fade-in)
  useLayoutEffect(() => {
    if (!active) return
    const overlay = overlaySvgRef.current
    const pop = popoverRef.current
    if (!overlay || !pop) return

    const ctx = gsap.context(() => {
      // 초기 상태 · fade-in 준비
      gsap.set(overlay, { autoAlpha: 0 })
      gsap.set(pop, { autoAlpha: 0, scale: 0.94 })

      if (prefersReducedMotion) {
        gsap.set([overlay, pop], { autoAlpha: 1, scale: 1 })
        return
      }

      // 시퀀스: overlay 먼저 → popover 살짝 늦게
      const tl = gsap.timeline({ defaults: { ease: EASE_MOUNT } })
      tl.to(overlay, { autoAlpha: 1, duration: DUR_MOUNT_S })
        .to(pop, { autoAlpha: 1, scale: 1, duration: DUR_MOUNT_S }, '-=0.14')
    })
    return () => ctx.revert()
  }, [active, prefersReducedMotion])

  // Ring + mask rect + popover 위치 이동 (target/스텝 변경 시)
  const spotForAnim = targetRect ? {
    top: Math.max(0, targetRect.top - (step?.spotlightPadding ?? 8)),
    left: Math.max(0, targetRect.left - (step?.spotlightPadding ?? 8)),
    width: targetRect.width + (step?.spotlightPadding ?? 8) * 2,
    height: targetRect.height + (step?.spotlightPadding ?? 8) * 2,
  } : null

  useLayoutEffect(() => {
    if (!active) return
    const ring = ringRef.current
    const rect = maskRectRef.current
    if (!spotForAnim) return

    const ctx = gsap.context(() => {
      const dur = prefersReducedMotion ? 0 : DUR_SPOT_S
      // ring div 위치·크기
      if (ring) {
        gsap.to(ring, {
          top: spotForAnim.top,
          left: spotForAnim.left,
          width: spotForAnim.width,
          height: spotForAnim.height,
          autoAlpha: 1,
          duration: dur,
          ease: EASE_MOVE,
          overwrite: 'auto',
        })
      }
      // SVG mask rect (attr tween — GSAP 내장)
      if (rect) {
        gsap.to(rect, {
          attr: {
            x: spotForAnim.left,
            y: spotForAnim.top,
            width: spotForAnim.width,
            height: spotForAnim.height,
          },
          duration: dur,
          ease: EASE_MOVE,
          overwrite: 'auto',
        })
      }
    })
    return () => ctx.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotForAnim?.top, spotForAnim?.left, spotForAnim?.width, spotForAnim?.height, active, prefersReducedMotion])

  // 팝오버 위치 이동 (스텝 변경 시)
  const placement: TourPlacement = step?.placement ?? (spotForAnim ? 'bottom' : 'center')
  const popoverPos = ((): React.CSSProperties => {
    if (!spotForAnim || placement === 'center') {
      return {
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: `min(${POPOVER_MAX_WIDTH}px, calc(100vw - ${VIEWPORT_PADDING * 2}px))`,
      }
    }
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
    const vh = typeof window !== 'undefined' ? window.innerHeight : 720
    const centerX = spotForAnim.left + spotForAnim.width / 2

    const tryPlace = (p: TourPlacement): React.CSSProperties | null => {
      switch (p) {
        case 'bottom': {
          const top = spotForAnim.top + spotForAnim.height + POPOVER_MARGIN
          if (top + POPOVER_MIN_HEIGHT > vh - VIEWPORT_PADDING) return null
          const left = Math.max(VIEWPORT_PADDING, Math.min(vw - POPOVER_MAX_WIDTH - VIEWPORT_PADDING, centerX - POPOVER_MAX_WIDTH / 2))
          return { top, left, maxWidth: `min(${POPOVER_MAX_WIDTH}px, calc(100vw - ${VIEWPORT_PADDING * 2}px))` }
        }
        case 'top': {
          const bottom = vh - spotForAnim.top + POPOVER_MARGIN
          if (bottom + POPOVER_MIN_HEIGHT > vh - VIEWPORT_PADDING) return null
          const left = Math.max(VIEWPORT_PADDING, Math.min(vw - POPOVER_MAX_WIDTH - VIEWPORT_PADDING, centerX - POPOVER_MAX_WIDTH / 2))
          return { bottom, left, maxWidth: `min(${POPOVER_MAX_WIDTH}px, calc(100vw - ${VIEWPORT_PADDING * 2}px))` }
        }
        case 'right': {
          const left = spotForAnim.left + spotForAnim.width + POPOVER_MARGIN
          if (left + POPOVER_MAX_WIDTH > vw - VIEWPORT_PADDING) return null
          const top = Math.max(VIEWPORT_PADDING, Math.min(vh - POPOVER_MIN_HEIGHT - VIEWPORT_PADDING, spotForAnim.top + spotForAnim.height / 2 - POPOVER_MIN_HEIGHT / 2))
          return { top, left, maxWidth: `min(${POPOVER_MAX_WIDTH}px, calc(100vw - ${left}px - ${VIEWPORT_PADDING}px))` }
        }
        case 'left': {
          const right = vw - spotForAnim.left + POPOVER_MARGIN
          if (right + POPOVER_MAX_WIDTH > vw - VIEWPORT_PADDING) return null
          const top = Math.max(VIEWPORT_PADDING, Math.min(vh - POPOVER_MIN_HEIGHT - VIEWPORT_PADDING, spotForAnim.top + spotForAnim.height / 2 - POPOVER_MIN_HEIGHT / 2))
          return { top, right, maxWidth: `min(${POPOVER_MAX_WIDTH}px, calc(100vw - ${right}px - ${VIEWPORT_PADDING}px))` }
        }
        default: return null
      }
    }
    const opposite: Record<TourPlacement, TourPlacement> = {
      top: 'bottom', bottom: 'top', left: 'right', right: 'left', center: 'center',
    }
    return tryPlace(placement) ?? tryPlace(opposite[placement]) ?? {
      top: '50%', left: '50%',
      maxWidth: `min(${POPOVER_MAX_WIDTH}px, calc(100vw - ${VIEWPORT_PADDING * 2}px))`,
    }
  })()

  // 팝오버 위치 tween — CSS 값이 GSAP 로부터 관리되지 않으므로 style 로 직접 반영하되
  // 변경 시 GSAP 로 부드럽게 (top/left/right/bottom 은 transition 대신 GSAP)
  useLayoutEffect(() => {
    if (!active) return
    const pop = popoverRef.current
    if (!pop) return
    if (prefersReducedMotion) {
      Object.entries(popoverPos).forEach(([k, v]) => {
        (pop.style as unknown as Record<string, string | number>)[k] = String(v ?? '')
      })
      return
    }
    // 위치만 tween — 크기/opacity 는 별도 관리
    const targetVars: Record<string, unknown> = { duration: DUR_POP_S, ease: EASE_MOVE, overwrite: 'auto' }
    // top/left/right/bottom 중 popoverPos 에 있는 것만 tween 대상
    ;(['top', 'left', 'right', 'bottom'] as const).forEach(k => {
      const v = (popoverPos as Record<string, string | number | undefined>)[k]
      if (v !== undefined) targetVars[k] = v
      else (pop.style as unknown as Record<string, string>)[k] = ''  // 이전 값 제거
    })
    // maxWidth 는 직접 적용
    if (popoverPos.maxWidth !== undefined) pop.style.maxWidth = String(popoverPos.maxWidth)
    // center placement 는 transform 이 있어 별도 처리
    if (popoverPos.transform !== undefined) {
      gsap.to(pop, { ...targetVars, transform: popoverPos.transform })
    } else {
      // 이전 transform 초기화 (center → 다른 배치 전환 시)
      pop.style.transform = ''
      gsap.to(pop, targetVars)
    }
  }, [popoverPos.top, popoverPos.left, popoverPos.right, popoverPos.bottom, popoverPos.transform, popoverPos.maxWidth, active, prefersReducedMotion])

  if (!active || !step) return null

  const overlayId = 'mm-tour-overlay-mask'

  return (
    <div
      ref={rootRef}
      className="mm-tour-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mm-tour-title"
      aria-describedby="mm-tour-desc"
      aria-live="polite"
      style={{ position: 'fixed', inset: 0, zIndex: 100, pointerEvents: 'none' }}
    >
      {/* SVG mask cutout — GSAP 이 attr 로 rect tween */}
      <svg
        ref={overlaySvgRef}
        aria-hidden
        style={{
          position: 'fixed', inset: 0, width: '100vw', height: '100vh',
          pointerEvents: 'auto', visibility: 'hidden',  // GSAP set autoAlpha 로 노출
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeTour(false)
        }}
      >
        <defs>
          <mask id={overlayId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spotForAnim && (
              <rect
                ref={maskRectRef}
                x={spotForAnim.left}
                y={spotForAnim.top}
                width={spotForAnim.width}
                height={spotForAnim.height}
                rx={10}
                ry={10}
                fill="black"
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

      {/* Spotlight ring · GSAP tween */}
      {spotForAnim && (
        <div
          ref={ringRef}
          aria-hidden
          style={{
            position: 'fixed',
            top: spotForAnim.top,
            left: spotForAnim.left,
            width: spotForAnim.width,
            height: spotForAnim.height,
            borderRadius: 10,
            border: '2px solid var(--mm-yellow)',
            boxShadow: '0 0 0 4px rgba(234, 179, 8, 0.18), 0 0 32px rgba(234, 179, 8, 0.38)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* 팝오버 — Beautiful md shadow 적용 */}
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
          visibility: 'hidden',  // GSAP autoAlpha 이후 노출
          ...popoverPos,
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
              transition: 'background 160ms ease-out',
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

        {/* 인디케이터 + 컨트롤 */}
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
                  transition: prefersReducedMotion ? 'none' : 'width 240ms cubic-bezier(0.22,1,0.36,1), background 240ms',
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
                transition: 'filter 160ms, transform 160ms',
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
