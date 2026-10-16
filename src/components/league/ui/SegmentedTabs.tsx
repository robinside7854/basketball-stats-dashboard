'use client'
// 화면 안 탭 전환기 — 알약 트랙 위 노란 선택 칸 (리뉴얼 1단계, 2026-10-12).
//
// 배경: 박스스코어 5탭(밑줄+배경), 홈 4섹션(노란 밑줄), 스탯 모드(검정 반전 버튼)가 같은 일을
//   세 가지 모양으로 하고 있었다. 「지금 어느 화면인가」를 같은 신호로 읽혀야 한다.
// 규칙
//   · 선택 = 노랑(--mm-yellow) 바탕 + 검정 글자. 액센트는 노랑(사용자 결정).
//   · 탭이 넘치면 트랙이 가로로 밀리고, 고른 탭은 화면 안으로 당겨 온다(360px 에서 5탭이 빠듯하다).
//   · 키보드 ←/→/Home/End 로 옮기면 바로 선택된다(자동 활성) — 패널 전환이 가벼운 화면 전용.
//   · 패널과 묶으려면 idPrefix 를 주고, 패널에는 tabPanelProps(idPrefix, key) 를 펼친다.
//     URL 이 바뀌는 페이지 이동 탭은 이걸 쓰지 않는다 — LeagueGroupTabs 가 따로 있다.

import { useRef, type KeyboardEvent, type ReactNode } from 'react'

export interface SegmentedTabItem<K extends string> {
  key: K
  label: ReactNode
  /** 라벨 옆 작은 숫자 — 0/undefined 면 감춘다 */
  count?: number
  disabled?: boolean
}

interface Props<K extends string> {
  items: readonly SegmentedTabItem<K>[]
  value: K
  onChange: (key: K) => void
  /** tablist 의 접근성 이름 — 필수(화면에 탭 묶음이 여럿일 수 있다) */
  ariaLabel: string
  /** 주면 탭 id = `${idPrefix}-tab-${key}`, aria-controls = `${idPrefix}-panel-${key}` */
  idPrefix?: string
  /** sm: 36px · md: 44px 높이 */
  size?: 'sm' | 'md'
  /** 트랙을 가로 전체로 펴고 탭을 균등 분배(넘치면 그대로 스크롤) */
  fullWidth?: boolean
  className?: string
}

export function tabPanelProps(idPrefix: string, key: string) {
  return {
    role: 'tabpanel' as const,
    id: `${idPrefix}-panel-${key}`,
    'aria-labelledby': `${idPrefix}-tab-${key}`,
  }
}

export default function SegmentedTabs<K extends string>({
  items, value, onChange, ariaLabel, idPrefix, size = 'md', fullWidth = false, className = '',
}: Props<K>) {
  const refs = useRef(new Map<K, HTMLButtonElement>())

  function select(key: K, focus: boolean) {
    onChange(key)
    const el = refs.current.get(key)
    if (!el) return
    if (focus) el.focus({ preventScroll: true })
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const enabled = items.filter(t => !t.disabled)
    if (enabled.length === 0) return
    const idx = enabled.findIndex(t => t.key === value)
    let next: number | null = null
    if (e.key === 'ArrowRight') next = (idx + 1) % enabled.length
    else if (e.key === 'ArrowLeft') next = (idx - 1 + enabled.length) % enabled.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = enabled.length - 1
    if (next === null) return
    e.preventDefault()
    select(enabled[next].key, true)
  }

  const tabCls = size === 'sm' ? 'min-h-9 px-3 text-xs' : 'min-h-11 px-4 text-sm lg:text-base'

  return (
    <div className={`max-w-full overflow-x-auto scrollbar-hide ${className}`} style={{ scrollbarWidth: 'none' }}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className={`${fullWidth ? 'flex w-full min-w-max' : 'inline-flex'} items-stretch gap-1 p-1`}
        style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)' }}
      >
        {items.map(t => {
          const on = t.key === value
          return (
            <button
              key={t.key}
              ref={el => { if (el) refs.current.set(t.key, el); else refs.current.delete(t.key) }}
              type="button"
              role="tab"
              id={idPrefix ? `${idPrefix}-tab-${t.key}` : undefined}
              aria-controls={idPrefix ? `${idPrefix}-panel-${t.key}` : undefined}
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              disabled={t.disabled}
              onClick={() => select(t.key, false)}
              className={`mm-press ${fullWidth ? 'flex-1' : ''} shrink-0 inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-inset ${tabCls} ${
                on ? 'font-black' : 'font-semibold hover:text-[color:var(--mm-ink)]'
              }`}
              style={{
                borderRadius: 'var(--mm-radius-chip)',
                background: on ? 'var(--mm-yellow)' : 'transparent',
                color: on ? 'var(--mm-black)' : 'var(--mm-muted)',
                boxShadow: on ? 'var(--mm-shadow-sm)' : undefined,
              }}
            >
              {t.label}
              {!!t.count && (
                <span className="text-xs tabular-nums font-bold" style={{ opacity: on ? 0.7 : 1 }}>{t.count}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
