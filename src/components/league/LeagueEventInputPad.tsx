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
      { type: 'ft_3pt_1', label: '3P파울 1구', color: 'bg-teal-700 hover:bg-teal-600',  activeColor: 'bg-teal-600',  needsResult: true },
      { type: 'ft_3pt_2', label: '3P파울 2구', color: 'bg-teal-800 hover:bg-teal-700',  activeColor: 'bg-teal-700',  needsResult: true },
    ],
  },
]

const SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive']
const FT_TYPES   = ['free_throw', 'ft_2pt', 'ft_3pt_1', 'ft_3pt_2', 'and_one']

function calcPoints(type: string, result: string, isPlusOne = false): number {
  if (result !== 'made') return 0
  if (type === 'and_one')   return 1   // 득점인정반칙: 슛 성공 + 1점 추가
  if (type === 'ft_2pt')    return 2
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
}: Props) {
  const { getCurrentTimestamp } = useGameStore()

  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [pendingShot, setPendingShot] = useState<EventBtn | null>(null)
  const [awaitingAssist, setAwaitingAssist] = useState(false)
  const [pendingResult, setPendingResult] = useState<'made' | 'missed' | null>(null)
  const [lastEvent, setLastEvent] = useState<LastEventDetails | null>(null)
  const [recentIds, setRecentIds] = useState<string[]>([])
  const [showLastMenu, setShowLastMenu] = useState(false)
  const [addingAssistForLast, setAddingAssistForLast] = useState(false)
  const [assistCountdown, setAssistCountdown] = useState(0)

  const allPlayers: RosterPlayer[] = [...homePlayers, ...awayPlayers]
  const selectedObj   = selectedPlayer ? (allPlayers.find(p => p.id === selectedPlayer) ?? null) : null
  const selectedTeamId = selectedObj?.team_id ?? null
  const selectedTeam   = selectedObj
    ? (selectedObj.team_id === homeTeam?.id ? homeTeam : selectedObj.team_id === awayTeam?.id ? awayTeam : null)
    : null
  const isPlusOne = !!(selectedObj as LeaguePlayer | null)?.plus_one

  const assistCandidates = allPlayers.filter(p =>
    p.id !== selectedPlayer && selectedTeamId && p.team_id === selectedTeamId
  )
  // 어시스트 추가 모드일 때는 마지막 이벤트 선수의 팀 동료
  const assistForLastCandidates = addingAssistForLast && lastEvent
    ? allPlayers.filter(p => p.id !== lastEvent.playerId && allPlayers.find(a => a.id === lastEvent.playerId)?.team_id && p.team_id === allPlayers.find(a => a.id === lastEvent.playerId)?.team_id)
    : []

  const recentPlayers = recentIds.map(id => allPlayers.find(p => p.id === id)).filter(Boolean) as RosterPlayer[]

  // 항상 최신 상태를 참조하는 ref (어시스트 타임아웃용)
  const liveRef = useRef({ selectedPlayer, pendingShot, pendingResult, isPlusOne, selectedTeamId })
  liveRef.current = { selectedPlayer, pendingShot, pendingResult, isPlusOne, selectedTeamId }

  function selectPlayer(id: string) {
    setSelectedPlayer(id)
    setPendingShot(null)
    setAwaitingAssist(false)
    setRecentIds(prev => [id, ...prev.filter(x => x !== id)].slice(0, 5))
  }

  // ── 어시스트 2초 자동 타임아웃 ──────────────────────────────
  useEffect(() => {
    if (!awaitingAssist) { setAssistCountdown(0); return }
    setAssistCountdown(2)
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
      toast.success(`기록: ${lbl}`)
      setAwaitingAssist(false)
      setPendingResult(null)
      if (!FT_TYPES.includes(shot.type)) setPendingShot(null)
      onEventSaved()
    }, 2000)
    return () => { clearTimeout(timer); clearInterval(tick) }
  }, [awaitingAssist]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setLastEvent({ id, type: pendingShot.type, result, playerId: selectedPlayer, label: lbl })
    toast.success(`기록: ${lbl}`)
    setAwaitingAssist(false)
    setPendingResult(null)
    if (!FT_TYPES.includes(pendingShot.type)) setPendingShot(null)
    onEventSaved()
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
    toast.success(`기록: ${lbl}`)
    onEventSaved()
  }

  function handleResult(result: 'made' | 'missed') {
    if (!pendingShot) return
    if (result === 'missed' || !pendingShot.needsRelated) {
      saveShot(result)
    } else {
      setPendingResult('made')
      setAwaitingAssist(true)
    }
  }

  async function undoLast() {
    if (!lastEvent) return
    const r = await fetch(`/api/leagues/${leagueId}/events/${lastEvent.id}`, { method: 'DELETE', headers: leagueHeaders })
    if (!r.ok) { toast.error('취소 실패'); return }
    toast(`↩ 취소: ${lastEvent.label}`)
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
    const isRecent   = recentIds.includes(p.id)
    return (
      <button
        key={p.id}
        onClick={() => selectPlayer(p.id)}
        className={`relative py-3 px-1 rounded-xl text-center transition-all cursor-pointer border active:scale-95 ${
          isSelected
            ? 'text-white shadow-lg'
            : isRecent
              ? 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700'
              : 'bg-gray-800/80 border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-500'
        } ${p.plus_one ? 'ring-1 ring-amber-400/60' : ''}`}
        style={isSelected ? { backgroundColor: teamColor, borderColor: teamColor } : {}}
      >
        <div className="text-2xl font-black font-mono leading-none mb-1 opacity-90">{p.number ?? '—'}</div>
        <div className="text-xs font-semibold truncate leading-tight px-0.5">{p.name}</div>
        {p.plus_one && (
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

        <button onClick={undoLast} disabled={!lastEvent}
          className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-800 border border-gray-700 text-gray-400 hover:text-orange-400 hover:border-orange-600 disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer">
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

      {/* ── 최근 5명 quick-bar ── */}
      {recentPlayers.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {recentPlayers.map(p => {
            const tc = allPlayers.find(a => a.id === p.id) as RosterPlayer | undefined
            const color = tc?.team_id === homeTeam?.id ? homeTeam?.color : awayTeam?.color
            const isSelected = selectedPlayer === p.id
            return (
              <button key={p.id} onClick={() => selectPlayer(p.id)}
                className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-all active:scale-95 ${
                  isSelected ? 'text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                }`}
                style={isSelected ? { backgroundColor: color ?? '#3b82f6', borderColor: color ?? '#3b82f6' } : {}}>
                <span className="font-mono opacity-70">#{p.number ?? '—'}</span>
                {p.name}
              </button>
            )
          })}
          <div className="shrink-0 w-1" />
        </div>
      )}

      {/* ── 선수 선택: 두 팀 2열 ── */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[11px] font-bold mb-1.5 px-2 py-1 rounded-lg text-center"
            style={{ color: homeTeam?.color ?? '#3b82f6', backgroundColor: `${homeTeam?.color ?? '#3b82f6'}18` }}>
            {homeTeam?.name ?? '홈팀'}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {homePlayers.map(p => renderPlayerBtn(p, homeTeam?.color ?? '#3b82f6'))}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold mb-1.5 px-2 py-1 rounded-lg text-center"
            style={{ color: awayTeam?.color ?? '#ef4444', backgroundColor: `${awayTeam?.color ?? '#ef4444'}18` }}>
            {awayTeam?.name ?? '어웨이팀'}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {awayPlayers.map(p => renderPlayerBtn(p, awayTeam?.color ?? '#ef4444'))}
          </div>
        </div>
      </div>

      {/* ── 이벤트 버튼 (선수 선택 후) ── */}
      {selectedPlayer && !awaitingAssist && !addingAssistForLast && (
        <div className="space-y-2 pt-1">
          {EVENT_GROUPS.map(group => (
            <div key={group.label}>
              <p className="text-[10px] text-gray-500 mb-1">{group.label}</p>
              <div className={`grid gap-1.5 grid-cols-${group.cols}`}>
                {group.buttons.map(btn => {
                  const isActive = pendingShot?.type === btn.type
                  return (
                    <button
                      key={btn.type}
                      onClick={() => {
                        if (btn.needsResult) { setPendingShot(btn); setAwaitingAssist(false) }
                        else saveInstant(btn)
                      }}
                      className={`py-4 rounded-xl text-sm font-bold text-white transition-all active:scale-95 cursor-pointer border-2 ${
                        isActive
                          ? `${btn.activeColor} border-white/60 shadow-lg scale-[1.02]`
                          : `${btn.color} border-transparent`
                      }`}
                    >
                      {btn.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
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

      {/* ── O/X 하단 Fixed Bar ── */}
      {pendingShot && !awaitingAssist && !addingAssistForLast && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-gray-950/95 backdrop-blur-sm border-t border-gray-800 px-4 py-3">
          <div className="max-w-lg mx-auto space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">{pendingShot.label} — 결과 선택</span>
              <button onClick={() => { setPendingShot(null); setAwaitingAssist(false) }}
                className="text-[11px] text-gray-600 hover:text-gray-400 cursor-pointer">취소</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => handleResult('made')}
                className="py-5 bg-green-600 hover:bg-green-500 text-white text-2xl font-black rounded-2xl active:scale-95 cursor-pointer transition-transform shadow-lg">
                ✓ 성공
              </button>
              <button onClick={() => handleResult('missed')}
                className="py-5 bg-red-700 hover:bg-red-600 text-white text-2xl font-black rounded-2xl active:scale-95 cursor-pointer transition-transform shadow-lg">
                ✗ 실패
              </button>
            </div>
          </div>
        </div>
      )}
      {/* O/X 바 공간 확보 (fixed bar가 콘텐츠를 가리지 않도록) */}
      {pendingShot && !awaitingAssist && !addingAssistForLast && <div className="h-28" />}
    </div>
  )
}
