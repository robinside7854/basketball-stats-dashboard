'use client'
// "이 표 읽는 법" — 기본 접힌 한 줄 안내 (라이트 유저용).
// 네이티브 <details>/<summary> 사용 — 접힘 상태는 summary 한 줄 높이만 차지하고
// 별도 JS 상태 없이 키보드(Enter/Space)·스크린리더 모두 기본 지원됨.
// 스탯/팀순위 페이지에서 재사용 — 새 컴포넌트 난립 방지 위해 항목만 props 로 받는다.

import { HelpCircle, ChevronDown } from 'lucide-react'

export interface GuideItem {
  term: string
  text: string
}

interface Props {
  items: GuideItem[]
  className?: string
}

export default function StatsReadingGuide({ items, className }: Props) {
  return (
    <details
      className={`group ${className ?? ''}`}
      style={{ border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)', background: 'var(--mm-panel-alt)' }}
    >
      <summary
        className="flex items-center gap-2 px-3 cursor-pointer select-none min-h-[44px] [&::-webkit-details-marker]:hidden"
        style={{ color: 'var(--mm-ink-soft)', listStyle: 'none' }}
      >
        <HelpCircle size={14} aria-hidden style={{ color: 'var(--mm-muted)', flexShrink: 0 }} />
        <span className="text-xs font-black uppercase" style={{ letterSpacing: '0.08em' }}>이 표 읽는 법</span>
        <ChevronDown
          size={14}
          aria-hidden
          className="ml-auto transition-transform duration-200 group-open:rotate-180"
          style={{ color: 'var(--mm-muted)', flexShrink: 0 }}
        />
      </summary>
      <div className="px-3 pb-3 pt-1 space-y-1.5" style={{ borderTop: '1px solid var(--mm-rule)' }}>
        {items.map(item => (
          <p key={item.term} className="text-xs leading-relaxed" style={{ color: 'var(--mm-ink-soft)' }}>
            <span className="font-black" style={{ color: 'var(--mm-ink)' }}>{item.term}</span> {item.text}
          </p>
        ))}
      </div>
    </details>
  )
}
