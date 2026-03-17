'use client'
import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useGameStore } from '@/store/gameStore'
import { formatTimestamp } from '@/lib/youtube/utils'
import { EVENT_LABELS } from '@/types/database'
import type { Tournament, Game, GameEvent } from '@/types/database'

const EVENT_ICONS: Record<string, string> = {
  shot_3p: '🟡', shot_2p_mid: '🔵', shot_2p_drive: '🟣', free_throw: '⚪',
  oreb: '🟢', dreb: '🟢', assist: '🔵', steal: '💚', block: '💜',
  turnover: '🔴', foul: '🟠', opp_score: '❌',
  sub_in: '⬆️', sub_out: '⬇️', quarter_start: '▶️', quarter_end: '⏹️',
}

export default function GameLogPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [selectedTId, setSelectedTId] = useState('')
  const [selectedGId, setSelectedGId] = useState('')
  const [events, setEvents] = useState<GameEvent[]>([])
  const [filterPlayer, setFilterPlayer] = useState('')
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const { seekTo } = useGameStore()

  useEffect(() => { fetch('/api/tournaments').then(r => r.json()).then(setTournaments) }, [])
  useEffect(() => {
    if (!selectedTId) return
    fetch(`/api/games?tournamentId=${selectedTId}`).then(r => r.json()).then(setGames)
  }, [selectedTId])
  useEffect(() => {
    if (!selectedGId) return
    const g = games.find(g => g.id === selectedGId) || null
    setSelectedGame(g)
    fetchEvents()
  }, [selectedGId, games])

  async function fetchEvents() {
    const data = await fetch(`/api/events?gameId=${selectedGId}`).then(r => r.json())
    setEvents(data)
  }

  async function deleteEvent(id: string) {
    await fetch(`/api/events/${id}`, { method: 'DELETE' })
    toast.success('이벤트 삭제됨'); fetchEvents()
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
                <div key={e.id}
                  className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-gray-900 transition-colors group">
                  {/* 타임코드 */}
                  <button
                    onClick={() => e.video_timestamp != null && seekTo(e.video_timestamp)}
                    className="text-blue-400 hover:text-blue-300 text-xs font-mono w-14 shrink-0 text-right"
                    title="클릭 시 영상 해당 구간으로 이동"
                  >
                    {e.video_timestamp != null ? formatTimestamp(e.video_timestamp) : '--:--'}
                  </button>
                  {/* 아이콘 */}
                  <span className="text-sm">{EVENT_ICONS[e.type] || '•'}</span>
                  {/* 내용 */}
                  <div className="flex-1 text-sm">
                    {e.player && <span className="font-medium text-white">[{e.player.number}] {e.player.name}</span>}
                    {' '}
                    <span className="text-gray-300">{EVENT_LABELS[e.type]}</span>
                    {e.result && <span className={`ml-2 font-bold ${e.result === 'made' ? 'text-green-400' : 'text-red-400'}`}>{e.result === 'made' ? '✓' : '✗'}</span>}
                    {e.related_player && <span className="text-gray-500 text-xs ml-2">(어시스트: {e.related_player.name})</span>}
                    {e.type === 'opp_score' && <span className="ml-2 text-red-400">+{e.points}점</span>}
                  </div>
                  {/* 삭제 */}
                  <button onClick={() => deleteEvent(e.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-400 p-1">
                    <Trash2 size={14} />
                  </button>
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
