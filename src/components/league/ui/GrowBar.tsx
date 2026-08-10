'use client'
// 진행바 — 0 에서 목표치까지 차오른다.
//
// 왜: 기존 마일스톤 체이서 바는 width 를 그냥 최종값으로 그렸다. 전환(transition)이 아예 없어서
//   "얼마나 왔는지"가 정지한 그림으로만 읽혔다. 차오르는 동작 자체가 "쌓이는 중"이라는 뜻이 된다.
//
// reduced-motion 은 여기서 따로 확인하지 않는다 — globals.css 의 전역 규칙이
//   transition-duration 을 !important 로 눌러 이미 무력화한다(인라인 스타일보다 우선).
import { useEffect, useState } from 'react'

interface Props {
  /** 0~100. 범위를 벗어난 값은 여기서 잘라낸다 — 호출부마다 Math.min 을 반복하지 않도록 */
  pct: number
  color: string
  /** 트랙 높이(px) */
  height?: number
  /** 여러 개가 나란히 있을 때 순서를 만든다 */
  delay?: number
}

export default function GrowBar({ pct, color, height = 8, delay = 0 }: Props) {
  const target = Math.max(0, Math.min(100, pct))
  const [width, setWidth] = useState(0)

  useEffect(() => {
    // rAF 를 한 번 거쳐야 브라우저가 0 → target 을 '변화'로 인식한다.
    // 같은 프레임에서 바로 넣으면 전환 없이 최종 폭으로 찍힌다.
    const raf = requestAnimationFrame(() => setWidth(target))
    return () => cancelAnimationFrame(raf)
  }, [target])

  return (
    <div
      className="relative overflow-hidden"
      style={{
        height,
        background: 'var(--mm-panel-alt)',
        borderRadius: 'var(--mm-radius-chip)',
        border: '1px solid var(--mm-rule)',
      }}
      role="progressbar"
      aria-valuenow={Math.round(target)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        style={{
          width: `${width}%`,
          height: '100%',
          background: color,
          transition: `width var(--mm-motion-slow) var(--mm-ease-out) ${delay}ms`,
        }}
      />
    </div>
  )
}
