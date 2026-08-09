'use client'
import { useEffect, useRef, useState } from 'react'

// 셀 안에 가로 막대 오버레이 + (선택) 카운트업 — 백분율/수치 시각화
//
// usage:
//   <PercentBar value={53.4} max={100} color="#34d399" />  → 셀 아래쪽 2px 컬러 막대
//   <CountUp value={418} />                                 → 0 → 418 카운트업

export function PercentBar({
  value,
  max = 100,
  color,
  thickness = 2,
}: {
  value: number
  max?: number
  color?: string
  thickness?: number
}) {
  const safe = Math.max(0, Math.min(max, value))
  const pct = max > 0 ? (safe / max) * 100 : 0
  // 기본 accent: mm-ink-soft (뉴트럴 · 라이트/다크 모두 대응). 명시 color prop 있으면 override.
  return (
    <div
      className="absolute left-0 right-0 bottom-0 overflow-hidden"
      style={{ height: thickness, background: 'var(--mm-rule)' }}
      aria-hidden
    >
      <div
        className="h-full transition-all duration-500 ease-out"
        style={{ width: `${pct}%`, backgroundColor: color ?? 'var(--mm-ink-soft)' }}
      />
    </div>
  )
}

// 카운트업 훅 — easeOutCubic 적용, prefers-reduced-motion 존중
export function useCountUp(target: number, durationMs = 600): number {
  const [val, setVal] = useState(0)
  const prefersReducedMotion = useRef(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }
  }, [])

  useEffect(() => {
    if (prefersReducedMotion.current || target === 0) {
      setVal(target)
      return
    }
    let raf = 0
    let start: number | null = null
    const tick = (t: number) => {
      if (start == null) start = t
      const elapsed = t - start
      const p = Math.min(elapsed / durationMs, 1)
      // ease-out-cubic
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs])

  return val
}

// 카운트업 컴포넌트 — 큰 숫자(정수)에 적합
export function CountUp({
  value,
  durationMs = 600,
  decimals = 0,
  className,
}: {
  value: number
  durationMs?: number
  decimals?: number
  className?: string
}) {
  const animated = useCountUp(value, durationMs)
  const text = decimals > 0 ? animated.toFixed(decimals) : Math.round(animated).toString()
  return <span className={className}>{text}</span>
}


// FormDots(최근 N경기 W-L 닷) 는 2026-08-10 삭제.
//   한 라운드에 여러 경기를 하는 리그라 하루를 W/L 하나로 압축하면 실제 전적이 사라져
//   오해를 만든다는 판단으로 2026-08-09 선수 카드에서 제거됐고, 그 뒤 소비처가 0 이었다.
