'use client'
// 선수 카드 머리의 「플레이 스타일」 칩 최대 2개 (2026-10-14).
//   ⚠ 배지가 아니다 — 모으는 것·아이콘 트로피 없음. 카드에서 고른 기간(전체/분기)을 따라 바뀐다.
//   칩을 누르면(또는 마우스를 올리면) 한 줄 설명이 보인다. 규칙은 lib/stats/roleLabels.ts.
//   preview = 회원 공개 스위치가 꺼져 있어 CEO 에게만 보이는 상태.
import { useState } from 'react'
import Chip from '@/components/league/ui/Chip'
import type { RoleLabel } from '@/lib/stats/roleLabels'

export type RoleLabelsData = { labels: RoleLabel[]; preview: boolean } | null | undefined

export default function RoleLabelChips({ data, className = '' }: { data: RoleLabelsData; className?: string }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!data || data.labels.length === 0) return null
  const active = data.labels.find(l => l.key === open) ?? null

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>플레이 스타일</span>
        {data.labels.map(l => (
          <button
            key={l.key}
            type="button"
            onClick={() => setOpen(cur => (cur === l.key ? null : l.key))}
            aria-expanded={open === l.key}
            title={l.explanation}
            className="inline-flex items-center min-h-9 cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
          >
            <Chip tone={l.key === 'teamplayer' ? 'neutral' : 'accent'}>{l.label}</Chip>
          </button>
        ))}
        {data.preview && (
          <Chip tone="neutral" title="회원에게는 아직 보이지 않습니다(CEO 미리보기)">미리보기</Chip>
        )}
      </div>
      {active && (
        <p className="mt-1 text-xs break-keep" style={{ color: 'var(--mm-ink-soft)' }}>
          <b style={{ color: 'var(--mm-ink)' }}>{active.label}</b> · {active.explanation}
        </p>
      )}
    </div>
  )
}
