'use client'
import { useEffect, useState } from 'react'
import { Pencil, Trash2, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { useEditMode } from '@/contexts/EditModeContext'
import { formatTimestamp } from '@/lib/youtube/utils'
import { EVENT_LABELS } from '@/types/database'
import type { GameEvent, Player, EventType } from '@/types/database'

// 기록 중 로그 수정 (2026-10-05) — 종전엔 기록 화면에 「마지막 1건 취소」 뿐이라, 앞선 기록을 고치려면
//   「게임 로그」 탭으로 나가야 했고 거기서도 삭제만 됐다(다시 넣으면 영상 시각이 '지금' 으로 바뀐다).
//   여기서는 선수·종류·성공여부·어시스트·쿼터를 그 자리에서 고친다(`PATCH /api/events/[id]`).

interface Props {
  gameId: string
  players: Player[]
  refreshKey: number
  onChanged: () => void
}

const TYPE_CHIPS: { type: EventType; label: string }[] = [
  { type: 'shot_3p', label: '3P' }, { type: 'shot_2p_mid', label: '미들' }, { type: 'shot_layup', label: '레이업' },
  { type: 'shot_post', label: '골밑' }, { type: 'free_throw', label: 'FT' },
  { type: 'oreb', label: 'OR' }, { type: 'dreb', label: 'DR' }, { type: 'steal', label: 'STL' },
  { type: 'block', label: 'BLK' }, { type: 'turnover', label: 'TOV' }, { type: 'foul', label: 'PF' },
]
const EDITABLE = new Set<string>(TYPE_CHIPS.map(t => t.type))
const SHOTS = new Set<string>(['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'free_throw'])
const FIELD_GOALS = new Set<string>(['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post'])
const HIDDEN = new Set<string>(['quarter_start', 'quarter_end'])
const PAGE = 30

const qLabel = (q: number) => (q <= 4 ? `Q${q}` : `OT${q - 4}`)

type Draft = { player_id: string; type: EventType; result: 'made' | 'missed' | null; related_player_id: string | null; quarter: number }

export default function EventLogPanel({ gameId, players, refreshKey, onChanged }: Props) {
  const { teamHeaders } = useEditMode()
  const [events, setEvents] = useState<GameEvent[]>([])
  const [open, setOpen] = useState(true)
  const [limit, setLimit] = useState(PAGE)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!gameId) return
    fetch(`/api/events?gameId=${gameId}`)
      .then(r => r.json())
      .then((d: GameEvent[]) => setEvents(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [gameId, refreshKey])

  // 최신 기록이 위로 — 기록 중에 고칠 것은 대개 방금 넣은 것들이다
  const visible = events.filter(e => !HIDDEN.has(e.type)).slice().reverse()

  // 로그에 있지만 지금 명단(대회 로스터)에 없는 선수도 고를 수 있어야 원래 값으로 되돌릴 수 있다
  const pickList = [...players]
  for (const e of events) if (e.player && !pickList.some(p => p.id === e.player!.id)) pickList.push(e.player)

  function startEdit(e: GameEvent) {
    setConfirmDeleteId(null)
    setEditingId(e.id)
    setDraft({
      player_id: e.player_id ?? '',
      type: e.type,
      result: (e.result as 'made' | 'missed' | undefined) ?? null,
      related_player_id: e.related_player_id ?? null,
      quarter: e.quarter,
    })
  }

  async function save() {
    if (!editingId || !draft) return
    setBusy(true)
    const res = await fetch(`/api/events/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...teamHeaders },
      body: JSON.stringify(draft),
    })
    setBusy(false)
    if (!res.ok) {
      const msg = await res.json().then(d => d?.error).catch(() => null)
      toast.error(msg ? `수정 실패: ${msg}` : '수정 실패')
      return
    }
    const saved: GameEvent = await res.json()
    setEvents(prev => prev.map(e => (e.id === saved.id ? saved : e)))
    setEditingId(null)
    setDraft(null)
    toast.success('기록을 수정했습니다')
    onChanged()
  }

  async function remove(id: string) {
    setBusy(true)
    const res = await fetch(`/api/events/${id}`, { method: 'DELETE', headers: { ...teamHeaders } })
    setBusy(false)
    if (!res.ok) { toast.error('삭제 실패'); return }
    setEvents(prev => prev.filter(e => e.id !== id))
    setConfirmDeleteId(null)
    if (editingId === id) { setEditingId(null); setDraft(null) }
    toast('기록을 삭제했습니다')
    onChanged()
  }

  const chip = (active: boolean) =>
    `min-h-9 px-2 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
      active ? 'bg-[var(--mm-ink)] text-[var(--mm-panel)]' : 'bg-[var(--mm-panel-alt)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)]'
    }`

  return (
    <div className="border-t border-[var(--mm-rule)] pt-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between text-sm font-bold text-[var(--mm-ink)] cursor-pointer"
        aria-expanded={open}
      >
        <span>기록 로그 <span className="text-[var(--mm-muted)] font-normal">({visible.length}건 · 최신순)</span></span>
        <ChevronDown size={16} className={`text-[var(--mm-muted)] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div className="mt-2 space-y-1">
          {visible.length === 0 && <p className="text-xs text-[var(--mm-muted)] py-3 text-center">아직 기록이 없습니다</p>}
          {visible.slice(0, limit).map(e => {
            const editable = EDITABLE.has(e.type)
            const isEditing = editingId === e.id && draft
            const isSub = e.type === 'sub_in' || e.type === 'sub_out'
            return (
              <div key={e.id} className={`rounded-lg ${isEditing ? 'bg-[var(--mm-yellow-soft)] border border-[color:var(--mm-yellow)] p-2' : ''}`}>
                <div className={`flex items-center gap-2 text-xs ${isSub ? 'opacity-60' : ''}`}>
                  <span className="font-mono text-[var(--mm-muted)] w-7 shrink-0">{qLabel(e.quarter)}</span>
                  <span className="font-mono text-[var(--mm-muted)] w-11 shrink-0">{e.video_timestamp != null ? formatTimestamp(e.video_timestamp) : '--:--'}</span>
                  <span className="flex-1 min-w-0 truncate text-[var(--mm-ink)]">
                    {e.player && <span className="font-medium">{e.player.number} {e.player.name} </span>}
                    <span className="text-[var(--mm-ink-soft)]">{EVENT_LABELS[e.type]}</span>
                    {e.result && <span className={`ml-1 font-bold ${e.result === 'made' ? 'text-green-500' : 'text-red-400'}`}>{e.result === 'made' ? '✓' : '✗'}</span>}
                    {e.related_player && <span className="text-[var(--mm-muted)]"> (A: {e.related_player.name})</span>}
                    {e.type === 'opp_score' && <span className="text-red-400"> +{e.points}</span>}
                  </span>
                  {editable && !isEditing && (
                    <button onClick={() => startEdit(e)} aria-label="이 기록 수정" className="shrink-0 min-h-9 min-w-9 flex items-center justify-center rounded-lg text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] hover:bg-[var(--mm-panel-alt)] cursor-pointer">
                      <Pencil size={14} aria-hidden />
                    </button>
                  )}
                  {/* 교체 기록은 출전시간 표(minutes)와 짝이라 로그만 지우면 어긋난다 — 여기서는 지우지 않는다 */}
                  {!isSub && (confirmDeleteId === e.id ? (
                    <button onClick={() => remove(e.id)} disabled={busy} className="shrink-0 min-h-9 px-2 rounded-lg bg-red-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                      삭제 확인
                    </button>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(e.id)} aria-label="이 기록 삭제" className="shrink-0 min-h-9 min-w-9 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-950/30 cursor-pointer">
                      <Trash2 size={14} aria-hidden />
                    </button>
                  ))}
                </div>

                {isEditing && draft && (
                  <div className="mt-2 space-y-2">
                    <div>
                      <p className="text-[11px] text-[var(--mm-muted)] mb-1">선수</p>
                      <div className="grid grid-cols-4 gap-1">
                        {pickList.map(p => (
                          <button key={p.id} onClick={() => setDraft({ ...draft, player_id: p.id })} className={chip(draft.player_id === p.id)}>
                            {p.number} {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-[var(--mm-muted)] mb-1">종류</p>
                      <div className="flex flex-wrap gap-1">
                        {TYPE_CHIPS.map(t => (
                          <button key={t.type} onClick={() => setDraft({ ...draft, type: t.type, result: SHOTS.has(t.type) ? (draft.result ?? 'made') : null })} className={chip(draft.type === t.type)}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {SHOTS.has(draft.type) && (
                      <div>
                        <p className="text-[11px] text-[var(--mm-muted)] mb-1">결과</p>
                        <div className="flex gap-1">
                          <button onClick={() => setDraft({ ...draft, result: 'made' })} className={chip(draft.result === 'made')}>성공 ✓</button>
                          <button onClick={() => setDraft({ ...draft, result: 'missed' })} className={chip(draft.result === 'missed')}>실패 ✗</button>
                        </div>
                      </div>
                    )}
                    {FIELD_GOALS.has(draft.type) && draft.result === 'made' && (
                      <div>
                        <p className="text-[11px] text-[var(--mm-muted)] mb-1">어시스트</p>
                        <div className="grid grid-cols-4 gap-1">
                          <button onClick={() => setDraft({ ...draft, related_player_id: null })} className={chip(!draft.related_player_id)}>없음</button>
                          {pickList.filter(p => p.id !== draft.player_id).map(p => (
                            <button key={p.id} onClick={() => setDraft({ ...draft, related_player_id: p.id })} className={chip(draft.related_player_id === p.id)}>
                              {p.number} {p.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <p className="text-[11px] text-[var(--mm-muted)] mb-1">쿼터</p>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(q => (
                          <button key={q} onClick={() => setDraft({ ...draft, quarter: q })} className={chip(draft.quarter === q)}>{qLabel(q)}</button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={save} disabled={busy || !draft.player_id} className="flex-1 min-h-11 rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] text-sm font-bold cursor-pointer disabled:opacity-50">
                        {busy ? '저장 중…' : '저장'}
                      </button>
                      <button onClick={() => { setEditingId(null); setDraft(null) }} className="min-h-11 px-4 rounded-lg bg-[var(--mm-panel-alt)] text-[var(--mm-ink-soft)] text-sm cursor-pointer">
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {visible.length > limit && (
            <button onClick={() => setLimit(l => l + PAGE)} className="w-full min-h-9 text-xs text-[var(--mm-muted)] hover:text-[var(--mm-ink)] cursor-pointer">
              이전 기록 더 보기 ({visible.length - limit}건)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
