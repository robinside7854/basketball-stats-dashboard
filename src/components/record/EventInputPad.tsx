'use client'
import { useState } from 'react'
import { toast } from 'sonner'
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
  needsResult?: boolean  // 슛팅 — O/X 분할 표시
  needsRelated?: boolean // 어시스트 가능
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
  const [pendingShot, setPendingShot] = useState<EventBtn | null>(null)
  const [awaitingAssist, setAwaitingAssist] = useState(false)
  const [lastEventId, setLastEventId] = useState<string | null>(null)
  const [lastEventLabel, setLastEventLabel] = useState<string>('')

  const onCourtPlayers = players.filter(p => onCourt.includes(p.id))
  const assistCandidates = onCourtPlayers.filter(p => p.id !== selectedPlayer)

  // ── 슛팅 저장 ───────────────────────────────────────────────────
  async function saveShot(result: 'made' | 'missed', assistId?: string) {
    if (!currentGame || !selectedPlayer || !pendingShot) return
    const body = {
      game_id: currentGame.id,
      quarter: currentQuarter,
      video_timestamp: getCurrentTimestamp(),
      type: pendingShot.type,
      player_id: selectedPlayer,
      result,
      related_player_id: assistId ?? null,
    }
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) { toast.error('저장 실패'); return }
    const saved = await res.json()

    const playerName = players.find(p => p.id === selectedPlayer)?.name ?? ''
    const assistPlayer = assistId ? players.find(p => p.id === assistId) : null
    const mark = result === 'made' ? ' ✓' : ' ✗'
    const label = `${playerName} — ${pendingShot.label}${mark}${assistPlayer ? ` (A: ${assistPlayer.name})` : ''} (Q${currentQuarter})`
    setLastEventId(saved.id)
    setLastEventLabel(label)
    toast.success(`기록: ${label}`)

    setAwaitingAssist(false)
    if (pendingShot.type !== 'free_throw') setPendingShot(null) // FT는 연속 모드 유지
    onEventSaved()
  }

  // ── 즉시 저장 (리바운드·기타) ────────────────────────────────────
  async function saveInstant(btn: EventBtn) {
    if (!currentGame || !selectedPlayer) return
    const body = {
      game_id: currentGame.id,
      quarter: currentQuarter,
      video_timestamp: getCurrentTimestamp(),
      type: btn.type,
      player_id: selectedPlayer,
      result: null,
      related_player_id: null,
    }
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) { toast.error('저장 실패'); return }
    const saved = await res.json()
    const playerName = players.find(p => p.id === selectedPlayer)?.name ?? ''
    const label = `${playerName} — ${btn.label} (Q${currentQuarter})`
    setLastEventId(saved.id)
    setLastEventLabel(label)
    toast.success(`기록: ${label}`)
    onEventSaved()
  }

  // ── O/X 클릭 ────────────────────────────────────────────────────
  function handleResult(result: 'made' | 'missed') {
    if (!pendingShot) return
    if (result === 'missed' || !pendingShot.needsRelated) {
      // 실패 or 어시스트 없는 슛(FT) → 즉시 저장
      saveShot(result)
    } else {
      // 성공 + 어시스트 가능 → 어시스트 피커 표시
      setAwaitingAssist(true)
    }
  }

  // ── 어시스트 선택 후 저장 ─────────────────────────────────────────
  function handleAssist(assistId: string | null) {
    saveShot('made', assistId ?? undefined)
  }

  // ── Undo ────────────────────────────────────────────────────────
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

      {/* ── 헤더: 쿼터 + 마지막 기록 + Undo ── */}
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
        <div className="grid grid-cols-5 gap-1">
          {onCourtPlayers.map(p => (
            <button
              key={p.id}
              onClick={() => {
                setSelectedPlayer(p.id)
                setPendingShot(null)
                setAwaitingAssist(false)
              }}
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

      {/* ── 2. 이벤트 ── */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">2. 이벤트</p>
        <div className="space-y-2">
          {EVENT_GROUPS.map(group => (
            <div key={group.label}>
              <p className="text-xs text-gray-600 mb-1">{group.label}</p>

              <div className={`grid gap-1 ${
                group.label === '슈팅'    ? 'grid-cols-5' :
                group.label === '리바운드' ? 'grid-cols-2' : 'grid-cols-4'
              }`}>
                {group.buttons.map(btn => {
                  if (btn.needsResult) {
                    // ── 슛팅 버튼: 선택 시 O/X 분할 ──
                    const isActive = pendingShot?.type === btn.type
                    return (
                      <div key={btn.type}>
                        {isActive ? (
                          // 분할 O/X 버튼
                          <div className="flex rounded-lg overflow-hidden h-9 gap-px">
                            <button
                              onClick={() => handleResult('made')}
                              className="flex-1 bg-green-600 hover:bg-green-500 active:bg-green-400 text-white font-black text-lg flex items-center justify-center transition-colors"
                            >
                              O
                            </button>
                            <button
                              onClick={() => handleResult('missed')}
                              className="flex-1 bg-red-700 hover:bg-red-600 active:bg-red-500 text-white font-black text-lg flex items-center justify-center transition-colors"
                            >
                              X
                            </button>
                          </div>
                        ) : (
                          // 일반 버튼
                          <button
                            disabled={!selectedPlayer || awaitingAssist}
                            onClick={() => { setPendingShot(btn); setAwaitingAssist(false) }}
                            className={`w-full py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 text-white ${btn.color}`}
                          >
                            {btn.label}
                          </button>
                        )}
                      </div>
                    )
                  } else {
                    // ── 즉시 저장 버튼 (리바운드·기타) ──
                    return (
                      <button
                        key={btn.type}
                        disabled={!selectedPlayer}
                        onClick={() => saveInstant(btn)}
                        className={`py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-30 text-white active:scale-95 ${btn.color}`}
                      >
                        {btn.label}
                      </button>
                    )
                  }
                })}
              </div>

              {/* ── 어시스트 피커 (슛팅 그룹 바로 아래) ── */}
              {group.label === '슈팅' && awaitingAssist && (
                <div className="mt-2 px-3 py-2.5 rounded-xl bg-gray-800/80 border border-green-700/40">
                  <p className="text-xs text-green-400 font-medium mb-2">
                    어시스트 <span className="text-gray-500 font-normal">· 없으면 스킵</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => handleAssist(null)}
                      className="py-1.5 px-3 rounded-lg text-xs font-medium bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white transition-colors"
                    >
                      없음
                    </button>
                    {assistCandidates.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleAssist(p.id)}
                        className="py-1.5 px-2.5 rounded-lg text-xs font-bold bg-gray-700 text-white hover:bg-blue-600 active:bg-blue-500 transition-colors"
                      >
                        <span className="text-blue-300">#{p.number}</span> {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* FT 연속 모드 안내 */}
      {pendingShot?.type === 'free_throw' && lastEventLabel.includes('FT') && (
        <p className="text-xs text-cyan-400/70 text-center">FT 연속 입력 중 · 다른 이벤트를 선택하면 종료</p>
      )}
    </div>
  )
}
