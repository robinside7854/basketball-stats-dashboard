'use client'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useGameStore } from '@/store/gameStore'
import type { LeaguePlayer } from '@/types/league'

type RosterPlayer = LeaguePlayer & { team_id?: string; is_regular?: boolean }

interface Props {
  leagueId: string
  gameId: string
  homePlayers?: RosterPlayer[]
  awayPlayers?: RosterPlayer[]
  homeTeam?: { id: string; name: string; color: string }
  awayTeam?: { id: string; name: string; color: string }
  leagueHeaders: Record<string, string>
  onEventSaved: () => void
  activePlusOneIds?: string[]  // per-game override; if set, only these player IDs get +1
}

type EventBtn = {
  type: string
  label: string
  color: string
  activeColor: string
  needsResult?: boolean
  needsRelated?: boolean
}

// 순서: 슈팅 → 리바운드 → 기타 → 자유투
const EVENT_GROUPS: { label: string; cols: number; buttons: EventBtn[] }[] = [
  {
    label: '슈팅', cols: 5,
    buttons: [
      { type: 'shot_3p',       label: '3P',     color: 'bg-yellow-600 hover:bg-yellow-500', activeColor: 'bg-yellow-500', needsResult: true, needsRelated: true },
      { type: 'shot_2p_mid',   label: '미들슛',  color: 'bg-blue-600 hover:bg-blue-500',    activeColor: 'bg-blue-500',   needsResult: true, needsRelated: true },
      { type: 'shot_layup',    label: '레이업',  color: 'bg-blue-700 hover:bg-blue-600',    activeColor: 'bg-blue-600',   needsResult: true, needsRelated: true },
      { type: 'shot_post',     label: '골밑슛',  color: 'bg-violet-700 hover:bg-violet-600', activeColor: 'bg-violet-600', needsResult: true, needsRelated: true },
      { type: 'shot_2p_drive', label: '드라이브', color: 'bg-cyan-700 hover:bg-cyan-600',   activeColor: 'bg-cyan-600',   needsResult: true, needsRelated: true },
    ],
  },
  {
    label: '리바운드', cols: 2,
    buttons: [
      { type: 'oreb', label: '공격REB', color: 'bg-green-700 hover:bg-green-600', activeColor: 'bg-green-600' },
      { type: 'dreb', label: '수비REB', color: 'bg-green-600 hover:bg-green-500', activeColor: 'bg-green-500' },
    ],
  },
  {
    label: '기타', cols: 4,
    buttons: [
      { type: 'steal',    label: 'STL', color: 'bg-purple-600 hover:bg-purple-500', activeColor: 'bg-purple-500' },
      { type: 'block',    label: 'BLK', color: 'bg-indigo-600 hover:bg-indigo-500', activeColor: 'bg-indigo-500' },
      { type: 'turnover', label: 'TOV', color: 'bg-red-700 hover:bg-red-600',       activeColor: 'bg-red-600' },
      { type: 'foul',     label: 'PF',  color: 'bg-orange-600 hover:bg-orange-500', activeColor: 'bg-orange-500' },
    ],
  },
  {
    label: '자유투', cols: 4,
    buttons: [
      { type: 'and_one',  label: '앤드원',     color: 'bg-amber-600 hover:bg-amber-500', activeColor: 'bg-amber-500', needsResult: true },
      { type: 'ft_2pt',   label: '2P파울 FT',  color: 'bg-teal-600 hover:bg-teal-500',  activeColor: 'bg-teal-500',  needsResult: true },
      { type: 'ft_3pt_1', label: '3P파울 FT',  color: 'bg-teal-700 hover:bg-teal-600',  activeColor: 'bg-teal-600',  needsResult: true },
    ],
  },
]

const SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive']
const FT_TYPES   = ['free_throw', 'ft_2pt', 'ft_3pt_1', 'ft_3pt_2', 'and_one']

function calcPoints(type: string, result: string, isPlusOne = false): number {
  if (result !== 'made') return 0
  if (type === 'and_one')   return 1   // 득점인정반칙: 슛 성공 + 1점 추가
  if (type === 'ft_2pt')    return 2   // 2점 파울 FT: 1회 시도로 2점
  if (type === 'ft_3pt_1')  return 2
  if (type === 'ft_3pt_2')  return 1
  if (type === 'free_throw') return 1
  const bonus = isPlusOne ? 1 : 0
  if (type === 'shot_3p') return 3 + bonus
  if (SHOT_TYPES.includes(type)) return 2 + bonus
  return 0
}

