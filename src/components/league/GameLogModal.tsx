'use client'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2, Trash2, Pencil, Check, X, RotateCcw } from 'lucide-react'

type RosterPlayer = { id: string; name: string; number?: number | null; team_id?: string }

type EventRow = {
  id: string
  type: string
  result: string | null
  points: number
  league_player_id: string | null
  related_player_id: string | null
  team_id: string | null
  video_timestamp: number | null
  created_at: string
}

const EVENT_OPTS = [
  { v: 'shot_3p',       l: '3점슛'        },
  { v: 'shot_2p_mid',   l: '미들슛'       },
  { v: 'shot_layup',    l: '레이업'       },
  { v: 'shot_post',     l: '골밑슛'       },
  { v: 'shot_2p_drive', l: '드라이브'     },
  { v: 'free_throw',    l: '자유투'       },
  { v: 'ft_2pt',        l: '2P파울 FT'    },
  { v: 'ft_3pt_1',      l: '3P파울 1구'   },
  { v: 'ft_3pt_2',      l: '3P파울 2구'   },
  { v: 'oreb',          l: '공격리바운드'  },
  { v: 'dreb',          l: '수비리바운드'  },
  { v: 'steal',         l: '스틸'         },
  { v: 'block',         l: '블록'         },
  { v: 'turnover',      l: '턴오버'       },
  { v: 'foul',          l: '파울'         },
]

const SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive']
const FT_TYPES   = ['free_throw', 'ft_2pt', 'ft_3pt_1', 'ft_3pt_2']

function getLabel(type: string) { return EVENT_OPTS.find(e => e.v === type)?.l ?? type }

function eventColor(type: string, result: string | null) {
  const isMade = result === 'made'
  const isMiss = result === 'missed'
  if ([...SHOT_TYPES, ...FT_TYPES].includes(type)) {
    if (isMade) return 'text-green-400'
    if (isMiss) return 'text-red-400'
  }
  if (type === 'steal')    return 'text-purple-400'
  if (type === 'block')    return 'text-indigo-400'
  if (type === 'oreb' || type === 'dreb') return 'text-yellow-400'
  if (type === 'turnover') return 'text-red-500'
  if (type === 'foul')     return 'text-orange-400'
  return 'text-gray-400'
}

interface Props {
  gameId: string
  leagueId: string
  leagueHeaders: Record<string, string>
  allPlayers: RosterPlayer[]
  isEditMode: boolean
  onClose: () => void
  onChanged: () => void
}

