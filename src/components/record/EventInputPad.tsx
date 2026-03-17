'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useGameStore } from '@/store/gameStore'
import { useLineupStore } from '@/store/lineupStore'
import type { Player, EventType } from '@/types/database'

interface Props {
  players: Player[]
  onEventSaved: () => void
}

const EVENT_BUTTONS: { type: EventType; label: string; color: string; needsResult?: boolean; needsRelated?: boolean }[] = [
  { type: 'shot_3p',     label: '3P',    color: 'bg-yellow-600 hover:bg-yellow-500', needsResult: true, needsRelated: true },
  { type: 'shot_2p_mid', label: '미들슛',   color: 'bg-blue-600 hover:bg-blue-500', needsResult: true, needsRelated: true },
  { type: 'shot_layup',  label: '레이업', color: 'bg-blue-700 hover:bg-blue-600', needsResult: true, needsRelated: true },
  { type: 'shot_post',   label: '골밑슛', color: 'bg-violet-700 hover:bg-violet-600', needsResult: true, needsRelated: true },
  { type: 'free_throw',  label: 'FT',    color: 'bg-cyan-600 hover:bg-cyan-500', needsResult: true },
  { type: 'oreb',        label: 'OR',    color: 'bg-green-700 hover:bg-green-600' },
  { type: 'dreb',        label: 'DR',    color: 'bg-green-600 hover:bg-green-500' },
  { type: 'steal',       label: 'STL',   color: 'bg-purple-600 hover:bg-purple-500' },
  { type: 'block',       label: 'BLK',   color: 'bg-indigo-600 hover:bg-indigo-500' },
  { type: 'turnover',    label: 'TOV',   color: 'bg-red-700 hover:bg-red-600' },
  { type: 'foul',        label: 'PF',    color: 'bg-red-600 hover:bg-red-500' },
]

export default function EventInputPad({ players, onEventSaved }: Props) {
  const { currentGame, currentQuarter, getCurrentTimestamp } = useGameStore()
  const { onCourt } = useLineupStore()
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<(typeof EVENT_BUTTONS)[0] | null>(null)
  const [relatedPlayerId, setRelatedPlayerId] = useState<string>('')

  const onCourtPlayers = players.filter(p => onCourt.includes(p.id))
  const otherPlayers = players.filter(p => !onCourt.includes(p.id))

  async function saveEvent(result?: 'made' | 'missed') {
    if (!currentGame || !selectedPlayer || !selectedEvent) return
    const ts = getCurrentTimestamp()
    const body = {
      game_id: currentGame.id,
      quarter: currentQuarter,
      video_timestamp: ts,
      type: selectedEvent.type,
      player_id: selectedPlayer,
      result: result || null,
      related_player_id: relatedPlayerId || null,
    }
    const res = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) {
      toast.success(`기록: ${onCourtPlayers.find(p => p.id === selectedPlayer)?.name || ''} — ${selectedEvent.label}${result ? (result === 'made' ? ' ✓' : ' ✗') : ''}`)
      setSelectedEvent(null)
      setRelatedPlayerId('')
      onEventSaved()
    }
  }

  if (!currentGame) {
    return <div className="flex items-center justify-center h-40 text-gray-500 text-sm">경기를 선택하세요</div>
  }

  return (
    <div className="space-y-4">
      {/* 선수 선택 */}
      <div>
        <p className="text-xs text-gray-400 mb-2">1. 선수 선택</p>
        <div className="grid grid-cols-5 gap-1">
          {onCourtPlayers.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedPlayer(p.id)}
              className={`py-2 rounded-lg text-sm font-bold transition-colors ${
                selectedPlayer === p.id
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <div>{p.number}</div>
              <div className="text-xs font-normal truncate px-1">{p.name}</div>
            </button>
          ))}
        </div>
        {otherPlayers.length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-gray-500 cursor-pointer">벤치 선수 보기</summary>
            <div className="grid grid-cols-5 gap-1 mt-1 opacity-60">
              {otherPlayers.map(p => (
                <button key={p.id} onClick={() => setSelectedPlayer(p.id)}
                  className={`py-2 rounded-lg text-sm font-bold transition-colors ${selectedPlayer === p.id ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
                  <div>{p.number}</div>
                  <div className="text-xs font-normal truncate px-1">{p.name}</div>
                </button>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* 이벤트 선택 */}
      <div>
        <p className="text-xs text-gray-400 mb-2">2. 이벤트</p>
        <div className="grid grid-cols-5 gap-1">
          {EVENT_BUTTONS.map(btn => (
            <button
              key={btn.type}
              disabled={!selectedPlayer}
              onClick={() => setSelectedEvent(btn)}
              className={`py-2 px-1 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 ${
                selectedEvent?.type === btn.type ? 'ring-2 ring-white ' + btn.color : btn.color + ' text-white'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* 어시스트 선수 선택 (슈팅 이벤트만) */}
      {selectedEvent?.needsRelated && (
        <div>
          <p className="text-xs text-gray-400 mb-2">어시스트 선수 (선택)</p>
          <Select value={relatedPlayerId} onValueChange={v => setRelatedPlayerId(v ?? '')}>
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-9">
              <SelectValue placeholder="없음">
                {relatedPlayerId
                  ? (() => { const p = onCourtPlayers.find(pp => pp.id === relatedPlayerId); return p ? `${p.number}번 ${p.name}` : '없음' })()
                  : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700 text-white">
              <SelectItem value="">없음</SelectItem>
              {onCourtPlayers.filter(p => p.id !== selectedPlayer).map(p => (
                <SelectItem key={p.id} value={p.id}>{p.number}번 {p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 결과 / 저장 버튼 */}
      {selectedEvent?.needsResult ? (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => saveEvent('made')} disabled={!selectedPlayer || !selectedEvent}
            className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 text-base">
            ✓ 성공
          </Button>
          <Button onClick={() => saveEvent('missed')} disabled={!selectedPlayer || !selectedEvent}
            className="bg-red-700 hover:bg-red-600 text-white font-bold py-3 text-base">
            ✗ 실패
          </Button>
        </div>
      ) : (
        <Button onClick={() => saveEvent()} disabled={!selectedPlayer || !selectedEvent}
          className="w-full bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 text-base">
          기록 저장
        </Button>
      )}
    </div>
  )
}