type LastEventDetails = {
  id: string
  type: string
  result: 'made' | 'missed'
  playerId: string
  label: string
}

export default function LeagueEventInputPad({
  leagueId, gameId,
  homePlayers = [], awayPlayers = [],
  homeTeam, awayTeam,
  leagueHeaders, onEventSaved,
  activePlusOneIds,
}: Props) {
  const { getCurrentTimestamp } = useGameStore()

  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [pendingShot, setPendingShot] = useState<EventBtn | null>(null)
  const [awaitingAssist, setAwaitingAssist] = useState(false)
  const [pendingResult, setPendingResult] = useState<'made' | 'missed' | null>(null)
  const [lastEvent, setLastEvent] = useState<LastEventDetails | null>(null)
  const [showLastMenu, setShowLastMenu] = useState(false)
  const [addingAssistForLast, setAddingAssistForLast] = useState(false)
  const [assistCountdown, setAssistCountdown] = useState(0)
  const [awaitingRebound, setAwaitingRebound] = useState(false)
  const [reboundShooterTeamId, setReboundShooterTeamId] = useState<string | null>(null)
  const [lastReboundId, setLastReboundId] = useState<string | null>(null) // 슛 직후 저장된 리바운드 ID
  const [showAndOnePrompt, setShowAndOnePrompt] = useState(false)  // Phase 2-F
  const [awaitingTovPair, setAwaitingTovPair] = useState(false)    // Phase 2-G
  const [stealerTeamId, setStealerTeamId] = useState<string | null>(null)

  const allPlayers: RosterPlayer[] = [...homePlayers, ...awayPlayers]
  const selectedObj   = selectedPlayer ? (allPlayers.find(p => p.id === selectedPlayer) ?? null) : null
  const selectedTeamId = selectedObj?.team_id ?? null
  const selectedTeam   = selectedObj
    ? (selectedObj.team_id === homeTeam?.id ? homeTeam : selectedObj.team_id === awayTeam?.id ? awayTeam : null)
    : null
  const isPlusOne = activePlusOneIds !== undefined
    ? activePlusOneIds.includes(selectedPlayer ?? '')
    : !!(selectedObj as LeaguePlayer | null)?.plus_one

  const assistCandidates = allPlayers.filter(p =>
    p.id !== selectedPlayer && selectedTeamId && p.team_id === selectedTeamId
  )
  // 어시스트 추가 모드일 때는 마지막 이벤트 선수의 팀 동료
  const assistForLastCandidates = addingAssistForLast && lastEvent
    ? allPlayers.filter(p => p.id !== lastEvent.playerId && allPlayers.find(a => a.id === lastEvent.playerId)?.team_id && p.team_id === allPlayers.find(a => a.id === lastEvent.playerId)?.team_id)
    : []

  // 항상 최신 상태를 참조하는 ref (어시스트 타임아웃용)
  const liveRef = useRef({ selectedPlayer, pendingShot, pendingResult, isPlusOne, selectedTeamId })
  liveRef.current = { selectedPlayer, pendingShot, pendingResult, isPlusOne, selectedTeamId }

  function selectPlayer(id: string) {
    setSelectedPlayer(id)
    setPendingShot(null)
    setAwaitingAssist(false)
  }

  function handleShotClick(btn: EventBtn) {
    setPendingShot(btn)
    setAwaitingAssist(false)
  }

  // ── 어시스트 2초 자동 타임아웃 ──────────────────────────────
  useEffect(() => {
    if (!awaitingAssist) { setAssistCountdown(0); return }
    setAssistCountdown(3)
    const tick = setInterval(() => setAssistCountdown(n => Math.max(0, n - 1)), 1000)
    const timer = setTimeout(async () => {
      clearInterval(tick)
      const { selectedPlayer: pid, pendingShot: shot, pendingResult: res, isPlusOne: isP1, selectedTeamId: tid } = liveRef.current
      if (!pid || !shot || !res) return
      const pts = calcPoints(shot.type, res, isP1)
      const r = await fetch(`/api/leagues/${leagueId}/events`, {
        method: 'POST', headers: leagueHeaders,
        body: JSON.stringify({ league_game_id: gameId, quarter: 1, video_timestamp: getCurrentTimestamp(), type: shot.type, league_player_id: pid, team_id: tid, result: res, related_player_id: null, points: pts }),
      })
      if (!r.ok) { toast.error('저장 실패'); return }
      const saved = await r.json()
      const pName = allPlayers.find(p => p.id === pid)?.name ?? ''
      const lbl = `${pName} — ${shot.label} ✓ (어시스트 없음)`
      setLastEvent({ id: saved.id, type: shot.type, result: res, playerId: pid, label: lbl })
      setLastReboundId(null)
      toast.success(`기록: ${lbl}`)
      setAwaitingAssist(false)
      setPendingResult(null)
      if (!FT_TYPES.includes(shot.type) || shot.type === 'ft_2pt') setPendingShot(null)
      onEventSaved()
    }, 3000)
    return () => { clearTimeout(timer); clearInterval(tick) }
  }, [awaitingAssist]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 앤드원 4초 자동 스킵 ────────────────────────────────────
  const [andOneCountdown, setAndOneCountdown] = useState(0)
  useEffect(() => {
    if (!showAndOnePrompt) { setAndOneCountdown(0); return }
    setAndOneCountdown(4)
    const tick = setInterval(() => setAndOneCountdown(n => Math.max(0, n - 1)), 1000)
    const timer = setTimeout(() => { clearInterval(tick); setShowAndOnePrompt(false) }, 4000)
    return () => { clearTimeout(timer); clearInterval(tick) }
  }, [showAndOnePrompt]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── API ──────────────────────────────────────────────────────
  async function saveEvent(body: object): Promise<string | null> {
    const r = await fetch(`/api/leagues/${leagueId}/events`, { method: 'POST', headers: leagueHeaders, body: JSON.stringify(body) })
    if (!r.ok) { toast.error('저장 실패'); return null }
    return (await r.json()).id
  }

  async function saveShot(result: 'made' | 'missed', assistId?: string) {
    if (!selectedPlayer || !pendingShot) return
    const pts = calcPoints(pendingShot.type, result, isPlusOne)
    const id = await saveEvent({
      league_game_id: gameId, quarter: 1, video_timestamp: getCurrentTimestamp(),
      type: pendingShot.type, league_player_id: selectedPlayer, team_id: selectedTeamId,
      result, related_player_id: assistId ?? null, points: pts,
    })
    if (!id) return
    const pName = allPlayers.find(p => p.id === selectedPlayer)?.name ?? ''
    const aPName = assistId ? allPlayers.find(p => p.id === assistId)?.name : null
    const mark  = result === 'made' ? ' ✓' : ' ✗'
    const lbl   = `${pName} — ${pendingShot.label}${mark}${aPName ? ` (A: ${aPName})` : ''}`
    const shotType = pendingShot.type  // capture before potential clear
    const shooterTeamId = selectedTeamId
    setLastEvent({ id, type: shotType, result, playerId: selectedPlayer, label: lbl })
    setLastReboundId(null)  // 새 슛 이벤트 → 이전 리바운드 연계 해제
    toast.success(`기록: ${lbl}`)
    setAwaitingAssist(false)
    setPendingResult(null)
    if (shotType === 'ft_3pt_1') {
      // 2구 자동 진입
      setPendingShot({ type: 'ft_3pt_2', label: '3P파울 2구', color: 'bg-teal-800 hover:bg-teal-700', activeColor: 'bg-teal-700', needsResult: true })
      setPendingResult(null)
    } else if (!FT_TYPES.includes(shotType) || shotType === 'ft_2pt') {
      setPendingShot(null)
    }
    onEventSaved()

    // Phase 1-B: 마지막 자유투 실패 시 리바운드 피커 자동 등장
    const LAST_FT = ['ft_2pt', 'ft_3pt_2', 'free_throw', 'and_one']
    if (result === 'missed' && LAST_FT.includes(shotType)) {
      setReboundShooterTeamId(shooterTeamId)
      setAwaitingRebound(true)
    }

    // Phase 2-F: 필드골 성공 후 앤드원 프롬프트
    if (result === 'made' && SHOT_TYPES.includes(shotType)) {
      setShowAndOnePrompt(true)
    }
  }

  // Phase 2-F: 앤드원 처리
  async function handleAndOne(result: 'made' | 'missed') {
    const shooterId = lastEvent?.playerId ?? selectedPlayer
    if (!shooterId) { setShowAndOnePrompt(false); return }
    const shooter = allPlayers.find(p => p.id === shooterId)
    const pts = result === 'made' ? 1 : 0
    const id = await saveEvent({
      league_game_id: gameId, quarter: 1, video_timestamp: getCurrentTimestamp(),
      type: 'and_one', league_player_id: shooterId,
      team_id: shooter?.team_id ?? null,
      result, related_player_id: null, points: pts,
    })
    setShowAndOnePrompt(false)
    if (!id) return
    const name = shooter?.name ?? ''
    toast.success(`기록: ${name} — 앤드원 ${result === 'made' ? '✓' : '✗'}`)
    onEventSaved()
    if (result === 'missed') {
      setReboundShooterTeamId(shooter?.team_id ?? null)
      setAwaitingRebound(true)
    }
  }

  // Phase 2-G: 스틸 후 TOV 페어
  async function handleTovPair(tovPlayerId: string | null) {
    if (tovPlayerId) {
      const p = allPlayers.find(x => x.id === tovPlayerId)
      const id = await saveEvent({
        league_game_id: gameId, quarter: 1, video_timestamp: getCurrentTimestamp(),
        type: 'turnover', league_player_id: tovPlayerId,
        team_id: p?.team_id ?? null, result: null, related_player_id: null, points: 0,
      })
      if (id) {
        toast.success(`기록: ${p?.name ?? ''} — TOV (페어)`)
        onEventSaved()
      }
    }
    setAwaitingTovPair(false)
    setStealerTeamId(null)
  }

  async function saveInstant(btn: EventBtn) {
    if (!selectedPlayer) return
    const id = await saveEvent({
      league_game_id: gameId, quarter: 1, video_timestamp: getCurrentTimestamp(),
      type: btn.type, league_player_id: selectedPlayer, team_id: selectedTeamId,
      result: null, related_player_id: null, points: 0,
    })
    if (!id) return
    const pName = allPlayers.find(p => p.id === selectedPlayer)?.name ?? ''
    const lbl = `${pName} — ${btn.label}`
    setLastEvent({ id, type: btn.type, result: 'missed', playerId: selectedPlayer, label: lbl })
    setLastReboundId(null)  // 새 즉각 이벤트 → 이전 리바운드 연계 해제
    toast.success(`기록: ${lbl}`)
    onEventSaved()

    // Phase 2-G: 스틸 후 상대팀 TOV 페어 피커
    if (btn.type === 'steal') {
      setStealerTeamId(selectedTeamId)
      setAwaitingTovPair(true)
    }
  }

  async function handleResult(result: 'made' | 'missed') {
    if (!pendingShot) return
    if (result === 'missed' && SHOT_TYPES.includes(pendingShot.type)) {
      // 필드골 실패 → 슛 즉시 저장 후 리바운드 피커
      const shooterTeamId = selectedTeamId
      await saveShot('missed')
      setReboundShooterTeamId(shooterTeamId)
      setAwaitingRebound(true)
    } else if (result === 'missed' || !pendingShot.needsRelated) {
      saveShot(result)
    } else {
      setPendingResult('made')
      setAwaitingAssist(true)
    }
  }

  // 통합 리바운드 저장 함수 (슛 실패/블락/FT 미스 공통)
  async function doRebound(rebounderId: string | null) {
    if (rebounderId) {
      const rebounder = allPlayers.find(p => p.id === rebounderId)
      const rebType = rebounder?.team_id === reboundShooterTeamId ? 'oreb' : 'dreb'
      const rebId = await saveEvent({
        league_game_id: gameId, quarter: 1, video_timestamp: getCurrentTimestamp(),
        type: rebType, league_player_id: rebounderId,
        team_id: rebounder?.team_id ?? null,
        result: null, related_player_id: null, points: 0,
      })
      if (rebId) {
        setLastReboundId(rebId)  // 슛과 연계된 리바운드로 추적
        const rName = rebounder?.name ?? ''
        toast.success(`기록: ${rName} — ${rebType === 'oreb' ? '공격REB' : '수비REB'}`)
        onEventSaved()
      }
    } else {
      setLastReboundId(null)  // 아웃바운드/건너뛰기
    }
    setAwaitingRebound(false)
    setReboundShooterTeamId(null)
  }

  async function undoLast() {
    if (!lastEvent) return
    // 슛 취소 시 연계된 리바운드도 함께 삭제
    const rebId = lastReboundId
    if (rebId) {
      await fetch(`/api/leagues/${leagueId}/events/${rebId}`, { method: 'DELETE', headers: leagueHeaders })
      setLastReboundId(null)
    }
    const r = await fetch(`/api/leagues/${leagueId}/events/${lastEvent.id}`, { method: 'DELETE', headers: leagueHeaders })
    if (!r.ok) { toast.error('취소 실패'); return }
    toast(`↩ 취소: ${lastEvent.label}${rebId ? ' + 리바운드' : ''}`)
    setLastEvent(null)
    setShowLastMenu(false)
    onEventSaved()
  }

  // 마지막 이벤트에 어시스트 추가 (삭제 후 재입력 + 어시스트 선택)
  async function startAddAssistForLast() {
    if (!lastEvent || !SHOT_TYPES.includes(lastEvent.type)) return
    setShowLastMenu(false)
    const r = await fetch(`/api/leagues/${leagueId}/events/${lastEvent.id}`, { method: 'DELETE', headers: leagueHeaders })
    if (!r.ok) { toast.error('실패'); return }
    // 해당 선수로 포커스 + 어시스트 선택 모드
    setSelectedPlayer(lastEvent.playerId)
    const btn = EVENT_GROUPS.flatMap(g => g.buttons).find(b => b.type === lastEvent.type)
    if (btn) { setPendingShot(btn); setPendingResult('made') }
    setAddingAssistForLast(true)
    setAwaitingAssist(false) // 직접 선택 (타임아웃 없이)
    onEventSaved()
  }

  async function finishAssistForLast(assistId?: string) {
    if (!lastEvent || !pendingShot) return
    const pts = calcPoints(lastEvent.type, 'made', isPlusOne)
    const id = await saveEvent({
      league_game_id: gameId, quarter: 1, video_timestamp: getCurrentTimestamp(),
      type: lastEvent.type, league_player_id: lastEvent.playerId, team_id: allPlayers.find(p => p.id === lastEvent.playerId)?.team_id ?? null,
      result: 'made', related_player_id: assistId ?? null, points: pts,
    })
    if (!id) return
    const pName = allPlayers.find(p => p.id === lastEvent.playerId)?.name ?? ''
    const aPName = assistId ? allPlayers.find(p => p.id === assistId)?.name : null
    const lbl = `${pName} — ${pendingShot.label} ✓${aPName ? ` (A: ${aPName})` : ''}`
    setLastEvent({ id, type: lastEvent.type, result: 'made', playerId: lastEvent.playerId, label: lbl })
    toast.success(`기록: ${lbl}`)
    setAddingAssistForLast(false)
    setPendingShot(null)
    setPendingResult(null)
    onEventSaved()
  }

  const canAddAssist = lastEvent && SHOT_TYPES.includes(lastEvent.type) && lastEvent.result === 'made'

  // ── 선수 카드 렌더 ────────────────────────────────────────────
  function renderPlayerBtn(p: RosterPlayer, teamColor: string) {
    const isSelected = selectedPlayer === p.id
    return (
      <button
        key={p.id}
        onClick={() => selectPlayer(p.id)}
        className={`relative py-2 px-1 rounded-xl text-center transition-all cursor-pointer border active:scale-95 ${
          isSelected
            ? 'text-white shadow-lg'
            : 'bg-gray-800/80 border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-500'
        } ${(activePlusOneIds !== undefined ? activePlusOneIds.includes(p.id) : p.plus_one) ? 'ring-1 ring-amber-400/60' : ''}`}
        style={isSelected ? { backgroundColor: teamColor, borderColor: teamColor } : {}}
      >
        {p.number != null && (
          <div className="text-base font-black font-mono leading-none mb-0.5 opacity-70">#{p.number}</div>
        )}
        <div className={`font-semibold truncate leading-tight px-0.5 ${p.number != null ? 'text-xs' : 'text-sm'}`}>{p.name}</div>
        {(activePlusOneIds !== undefined ? activePlusOneIds.includes(p.id) : p.plus_one) && (
          <span className="absolute top-1 right-1 text-[8px] font-black text-amber-300 leading-none">+1</span>
        )}
      </button>
    )
  }

  return (
    <div className="space-y-2">
      {/* ── 헤더: 선택된 선수 + 마지막 이벤트 + 취소 ── */}
      <div className="flex items-center gap-2 min-h-[32px] relative">
        {selectedObj ? (
          <span className="shrink-0 px-3 py-1 rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: selectedTeam?.color ?? '#3b82f6' }}>
            {selectedObj.name}{selectedTeam ? ` · ${selectedTeam.name}` : ''}
          </span>
        ) : (
          <span className="shrink-0 px-3 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 text-sm font-bold">
            선수를 선택하세요
          </span>
        )}
        {isPlusOne && (
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-black">+1</span>
        )}

        {/* 마지막 이벤트 — 클릭하면 빠른 수정 메뉴 */}
        {lastEvent && (
          <button
            onClick={() => setShowLastMenu(v => !v)}
            className="flex-1 text-xs text-gray-400 truncate text-left hover:text-gray-200 cursor-pointer transition-colors"
          >
            {lastEvent.label}
          </button>
        )}

        {/* Phase 1-D: Undo — lastEvent 있으면 오렌지로 강조 */}
        <button onClick={undoLast} disabled={!lastEvent}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed ${
            lastEvent
              ? 'bg-orange-900/30 border-orange-600/60 text-orange-400 hover:bg-orange-900/50'
              : 'bg-gray-800 border-gray-700 text-gray-600'
          }`}>
          ↩ 취소
        </button>

        {/* 빠른 수정 메뉴 */}
        {showLastMenu && lastEvent && (
          <div className="absolute top-full left-0 mt-1 z-30 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden min-w-[180px]">
            {canAddAssist && (
              <button onClick={startAddAssistForLast}
                className="w-full text-left px-4 py-2.5 text-sm text-blue-300 hover:bg-gray-800 cursor-pointer transition-colors flex items-center gap-2">
                <span>🤝</span> 어시스트 추가
              </button>
            )}
            <button onClick={undoLast}
              className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-gray-800 cursor-pointer transition-colors flex items-center gap-2">
              <span>↩</span> 이벤트 취소
            </button>
            <button onClick={() => setShowLastMenu(false)}
              className="w-full text-left px-4 py-2.5 text-xs text-gray-600 hover:bg-gray-800 cursor-pointer transition-colors">
              닫기
            </button>
          </div>
        )}
      </div>

      {/* ── 선수 선택: 두 팀 2열 (연계 동작 중에는 숨김) ── */}
      {!pendingShot && !awaitingAssist && !awaitingRebound && !awaitingTovPair && !addingAssistForLast && (
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="flex items-center justify-between mb-1.5 px-2 py-1 rounded-lg"
            style={{ backgroundColor: `${homeTeam?.color ?? '#3b82f6'}18` }}>
            <span className="text-[11px] font-bold" style={{ color: homeTeam?.color ?? '#3b82f6' }}>{homeTeam?.name ?? '홈팀'}</span>
            <span className="text-[10px] font-bold opacity-60" style={{ color: homeTeam?.color ?? '#3b82f6' }}>코트 {homePlayers.length}명</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {homePlayers.map(p => renderPlayerBtn(p, homeTeam?.color ?? '#3b82f6'))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5 px-2 py-1 rounded-lg"
            style={{ backgroundColor: `${awayTeam?.color ?? '#ef4444'}18` }}>
            <span className="text-[11px] font-bold" style={{ color: awayTeam?.color ?? '#ef4444' }}>{awayTeam?.name ?? '어웨이팀'}</span>
            <span className="text-[10px] font-bold opacity-60" style={{ color: awayTeam?.color ?? '#ef4444' }}>코트 {awayPlayers.length}명</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {awayPlayers.map(p => renderPlayerBtn(p, awayTeam?.color ?? '#ef4444'))}
          </div>
        </div>
      </div>
      )}

      {/* ── 리바운드 선택 (슛 실패 / 블락 / FT 미스 공통) ── */}
      {awaitingRebound && (
        <div className="pt-1 space-y-2">
          <p className="text-xs text-gray-400">리바운드 선수 선택</p>
          <button
            onClick={() => doRebound(null)}
            className="w-full py-2 rounded-xl text-sm font-bold bg-gray-700/60 border border-gray-600/50 text-gray-400 hover:bg-gray-700 hover:text-gray-200 cursor-pointer transition-colors"
          >
            🌀 아웃바운드 / 미기록
          </button>
          {[
            { players: homePlayers, team: homeTeam, isShooterTeam: reboundShooterTeamId === homeTeam?.id },
            { players: awayPlayers, team: awayTeam, isShooterTeam: reboundShooterTeamId === awayTeam?.id },
          ].map(({ players: tPlayers, team, isShooterTeam }) => tPlayers.length === 0 ? null : (
            <div key={team?.id ?? 'team'}>
              <p className="text-[10px] font-bold mb-1.5 px-1" style={{ color: team?.color ?? '#9ca3af' }}>
                {team?.name ?? '팀'} — {isShooterTeam ? '공격리바' : '수비리바'}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {tPlayers.map(p => (
                  <button key={p.id} onClick={() => doRebound(p.id)}
                    className="py-2 rounded-xl text-sm font-bold text-white cursor-pointer active:scale-95 transition-all"
                    style={{ backgroundColor: `${team?.color ?? '#6b7280'}cc` }}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button onClick={() => doRebound(null)}
            className="text-[11px] text-gray-600 hover:text-gray-400 cursor-pointer w-full text-center py-1">
            리바운드 건너뛰기
          </button>
        </div>
      )}

      {/* ── 이벤트 버튼 (선수 선택 후) ── */}
      {selectedPlayer && !awaitingAssist && !addingAssistForLast && !awaitingRebound && !awaitingTovPair && (
        <div className="space-y-1.5 pt-1">
          {EVENT_GROUPS
            .filter(group => !pendingShot || group.buttons.some(b => b.type === pendingShot.type))
            .map(group => {
            const groupHasPending = pendingShot && group.buttons.some(b => b.type === pendingShot.type)
            return (
              <div key={group.label}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-gray-500">{group.label}</p>
                  {groupHasPending && (
                    <button onClick={() => { setPendingShot(null); setAwaitingAssist(false) }}
                      className="text-[10px] text-gray-600 hover:text-gray-400 cursor-pointer">취소</button>
                  )}
                </div>
                {groupHasPending ? (
                  /* 해당 그룹을 O/X 버튼으로 덮기 */
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => handleResult('made')}
                      className="py-4 bg-green-600 hover:bg-green-500 text-white text-xl font-black rounded-2xl active:scale-95 cursor-pointer transition-all shadow-lg">
                      ✓ 성공
                    </button>
                    <button onClick={() => handleResult('missed')}
                      className="py-4 bg-red-700 hover:bg-red-600 text-white text-xl font-black rounded-2xl active:scale-95 cursor-pointer transition-all shadow-lg">
                      ✗ 실패
                    </button>
                  </div>
                ) : (
                  <div className={`grid gap-1.5 grid-cols-${group.cols}`}>
                    {group.buttons.map(btn => (
                      <button
                        key={btn.type}
                        onClick={() => {
                          if (btn.needsResult) handleShotClick(btn)
                          else saveInstant(btn)
                        }}
                        className={`py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-95 cursor-pointer border-2 ${btn.color} border-transparent`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── 어시스트 선택 (+ 타임아웃 카운트다운) ── */}
      {awaitingAssist && (
        <div className="pt-1 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">어시스트 선수</p>
            <span className={`text-xs font-bold tabular-nums ${assistCountdown <= 1 ? 'text-red-400' : 'text-gray-600'}`}>
              {assistCountdown}초 후 자동 없음 처리
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button onClick={() => { setAwaitingAssist(false); saveShot(pendingResult ?? 'made') }}
              className="py-3 rounded-xl text-sm font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 cursor-pointer border-2 border-transparent">없음</button>
            {assistCandidates.map(p => (
              <button key={p.id} onClick={() => { setAwaitingAssist(false); saveShot(pendingResult ?? 'made', p.id) }}
                className="py-3 rounded-xl text-sm font-bold bg-blue-800 text-blue-200 hover:bg-blue-700 cursor-pointer truncate px-1 border-2 border-transparent">
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 어시스트 추가 모드 (마지막 이벤트 보정용) ── */}
      {addingAssistForLast && lastEvent && (
        <div className="pt-1 space-y-2">
          <p className="text-xs text-blue-400">어시스트 선수 선택 (보정 모드)</p>
          <div className="grid grid-cols-3 gap-1.5">
            <button onClick={() => finishAssistForLast()}
              className="py-3 rounded-xl text-sm font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 cursor-pointer">없음</button>
            {assistForLastCandidates.map(p => (
              <button key={p.id} onClick={() => finishAssistForLast(p.id)}
                className="py-3 rounded-xl text-sm font-bold bg-blue-800 text-blue-200 hover:bg-blue-700 cursor-pointer truncate px-1">
                {p.name}
              </button>
            ))}
          </div>
          <button onClick={() => { setAddingAssistForLast(false); setPendingShot(null) }}
            className="text-xs text-gray-600 hover:text-gray-400 cursor-pointer w-full text-center py-1">취소</button>
        </div>
      )}

      {/* ── Phase 2-F: 앤드원 프롬프트 (필드골 성공 직후) ── */}
      {showAndOnePrompt && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-900/25 border border-amber-600/40 rounded-xl">
          <span className="text-amber-300 font-black text-sm flex-1">⚡ 앤드원?</span>
          <button onClick={() => handleAndOne('made')}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-black rounded-lg cursor-pointer active:scale-95 transition-all">
            ✓ 성공
          </button>
          <button onClick={() => handleAndOne('missed')}
            className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs font-black rounded-lg cursor-pointer active:scale-95 transition-all">
            ✗ 실패
          </button>
          <button onClick={() => setShowAndOnePrompt(false)}
            className="px-2 py-1.5 bg-gray-700 text-gray-400 text-xs rounded-lg cursor-pointer hover:bg-gray-600">
            <span className={andOneCountdown <= 1 ? 'text-red-400 font-bold' : ''}>{andOneCountdown}s</span>
          </button>
        </div>
      )}

      {/* ── Phase 2-G: 스틸→TOV 페어 피커 ── */}
      {awaitingTovPair && (
        <div className="pt-1 space-y-2">
          <p className="text-xs text-gray-400">🎣 스틸 → 턴오버 선수 선택</p>
          <button onClick={() => handleTovPair(null)}
            className="w-full py-2 rounded-xl text-sm font-bold bg-gray-700/60 border border-gray-600/50 text-gray-400 hover:bg-gray-700 hover:text-gray-200 cursor-pointer transition-colors">
            불명 / 미기록
          </button>
          {(() => {
            const opposing = allPlayers.filter(p => p.team_id !== stealerTeamId)
            const oppTeam = opposing[0]?.team_id === homeTeam?.id ? homeTeam : awayTeam
            return opposing.length > 0 ? (
              <div>
                <p className="text-[10px] font-bold mb-1.5 px-1" style={{ color: oppTeam?.color ?? '#9ca3af' }}>
                  {oppTeam?.name ?? '상대팀'}
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {opposing.map(p => (
                    <button key={p.id} onClick={() => handleTovPair(p.id)}
                      className="py-2 rounded-xl text-sm font-bold text-white cursor-pointer active:scale-95 transition-all"
                      style={{ backgroundColor: `${oppTeam?.color ?? '#6b7280'}cc` }}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null
          })()}
          <button onClick={() => handleTovPair(null)}
            className="text-[11px] text-gray-600 hover:text-gray-400 cursor-pointer w-full text-center py-1">
            건너뛰기
          </button>
        </div>
      )}

    </div>
  )
}
