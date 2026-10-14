'use client'
// 「숫자 읽는 법」 — 스탯 탭 머리의 ⓘ 버튼 + 시트 (2026-10-14).
//   내용은 lib/stats/glossary.ts 의 READING_GUIDE 하나에서 온다. 종전 스탯 탭의 「이 표 읽는 법」
//   접힘 상자 항목도 거기로 합쳤다 — 같은 설명이 두 군데 따로 있으면 한쪽만 고쳐진다.
//   항목 한 줄 모양은 StatsReadingGuide(팀 탭이 아직 쓰는 접힘 상자)와 같은 GuideItemList 를 쓴다.
import { useState } from 'react'
import { Info } from 'lucide-react'
import Sheet from '@/components/league/ui/Sheet'
import { GuideItemList } from './StatsReadingGuide'
import { READING_GUIDE } from '@/lib/stats/glossary'

export default function StatsGlossarySheet({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1.5 px-3 min-h-11 text-sm font-bold whitespace-nowrap cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] ${className}`}
        style={{ color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)', background: 'var(--mm-panel)' }}
      >
        <Info size={16} aria-hidden />
        숫자 읽는 법
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="숫자 읽는 법" width="lg">
        <div className="space-y-5 pb-2">
          {READING_GUIDE.map(section => (
            <section key={section.title} aria-label={section.title}>
              <h3 className="text-sm font-black mb-2" style={{ color: 'var(--mm-ink)' }}>{section.title}</h3>
              <div className="p-3 space-y-2" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' }}>
                <GuideItemList items={section.items} />
              </div>
            </section>
          ))}
        </div>
      </Sheet>
    </>
  )
}
