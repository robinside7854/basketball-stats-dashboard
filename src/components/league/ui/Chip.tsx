'use client'
// 칩(알약) — 상태 표시 태그와 필터 버튼을 한 모양으로 (리뉴얼 1단계, 2026-10-12).
//
// 배경: 「승」「LIVE」「현재」 같은 태그와 분기·정렬 필터 버튼이 화면마다 따로 그려져
//   모서리(0 / 4px / 원형)·높이(28~44px)·선택색(검정 / 노랑)이 제각각이었다.
//   같은 뜻은 같은 모양이어야 한 서비스로 읽힌다.
// 규칙
//   · 선택 상태는 노랑(--mm-yellow) 하나. 검정 반전은 쓰지 않는다(사용자 결정 — 액센트는 노랑).
//   · 버튼 칩은 터치 높이를 지킨다 — sm 36px · md 44px.
//   · 색은 --mm-* 토큰만 — 라이트/다크가 토큰에서 갈린다.

import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type ChipTone = 'neutral' | 'accent' | 'positive' | 'negative' | 'live'
export type ChipSize = 'sm' | 'md'

const TONE: Record<ChipTone, CSSProperties> = {
  neutral:  { background: 'var(--mm-neutral-bg)',  color: 'var(--mm-neutral-fg)' },
  accent:   { background: 'var(--mm-yellow-soft)', color: 'var(--mm-yellow-strong)' },
  positive: { background: 'var(--mm-positive-bg)', color: 'var(--mm-positive-fg)' },
  negative: { background: 'var(--mm-negative-bg)', color: 'var(--mm-negative-fg)' },
  // --mm-live-bg 는 라이트/다크 공통 진한 빨강 — 흰 글자 대비가 양쪽에서 성립한다(globals.css 주석)
  live:     { background: 'var(--mm-live-bg)',     color: '#FFFFFF' },
}

interface BaseProps {
  children: ReactNode
  tone?: ChipTone
  size?: ChipSize
  /** lucide 아이콘 컴포넌트 또는 임의 노드(점·이모지 등) */
  icon?: LucideIcon | ReactNode
  className?: string
  title?: string
}

interface SpanProps extends BaseProps { as?: 'span' }
interface ButtonProps extends BaseProps {
  as: 'button'
  onClick: () => void
  /** 필터 칩의 선택 상태 — aria-pressed 로도 나간다 */
  selected?: boolean
  disabled?: boolean
  ariaLabel?: string
}

export type ChipProps = SpanProps | ButtonProps

function renderIcon(icon: ChipProps['icon'], size: ChipSize) {
  if (!icon) return null
  const px = size === 'sm' ? 12 : 14
  // LucideIcon 은 forwardRef 객체(또는 함수) — ReactNode 와 구분해 렌더한다
  if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null && 'render' in icon)) {
    const Icon = icon as LucideIcon
    return <Icon size={px} aria-hidden className="shrink-0" />
  }
  return <span aria-hidden className="inline-flex shrink-0">{icon as ReactNode}</span>
}

export default function Chip(props: ChipProps) {
  const { children, tone = 'neutral', size = 'sm', icon, className = '', title } = props
  const iconEl = renderIcon(icon, size)

  if (props.as === 'button') {
    const { onClick, selected = false, disabled = false, ariaLabel } = props
    const sizeCls = size === 'sm' ? 'min-h-9 px-3 text-xs gap-1' : 'min-h-11 px-4 text-sm gap-1.5'
    const style: CSSProperties = selected
      ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-yellow)', boxShadow: 'var(--mm-shadow-sm)' }
      : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={ariaLabel}
        title={title}
        className={`mm-press inline-flex items-center justify-center shrink-0 whitespace-nowrap tabular-nums cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1 focus-visible:ring-offset-[color:var(--mm-ground)] ${selected ? 'font-black' : 'font-semibold hover:text-[color:var(--mm-ink)] hover:border-[color:var(--mm-muted)]'} ${sizeCls} ${className}`}
        style={{ ...style, borderRadius: 'var(--mm-radius-chip)' }}
      >
        {iconEl}
        {children}
      </button>
    )
  }

  const sizeCls = size === 'sm' ? 'h-6 px-2 text-xs gap-1' : 'h-7 px-2.5 text-sm gap-1.5'
  return (
    <span
      title={title}
      className={`inline-flex items-center shrink-0 whitespace-nowrap font-bold tabular-nums leading-none ${sizeCls} ${className}`}
      style={{ ...TONE[tone], borderRadius: 'var(--mm-radius-chip)' }}
    >
      {iconEl}
      {children}
    </span>
  )
}
