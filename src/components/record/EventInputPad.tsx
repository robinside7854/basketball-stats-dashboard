'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useGameStore } from '@/store/gameStore'
import { useLineupStore } from '@/store/lineupStore'
import type { Player, EventType } from '@/types/database'

interface Props {
  players: Player[]
  onEventSaved: () => void
}

type EventBtn = {
  type: EventType
  label: string
  color: string
  needsResult?: boolean
  needsRelated?: boolean
}

const EVENT_GROUPS: { label: string; buttons: EventBtn[] }[] = [
  {
    label: '슈팅',
    buttons: [
      { type: 'shot_3p',     label: '3P',    color: 'bg-yellow-600 hover:bg-yellow-500', needsResult: true, needsRelated: true },
      { type: 'shot_2p_mid', label: '미들슛', color: 'bg-blue-600 hover:bg-blue-500',    needsResult: true, needsRelated: true },
      { type: 'shot_layup',  label: '레이업', color: 'bg-blue-700 hover:bg-blue-600',    needsResult: true, needsRelated: true },
      { type: 'shot_post',   label: '골밑슛', color: 'bg-violet-700 hover:bg-violet-600',needsResult: true, needsRelated: true },
      { type: 'free_throw',  label: 'FT',    color: 'bg-cyan-600 hover:bg-cyan-500',     needsResult: true },
    ],
  },
  {
    label: '리바운드',
    buttons: [
      { type: 'oreb', label: 'OR', color: 'bg-green-700 hover:bg-green-600' },
      { type: 'dreb', label: 'DR', color: 'bg-green-600 hover:bg-green-500' },
    ],
  },
  {
    label: '기타',
    buttons: [
      { type: 'steal',    label: 'STL', color: 'bg-purple-600 hover:bg-purple-500' },
      { type: 'block',    label: 'BLK', color: 'bg-indigo-600 hover:bg-indigo-500' },
      { type: 'turnover', label: 'TOV', color: 'bg-red-700 hover:bg-red-600' },
      { type: 'foul',     label: 'PF',  color: 'bg-red-600 hover:bg-red-500' },
    ],
  },
]

