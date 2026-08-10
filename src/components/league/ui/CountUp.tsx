'use client'
// 숫자 카운트업 — 누적 기록이 0 에서 올라가 최종값에 안착한다.
//
// 왜 필요한가: "숫자만 빽빽해서 데이터 대시보드 같다"는 피드백의 뿌리는 숫자가 그냥
//   *놓여 있고* 아무 일도 *일어나지* 않는다는 것이다. 득점 524 가 올라가는 걸 잠깐 보는 것만으로
//   "쌓아온 기록"이라는 감각이 생긴다. 라이트 유저 대상 효율이 가장 높은 한 수다.
//
// ⚠ 아무 숫자에나 붙이면 안 된다. 쓰는 곳은 **누적/시즌 기록**뿐이다.
//   경기 중 실시간 스코어나 표 안의 행별 수치에 붙이면, 볼 때마다 값이 흔들려
//   "지금 몇 점인지" 읽는 데 방해가 된다.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// SSR 에서 useLayoutEffect 는 경고를 낸다. 서버에서는 useEffect 로 갈아끼운다.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

interface Props {
  value: number
  /** 소수 자릿수 — 평균 지표(12.4) 처럼 소수가 필요한 곳에서만 */
  decimals?: number
  /** 시작 지연(ms). 여러 개를 나란히 굴릴 때 순서를 만든다 — 동시에 터지면 산만하다 */
  delay?: number
  className?: string
  style?: React.CSSProperties
  suffix?: string
}

export default function CountUp({ value, decimals = 0, delay = 0, className, style, suffix }: Props) {
  // 초기값을 value 로 둬야 서버 렌더 결과와 첫 클라이언트 렌더가 일치한다(하이드레이션 불일치 방지).
  // 0 으로 되감는 일은 아래 layout effect 가 페인트 전에 처리하므로 최종값이 깜빡이지 않는다.
  const [display, setDisplay] = useState(value)
  // 최초 1회만 굴린다. 리렌더마다 다시 굴리면 탭을 오갈 때마다 숫자가 출렁인다.
  const playedRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useIsomorphicLayoutEffect(() => {
    if (playedRef.current) { setDisplay(value); return }
    playedRef.current = true

    // CSS 의 prefers-reduced-motion 규칙은 JS 로 바꾸는 값을 막지 못한다. 여기서 직접 확인한다.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || value === 0) { setDisplay(value); return }

    // duration 은 토큰(--mm-motion-tell)에서 읽는다. 여기 하드코딩하면 토큰 체계를 만든 의미가 없다.
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--mm-motion-tell')
    const parsed = parseFloat(raw)
    const duration = parsed > 1 ? parsed : 760

    setDisplay(0) // 페인트 전에 되감기 — 최종값이 한 프레임 스쳤다 사라지는 깜빡임을 막는다

    let start: number | null = null
    const tick = (now: number) => {
      if (start === null) start = now
      const t = Math.min(1, (now - start) / duration)
      // ease-out(cubic) — 빠르게 올라가 부드럽게 안착. 되튐은 넣지 않는다(기록이 출렁이면 장난스럽다).
      const eased = 1 - Math.pow(1 - t, 3)
      if (t < 1) {
        setDisplay(value * eased)
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setDisplay(value) // 부동소수 오차로 523.9998 이 남지 않도록 최종값을 못 박는다
      }
    }
    timerRef.current = setTimeout(() => { rafRef.current = requestAnimationFrame(tick) }, delay)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [value, delay])

  return (
    // tabular-nums 필수 — 없으면 자릿수가 바뀔 때마다 폭이 흔들려 옆 요소가 밀린다.
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>
      {display.toFixed(decimals)}
      {suffix}
    </span>
  )
}
