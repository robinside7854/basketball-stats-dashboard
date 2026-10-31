'use client'
// 「정렬 ▾ 득점」 하나짜리 고르기 (리뉴얼 R0, 2026-10-31).
//   운영진 원칙 「한 화면 = 한 줄의 고르기」 — 정렬 칩 6~9개를 늘어놓던 자리를 이것 하나로 바꾼다.
//   폰에서는 기기 기본 선택창이 뜬다(가장 익숙하고 손가락 크기 걱정이 없다).
import { ChevronDown } from 'lucide-react'

export default function SortSelect<K extends string>({
  value, options, onChange, label = '정렬', className = '',
}: {
  value: K
  options: readonly { key: K; label: string }[]
  onChange: (k: K) => void
  label?: string
  className?: string
}) {
  return (
    <label className={`relative inline-flex items-center gap-2 ${className}`}>
      <span className="t-label">{label}</span>
      <span className="relative inline-flex">
        <select
          value={value}
          onChange={e => onChange(e.target.value as K)}
          className="mm-press appearance-none min-h-11 pl-3.5 pr-9 text-sm font-black cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
          style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', borderRadius: 'var(--mm-radius-chip)' }}
        >
          {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mm-black)' }} />
      </span>
    </label>
  )
}
