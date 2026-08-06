'use client'
// 리그 홈 · 서브 페이지 공통 섹션 카드
// - variant='stack' / 'standalone': 둘 다 var(--mm-radius-card) 라디우스의 독립 카드
//   (2026-08 캐주얼 전환 전에는 stack 이 radius 0 + borderTop 0 로 이어 붙는 방식이었음.
//   상위 래퍼가 그 flush 가정에 기대고 있으면 별도로 간격/래퍼를 손봐야 함 — HomeSectionTabs 참고)
// - emphasized=true: 상단 3px 옐로우-soft 라인 (옐로우 실색상 대체)
import type { ReactNode } from 'react'

interface Props {
  variant?: 'stack' | 'standalone'
  emphasized?: boolean
  dataTour?: string
  ariaLabel?: string
  className?: string
  background?: string  // CSS color; default var(--mm-panel)
  children: ReactNode
}

export default function SectionCard({
  variant = 'stack',
  emphasized = false,
  dataTour,
  ariaLabel,
  className = '',
  background = 'var(--mm-panel)',
  children,
}: Props) {
  // 캐주얼 전환(2026-08) — stack/standalone 모두 개별 카드로 라디우스 부여.
  // emphasized 상단 3px 옐로우-soft 라인은 variant 와 무관하게 항상 적용.
  return (
    <section
      data-tour={dataTour}
      aria-label={ariaLabel}
      className={`mm-brand ${className}`}
      style={{
        background,
        border: '1px solid var(--mm-rule)',
        borderTop: emphasized ? '3px solid var(--mm-yellow-soft)' : '1px solid var(--mm-rule)',
        borderRadius: 'var(--mm-radius-card)',
        overflow: 'hidden',
      }}
    >
      {children}
    </section>
  )
}
