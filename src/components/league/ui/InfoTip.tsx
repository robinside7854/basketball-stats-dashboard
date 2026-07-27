'use client'
// 용어 설명 인라인 툴팁 — ⓘ 아이콘 hover/tap 시 한 줄 설명 팝오버. (첫 사용자 용어 장벽 완화)
import { useState, useRef, useEffect } from 'react'
import { Info } from 'lucide-react'

export default function InfoTip({ text, label = '설명 보기' }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])
  return (
    <span
      ref={ref}
      className="relative inline-flex align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={label}
        className="inline-flex items-center justify-center cursor-pointer text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)] transition-colors min-h-[24px] min-w-[24px]"
      >
        <Info size={15} />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-30 top-full left-1/2 -translate-x-1/2 mt-1.5 w-56 max-w-[72vw] p-2.5 rounded-md text-xs leading-relaxed font-normal normal-case tracking-normal text-left"
          style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', boxShadow: '0 8px 28px -8px rgba(0,0,0,0.3)' }}
        >
          {text}
        </span>
      )}
    </span>
  )
}
