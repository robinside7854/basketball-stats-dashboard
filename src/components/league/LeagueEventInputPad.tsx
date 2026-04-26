'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { useGameStore } from '@/store/gameStore'
import type { LeaguePlayer } from '@/types/league'

type RosterPlayer = LeaguePlayer & { team_id?: string; is_regular?: boolean }

interface Props {
  leagueId: string
  gameId: string
  // 기존 호환: 분기 배정 없을 때 단일 배열
  players?: LeaguePlayer[]
  // 신규: 홈/어웨이 분리 명단 (전체 명단 — onCourt 필터 없이 전부 노출)
  homePlayers?: RosterPlayer[]
  awayPlayers?: RosterPlayer[]
  homeTeam?: { id: string; name: string; color: string }
  awayTeam?: { id: string; name: string; color: string }
  plusOneAge?: number | null   // 플러스원 나이 기준 (만 나이)
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

function calcAge(birthDate: string | null | undefined): number {
  if (!birthDate) return 0
  const birth = new Date(birthDate)
  if (isNaN(birth.getTime())) return 0
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const md = now.getMonth() - birth.getMonth()
  if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age--
  return age
}

function calcPoints(type: string, result: string, isPlusOne = false): number {
  if (result !== 'made') return 0
  // 자유투(FT)는 +1 미적용
  if (type === 'free_throw') return 1
  const bonus = isPlusOne ? 1 : 0
  if (type === 'shot_3p') return 3 + bonus
  if (['shot_2p_mid','shot_layup','shot_post'].includes(type)) return 2 + bonus
  return 0
}

export default function LeagueEventInputPad({
  leagueId, gameId,
  players: legacyPlayers,
  homePlayers = [], awayPlayers = [],
  homeTeam, awayTeam,
  plusOneAge,
  leagueHeaders, onEventSaved,
}: Props) {
  const { getCurrentTimestamp } = useGameStore()

  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [pendingShot, setPendingShot] = useState<EventBtn | null>(null)
  const [awaitingAssist, setAwaitingAssist] = useState(false)
  const [lastEventId, setLastEventId] = useState<string | null>(null)
  const [lastEventLabel, setLastEventLabel] = useState('')

  // 홈/어웨이 분리 모드 vs 레거시 단일 모드
  const hasRoster = homePlayers.length > 0 || awayPlayers.length > 0
  const allPlayers: RosterPlayer[] = hasRoster
    ? [...homePlayers, ...awayPlayers]
    : (legacyPlayers ?? [])

  // 어시스트 후보 — 같은 팀의 다른 선수만
  const selectedPlayerObj = selectedPlayer
    ? (allPlayers.find(p => p.id === selectedPlayer) as RosterPlayer | undefined) ?? null
    : null
  const selectedPlayerTeamId = selectedPlayerObj?.team_id ?? null

  const assistCandidates = hasRoster
    ? allPlayers.filter(p =>
        p.id !== selectedPlayer &&
        selectedPlayerTeamId &&
        p.team_id === selectedPlayerTeamId
      )
    : (legacyPlayers ?? []).filter(p => p.id !== selectedPlayer)

  // 선택된 선수의 팀 컬러/이름
  const selectedTeam =
    selectedPlayerObj && hasRoster
      ? (selectedPlayerObj.team_id === homeTeam?.id ? homeTeam :
         selectedPlayerObj.team_id === awayTeam?.id ? awayTeam : null)
      : null

  // 플러스원 여부: 선택된 선수의 만 나이 >= plusOneAge
  const selectedPlayerIsPlusOne = !!(
    plusOneAge != null &&
    selectedPlayerObj &&
    calcAge((selectedPlayerObj as LeaguePlayer).birth_date) >= plusOneAge
  )

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
    const pts = calcPoints(pendingShot.type, result, selectedPlayerIsPlusOne)
    const id = await saveEvent({
      league_game_id: gameId,
      quarter: 1,
      video_timestamp: getCurrentTimestamp(),
      type: pendingShot.type,
      league_player_id: selectedPlayer,
      team_id: selectedPlayerTeamId,
      result,
      related_player_id: assistId ?? null,
      points: pts,
    })
    if (!id) return

    const pName = allPlayers.find(p => p.id === selectedPlayer)?.name ?? ''
    const assistP = assistId ? allPlayers.find(p => p.id === assistId) : null
    const mark = result === 'made' ? ' ✓' : ' ✗'
    const label = `${pName} — ${pendingShot.label}${mark}${assistP ? ` (A: ${assistP.name})` : ''}`
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
      quarter: 1,
      video_timestamp: getCurrentTimestamp(),
      type: btn.type,
      league_player_id: selectedPlayer,
      team_id: selectedPlayerTeamId,
      result: null,
      related_player_id: null,
      points: 0,
    })
    if (!id) return
    const pName = allPlayers.find(p => p.id === selectedPlayer)?.name ?? ''
    const label = `${pName} — ${btn.label}`
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

  // 선수 버튼 (파란날개 스타일: 등번호 크게, 이름 작게)
  function renderPlayerBtn(p: RosterPlayer, teamColor: string) {
    const isSelected = selectedPlayer === p.id
    const isPlusOne = plusOneAge != null && calcAge((p as LeaguePlayer).birth_date) >= plusOneAge
    return (
      <button
        key={p.id}
        onClick={() => { setSelectedPlayer(p.id); setPendingShot(null); setAwaitingAssist(false) }}
        className={`relative py-3 px-1 rounded-xl text-center transition-all cursor-pointer border active:scale-95 ${
          isSelected ? 'text-white' : 'bg-gray-800/80 border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-500'
        }`}
        style={isSelected ? { backgroundColor: teamColor, borderColor: teamColor } : {}}
      >
        <div className="text-xl font-black font-mono leading-none mb-0.5 opacity-80">
          {p.number ?? '—'}
        </div>
        <div className="text-[11px] font-medium truncate leading-tight">{p.name}</div>
        {isPlusOne && (
          <span className="absolute top-1 right-1 text-[8px] font-black text-amber-300 leading-none">+1</span>
        )}
      </button>
    )
  }

  return (
    <div className="space-y-2">
      {/* 헤더 — 선택된 선수 + 취소 */}
      <div className="flex items-center gap-2 min-h-[32px]">
        {selectedPlayerObj ? (
          <span
            className="shrink-0 px-3 py-1 rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: selectedTeam?.color ?? '#3b82f6' }}
          >
            {selectedPlayerObj.name}
            {selectedTeam ? ` · ${selectedTeam.name}` : ''}
          </span>
        ) : (
          <span className="shrink-0 px-3 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 text-sm font-bold">
            선수를 선택하세요
          </span>
        )}
        {selectedPlayerIsPlusOne && (
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-black">+1</span>
        )}
        {lastEventLabel && <span className="flex-1 text-xs text-gray-400 truncate">{lastEventLabel}</span>}
        <button
          onClick={undoLastEvent}
          disabled={!lastEventId}
          className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-800 border border-gray-700 text-gray-400 hover:text-orange-400 hover:border-orange-600 disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >↩ 취소</button>
      </div>

      {/* ── 선수 선택: 두 팀 2열 ── */}
      {hasRoster ? (
        <div className="grid grid-cols-2 gap-2">
          {/* 홈팀 */}
          <div>
            <div
              className="text-[11px] font-bold mb-1.5 px-2 py-1 rounded-lg text-center"
              style={{ color: homeTeam?.color ?? '#3b82f6', backgroundColor: `${homeTeam?.color ?? '#3b82f6'}18` }}
            >
              {homeTeam?.name ?? '홈팀'}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {homePlayers.map(p => renderPlayerBtn(p, homeTeam?.color ?? '#3b82f6'))}
            </div>
          </div>
          {/* 어웨이팀 */}
          <div>
            <div
              className="text-[11px] font-bold mb-1.5 px-2 py-1 rounded-lg text-center"
              style={{ color: awayTeam?.color ?? '#ef4444', backgroundColor: `${awayTeam?.color ?? '#ef4444'}18` }}
            >
              {awayTeam?.name ?? '어웨이팀'}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {awayPlayers.map(p => renderPlayerBtn(p, awayTeam?.color ?? '#ef4444'))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {(legacyPlayers ?? []).map(p => (
            <button key={p.id}
              onClick={() => { setSelectedPlayer(p.id); setPendingShot(null); setAwaitingAssist(false) }}
              className={`py-3 px-1 rounded-xl text-center transition-all cursor-pointer border ${
                selectedPlayer === p.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
              }`}
            >
              <div className="text-xl font-black font-mono opacity-80">{p.number ?? '—'}</div>
              <div className="text-[11px] truncate">{p.name}</div>
            </button>
          ))}
        </div>
      )}

      {/* ── 이벤트 버튼 (선수 선택 후, 파란날개 스타일: 전체 폭) ── */}
      {selectedPlayer && !awaitingAssist && (
        <div className="space-y-2 pt-1">
          {EVENT_GROUPS.map(group => {
            const isShooting = group.label === '슈팅'
            const isRebound  = group.label === '리바운드'
            return (
              <div key={group.label}>
                <p className="text-[10px] text-gray-500 mb-1">{group.label}</p>
                <div className={`grid gap-1.5 ${
                  isShooting ? 'grid-cols-5' :
                  isRebound  ? 'grid-cols-2' :
                               'grid-cols-4'
                }`}>
                  {group.buttons.map(btn => {
                    const isActive = !!btn.needsResult && pendingShot?.type === btn.type
                    if (isActive) {
                      return (
                        <div key={btn.type} className="col-span-1 flex rounded-xl overflow-hidden gap-px h-[44px]">
                          <button onClick={() => handleResult('made')}
                            className="flex-1 bg-green-600 hover:bg-green-500 text-white font-black text-lg active:scale-95 cursor-pointer">O</button>
                          <button onClick={() => handleResult('missed')}
                            className="flex-1 bg-red-700 hover:bg-red-600 text-white font-black text-lg active:scale-95 cursor-pointer">X</button>
                        </div>
                      )
                    }
                    return (
                      <button
                        key={btn.type}
                        onClick={() => {
                          if (btn.needsResult) { setPendingShot(btn); setAwaitingAssist(false) }
                          else saveInstant(btn)
                        }}
                        className={`py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-95 cursor-pointer ${btn.color}`}
                      >
                        {btn.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── 어시스트 ── */}
      {awaitingAssist && (
        <div className="pt-1">
          <p className="text-xs text-gray-400 mb-2">어시스트 선수 (없으면 건너뜀)</p>
          <div className="grid grid-cols-3 gap-1.5">
            <button onClick={() => saveShot('made')}
              className="py-3 rounded-xl text-sm font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 cursor-pointer">없음</button>
            {assistCandidates.map(p => (
              <button key={p.id} onClick={() => saveShot('made', p.id)}
                className="py-3 rounded-xl text-sm font-bold bg-blue-800 text-blue-200 hover:bg-blue-700 cursor-pointer truncate px-1">
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