export default function EventInputPad({ players, onEventSaved }: Props) {
  const { currentGame, currentQuarter, getCurrentTimestamp } = useGameStore()
  const { onCourt } = useLineupStore()

  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<EventBtn | null>(null)
  const [relatedPlayerId, setRelatedPlayerId] = useState<string>('')
  const [lastEventId, setLastEventId] = useState<string | null>(null)
  const [lastEventLabel, setLastEventLabel] = useState<string>('')

  const onCourtPlayers = players.filter(p => onCourt.includes(p.id))
  const assistCandidates = onCourtPlayers.filter(p => p.id !== selectedPlayer)

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
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) { toast.error('저장 실패'); return }

    const saved = await res.json()
    const playerName = players.find(p => p.id === selectedPlayer)?.name ?? ''
    const resultMark = result === 'made' ? ' ✓' : result === 'missed' ? ' ✗' : ''
    const label = `${playerName} — ${selectedEvent.label}${resultMark} (Q${currentQuarter})`

    setLastEventId(saved.id)
    setLastEventLabel(label)
    toast.success(`기록: ${label}`)

    // FT 연속 모드: 선수 + FT 이벤트 유지
    if (selectedEvent.type === 'free_throw') {
      setRelatedPlayerId('')
    } else {
      setSelectedEvent(null)
      setRelatedPlayerId('')
    }
    onEventSaved()
  }

  async function undoLastEvent() {
    if (!lastEventId) return
    const res = await fetch(`/api/events/${lastEventId}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('취소 실패'); return }
    toast(`↩ 취소: ${lastEventLabel}`)
    setLastEventId(null)
    setLastEventLabel('')
    onEventSaved()
  }

  if (!currentGame) {
    return <div className="flex items-center justify-center h-40 text-gray-500 text-sm">경기를 선택하세요</div>
  }

  return (
    <div className="space-y-3">

      {/* ── 헤더: 쿼터 배지 + 마지막 기록 + Undo ── */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 px-2.5 py-1 rounded-lg bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-bold">
          Q{currentQuarter} 기록 중
        </span>
        {lastEventLabel && (
          <span className="flex-1 text-xs text-gray-400 truncate">{lastEventLabel}</span>
        )}
        <button
          onClick={undoLastEvent}
          disabled={!lastEventId}
          title="마지막 기록 취소"
          className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-800 border border-gray-700 text-gray-400 hover:text-orange-400 hover:border-orange-600 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        >
          ↩ 취소
        </button>
      </div>

      {/* ── 1. 선수 선택 ── */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">1. 선수 선택</p>

        {/* 코트 */}
        <div className="grid grid-cols-5 gap-1">
          {onCourtPlayers.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedPlayer(p.id)}
              className={`py-2 rounded-lg text-sm font-bold transition-colors ${
                selectedPlayer === p.id
                  ? 'bg-blue-500 text-white ring-2 ring-blue-300'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <div>{p.number}</div>
              <div className="text-xs font-normal truncate px-1">{p.name}</div>
            </button>
          ))}
        </div>

      </div>

      {/* ── 2. 이벤트 (그룹핑) ── */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">2. 이벤트</p>
        <div className="space-y-2">
          {EVENT_GROUPS.map(group => (
            <div key={group.label}>
              <p className="text-xs text-gray-600 mb-1">{group.label}</p>
              <div className={`grid gap-1 ${
                group.label === '슈팅' ? 'grid-cols-5' :
                group.label === '리바운드' ? 'grid-cols-2' : 'grid-cols-4'
              }`}>
                {group.buttons.map(btn => (
                  <button
                    key={btn.type}
                    disabled={!selectedPlayer}
                    onClick={() => {
                      setSelectedEvent(btn)
                      // FT 이외 선택 시 FT 연속 모드 종료
                      if (btn.type !== 'free_throw') setRelatedPlayerId('')
                    }}
                    className={`py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 text-white ${
                      selectedEvent?.type === btn.type
                        ? 'ring-2 ring-white ' + btn.color
                        : btn.color
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FT 연속 모드 안내 */}
      {selectedEvent?.type === 'free_throw' && lastEventLabel.includes('FT') && (
        <p className="text-xs text-cyan-400/70 text-center">FT 연속 입력 중 · 다른 이벤트를 선택하면 종료</p>
      )}

      {/* ── 3. 어시스트 선수 (인라인 버튼) ── */}
      {selectedEvent?.needsRelated && (
        <div>
          <p className="text-xs text-gray-400 mb-1.5">어시스트 <span className="text-gray-600">(선택)</span></p>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setRelatedPlayerId('')}
              className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                relatedPlayerId === ''
                  ? 'bg-gray-600 text-white ring-1 ring-gray-400'
                  : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
              }`}
            >
              없음
            </button>
            {assistCandidates.map(p => (
              <button
                key={p.id}
                onClick={() => setRelatedPlayerId(relatedPlayerId === p.id ? '' : p.id)}
                className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-colors ${
                  relatedPlayerId === p.id
                    ? 'bg-blue-500 text-white ring-1 ring-blue-300'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {p.number}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 4. 결과 / 저장 ── */}
      {selectedEvent?.needsResult ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => saveEvent('made')}
            disabled={!selectedPlayer || !selectedEvent}
            className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 text-base"
          >
            ✓ 성공
          </Button>
          <Button
            onClick={() => saveEvent('missed')}
            disabled={!selectedPlayer || !selectedEvent}
            className="bg-red-700 hover:bg-red-600 text-white font-bold py-3 text-base"
          >
            ✗ 실패
          </Button>
        </div>
      ) : (
        <Button
          onClick={() => saveEvent()}
          disabled={!selectedPlayer || !selectedEvent}
          className="w-full bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 text-base"
        >
          기록 저장
        </Button>
      )}
    </div>
  )
}
