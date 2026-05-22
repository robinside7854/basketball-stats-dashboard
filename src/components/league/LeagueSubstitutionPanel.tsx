'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { useGameStore } from '@/store/gameStore'
import { useLineupStore } from '@/store/lineupStore'
import type { LeaguePlayer } from '@/types/league'

interface MinRow { id: string; league_player_id: string; league_game_id: string; out_time: number | null }
type RosterPlayer = LeaguePlayer & { team_id?: string; is_regular?: boolean }
type TeamRef = { id: string; name: string; color: string }

interface Props {
  leagueId: string
  gameId: string
  players: LeaguePlayer[]
  homeRoster: RosterPlayer[]
  awayRoster: RosterPlayer[]
  homeTeam?: TeamRef
  awayTeam?: TeamRef
  minutes: MinRow[]
  leagueHeaders: Record<string, string>
  onSubstitution: () => void | Promise<void>
}

const COURT_SIZE = 5

export default function LeagueSubstitutionPanel({
  leagueId, gameId,
  players, homeRoster, awayRoster, homeTeam, awayTeam,
  minutes, leagueHeaders, onSubstitution,
}: Props) {
  const { getCurrentTimestamp } = useGameStore()
  const { onCourt, addPlayer, removePlayer } = useLineupStore()

  // 드래그 상태
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)  // 빈 슬롯도 식별

  // 탭 모드 (보조)
  const [tapMode, setTapMode] = useState(false)
  const [tapOut, setTapOut] = useState<string | null>(null)

  const [pendingSwap, setPendingSwap] = useState<{
    outId?: string             // 코트에서 빠지는 선수 (없으면 빈 슬롯 채우기)
    inId: string               // 코트로 들어가는 선수
    targetTeamId: string       // 들어가는 선수의 새 팀 (코트 슬롯의 팀)
    swapTeamId?: string        // 빠지는 선수가 새로 받을 팀 (cross-team swap 시)
  } | null>(null)

  const homeIds = new Set(homeRoster.map(p => p.id))
  const awayIds = new Set(awayRoster.map(p => p.id))

  const homeOnCourt = homeRoster.filter(p => onCourt.includes(p.id))
  const homeBench = homeRoster.filter(p => !onCourt.includes(p.id))
  const awayOnCourt = awayRoster.filter(p => onCourt.includes(p.id))
  const awayBench = awayRoster.filter(p => !onCourt.includes(p.id))

  // 코트엔 있는데 어느 팀에도 속하지 않은 선수 (유령 상태)
  const unassignedOnCourt = players.filter(p =>
    onCourt.includes(p.id) && !homeIds.has(p.id) && !awayIds.has(p.id)
  )

  // 어느 팀에도 없는 선수 (벤치 후보 풀)
  const unassignedBench = players.filter(p =>
    !onCourt.includes(p.id) && !homeIds.has(p.id) && !awayIds.has(p.id)
  )

  function teamOf(playerId: string): string | null {
    if (homeIds.has(playerId)) return homeTeam?.id ?? null
    if (awayIds.has(playerId)) return awayTeam?.id ?? null
    return null
  }

  // ── 팀 배정 (이 경기 한정) ──
  async function assignToTeam(playerId: string, teamId: string) {
    return fetch(`/api/leagues/${leagueId}/games/${gameId}/irregular-players`, {
      method: 'POST',
      headers: leagueHeaders,
      body: JSON.stringify({ league_player_id: playerId, team_id: teamId }),
    })
  }

  // ── 분(minutes) + sub_in/sub_out 이벤트 처리 ──
  async function subOutMinutes(outId: string, ts: number) {
    const open = minutes.find(m => m.league_player_id === outId && m.league_game_id === gameId && m.out_time == null)
    if (open) {
      await fetch(`/api/leagues/${leagueId}/minutes`, {
        method: 'PATCH', headers: leagueHeaders,
        body: JSON.stringify({ id: open.id, out_time: ts }),
      })
    }
    await fetch(`/api/leagues/${leagueId}/events`, {
      method: 'POST', headers: leagueHeaders,
      body: JSON.stringify({ league_game_id: gameId, quarter: 1, video_timestamp: ts, type: 'sub_out', league_player_id: outId, points: 0 }),
    })
  }

  async function subInMinutes(inId: string, ts: number) {
    await fetch(`/api/leagues/${leagueId}/minutes`, {
      method: 'POST', headers: leagueHeaders,
      body: JSON.stringify({ league_game_id: gameId, league_player_id: inId, quarter: 1, in_time: ts }),
    })
    await fetch(`/api/leagues/${leagueId}/events`, {
      method: 'POST', headers: leagueHeaders,
      body: JSON.stringify({ league_game_id: gameId, quarter: 1, video_timestamp: ts, type: 'sub_in', league_player_id: inId, points: 0 }),
    })
  }

  // ── 실제 swap 실행 ──
  async function executeSwap(spec: NonNullable<typeof pendingSwap>) {
    const ts = getCurrentTimestamp()
    const { outId, inId, targetTeamId, swapTeamId } = spec

    // 1) 들어오는 선수의 팀 매칭이 다르면 배정
    if (teamOf(inId) !== targetTeamId) {
      await assignToTeam(inId, targetTeamId)
    }

    // 2) cross-team swap: 빠지는 선수도 팀 변경 (양쪽 코트 swap)
    if (swapTeamId && outId && teamOf(outId) !== swapTeamId) {
      await assignToTeam(outId, swapTeamId)
    }

    // 3) cross-team court swap이면 둘 다 코트에 있는 채로 끝 → sub 이벤트 없음
    if (swapTeamId && outId) {
      const outName = players.find(p => p.id === outId)?.name ?? ''
      const inName = players.find(p => p.id === inId)?.name ?? ''
      toast.success(`팀 교환: ${outName} ↔ ${inName}`)
    } else if (outId) {
      // 4) 일반 교체 (코트↔벤치)
      await Promise.all([subOutMinutes(outId, ts), subInMinutes(inId, ts)])
      removePlayer(outId)
      addPlayer(inId)
      const outName = players.find(p => p.id === outId)?.name ?? ''
      const inName = players.find(p => p.id === inId)?.name ?? ''
      toast.success(`교체: ${outName} OUT → ${inName} IN`)
    } else {
      // 5) 빈 슬롯 채우기 (벤치 → 코트, 나갈 선수 없음)
      await subInMinutes(inId, ts)
      addPlayer(inId)
      const inName = players.find(p => p.id === inId)?.name ?? ''
      toast.success(`투입: ${inName} IN`)
    }

    await onSubstitution()
  }

  function confirmSwap() {
    if (!pendingSwap) return
    executeSwap(pendingSwap)
    setPendingSwap(null)
  }

  // ── Drop 핸들러 ──
  // sourceId가 어떤 위치에서 왔는지 + targetSpec(어디로 가는지) 기반으로 swap 결정
  function handleDrop(sourceId: string, target: { kind: 'player' | 'empty'; id?: string; teamId?: string }) {
    if (!sourceId) return
    const sourceIsOnCourt = onCourt.includes(sourceId)
    const sourceTeamId = teamOf(sourceId)

    if (target.kind === 'empty') {
      // 빈 슬롯에 드롭
      if (!target.teamId) return
      if (sourceIsOnCourt) {
        // 코트에 있던 선수가 다른 팀 빈 슬롯으로 → 팀만 변경 (코트 유지)
        if (sourceTeamId === target.teamId) return
        setPendingSwap({ inId: sourceId, targetTeamId: target.teamId })
      } else {
        // 벤치에서 빈 슬롯으로 → 투입
        setPendingSwap({ inId: sourceId, targetTeamId: target.teamId })
      }
      return
    }

    // target.kind === 'player'
    const targetId = target.id!
    if (sourceId === targetId) return
    const targetIsOnCourt = onCourt.includes(targetId)
    const targetTeamId = teamOf(targetId)
    if (!targetTeamId) return  // 미배정 선수에게 드롭 — 일단 지원 안 함

    if (sourceIsOnCourt && targetIsOnCourt) {
      // 양쪽 모두 코트 → cross-team court swap (다른 팀끼리만 의미 있음)
      if (sourceTeamId === targetTeamId) return
      if (!sourceTeamId) return
      setPendingSwap({
        outId: targetId, swapTeamId: sourceTeamId,    // target은 source의 팀으로
        inId: sourceId, targetTeamId: targetTeamId,   // source는 target의 팀으로
      })
    } else if (!sourceIsOnCourt && targetIsOnCourt) {
      // 벤치 source → 코트 target (target out, source in to target's team)
      setPendingSwap({ outId: targetId, inId: sourceId, targetTeamId })
    } else if (sourceIsOnCourt && !targetIsOnCourt) {
      // 코트 source → 벤치 target (source out, target in to source's team)
      if (!sourceTeamId) return
      setPendingSwap({ outId: sourceId, inId: targetId, targetTeamId: sourceTeamId })
    }
    // 양쪽 모두 벤치 → 의미 없음
  }

  // ── 탭 모드 ──
  function handleTap(id: string, isOnCourt: boolean) {
    if (!tapMode) return
    if (!tapOut) {
      if (isOnCourt) setTapOut(id)
      return
    }
    if (tapOut === id) { setTapOut(null); return }
    if (isOnCourt) { setTapOut(id); return }
    handleDrop(id, { kind: 'player', id: tapOut })
    setTapOut(null)
  }

  function startDrag(e: React.DragEvent, id: string) {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
  }
  function endDrag() { setDraggingId(null); setDragOverKey(null) }
  function overEl(e: React.DragEvent, key: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverKey(key)
  }
  function leaveEl() { setDragOverKey(null) }

  function onDropOnPlayer(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    setDragOverKey(null)
    if (!draggingId) return
    handleDrop(draggingId, { kind: 'player', id: targetId })
    setDraggingId(null)
  }
  function onDropOnEmpty(e: React.DragEvent, teamId: string) {
    e.preventDefault()
    setDragOverKey(null)
    if (!draggingId) return
    handleDrop(draggingId, { kind: 'empty', teamId })
    setDraggingId(null)
  }

  // ── 렌더링 헬퍼 ──
  function PlayerChip({ p, isOnCourt, accent }: { p: LeaguePlayer; isOnCourt: boolean; accent: string }) {
    const isTapTarget = tapOut === p.id
    const isDragging = draggingId === p.id
    const isDragOver = dragOverKey === `p:${p.id}` && draggingId !== p.id
    return (
      <div
        key={p.id}
        draggable={!tapMode}
        onClick={() => tapMode && handleTap(p.id, isOnCourt)}
        onDragStart={!tapMode ? e => startDrag(e, p.id) : undefined}
        onDragEnd={!tapMode ? endDrag : undefined}
        onDragOver={!tapMode ? e => overEl(e, `p:${p.id}`) : undefined}
        onDragLeave={!tapMode ? leaveEl : undefined}
        onDrop={!tapMode ? e => onDropOnPlayer(e, p.id) : undefined}
        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all whitespace-nowrap
          ${tapMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}
          ${isTapTarget ? 'bg-orange-600 border-orange-400 text-white scale-105 ring-1 ring-orange-300' : ''}
          ${isDragging ? 'opacity-40' : ''}
          ${isDragOver ? 'bg-blue-600 border-blue-400 text-white scale-105' : ''}
          ${!isTapTarget && !isDragging && !isDragOver ? `border-${accent}-800 text-white hover:brightness-110` : ''}
        `}
        style={!isTapTarget && !isDragging && !isDragOver ? {
          backgroundColor: accent === 'home' ? `${homeTeam?.color ?? '#dc2626'}33` : accent === 'away' ? `${awayTeam?.color ?? '#2563eb'}33` : '#374151',
          borderColor: accent === 'home' ? `${homeTeam?.color ?? '#dc2626'}88` : accent === 'away' ? `${awayTeam?.color ?? '#2563eb'}88` : '#4b5563',
        } : undefined}
      >
        {p.number != null && <span className="font-mono mr-1 text-[10px] opacity-70">#{p.number}</span>}
        {p.name}
      </div>
    )
  }

  function EmptySlot({ teamId, label }: { teamId: string; label: string }) {
    const isOver = dragOverKey === `empty:${teamId}` && draggingId
    return (
      <div
        onDragOver={!tapMode ? e => overEl(e, `empty:${teamId}`) : undefined}
        onDragLeave={!tapMode ? leaveEl : undefined}
        onDrop={!tapMode ? e => onDropOnEmpty(e, teamId) : undefined}
        onClick={() => tapMode && tapOut && handleDrop(tapOut, { kind: 'empty', teamId }) && setTapOut(null)}
        className={`px-2.5 py-1 rounded-lg text-xs font-medium border border-dashed transition-all
          ${isOver ? 'bg-blue-900/40 border-blue-400 text-blue-200' : 'border-gray-700 text-gray-600'}
        `}
      >
        + {label}
      </div>
    )
  }

  const homeOpenSlots = Math.max(0, COURT_SIZE - homeOnCourt.length)
  const awayOpenSlots = Math.max(0, COURT_SIZE - awayOnCourt.length)

  const outName = pendingSwap?.outId ? players.find(p => p.id === pendingSwap.outId)?.name : null
  const inName = pendingSwap ? players.find(p => p.id === pendingSwap.inId)?.name : null
  const isCrossSwap = !!(pendingSwap?.swapTeamId)
  const isEmptyFill = !pendingSwap?.outId

  return (
    <div className="space-y-3 select-none">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 font-medium">선수 교체</p>
        <div className="flex rounded-lg overflow-hidden border border-gray-700">
          <button
            onClick={() => { setTapMode(false); setTapOut(null) }}
            className={`px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${!tapMode ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            드래그
          </button>
          <button
            onClick={() => { setTapMode(true); setTapOut(null) }}
            className={`px-2.5 py-1 text-xs font-medium transition-colors border-l border-gray-700 cursor-pointer ${tapMode ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            탭 선택
          </button>
        </div>
      </div>

      <p className="text-[11px] text-gray-500">
        {tapMode
          ? (tapOut ? `OUT: ${players.find(p => p.id === tapOut)?.name} — 들어갈 자리(코트/벤치/빈슬롯)를 누르세요` : '먼저 코트에서 OUT 선수를 누르세요')
          : '드래그로 자유롭게 이동: 같은 팀 교체 / 다른 팀끼리 교환 / 빈 슬롯 채우기'}
      </p>

      {/* 코트 2열 — 팀별 */}
      <div className="grid grid-cols-2 gap-3">
        {/* 홈 코트 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold" style={{ color: homeTeam?.color ?? '#dc2626' }}>
              {homeTeam?.name ?? '홈팀'} 코트
            </span>
            <span className="text-[10px] text-gray-500">{homeOnCourt.length}/{COURT_SIZE}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
            {homeOnCourt.map(p => <PlayerChip key={p.id} p={p} isOnCourt accent="home" />)}
            {Array.from({ length: homeOpenSlots }).map((_, i) =>
              homeTeam && <EmptySlot key={`he${i}`} teamId={homeTeam.id} label="빈자리" />
            )}
          </div>
        </div>

        {/* 어웨이 코트 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold" style={{ color: awayTeam?.color ?? '#2563eb' }}>
              {awayTeam?.name ?? '어웨이팀'} 코트
            </span>
            <span className="text-[10px] text-gray-500">{awayOnCourt.length}/{COURT_SIZE}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
            {awayOnCourt.map(p => <PlayerChip key={p.id} p={p} isOnCourt accent="away" />)}
            {Array.from({ length: awayOpenSlots }).map((_, i) =>
              awayTeam && <EmptySlot key={`ae${i}`} teamId={awayTeam.id} label="빈자리" />
            )}
          </div>
        </div>
      </div>

      {/* 유령 (미배정 코트) */}
      {unassignedOnCourt.length > 0 && (
        <div className="space-y-1 p-2 rounded-lg bg-amber-900/15 border border-amber-700/30">
          <p className="text-[10px] font-bold text-amber-400">⚠ 미배정 코트 ({unassignedOnCourt.length}) — 드래그로 팀에 할당하세요</p>
          <div className="flex flex-wrap gap-1.5">
            {unassignedOnCourt.map(p => <PlayerChip key={p.id} p={p} isOnCourt accent="ghost" />)}
          </div>
        </div>
      )}

      {/* 벤치 2열 — 팀별 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold" style={{ color: homeTeam?.color ?? '#dc2626' }}>
            {homeTeam?.name ?? '홈팀'} 벤치 ({homeBench.length})
          </p>
          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
            {homeBench.map(p => <PlayerChip key={p.id} p={p} isOnCourt={false} accent="home" />)}
            {homeBench.length === 0 && <p className="text-[10px] text-gray-600 italic">없음</p>}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-bold" style={{ color: awayTeam?.color ?? '#2563eb' }}>
            {awayTeam?.name ?? '어웨이팀'} 벤치 ({awayBench.length})
          </p>
          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
            {awayBench.map(p => <PlayerChip key={p.id} p={p} isOnCourt={false} accent="away" />)}
            {awayBench.length === 0 && <p className="text-[10px] text-gray-600 italic">없음</p>}
          </div>
        </div>
      </div>

      {/* 기타 선수 (어디에도 배정 안 된 풀) — 접힘 */}
      {unassignedBench.length > 0 && (
        <details className="rounded-lg bg-gray-800/40 border border-gray-700/60">
          <summary className="cursor-pointer px-2.5 py-1.5 text-[11px] text-gray-400 font-medium hover:text-white">
            기타 선수 ({unassignedBench.length}) — 드래그로 팀에 배정
          </summary>
          <div className="px-2.5 pb-2 pt-1">
            <div className="flex flex-wrap gap-1.5">
              {unassignedBench.map(p => <PlayerChip key={p.id} p={p} isOnCourt={false} accent="ghost" />)}
            </div>
          </div>
        </details>
      )}

      {/* 확인 모달 */}
      {pendingSwap && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setPendingSwap(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-white font-semibold text-center mb-4">
              {isCrossSwap ? '팀 교환' : isEmptyFill ? '빈 슬롯 채우기' : '교체'}하시겠습니까?
            </p>
            <div className="flex items-center justify-center gap-2 mb-5 flex-wrap">
              {pendingSwap.outId && (
                <>
                  <span className="bg-red-900/60 border border-red-700 px-3 py-1.5 rounded-lg text-sm text-red-300 font-medium">
                    {outName} {isCrossSwap ? '→ ' + (pendingSwap.swapTeamId === homeTeam?.id ? homeTeam?.name : awayTeam?.name) : 'OUT'}
                  </span>
                  <span className="text-gray-400">↔</span>
                </>
              )}
              <span className="bg-green-900/60 border border-green-700 px-3 py-1.5 rounded-lg text-sm text-green-300 font-medium">
                {inName} → {pendingSwap.targetTeamId === homeTeam?.id ? homeTeam?.name : awayTeam?.name}
              </span>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPendingSwap(null)} className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors cursor-pointer">취소</button>
              <button onClick={confirmSwap} className="flex-1 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-sm font-bold transition-colors cursor-pointer">실행</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
