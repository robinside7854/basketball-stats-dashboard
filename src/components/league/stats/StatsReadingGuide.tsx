'use client'
// "이 표 읽는 법" — 기본 접힌 한 줄 안내 (라이트 유저용).
// 네이티브 <details>/<summary> 사용 — 접힘 상태는 summary 한 줄 높이만 차지하고
// 별도 JS 상태 없이 키보드(Enter/Space)·스크린리더 모두 기본 지원됨.
// 스탯/팀순위 페이지에서 재사용 — 새 컴포넌트 난립 방지 위해 항목만 props 로 받는다.

import { HelpCircle, ChevronDown } from 'lucide-react'

export interface GuideItem {
  term: string
  text: string
  /** 계산식 — 있으면 설명 아래 작은 글씨 */
  formula?: string
}

/** 항목 목록 — 이 접힘 상자와 스탯 탭 「숫자 읽는 법」 시트(StatsGlossarySheet)가 같이 쓴다 */
export function GuideItemList({ items }: { items: GuideItem[] }) {
  return (
    <>
      {items.map(item => (
        <p key={item.term} className="text-xs leading-relaxed max-w-prose" style={{ color: 'var(--mm-ink-soft)' }}>
          <span className="font-black" style={{ color: 'var(--mm-ink)' }}>{item.term}</span> {item.text}
          {item.formula && (
            <span className="block mt-0.5 t-num" style={{ color: 'var(--mm-muted)' }}>계산: {item.formula}</span>
          )}
        </p>
      ))}
    </>
  )
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
        <span className="text-xs font-black" style={{ letterSpacing: '0.08em' }}>이 표 읽는 법</span>
        <ChevronDown
          size={14}
          aria-hidden
          className="ml-auto transition-transform duration-200 group-open:rotate-180"
          style={{ color: 'var(--mm-muted)', flexShrink: 0 }}
        />
      </summary>
      <div className="px-3 pb-3 pt-1 space-y-1.5" style={{ borderTop: '1px solid var(--mm-rule)' }}>
        <GuideItemList items={items} />
      </div>
    </details>
  )
}
