'use client'
// 키 일괄 입력 — 명단 화면(편집 모드)에서 선수 키(cm)를 한 번에 넣는다(2026-11-13, 미라클 후프스 캐릭터용).
import { useState } from 'react'
import { toast } from 'sonner'
import { Ruler, Loader2 } from 'lucide-react'
import type { LeaguePlayer } from '@/types/league'

export default function HeightBulkCard({ leagueId, leagueHeaders, players, onSaved }: {
  leagueId: string
  leagueHeaders: Record<string, string> | null | undefined
  players: LeaguePlayer[]
  onSaved: (changed: Record<string, number | null>) => void
}) {
  const list = players.filter(p => !p.is_guest && p.is_active !== false).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const value = (p: LeaguePlayer) => draft[p.id] ?? (p.height_cm ? String(p.height_cm) : '')
  const changed = list.filter(p => draft[p.id] !== undefined && draft[p.id] !== (p.height_cm ? String(p.height_cm) : ''))
  const filled = list.filter(p => value(p)).length

  async function save() {
    const bad = changed.find(p => draft[p.id] && !(Number(draft[p.id]) >= 120 && Number(draft[p.id]) <= 230))
    if (bad) { toast.error(`${bad.name}: 키는 120~230 사이로 넣어 주세요`); return }
    setSaving(true)
    const res = await fetch(`/api/leagues/${leagueId}/players/bulk`, {
      method: 'PATCH', headers: { ...(leagueHeaders ?? {}), 'Content-Type': 'application/json' },
      body: JSON.stringify({ heights: changed.map(p => ({ id: p.id, height_cm: draft[p.id] || null })) }),
    }).catch(() => null)
    setSaving(false)
    if (!res?.ok) { toast.error((await res?.json().catch(() => null))?.error ?? '저장 실패'); return }
    onSaved(Object.fromEntries(changed.map(p => [p.id, draft[p.id] ? Math.round(Number(draft[p.id])) : null])))
    setDraft({})
    toast.success(`키 ${changed.length}명 저장했어요`)
  }

  return (
    <details className="mm-brand">
      <summary className="p-3.5 lg:p-4 flex items-center gap-2 cursor-pointer min-h-11 font-black text-[17px] text-[var(--mm-ink)]">
        <Ruler size={16} aria-hidden style={{ color: 'var(--mm-yellow-strong)' }} />
        키 일괄 입력
        <span className="text-sm font-medium text-[var(--mm-ink-soft)]">{filled}/{list.length}명 입력됨</span>
      </summary>
      <div className="px-3.5 pb-3.5 lg:px-4 lg:pb-4 space-y-3">
        <p className="text-sm text-[var(--mm-ink-soft)]">숫자만 넣고 맨 아래 저장을 누르세요. 칸을 비우면 키가 지워져요.</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
          {list.map(p => (
            <li key={p.id} className="flex items-center gap-2">
              <label htmlFor={`h-${p.id}`} className="flex-1 min-w-0 truncate text-sm font-bold text-[var(--mm-ink)]">{p.name}</label>
              <input
                id={`h-${p.id}`} type="number" inputMode="numeric" min={120} max={230} placeholder="cm"
                value={value(p)}
                onChange={e => setDraft(d => ({ ...d, [p.id]: e.target.value }))}
                className="w-24 min-h-11 rounded-sm px-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)' }}
              />
            </li>
          ))}
        </ul>
        <button
          type="button" onClick={save} disabled={saving || changed.length === 0}
          className="w-full min-h-11 rounded-sm font-black text-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 transition-colors duration-200 inline-flex items-center justify-center gap-2"
          style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)' }}
        >
          {saving && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {changed.length ? `${changed.length}명 저장` : '바뀐 키가 없어요'}
        </button>
      </div>
    </details>
  )
}
