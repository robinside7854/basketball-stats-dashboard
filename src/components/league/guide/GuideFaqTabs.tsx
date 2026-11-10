'use client'
// 자주 묻는 질문 — 카테고리 칩을 눌러 그 묶음만 보인다(세로로 길어지지 않게, 2026-11-10 운영진).
import { useState } from 'react'
import { FAQ_CATEGORIES, type GuideFaq } from '@/lib/guide/memberGuide'

const lineCls = 'text-[15px] lg:text-[18px] leading-[1.6]'

export default function GuideFaqTabs({ faqs }: { faqs: GuideFaq[] }) {
  // 회원 가이드는 정해 둔 순서, 그 밖(어드민 가이드)은 처음 나온 순서
  const known = FAQ_CATEGORIES.filter(c => faqs.some(f => f.cat === c)) as string[]
  const cats = [...known, ...[...new Set(faqs.map(f => f.cat))].filter(c => !known.includes(c))]
  const [cat, setCat] = useState(cats[0])
  const list = faqs.filter(f => f.cat === cat)
  return (
    <div className="mt-4 lg:mt-6">
      <div role="tablist" aria-label="질문 묶음" className="flex flex-wrap gap-2">
        {cats.map(c => {
          const on = c === cat
          return (
            <button key={c} type="button" role="tab" aria-selected={on} onClick={() => setCat(c)}
              className="mm-press px-3 py-2 lg:px-4 text-sm lg:text-base font-bold whitespace-nowrap cursor-pointer"
              style={{ background: on ? 'var(--mm-ink)' : 'var(--mm-panel)', color: on ? 'var(--mm-panel)' : 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: '999px' }}>
              {c} <span style={{ opacity: 0.6 }}>{faqs.filter(f => f.cat === c).length}</span>
            </button>
          )
        })}
      </div>
      <ol className="mt-3 lg:mt-4 space-y-3">
        {list.map((f, j) => (
          <li key={f.q} className="p-3 md:p-4" style={{ border: '1px solid var(--mm-rule)', borderRadius: '10px' }}>
            <p className={`flex gap-2 font-bold ${lineCls}`} style={{ color: 'var(--mm-ink)' }}>
              <span className="shrink-0 font-black" style={{ color: 'var(--mm-yellow-strong, #b8860b)' }}>Q{j + 1}.</span>
              <span>{f.q}</span>
            </p>
            <div className="mt-2 flex gap-2 p-3" style={{ background: 'var(--mm-panel-alt)', borderRadius: '8px' }}>
              <span className={`shrink-0 font-black ${lineCls}`} style={{ color: 'var(--mm-muted)' }}>A.</span>
              <div className="space-y-0.5">
                {f.a.map((l, k) => <p key={k} className={lineCls} style={{ color: 'var(--mm-ink)' }}>{l}</p>)}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
