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

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const homeIds = new Set(homeRoster.map(p => p.id))
  const awayIds = new Set(awayRoster.map(p => p.id))

  function teamOf(playerId: string): string | null {
    if (homeIds.has(playerId)) return homeTeam?.id ?? null
    if (awayIds.has(playerId)) return awayTeam?.id ?? null
    return null
  }

  function isOnCourt(playerId: string): boolean {
    return onCourt.includes(playerId)
  }

  const homeOnCourt = homeRoster.filter(p => isOnCourt(p.id))
  const homeBench = homeRoster.filter(p => !isOnCourt(p.id))
  const awayOnCourt = awayRoster.filter(p => isOnCourt(p.id))
  const awayBench = awayRoster.filter(p => !isOnCourt(p.id))
  const unassignedOnCourt = players.filter(p => onCourt.includes(p.id) && !homeIds.has(p.id) && !awayIds.has(p.id))
  const unassignedBench = players.filter(p => !onCourt.includes(p.id) && !homeIds.has(p.id) && !awayIds.has(p.id))

  // ── API 헬퍼 ──────────────────────────────────────────────────
  async function assignToTeam(playerId: string, teamId: string) {
    return fetch(`/api/leagues/${leagueId}/games/${gameId}/irregular-players`, {
      method: 'POST', headers: leagueHeaders,
      body: JSON.stringify({ league_player_id: playerId, team_id: teamId }),
    })
  }

  async function recordSubOut(playerId: string, ts: number) {
    const open = minutes.find(m => m.league_player_id === playerId && m.league_game_id === gameId && m.out_time == null)
    if (open) {
      await fetch(`/api/leagues/${leagueId}/minutes`, {
        method: 'PATCH', headers: leagueHeaders,
        body: JSON.stringify({ id: open.id, out_time: ts }),
      })
    }
    await fetch(`/api/leagues/${leagueId}/events`, {
      method: 'POST', headers: leagueHeaders,
      body: JSON.stringify({ league_game_id: gameId, quarter: 1, video_timestamp: ts, type: 'sub_out', league_player_id: playerId, points: 0 }),
    })
  }

  async function recordSubIn(playerId: string, ts: number) {
    await fetch(`/api/leagues/${leagueId}/minutes`, {
      method: 'POST', headers: leagueHeaders,
      body: JSON.stringify({ league_game_id: gameId, league_player_id: playerId, quarter: 1, in_time: ts }),
    })
    await fetch(`/api/leagues/${leagueId}/events`, {
      method: 'POST', headers: leagueHeaders,
      body: JSON.stringify({ league_game_id: gameId, quarter: 1, video_timestamp: ts, type: 'sub_in', league_player_id: playerId, points: 0 }),
    })
  }

  // ── 단일 선수의 위치 이동 ─────────────────────────────────────
  // newTeamId가 null이면 팀 변경 없음 (현재 팀 유지)
  async function movePlayer(playerId: string, newTeamId: string | null, goCourt: boolean) {
    const prevTeam = teamOf(playerId)
    const prevCourt = isOnCourt(playerId)

    const teamChange = newTeamId != null && newTeamId !== prevTeam
    const courtChange = goCourt !== prevCourt
    if (!teamChange && !courtChange) return

    const ts = getCurrentTimestamp()

    if (teamChange && newTeamId) {
      await assignToTeam(playerId, newTeamId)
    }

    if (courtChange) {
      if (goCourt) {
        await recordSubIn(playerId, ts)
        addPlayer(playerId)
      } else {
        await recordSubOut(playerId, ts)
        removePlayer(playerId)
      }
    }
  }

  // ── 드래그 동작 분기 ──────────────────────────────────────────
  // chip → chip: 두 선수가 서로의 위치(팀+코트/벤치)로 swap
  async function swapTwo(aId: string, bId: string) {
    if (aId === bId) return
    const aTeam = teamOf(aId)
    const aCourt = isOnCourt(aId)
    const bTeam = teamOf(bId)
    const bCourt = isOnCourt(bId)

    // 상대의 팀이 없으면 자기 팀 유지 (둘 다 미배정인 경우만 둘 다 미배정 유지)
    const aNewTeam = bTeam ?? aTeam
    const bNewTeam = aTeam ?? bTeam

    // 동시 호출 시 race condition 위험 → 순차 실행
    await movePlayer(aId, aNewTeam, bCourt)
    await movePlayer(bId, bNewTeam, aCourt)

    const aName = players.find(p => p.id === aId)?.name ?? ''
    const bName = players.find(p => p.id === bId)?.name ?? ''
    toast.success(`${aName} ↔ ${bName}`)
  }

  // chip → 빈 영역(team 코트/벤치): 해당 위치로 이동
  async function moveToArea(playerId: string, teamId: string, goCourt: boolean) {
    const player = players.find(p => p.id === playerId)
    await movePlayer(playerId, teamId, goCourt)
    const teamName =
      teamId === homeTeam?.id ? homeTeam.name :
      teamId === awayTeam?.id ? awayTeam.name : ''
    toast.success(`${player?.name ?? ''} → ${teamName} ${goCourt ? '코트' : '벤치'}`)
  }

  // ── 드래그 이벤트 핸들러 ──────────────────────────────────────
  function startDrag(e: React.DragEvent, id: string) {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }
  function endDrag() { setDraggingId(null); setDragOverKey(null) }
  function overEl(e: React.DragEvent, key: string) {
    if (busy) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverKey(key)
  }
  function leaveEl() { setDragOverKey(null) }

  async function withBusy(fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
    await onSubstitution()
  }

  function onDropOnChip(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    e.stopPropagation()
    setDragOverKey(null)
    const sourceId = draggingId ?? e.dataTransfer.getData('text/plain')
    setDraggingId(null)
    if (!sourceId || sourceId === targetId) return
    withBusy(() => swapTwo(sourceId, targetId))
  }

  function onDropOnArea(e: React.DragEvent, teamId: string, goCourt: boolean) {
    e.preventDefault()
    setDragOverKey(null)
    const sourceId = draggingId ?? e.dataTransfer.getData('text/plain')
    setDraggingId(null)
    if (!sourceId) return
    // 정원 체크: 코트로 이동 시 해당 팀 코트가 이미 5명이고 source가 그 팀 코트가 아니면 거부
    if (goCourt) {
      const targetCourtCount =
        teamId === homeTeam?.id ? homeOnCourt.length :
        teamId === awayTeam?.id ? awayOnCourt.length : 0
      const sourceWasInTargetCourt = teamOf(sourceId) === teamId && isOnCourt(sourceId)
      if (!sourceWasInTargetCourt && targetCourtCount >= COURT_SIZE) {
        toast.error('코트 정원(5명)이 가득 찼습니다. 선수끼리 직접 드래그해 교체하세요.')
        return
      }
    }
    withBusy(() => moveToArea(sourceId, teamId, goCourt))
  }

  // ── 렌더링 헬퍼 ───────────────────────────────────────────────
  function PlayerChip({ p, accent }: { p: LeaguePlayer; accent: 'home' | 'away' | 'ghost' }) {
    const isDragging = draggingId === p.id
    const isDragOver = dragOverKey === `chip:${p.id}` && draggingId !== p.id
    const color =
      accent === 'home' ? (homeTeam?.color ?? '#dc2626') :
      accent === 'away' ? (awayTeam?.color ?? '#2563eb') : '#6b7280'

    return (
      <div
        draggable={!busy}
        onDragStart={e => startDrag(e, p.id)}
        onDragEnd={endDrag}
        onDragOver={e => overEl(e, `chip:${p.id}`)}
        onDragLeave={leaveEl}
        onDrop={e => onDropOnChip(e, p.id)}
        className={`px-2.5 py-1 rounded-lg text-xs font-medium border whitespace-nowrap transition-all
          ${busy ? 'cursor-wait' : 'cursor-grab active:cursor-grabbing'}
          ${isDragging ? 'opacity-40 scale-95' : ''}
          ${isDragOver ? 'ring-2 ring-blue-300 scale-105 z-10 relative' : ''}
        `}
        style={{
          backgroundColor: `${color}33`,
          borderColor: `${color}88`,
          color: 'white',
        }}
      >
        {p.number != null && <span className="font-mono mr-1 text-[10px] opacity-70">#{p.number}</span>}
        {p.name}
      </div>
    )
  }

  function AreaDropZone({ teamId, goCourt, children, label, color, openSlots = 0, overCapacity = false }: {
    teamId: string
    goCourt: boolean
    children: React.ReactNode
    label: string
    color: string
    openSlots?: number
    overCapacity?: boolean
  }) {
    const key = `area:${teamId}:${goCourt ? 'court' : 'bench'}`
    const isOver = dragOverKey === key
    return (
      <div
        onDragOver={e => overEl(e, key)}
        onDragLeave={leaveEl}
        onDrop={e => onDropOnArea(e, teamId, goCourt)}
        className={`rounded-lg px-2 py-1.5 border transition-all ${
          isOver ? 'bg-blue-900/30 border-blue-400' : overCapacity ? 'bg-red-900/15 border-red-700/40' : 'bg-gray-800/40 border-gray-700/50'
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{label}</span>
          {overCapacity && <span className="text-[10px] font-bold text-red-400">⚠ 정원 초과</span>}
        </div>
        <div className="flex flex-wrap gap-1.5 min-h-[28px]">
          {children}
          {goCourt && Array.from({ length: openSlots }).map((_, i) => (
            <div key={`empty-${i}`}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border border-dashed transition-all ${
                isOver ? 'border-blue-400 text-blue-200' : 'border-gray-700 text-gray-600'
              }`}>
              + 빈자리
            </div>
          ))}
        </div>
      </div>
    )
  }

  function TeamCard({ team, accent, onCourtPlayers, benchPlayers }: {
    team?: TeamRef
    accent: 'home' | 'away'
    onCourtPlayers: LeaguePlayer[]
    benchPlayers: LeaguePlayer[]
  }) {
    if (!team) return null
    const overCap = onCourtPlayers.length > COURT_SIZE
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-sm font-black" style={{ color: team.color }}>{team.name}</span>
          <span className={`text-xs font-bold tabular-nums ${overCap ? 'text-red-400' : 'text-gray-500'}`}>
            {onCourtPlayers.length}/{COURT_SIZE}
          </span>
        </div>
        <AreaDropZone teamId={team.id} goCourt={true} label="코트" color={team.color} openSlots={Math.max(0, COURT_SIZE - onCourtPlayers.length)} overCapacity={overCap}>
          {onCourtPlayers.map(p => <PlayerChip key={p.id} p={p} accent={accent} />)}
        </AreaDropZone>
        <AreaDropZone teamId={team.id} goCourt={false} label={`벤치 (${benchPlayers.length})`} color={team.color}>
          {benchPlayers.map(p => <PlayerChip key={p.id} p={p} accent={accent} />)}
          {benchPlayers.length === 0 && <p className="text-[11px] text-gray-600 italic">선수를 드래그해 배정하세요</p>}
        </AreaDropZone>
      </div>
    )
  }

  return (
    <div className="space-y-3 select-none">
      <p className="text-[11px] text-gray-500">
        드래그로 자유롭게 이동 — 코트로 보내면 그 팀 소속으로 출전 처리됩니다.
        선수끼리 드래그하면 자리를 교환하고, 빈 영역에 드롭하면 그쪽으로 이동합니다.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TeamCard team={homeTeam} accent="home" onCourtPlayers={homeOnCourt} benchPlayers={homeBench} />
        <TeamCard team={awayTeam} accent="away" onCourtPlayers={awayOnCourt} benchPlayers={awayBench} />
      </div>

      {/* 미배정 코트 (유령 상태) */}
      {unassignedOnCourt.length > 0 && (
        <div className="rounded-lg px-2 py-1.5 bg-amber-900/15 border border-amber-700/40">
          <p className="text-[10px] font-bold text-amber-400 mb-1">⚠ 미배정 코트 ({unassignedOnCourt.length}) — 드래그로 팀에 배정하세요</p>
          <div className="flex flex-wrap gap-1.5">
            {unassignedOnCourt.map(p => <PlayerChip key={p.id} p={p} accent="ghost" />)}
          </div>
        </div>
      )}

      {/* 기타 선수 풀 (어느 팀에도 없음, 벤치) */}
      {unassignedBench.length > 0 && (
        <details className="rounded-lg bg-gray-800/40 border border-gray-700/60">
          <summary className="cursor-pointer px-2.5 py-1.5 text-[11px] text-gray-400 font-medium hover:text-white">
            기타 선수 ({unassignedBench.length}) — 드래그로 팀에 배정
          </summary>
          <div className="px-2.5 pb-2 pt-1">
            <div className="flex flex-wrap gap-1.5">
              {unassignedBench.map(p => <PlayerChip key={p.id} p={p} accent="ghost" />)}
            </div>
          </div>
        </details>
      )}

      {busy && (
        <p className="text-[11px] text-blue-400 text-center">⏳ 처리 중...</p>
      )}
    </div>
  )
}
