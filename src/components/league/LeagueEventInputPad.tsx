'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { useGameStore } from '@/store/gameStore'
import { useLineupStore } from '@/store/lineupStore'
import type { LeaguePlayer } from '@/types/league'

interface Props {
  leagueId: string
  gameId: string
  players: LeaguePlayer[]
  leagueHeaders: Record<string, string>
  onEventSaved: () => void
}

type EventBtn = {
  type: string
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

function calcPoints(type: string, result: string): number {
  if (result !== 'made') return 0
  if (type === 'shot_3p') return 3
  if (['shot_2p_mid','shot_layup','shot_post'].includes(type)) return 2
  if (type === 'free_throw') return 1
  return 0
}

export default function LeagueEventInputPad({ leagueId, gameId, players, leagueHeaders, onEventSaved }: Props) {
  const { currentQuarter, getCurrentTimestamp } = useGameStore()
  const { onCourt } = useLineupStore()

  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [pendingShot, setPendingShot] = useState<EventBtn | null>(null)
  const [awaitingAssist, setAwaitingAssist] = useState(false)
  const [lastEventId, setLastEventId] = useState<string | null>(null)
  const [lastEventLabel, setLastEventLabel] = useState('')

  const onCourtPlayers = players.filter(p => onCourt.includes(p.id))
  const assistCandidates = onCourtPlayers.filter(p => p.id !== selectedPlayer)

  async function saveEvent(body: object): Promise<string | null> {
    const res = await fetch(`/api/leagues/${leagueId}/events`, {
      method: 'POST',
      headers: leagueHeaders,
      body: JSON.stringify(body),
    })
    if (!res.ok) { toast.error('저장 실패'); return null }
    const saved = await res.json()
    return saved.id
  }

  async function saveShot(result: 'made' | 'missed', assistId?: string) {
    if (!selectedPlayer || !pendingShot) return
    const pts = calcPoints(pendingShot.type, result)
    const id = await saveEvent({
      league_game_id: gameId,
      quarter: currentQuarter,
      video_timestamp: getCurrentTimestamp(),
      type: pendingShot.type,
      league_player_id: selectedPlayer,
      result,
      related_player_id: assistId ?? null,
      points: pts,
    })
    if (!id) return

    const pName = players.find(p => p.id === selectedPlayer)?.name ?? ''
    const assistP = assistId ? players.find(p => p.id === assistId) : null
    const mark = result === 'made' ? ' ✓' : ' ✗'
    const label = `${pName} — ${pendingShot.label}${mark}${assistP ? ` (A: ${assistP.name})` : ''} (Q${currentQuarter})`
    setLastEventId(id)
    setLastEventLabel(label)
    toast.success(`기록: ${label}`)
    setAwaitingAssist(false)
    if (pendingShot.type !== 'free_throw') setPendingShot(null)
    onEventSaved()
  }

  async function saveInstant(btn: EventBtn) {
    if (!selectedPlayer) return
    const id = await saveEvent({
      league_game_id: gameId,
      quarter: currentQuarter,
      video_timestamp: getCurrentTimestamp(),
      type: btn.type,
      league_player_id: selectedPlayer,
      result: null,
      related_player_id: null,
      points: 0,
    })
    if (!id) return
    const pName = players.find(p => p.id === selectedPlayer)?.name ?? ''
    const label = `${pName} — ${btn.label} (Q${currentQuarter})`
    setLastEventId(id)
    setLastEventLabel(label)
    toast.success(`기록: ${label}`)
    onEventSaved()
  }

  function handleResult(result: 'made' | 'missed') {
    if (!pendingShot) return
    if (result === 'missed' || !pendingShot.needsRelated) saveShot(result)
    else setAwaitingAssist(true)
  }

  async function undoLastEvent() {
    if (!lastEventId) return
    const res = await fetch(`/api/leagues/${leagueId}/events/${lastEventId}`, {
      method: 'DELETE',
      headers: leagueHeaders,
    })
    if (!res.ok) { toast.error('취소 실패'); return }
    toast(`↩ 취소: ${lastEventLabel}`)
    setLastEventId(null)
    setLastEventLabel('')
    onEventSaved()
  }

  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 px-2.5 py-1 rounded-lg bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-bold">
          Q{currentQuarter} 기록 중
        </span>
        {lastEventLabel && <span className="flex-1 text-xs text-gray-400 truncate">{lastEventLabel}</span>}
        <button
          onClick={undoLastEvent}
          disabled={!lastEventId}
          className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-800 border border-gray-700 text-gray-400 hover:text-orange-400 hover:border-orange-600 disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >↩ 취소</button>
      </div>

      {/* 선수 선택 */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">1. 선수 선택</p>
        <div className="grid grid-cols-5 gap-1">
          {onCourtPlayers.map(p => (
            <button
              key={p.id}
              onClick={() => { setSelectedPlayer(p.id); setPendingShot(null); setAwaitingAssist(false) }}
              className={`py-2 px-1 rounded-lg text-center text-xs font-medium transition-all cursor-pointer border ${
                selectedPlayer === p.id
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
              }`}
            >
              <div className="font-mono text-gray-400 text-[10px]">{p.number ?? '—'}</div>
              <div className="truncate">{p.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 이벤트 버튼 */}
      {selectedPlayer && !awaitingAssist && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">2. 이벤트 선택</p>
          {EVENT_GROUPS.map(group => (
            <div key={group.label}>
              <p className="text-[10px] text-gray-600 mb-1">{group.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.buttons.map(btn => (
                  <button
                    key={btn.type}
                    onClick={() => {
                      if (btn.needsResult) { setPendingShot(btn); setAwaitingAssist(false) }
                      else saveInstant(btn)
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all active:scale-95 cursor-pointer ${btn.color} ${pendingShot?.type === btn.type ? 'ring-2 ring-white/50 scale-105' : ''}`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* O/X 결과 */}
      {pendingShot && !awaitingAssist && (
        <div>
          <p className="text-xs text-gray-400 mb-1.5">3. 결과 선택 — {pendingShot.label}</p>
          <div className="flex gap-2">
            <button onClick={() => handleResult('made')}   className="flex-1 py-3 rounded-xl bg-green-700 hover:bg-green-600 text-white font-bold text-lg active:scale-95 cursor-pointer">O</button>
            <button onClick={() => handleResult('missed')} className="flex-1 py-3 rounded-xl bg-red-700 hover:bg-red-600 text-white font-bold text-lg active:scale-95 cursor-pointer">X</button>
          </div>
        </div>
      )}

      {/* 어시스트 */}
      {awaitingAssist && (
        <div>
          <p className="text-xs text-gray-400 mb-1.5">어시스트 선수 (없으면 건너뜀)</p>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => saveShot('made')} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 cursor-pointer">없음</button>
            {assistCandidates.map(p => (
              <button key={p.id} onClick={() => saveShot('made', p.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-800 text-blue-200 hover:bg-blue-700 cursor-pointer">
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
