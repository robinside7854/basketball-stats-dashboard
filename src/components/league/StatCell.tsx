'use client'
import { useEffect, useRef, useState } from 'react'

// 숫자 카운트업 — 큰 수치의 등장 연출
//
// usage:
//   <CountUp value={418} />  → 0 → 418 카운트업

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


// PercentBar(셀 하단 2px 컬러 막대) 는 2026-08-15 삭제.
//   마지막 소비처였던 팀 화면 Shooting 표에서 뺐다. 11개 컬럼에 0-100 척도 막대를 일괄로 깔면
//   성공률(FG%)과 시도 비중(MD)처럼 뜻이 다른 값이 같은 길이로 나란히 서서 비교되는 것처럼
//   보인다. 리그 스탯 탭은 같은 이유로 2026-07-19 에 이미 뺐었다(그때 import 만 남아 있었음).
//
// FormDots(최근 N경기 W-L 닷) 는 2026-08-10 삭제.
//   한 라운드에 여러 경기를 하는 리그라 하루를 W/L 하나로 압축하면 실제 전적이 사라져
//   오해를 만든다는 판단으로 2026-08-09 선수 카드에서 제거됐고, 그 뒤 소비처가 0 이었다.
