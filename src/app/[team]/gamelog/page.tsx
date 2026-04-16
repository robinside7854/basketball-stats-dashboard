'use client'
import { useEffect, useRef, useState } from 'react'
import { Trash2, Scissors } from 'lucide-react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useGameStore } from '@/store/gameStore'
import { useEditMode } from '@/contexts/EditModeContext'
import { useTeam } from '@/contexts/TeamContext'
import { formatTimestamp } from '@/lib/youtube/utils'
import { EVENT_LABELS } from '@/types/database'
import type { Tournament, Game, GameEvent } from '@/types/database'

const EVENT_ICONS: Record<string, string> = {
  shot_3p: '🟡', shot_2p_mid: '🔵', shot_2p_drive: '🟣', free_throw: '⚪',
  oreb: '🟢', dreb: '🟢', assist: '🔵', steal: '💚', block: '💜',
  turnover: '🔴', foul: '🟠', opp_score: '❌',
  sub_in: '⬆️', sub_out: '⬇️', quarter_start: '▶️', quarter_end: '⏹️',
  shot_layup: '🟠', shot_post: '🔴',
}

const QUARTER_OPTIONS = [
  { value: 1, label: 'Q1' },
  { value: 2, label: 'Q2' },
  { value: 3, label: 'Q3' },
  { value: 4, label: 'Q4' },
  { value: 5, label: 'OT1' },
  { value: 6, label: 'OT2' },
]

