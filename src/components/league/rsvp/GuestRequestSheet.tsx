'use client'
// 게스트 신청 창 (2026-11-09 운영진) — 게스트는 대시보드 명단에 없는 사람이라, 부르는 회원이 직접 이름·나이·포지션·키를 넣는다.
//   제출하면 이번 주 「참」으로 대기명단에 들어가고, 팀 배치는 어드민이 한다. 게스트비는 같은 통장으로.
import { useState } from 'react'
import { toast } from 'sonner'
import Sheet from '@/components/league/ui/Sheet'
import { guestLine, type RsvpRes } from './rsvpTypes'

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const
const INPUT = 'mt-1 w-full min-h-11 px-3 border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)] text-base'

export default function GuestRequestSheet({ leagueId, open, onClose, onDone, pool = [] }: { leagueId: string; open: boolean; onClose: () => void; onDone: () => void; pool?: NonNullable<RsvpRes['guest_pool']> }) {
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [height, setHeight] = useState('')
  const [pos, setPos] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  // 지난 게스트 다시 부르기 — 한 번 팀에 배치된 내 게스트(2026-11-09 운영진)
  async function again(id: string, nm: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/rsvp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'guest_again', guestId: id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error ?? '신청하지 못했어요'); return }
      toast.success(`${nm} 님을 이번 주 게스트로 다시 신청했어요`)
      onDone(); onClose()
    } finally { setBusy(false) }
  }

  async function submit() {
    if (!name.trim()) { toast.error('이름을 적어 주세요'); return }
    if (!age) { toast.error('나이를 적어 주세요'); return }
    if (pos.length === 0) { toast.error('포지션을 하나 이상 골라 주세요'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/rsvp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'guest', name: name.trim(), age: Number(age), height_cm: height ? Number(height) : null, position: pos }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error ?? '신청하지 못했어요'); return }
      toast.success(`${name.trim()} 님을 게스트로 신청했어요 — 어드민이 팀을 정해요`)
      setName(''); setAge(''); setHeight(''); setPos([])
      onDone(); onClose()
    } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title="게스트 신청" width="sm">
      <div className="space-y-3">
        {pool.length > 0 && (
          <div>
            <div className="text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>지난번 게스트 다시 부르기</div>
            <ul className="mt-1 space-y-1.5">
              {pool.map(g => (
                <li key={g.player_id} className="flex items-center justify-between gap-2 pl-3 pr-1 py-1" style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-ctl)' }}>
                  <span className="text-sm min-w-0" style={{ color: 'var(--mm-ink)' }}>{guestLine(g)}</span>
                  <button type="button" disabled={busy} onClick={() => again(g.player_id, g.name)}
                    className="mm-press shrink-0 min-h-11 px-3 text-sm font-black disabled:opacity-50"
                    style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', borderRadius: 'var(--mm-radius-ctl)' }}>
                    다시 신청
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>새 게스트</div>
          </div>
        )}
        <p className="text-sm" style={{ color: 'var(--mm-ink-soft)' }}>함께 올 게스트를 적어 주세요. 대기명단에 들어가고 어드민이 팀을 정해요. 게스트비는 같은 통장으로 보내 주세요.</p>
        <label className="block text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>이름
          <input value={name} onChange={e => setName(e.target.value)} maxLength={30} className={INPUT} placeholder="예: 홍길동" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>나이
            <input inputMode="numeric" value={age} onChange={e => setAge(e.target.value.replace(/[^\d]/g, '').slice(0, 2))} className={INPUT} placeholder="예: 32" />
          </label>
          <label className="block text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>키(cm · 선택)
            <input inputMode="numeric" value={height} onChange={e => setHeight(e.target.value.replace(/[^\d]/g, '').slice(0, 3))} className={INPUT} placeholder="예: 180" />
          </label>
        </div>
        <div>
          <div className="text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>포지션 (여러 개 가능)</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {POSITIONS.map(p => {
              const on = pos.includes(p)
              return (
                <button key={p} type="button" aria-pressed={on} onClick={() => setPos(v => on ? v.filter(x => x !== p) : [...v, p])}
                  className="mm-press min-h-11 min-w-12 px-3 text-sm font-black border"
                  style={{ borderColor: on ? 'var(--mm-ink)' : 'var(--mm-rule)', background: on ? 'var(--mm-yellow)' : 'var(--mm-panel)', color: on ? 'var(--mm-black)' : 'var(--mm-ink)' }}>
                  {p}
                </button>
              )
            })}
          </div>
        </div>
        <button type="button" disabled={busy} onClick={submit} className="mm-press w-full min-h-12 font-black disabled:opacity-50"
          style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}>
          {busy ? '보내는 중' : '게스트 신청하기'}
        </button>
      </div>
    </Sheet>
  )
}
