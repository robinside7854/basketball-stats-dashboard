'use client'
// 라벨 입력 + 초성 자동완성 — 'ㅍ' 만 쳐도 '필스위치' 추천
import { useMemo, useState, useRef, useEffect } from 'react'
import { matchesLabel } from '@/lib/hangul'
import { LABEL_MAX_LEN, type LabelOption } from '@/types/coachPin'

interface Props {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  options: LabelOption[]
  autoFocus?: boolean
}

const MAX_SUGGESTIONS = 6

export default function LabelInput({ value, onChange, onSubmit, options, autoFocus }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo(
    () => options.filter(o => matchesLabel(value, o.label)).slice(0, MAX_SUGGESTIONS),
    [options, value],
  )

  // 목록 밖 클릭 시 닫기
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // -1 = 아무것도 선택 안 됨. 사용자가 방향키로 고른 경우에만 0 이상이 된다.
  const activeIdx = active < 0 ? -1 : Math.min(active, suggestions.length - 1)

  function choose(label: string) {
    onChange(label)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // 자동완성 목록이 열려 있을 때만 방향키를 가로챈다
    if (open && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIdx < 0 ? 0 : (activeIdx + 1) % suggestions.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(activeIdx < 0 ? suggestions.length - 1 : (activeIdx - 1 + suggestions.length) % suggestions.length); return }
      if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault()
        choose(suggestions[activeIdx].label)
        return
      }
    }
    if (e.key === 'Enter') { e.preventDefault(); onSubmit() }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        maxLength={LABEL_MAX_LEN}
        onChange={e => { onChange(e.target.value); setActive(-1); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="라벨 (예: 필스위치)"
        role="combobox"
        aria-label="핀 라벨"
        aria-autocomplete="list"
        aria-controls="label-suggestions"
        aria-expanded={open && suggestions.length > 0}
        aria-activedescendant={activeIdx >= 0 ? `label-suggestion-${activeIdx}` : undefined}
        className="w-full min-h-[44px] bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white
                   focus:outline-none focus:border-blue-500"
      />
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          id="label-suggestions"
          className="absolute z-50 left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg overflow-hidden shadow-xl"
        >
          {suggestions.map((s, i) => (
            <li key={s.label} id={`label-suggestion-${i}`} role="option" aria-selected={i === activeIdx}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(s.label)}
                className={`w-full text-left px-3 py-2 min-h-[44px] text-sm cursor-pointer transition-colors flex items-center justify-between gap-2
                  ${i === activeIdx ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
              >
                <span className="truncate">{s.label}</span>
                <span className="text-xs opacity-70 tabular-nums shrink-0">{s.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