export default function GameLogPage() {
  const team = useTeam()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [selectedTId, setSelectedTId] = useState('')
  const [selectedGId, setSelectedGId] = useState('')
  const [events, setEvents] = useState<GameEvent[]>([])
  const [filterPlayer, setFilterPlayer] = useState('')
  const { seekTo } = useGameStore()
  const { isEditMode } = useEditMode()

  const [splitTarget, setSplitTarget] = useState<{ eventId: string; currentQ: number } | null>(null)
  const [splitNewQ, setSplitNewQ] = useState<number>(0)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetch(`/api/tournaments?team=${team}`).then(r => r.json()).then(setTournaments) }, [team])
  useEffect(() => {
    if (!selectedTId) return
    fetch(`/api/games?tournamentId=${selectedTId}`).then(r => r.json()).then(setGames)
  }, [selectedTId])
  useEffect(() => {
    if (!selectedGId) return
    fetchEvents()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGId, games])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setSplitTarget(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function fetchEvents() {
    const data = await fetch(`/api/events?gameId=${selectedGId}`).then(r => r.json())
    setEvents(data)
  }

  async function deleteEvent(id: string) {
    await fetch(`/api/events/${id}`, { method: 'DELETE' })
    toast.success('이벤트 삭제됨')
    fetchEvents()
  }

  function openSplitPopover(eventId: string, currentQ: number) {
    const next = currentQ < 4 ? currentQ + 1 : currentQ + 1 <= 6 ? currentQ + 1 : currentQ
    setSplitNewQ(next)
    setSplitTarget({ eventId, currentQ })
  }

  async function confirmSplit() {
    if (!splitTarget || !splitNewQ || !selectedGId) return
    const res = await fetch('/api/events/split-quarter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: selectedGId, fromEventId: splitTarget.eventId, newQuarter: splitNewQ }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error || '쿼터 분리 실패')
      return
    }
    const oldLabel = splitTarget.currentQ > 4 ? `OT${splitTarget.currentQ - 4}` : `Q${splitTarget.currentQ}`
    const newLabel = splitNewQ > 4 ? `OT${splitNewQ - 4}` : `Q${splitNewQ}`
    toast.success(`${oldLabel} → ${newLabel} 쿼터 분리 완료 (${data.updated}개 이벤트)`)
    setSplitTarget(null)
    fetchEvents()
  }

  const uniquePlayers = Array.from(new Map(events.filter(e => e.player).map(e => [e.player_id, e.player!])).values())
  const filtered = filterPlayer ? events.filter(e => e.player_id === filterPlayer || e.related_player_id === filterPlayer) : events
  const quarters = [1, 2, 3, 4, 5, 6]

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-6">
        <Select value={selectedTId} onValueChange={v => { setSelectedTId(v ?? ''); setSelectedGId('') }}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white w-52">
            <SelectValue placeholder="대회 선택">
              {selectedTId ? (() => { const t = tournaments.find(t => t.id === selectedTId); return t ? `${t.name} (${t.year})` : undefined })() : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700 text-white">
            {tournaments.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.year})</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={selectedGId} onValueChange={v => setSelectedGId(v ?? '')} disabled={!selectedTId}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white w-52">
            <SelectValue placeholder="경기 선택">
              {selectedGId ? (() => { const g = games.find(g => g.id === selectedGId); return g ? `${g.date} vs ${g.opponent}` : undefined })() : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700 text-white">
            {games.map(g => <SelectItem key={g.id} value={g.id}>{g.date} vs {g.opponent}</SelectItem>)}
          </SelectContent>
        </Select>
        {uniquePlayers.length > 0 && (
          <Select value={filterPlayer} onValueChange={v => setFilterPlayer(v ?? '')}>
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white w-40">
              <SelectValue placeholder="선수 필터">
                {filterPlayer ? (() => { const p = uniquePlayers.find(p => p.id === filterPlayer); return p ? `${p.number}번 ${p.name}` : undefined })() : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700 text-white">
              <SelectItem value="">전체</SelectItem>
              {uniquePlayers.map(p => <SelectItem key={p.id} value={p.id}>{p.number}번 {p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {isEditMode && selectedGId && events.length > 0 && (
        <div className="mb-4 px-4 py-2.5 bg-blue-950/40 border border-blue-800/50 rounded-lg text-xs text-blue-300 flex items-center gap-2">
          <Scissors size={12} className="shrink-0" />
          각 이벤트 우측의 <strong>✂️ 버튼</strong>을 클릭하면 해당 이벤트부터 쿼터를 분리할 수 있습니다
        </div>
      )}

      {selectedGId && events.length === 0 && (
        <div className="text-center py-16 text-gray-500">기록된 이벤트가 없습니다</div>
      )}

      {quarters.map(q => {
        const qEvents = filtered.filter(e => e.quarter === q)
        if (qEvents.length === 0) return null
        return (
          <div key={q} className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-gray-800" />
              <span className="text-blue-400 font-bold text-sm px-3 py-1 bg-gray-900 rounded-full border border-blue-500">
                Q{q > 4 ? `OT${q - 4}` : q}
              </span>
              <div className="h-px flex-1 bg-gray-800" />
            </div>
            <div className="space-y-1">
              {qEvents.map(e => (
                <div key={e.id} className="relative flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-gray-900 transition-colors group">
                  <button
                    onClick={() => e.video_timestamp != null && seekTo(e.video_timestamp)}
                    className="text-blue-400 hover:text-blue-300 text-xs font-mono w-14 shrink-0 text-right"
                    title="클릭 시 영상 해당 구간으로 이동"
                  >
                    {e.video_timestamp != null ? formatTimestamp(e.video_timestamp) : '--:--'}
                  </button>
                  <span className="text-sm">{EVENT_ICONS[e.type] || '•'}</span>
                  <div className="flex-1 text-sm">
                    {e.player && <span className="font-medium text-white">[{e.player.number}] {e.player.name}</span>}
                    {' '}
                    <span className="text-gray-300">{EVENT_LABELS[e.type]}</span>
                    {e.result && <span className={`ml-2 font-bold ${e.result === 'made' ? 'text-green-400' : 'text-red-400'}`}>{e.result === 'made' ? '✓' : '✗'}</span>}
                    {e.related_player && <span className="text-gray-500 text-xs ml-2">(어시스트: {e.related_player.name})</span>}
                    {e.type === 'opp_score' && <span className="ml-2 text-red-400">+{e.points}점</span>}
                  </div>
                  {isEditMode && (
                    <>
                      <button
                        onClick={() => openSplitPopover(e.id, e.quarter)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-yellow-500 hover:text-yellow-400 p-1"
                        title="이 이벤트부터 쿼터 분리"
                      >
                        <Scissors size={13} />
                      </button>
                      <button onClick={() => deleteEvent(e.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-400 p-1">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}

                  {splitTarget?.eventId === e.id && (
                    <div
                      ref={popoverRef}
                      className="absolute right-16 top-0 z-50 bg-gray-800 border border-yellow-600/50 rounded-xl shadow-2xl p-4 w-64"
                    >
                      <div className="text-xs text-yellow-400 font-bold mb-2 flex items-center gap-1.5">
                        <Scissors size={12} />
                        쿼터 분리
                      </div>
                      <p className="text-xs text-gray-400 mb-3">
                        이 이벤트부터 같은 Q{splitTarget.currentQ} 이후 기록을 아래 쿼터로 변경합니다
                      </p>
                      <div className="flex gap-1.5 mb-3 flex-wrap">
                        {QUARTER_OPTIONS.filter(o => o.value !== splitTarget.currentQ).map(o => (
                          <button
                            key={o.value}
                            onClick={() => setSplitNewQ(o.value)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${splitNewQ === o.value ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={confirmSplit}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-yellow-500 hover:bg-yellow-400 text-black transition-colors"
                        >
                          Q{splitTarget.currentQ} → {splitNewQ > 4 ? `OT${splitNewQ - 4}` : `Q${splitNewQ}`} 변경
                        </button>
                        <button
                          onClick={() => setSplitTarget(null)}
                          className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition-colors"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {!selectedGId && (
        <div className="text-center py-16 text-gray-500">대회와 경기를 선택하면 게임 로그가 표시됩니다</div>
      )}
    </div>
  )
}
