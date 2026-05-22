'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { useGameStore } from '@/store/gameStore'
import { useLineupStore } from '@/store/lineupStore'
import type { LeaguePlayer } from '@/types/league'

interface MinRow { id: string; league_player_id: string; league_game_id: string; out_time: number | null }

interface Props {
  leagueId: string
  gameId: string
  players: LeaguePlayer[]
  minutes: MinRow[]
  leagueHeaders: Record<string, string>
  onSubstitution: () => void
}

export default function LeagueSubstitutionPanel({ leagueId, gameId, players, minutes, leagueHeaders, onSubstitution }: Props) {
  const { getCurrentTimestamp } = useGameStore()
  const { onCourt, addPlayer, removePlayer } = useLineupStore()

  // 드래그 상태
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // 탭 모드 상태
  const [tapMode, setTapMode] = useState(false)  // 기본값: 드래그 모드
  const [tapOut, setTapOut] = useState<string | null>(null)
  const [tapIn, setTapIn] = useState<string | null>(null)

  // 공통: 교체 확인 대기
  const [pendingSwap, setPendingSwap] = useState<{ outId: string; inId: string } | null>(null)

  const onCourtPlayers = players.filter(p => onCourt.includes(p.id))
  const benchPlayers = players.filter(p => !onCourt.includes(p.id))

  async function executeSubstitution(outId: string, inId: string) {
    const ts = getCurrentTimestamp()
    const openInterval = minutes.find(m => m.league_player_id === outId && m.league_game_id === gameId && m.out_time == null)
    if (openInterval) {
      await fetch(`/api/leagues/${leagueId}/minutes`, {
        method: 'PATCH',
        headers: leagueHeaders,
        body: JSON.stringify({ id: openInterval.id, out_time: ts }),
      })
    }
    await fetch(`/api/leagues/${leagueId}/minutes`, {
      method: 'POST',
      headers: leagueHeaders,
      body: JSON.stringify({ league_game_id: gameId, league_player_id: inId, quarter: 1, in_time: ts }),
    })
    await Promise.all([
      fetch(`/api/leagues/${leagueId}/events`, { method: 'POST', headers: leagueHeaders, body: JSON.stringify({ league_game_id: gameId, quarter: 1, video_timestamp: ts, type: 'sub_out', league_player_id: outId, points: 0 }) }),
      fetch(`/api/leagues/${leagueId}/events`, { method: 'POST', headers: leagueHeaders, body: JSON.stringify({ league_game_id: gameId, quarter: 1, video_timestamp: ts, type: 'sub_in', league_player_id: inId, points: 0 }) }),
    ])
    removePlayer(outId)
    addPlayer(inId)
    const outName = players.find(p => p.id === outId)?.name ?? ''
    const inName = players.find(p => p.id === inId)?.name ?? ''
    toast.success(`교체: ${outName} OUT → ${inName} IN`)
    onSubstitution()
  }

  // ── 탭 모드 핸들러 ──
  function handleTapSelect(id: string, isOnCourt: boolean) {
    if (isOnCourt) {
      if (tapOut === id) { setTapOut(null); return }
      setTapOut(id)
      if (tapIn) {
        setPendingSwap({ outId: id, inId: tapIn })
        setTapOut(null); setTapIn(null)
      }
    } else {
      if (tapIn === id) { setTapIn(null); return }
      setTapIn(id)
      if (tapOut) {
        setPendingSwap({ outId: tapOut, inId: id })
        setTapOut(null); setTapIn(null)
      }
    }
  }

  function resetTap() { setTapOut(null); setTapIn(null) }

  // ── 드래그 핸들러 ──
  function handleDragStart(e: React.DragEvent, id: string) { setDraggingId(id); e.dataTransfer.effectAllowed = 'move' }
  function handleDragEnd() { setDraggingId(null); setDragOverId(null) }
  function handleDragOver(e: React.DragEvent, id: string) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverId(id) }
  function handleDragLeave() { setDragOverId(null) }
  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault(); setDragOverId(null)
    if (!draggingId || draggingId === targetId) { setDraggingId(null); return }
    const draggingOnCourt = onCourt.includes(draggingId)
    const targetOnCourt = onCourt.includes(targetId)
    if (draggingOnCourt && !targetOnCourt) setPendingSwap({ outId: draggingId, inId: targetId })
    else if (!draggingOnCourt && targetOnCourt) setPendingSwap({ outId: targetId, inId: draggingId })
    setDraggingId(null)
  }

  function confirmSwap() {
    if (!pendingSwap) return
    executeSubstitution(pendingSwap.outId, pendingSwap.inId)
    setPendingSwap(null)
  }

  const outName = pendingSwap ? players.find(p => p.id === pendingSwap.outId)?.name : null
  const inName = pendingSwap ? players.find(p => p.id === pendingSwap.inId)?.name : null

  return (
    <div className="space-y-2 select-none">
      {/* 헤더: 제목 + 모드 토글 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 font-medium">선수 교체</p>
        <div className="flex rounded-lg overflow-hidden border border-gray-700">
          <button
            onClick={() => { setTapMode(false); resetTap() }}
            className={`px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${!tapMode ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            드래그
          </button>
          <button
            onClick={() => { setTapMode(true); resetTap() }}
            className={`px-2.5 py-1 text-xs font-medium transition-colors border-l border-gray-700 cursor-pointer ${tapMode ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            탭 선택
          </button>
        </div>
      </div>

      {/* 탭 모드 안내 */}
      {tapMode && (
        <div className="text-[11px] text-gray-500 text-center">
          {!tapOut && !tapIn && 'OUT 선수(코트) 또는 IN 선수(벤치)를 먼저 선택하세요'}
          {tapOut && !tapIn && <span className="text-red-400">OUT: {players.find(p => p.id === tapOut)?.name} → 벤치에서 IN 선수 선택</span>}
          {!tapOut && tapIn && <span className="text-green-400">IN: {players.find(p => p.id === tapIn)?.name} → 코트에서 OUT 선수 선택</span>}
        </div>
      )}

      {/* 드래그 모드 안내 */}
      {!tapMode && (
        <p className="text-[11px] text-gray-500 text-center">
          코트 ↔ 벤치 선수를 드래그해서 서로 끌어놓으세요
        </p>
      )}

      <div>
        <p className="text-[10px] text-red-400 mb-1 font-bold">코트 ({onCourtPlayers.length}명)</p>
        <div className="flex flex-wrap gap-1.5">
          {onCourtPlayers.map(p => {
            const isTapSelected = tapOut === p.id
            return (
              <div
                key={p.id}
                draggable={!tapMode}
                onClick={() => tapMode && handleTapSelect(p.id, true)}
                onDragStart={!tapMode ? e => handleDragStart(e, p.id) : undefined}
                onDragEnd={!tapMode ? handleDragEnd : undefined}
                onDragOver={!tapMode ? e => handleDragOver(e, p.id) : undefined}
                onDragLeave={!tapMode ? handleDragLeave : undefined}
                onDrop={!tapMode ? e => handleDrop(e, p.id) : undefined}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all
                  ${tapMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}
                  ${tapMode && isTapSelected ? 'bg-red-600 border-red-400 text-white scale-105 ring-1 ring-red-300' : ''}
                  ${!tapMode && draggingId === p.id ? 'opacity-40' : ''}
                  ${!tapMode && dragOverId === p.id && draggingId !== p.id ? 'bg-blue-600 border-blue-400 text-white scale-105' : ''}
                  ${(!tapMode && draggingId !== p.id && dragOverId !== p.id) || (tapMode && !isTapSelected) ? 'bg-red-900/40 border-red-800 text-white hover:bg-red-900/60' : ''}
                `}
              >
                {p.number != null && <span className="text-red-300 font-mono mr-1 text-xs">#{p.number}</span>}
                {p.name}
              </div>
            )
          })}
          {onCourtPlayers.length === 0 && <p className="text-xs text-gray-600 italic">없음</p>}
        </div>
      </div>

      <div>
        <p className="text-[10px] text-green-400 mb-1 font-bold">벤치 ({benchPlayers.length}명)</p>
        <div className="flex flex-wrap gap-1.5">
          {benchPlayers.map(p => {
            const isTapSelected = tapIn === p.id
            return (
              <div
                key={p.id}
                draggable={!tapMode}
                onClick={() => tapMode && handleTapSelect(p.id, false)}
                onDragStart={!tapMode ? e => handleDragStart(e, p.id) : undefined}
                onDragEnd={!tapMode ? handleDragEnd : undefined}
                onDragOver={!tapMode ? e => handleDragOver(e, p.id) : undefined}
                onDragLeave={!tapMode ? handleDragLeave : undefined}
                onDrop={!tapMode ? e => handleDrop(e, p.id) : undefined}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all
                  ${tapMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}
                  ${tapMode && isTapSelected ? 'bg-green-600 border-green-400 text-white scale-105 ring-1 ring-green-300' : ''}
                  ${!tapMode && draggingId === p.id ? 'opacity-40' : ''}
                  ${!tapMode && dragOverId === p.id && draggingId !== p.id ? 'bg-blue-600 border-blue-400 text-white scale-105' : ''}
                  ${(!tapMode && draggingId !== p.id && dragOverId !== p.id) || (tapMode && !isTapSelected) ? 'bg-green-900/40 border-green-800 text-white hover:bg-green-900/60' : ''}
                `}
              >
                {p.number != null && <span className="text-green-300 font-mono mr-1 text-xs">#{p.number}</span>}
                {p.name}
              </div>
            )
          })}
          {benchPlayers.length === 0 && <p className="text-xs text-gray-600 italic">없음</p>}
        </div>
      </div>

      {/* 교체 확인 모달 */}
      {pendingSwap && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setPendingSwap(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-xs w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-white font-semibold text-center mb-4">교체하시겠습니까?</p>
            <div className="flex items-center justify-center gap-3 mb-5">
              <span className="bg-red-900/60 border border-red-700 px-3 py-1.5 rounded-lg text-sm text-red-300 font-medium">{outName} OUT</span>
              <span className="text-gray-400">↔</span>
              <span className="bg-green-900/60 border border-green-700 px-3 py-1.5 rounded-lg text-sm text-green-300 font-medium">{inName} IN</span>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPendingSwap(null)} className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors cursor-pointer">취소</button>
              <button onClick={confirmSwap} className="flex-1 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-sm font-bold transition-colors cursor-pointer">교체</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
