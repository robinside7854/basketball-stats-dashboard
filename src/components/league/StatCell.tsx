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
  color = '#3b82f6',
  thickness = 2,
}: {
  value: number
  max?: number
  color?: string
  thickness?: number
}) {
  const safe = Math.max(0, Math.min(max, value))
  const pct = max > 0 ? (safe / max) * 100 : 0
  return (
    <div
      className="absolute left-0 right-0 bottom-0 bg-gray-800/40 rounded-full overflow-hidden"
      style={{ height: thickness }}
      aria-hidden
    >
      <div
        className="h-full transition-all duration-500 ease-out rounded-full"
        style={{ width: `${pct}%`, backgroundColor: color }}
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

// W-L 폼 닷 — 최근 N경기 결과를 작은 동그라미 5개로
//   results: 'W' | 'L' | 'D' | null  (null = 미정/없음)
export function FormDots({
  results,
  size = 6,
}: {
  results: ('W'|'L'|'D'|null)[]
  size?: number
}) {
  return (
    <div className="inline-flex items-center gap-0.5" aria-label={`최근 ${results.length}경기: ${results.map(r => r ?? '·').join('')}`}>
      {results.map((r, i) => {
        const color =
          r === 'W' ? 'bg-emerald-400' :
          r === 'L' ? 'bg-red-400' :
          r === 'D' ? 'bg-yellow-400' :
          'bg-gray-700'
        return (
          <span
            key={i}
            className={`inline-block rounded-full ${color}`}
            style={{ width: size, height: size }}
            title={r ?? '미정'}
          />
        )
      })}
    </div>
  )
}
