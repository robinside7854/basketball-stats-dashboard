'use client'
// 리그 홈 · 서브 페이지 공통 섹션 카드
// - variant='stack': NBA 4형제 스택 방식 (borderTop 0, radius 0)
// - variant='standalone': 독립 카드 (radius 6px)
// - emphasized=true: 상단 3px 옐로우-soft 라인 (옐로우 실색상 대체)
import type { ReactNode } from 'react'

interface Props {
  variant?: 'stack' | 'standalone'
  emphasized?: boolean
  dataTour?: string
  ariaLabel?: string
  className?: string
  children: ReactNode
}

export default function SectionCard({
  variant = 'stack',
  emphasized = false,
  dataTour,
  ariaLabel,
  className = '',
  children,
}: Props) {
  const isStandalone = variant === 'standalone'
  return (
    <section
      data-tour={dataTour}
      aria-label={ariaLabel}
      className={`mm-brand ${className}`}
      style={{
        background: 'var(--mm-panel)',
        border: '1px solid var(--mm-rule)',
        borderTop: isStandalone ? '1px solid var(--mm-rule)' : (emphasized ? '3px solid var(--mm-yellow-soft)' : 0),
        borderRadius: isStandalone ? '6px' : 0,
        overflow: 'hidden',
      }}
    >
      {children}
    </section>
  )
}