export default function GameLogModal({ gameId, leagueId, leagueHeaders, allPlayers, isEditMode, onClose, onChanged }: Props) {
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ type: '', result: '', points: '', playerId: '', relatedId: '' })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const playerMap = Object.fromEntries(allPlayers.map(p => [p.id, p]))

  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/events?gameId=${gameId}`)
      if (r.ok) setEvents((await r.json() as EventRow[]).reverse())
    } finally { setLoading(false) }
  }, [leagueId, gameId])

  useEffect(() => { loadEvents() }, [loadEvents])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  async function handleDelete(id: string) {
    setDeletingId(id)
    const r = await fetch(`/api/leagues/${leagueId}/events/${id}`, { method: 'DELETE', headers: leagueHeaders })
    setDeletingId(null)
    if (!r.ok) { toast.error('삭제 실패'); return }
    toast.success('이벤트 삭제됨')
    await loadEvents()
    onChanged()
  }

  function startEdit(e: EventRow) {
    setEditingId(e.id)
    setEditForm({
      type: e.type,
      result: e.result ?? '',
      points: String(e.points ?? 0),
      playerId: e.league_player_id ?? '',
      relatedId: e.related_player_id ?? '',
    })
  }

  async function handleSave(id: string) {
    setSaving(true)
    const isShotType = SHOT_TYPES.includes(editForm.type)
    const isFtType   = FT_TYPES.includes(editForm.type)
    const needsResult = isShotType || isFtType
    const body: Record<string, unknown> = {
      type: editForm.type,
      result: needsResult ? (editForm.result || null) : null,
      points: isFtType ? Number(editForm.points) : 0,
      league_player_id: editForm.playerId || null,
      related_player_id: isShotType ? (editForm.relatedId || null) : null,
      team_id: editForm.playerId ? (playerMap[editForm.playerId]?.team_id ?? null) : null,
    }
    const r = await fetch(`/api/leagues/${leagueId}/events/${id}`, {
      method: 'PATCH',
      headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!r.ok) { toast.error('수정 실패'); return }
    toast.success('이벤트 수정됨')
    setEditingId(null)
    await loadEvents()
    onChanged()
  }

  async function handleReset() {
    setResetting(true)
    const r = await fetch(`/api/leagues/${leagueId}/games/${gameId}/reset`, { method: 'DELETE', headers: leagueHeaders })
    setResetting(false)
    setConfirmReset(false)
    if (!r.ok) { toast.error('초기화 실패'); return }
    toast.success('경기 스탯이 초기화됐습니다')
    await loadEvents()
    onChanged()
  }

  const isShotType = SHOT_TYPES.includes(editForm.type)
  const isFtType   = FT_TYPES.includes(editForm.type)
  const needsResult = isShotType || isFtType

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col z-10 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-white font-bold text-sm">게임 이벤트 로그</h2>
            {!loading && <span className="text-[11px] text-gray-600">{events.length}개</span>}
          </div>
          <div className="flex items-center gap-2">
            {isEditMode && (
              <button
                onClick={() => setConfirmReset(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/30 hover:bg-red-900/50 border border-red-800/40 text-red-400 text-xs font-bold cursor-pointer transition-colors"
              >
                <RotateCcw size={12} />
                전체 초기화
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white cursor-pointer transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Event list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-gray-600" /></div>
          ) : events.length === 0 ? (
            <p className="text-center text-sm text-gray-600 py-10">이벤트가 없습니다</p>
          ) : events.map(e => {
            const player    = e.league_player_id ? playerMap[e.league_player_id] : null
            const relPlayer = e.related_player_id ? playerMap[e.related_player_id] : null
            const isEditing = editingId === e.id

            if (isEditing) {
              return (
                <div key={e.id} className="bg-gray-900 border border-blue-500/40 rounded-xl p-3.5 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-600 block mb-1">선수</label>
                      <select value={editForm.playerId} onChange={ev => setEditForm(f => ({ ...f, playerId: ev.target.value }))}
                        className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-2 py-1.5">
                        <option value="">없음</option>
                        {allPlayers.map(p => <option key={p.id} value={p.id}>#{p.number ?? '—'} {p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-600 block mb-1">이벤트</label>
                      <select value={editForm.type} onChange={ev => setEditForm(f => ({ ...f, type: ev.target.value, result: '', relatedId: '' }))}
                        className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-2 py-1.5">
                        {EVENT_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    </div>
                  </div>

                  {needsResult && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-600 block mb-1">결과</label>
                        <select value={editForm.result} onChange={ev => setEditForm(f => ({ ...f, result: ev.target.value }))}
                          className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-2 py-1.5">
                          <option value="">없음</option>
                          <option value="made">성공</option>
                          <option value="missed">실패</option>
                        </select>
                      </div>
                      {isFtType && (
                        <div>
                          <label className="text-[10px] text-gray-600 block mb-1">점수</label>
                          <input type="number" min={0} max={4} value={editForm.points}
                            onChange={ev => setEditForm(f => ({ ...f, points: ev.target.value }))}
                            className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-2 py-1.5" />
                        </div>
                      )}
                    </div>
                  )}

                  {isShotType && (
                    <div>
                      <label className="text-[10px] text-gray-600 block mb-1">어시스트 선수</label>
                      <select value={editForm.relatedId} onChange={ev => setEditForm(f => ({ ...f, relatedId: ev.target.value }))}
                        className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-2 py-1.5">
                        <option value="">없음</option>
                        {allPlayers.filter(p => p.id !== editForm.playerId).map(p => (
                          <option key={p.id} value={p.id}>#{p.number ?? '—'} {p.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex gap-2 pt-0.5">
                    <button onClick={() => handleSave(e.id)} disabled={saving}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg cursor-pointer disabled:opacity-50 transition-colors">
                      {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}저장
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold rounded-lg cursor-pointer transition-colors">
                      취소
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div key={e.id}
                className="flex items-center gap-3 px-3 py-2.5 bg-gray-900/60 border border-gray-800/40 rounded-xl hover:border-gray-700/60 transition-colors group">
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white text-sm font-semibold">
                      {player ? `#${player.number ?? '—'} ${player.name}` : '—'}
                    </span>
                    <span className={`text-xs font-bold ${eventColor(e.type, e.result)}`}>{getLabel(e.type)}</span>
                    {e.result && (
                      <span className={`text-[11px] px-1.5 py-0.5 rounded font-bold ${e.result === 'made' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                        {e.result === 'made' ? '성공' : '실패'}
                      </span>
                    )}
                    {e.points > 0 && e.result === 'made' && (
                      <span className="text-[11px] text-yellow-400 font-bold">+{e.points}점</span>
                    )}
                  </div>
                  {relPlayer && (
                    <p className="text-[11px] text-gray-600">
                      어시스트 → #{relPlayer.number ?? '—'} {relPlayer.name}
                    </p>
                  )}
                </div>

                {isEditMode && (
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(e)}
                      className="p-1.5 rounded-lg bg-gray-800 hover:bg-blue-900/40 text-gray-500 hover:text-blue-400 cursor-pointer transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDelete(e.id)} disabled={deletingId === e.id}
                      className="p-1.5 rounded-lg bg-gray-800 hover:bg-red-900/40 text-gray-500 hover:text-red-400 cursor-pointer transition-colors disabled:opacity-50">
                      {deletingId === e.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {!isEditMode && (
          <div className="px-5 py-2.5 border-t border-gray-800 shrink-0">
            <p className="text-[11px] text-gray-700 text-center">수정/삭제하려면 편집 모드를 활성화하세요</p>
          </div>
        )}
      </div>

      {/* 초기화 확인 다이얼로그 */}
      {confirmReset && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmReset(false)} />
          <div className="relative bg-gray-900 border border-red-800/50 rounded-2xl p-6 w-full max-w-sm z-10 space-y-4">
            <div className="text-center space-y-2">
              <RotateCcw size={32} className="text-red-400 mx-auto" />
              <h3 className="text-white font-bold text-base">경기 스탯 초기화</h3>
              <p className="text-gray-400 text-sm">모든 이벤트가 삭제되고 스코어가 0으로 초기화됩니다.<br/>이 작업은 되돌릴 수 없습니다.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmReset(false)}
                className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-bold rounded-xl cursor-pointer transition-colors">
                취소
              </button>
              <button onClick={handleReset} disabled={resetting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-bold rounded-xl cursor-pointer disabled:opacity-50 transition-colors">
                {resetting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                초기화
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
