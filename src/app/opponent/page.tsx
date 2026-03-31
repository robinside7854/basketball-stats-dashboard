'use client'
import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Plus, Trash2, ChevronDown, ChevronRight, Undo2 } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface OppTeam  { id: string; name: string; created_at: string }
interface OppPlayer { id: string; team_id: string; number: string; name: string | null }
interface OppGame  {
  id: string; opponent_team_id: string
  date: string; our_score: number; opponent_score: number
  round: string | null; tournament_name: string | null
}
interface OppEvent {
  id: string; game_id: string; player_id: string; quarter: number
  type: string; result: string | null; points: number; created_at: string
  player?: OppPlayer
}
interface ShotBreakdown { att: number; made: number; pts: number }
type ShotBreakdownMap = Record<string, ShotBreakdown>
interface OppPlayerStat {
  player_id: string; player_number: string; player_name: string | null
  games: number; pts: number; fgm: number; fga: number; reb: number
  stl: number; blk: number; tov: number; fg_pct: number
  shot_breakdown: ShotBreakdownMap
}
interface OppGameDetail {
  game_id: string; date: string; our_score: number; opponent_score: number
  round: string | null; tournament_name: string | null
  players: Array<{ player_id: string; player_number: string; player_name: string | null; pts: number; fga: number; fgm: number; shot_breakdown: ShotBreakdownMap }>
}
interface OppStats {
  players: OppPlayerStat[]
  team_shot_breakdown: ShotBreakdownMap
  games: OppGameDetail[]
  total_games: number
}

// ─── Shot type config ─────────────────────────────────────────────────────────
const SHOT_TYPES = [
  { type: 'shot_3p',      label: '3P',   color: '#EAB308', pts: 3 },
  { type: 'shot_2p_mid',  label: '미들',  color: '#3B82F6', pts: 2 },
  { type: 'shot_2p_drive',label: '드라이브', color: '#06B6D4', pts: 2 },
  { type: 'shot_layup',   label: '레이업', color: '#22C55E', pts: 2 },
  { type: 'shot_post',    label: '골밑',  color: '#8B5CF6', pts: 2 },
  { type: 'free_throw',   label: 'FT',   color: '#94A3B8', pts: 1 },
]
const OTHER_EVENTS = [
  { type: 'oreb',     label: 'OR', color: 'bg-green-700 hover:bg-green-600' },
  { type: 'dreb',     label: 'DR', color: 'bg-green-600 hover:bg-green-500' },
  { type: 'steal',    label: 'STL', color: 'bg-purple-600 hover:bg-purple-500' },
  { type: 'block',    label: 'BLK', color: 'bg-indigo-600 hover:bg-indigo-500' },
  { type: 'turnover', label: 'TOV', color: 'bg-red-700 hover:bg-red-600' },
]

// ─── Mini stacked bar ─────────────────────────────────────────────────────────
function ShotBar({ breakdown, size = 'sm' }: { breakdown: ShotBreakdownMap; size?: 'sm' | 'lg' }) {
  const total = SHOT_TYPES.reduce((s, t) => s + (breakdown[t.type]?.att ?? 0), 0)
  if (total === 0) return <span className="text-gray-600 text-xs">-</span>
  const h = size === 'lg' ? 'h-4' : 'h-2.5'
  return (
    <div className={`flex w-full ${h} rounded overflow-hidden gap-px`} title={SHOT_TYPES.map(t => `${t.label}: ${breakdown[t.type]?.att ?? 0}`).join(' | ')}>
      {SHOT_TYPES.map(({ type, color }) => {
        const pct = ((breakdown[type]?.att ?? 0) / total) * 100
        if (pct === 0) return null
        return <div key={type} style={{ width: `${pct}%`, backgroundColor: color }} />
      })}
    </div>
  )
}

// ─── Team shot distribution summary ──────────────────────────────────────────
function TeamShotSummary({ breakdown, totalGames }: { breakdown: ShotBreakdownMap; totalGames: number }) {
  const totalAtt = SHOT_TYPES.reduce((s, t) => s + (breakdown[t.type]?.att ?? 0), 0)
  if (totalAtt === 0) return <p className="text-gray-500 text-sm">기록된 슈팅 없음</p>

  return (
    <div className="space-y-2">
      <div className="flex gap-1 mb-3">
        <ShotBar breakdown={breakdown} size="lg" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {SHOT_TYPES.map(({ type, label, color }) => {
          const b = breakdown[type] ?? { att: 0, made: 0, pts: 0 }
          if (b.att === 0) return null
          const pct = Math.round((b.att / totalAtt) * 100)
          const fgPct = Math.round((b.made / b.att) * 100)
          return (
            <div key={type} className="bg-gray-800/60 rounded-lg p-2.5 border border-gray-700/50">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs font-medium text-gray-300">{label}</span>
              </div>
              <div className="text-lg font-bold text-white">{pct}%</div>
              <div className="text-xs text-gray-400">{b.made}/{b.att} ({fgPct}%)</div>
              <div className="text-xs text-gray-500">{totalGames > 0 ? (b.att / totalGames).toFixed(1) : 0}회/경기</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
type Tab = 'manage' | 'record' | 'analyze'

export default function OpponentPage() {
  const [tab, setTab] = useState<Tab>('manage')

  // Teams
  const [teams, setTeams] = useState<OppTeam[]>([])
  const [selectedTeam, setSelectedTeam] = useState<OppTeam | null>(null)
  const [newTeamName, setNewTeamName] = useState('')

  // Players
  const [players, setPlayers] = useState<OppPlayer[]>([])
  const [newPlayerNumber, setNewPlayerNumber] = useState('')

  // Games
  const [games, setGames] = useState<OppGame[]>([])
  const [selectedGame, setSelectedGame] = useState<OppGame | null>(null)
  const [newGameDate, setNewGameDate] = useState(new Date().toISOString().split('T')[0])
  const [newGameRound, setNewGameRound] = useState('')
  const [newGameTournament, setNewGameTournament] = useState('')

  // Recording
  const [events, setEvents] = useState<OppEvent[]>([])
  const [recQuarter, setRecQuarter] = useState(1)
  const [selPlayer, setSelPlayer] = useState<string | null>(null)
  const [lastEventId, setLastEventId] = useState<string | null>(null)
  const [lastEventLabel, setLastEventLabel] = useState('')
  const [pendingShot, setPendingShot] = useState<string | null>(null) // shot type waiting for result

  // Stats
  const [stats, setStats] = useState<OppStats | null>(null)
  const [expandedGame, setExpandedGame] = useState<string | null>(null)

  // ── Load teams ──
  useEffect(() => {
    fetch('/api/opponent-teams').then(r => r.json()).then(setTeams)
  }, [])

  // ── Load players + games when team selected ──
  useEffect(() => {
    if (!selectedTeam) return
    fetch(`/api/opponent-players?teamId=${selectedTeam.id}`).then(r => r.json()).then(setPlayers)
    fetch(`/api/opponent-games?teamId=${selectedTeam.id}`).then(r => r.json()).then(setGames)
    setSelectedGame(null)
    setStats(null)
  }, [selectedTeam])

  // ── Load events when game selected ──
  const loadEvents = useCallback(() => {
    if (!selectedGame) return
    fetch(`/api/opponent-events?gameId=${selectedGame.id}`).then(r => r.json()).then(setEvents)
  }, [selectedGame])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  // ── Load stats ──
  const loadStats = useCallback(() => {
    if (!selectedTeam) return
    fetch(`/api/opponent-stats?teamId=${selectedTeam.id}`)
      .then(r => r.json()).then(setStats)
  }, [selectedTeam])

  useEffect(() => {
    if (tab === 'analyze' && selectedTeam) loadStats()
  }, [tab, selectedTeam, loadStats])

  // ─── Actions ──────────────────────────────────────────────────────────────
  async function addTeam() {
    if (!newTeamName.trim()) return
    const res = await fetch('/api/opponent-teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newTeamName.trim() }) })
    if (!res.ok) { toast.error('팀 추가 실패'); return }
    const t = await res.json()
    setTeams(prev => [t, ...prev])
    setNewTeamName('')
    toast.success(`${t.name} 추가됨`)
  }

  async function deleteTeam(id: string) {
    if (!confirm('팀과 모든 관련 데이터를 삭제합니다. 계속하시겠습니까?')) return
    await fetch(`/api/opponent-teams/${id}`, { method: 'DELETE' })
    setTeams(prev => prev.filter(t => t.id !== id))
    if (selectedTeam?.id === id) setSelectedTeam(null)
    toast.success('팀 삭제됨')
  }

  async function addPlayer() {
    if (!newPlayerNumber.trim() || !selectedTeam) return
    const res = await fetch('/api/opponent-players', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team_id: selectedTeam.id, number: newPlayerNumber.trim() }) })
    if (!res.ok) { toast.error('선수 추가 실패'); return }
    const p = await res.json()
    setPlayers(prev => [...prev, p].sort((a, b) => Number(a.number) - Number(b.number)))
    setNewPlayerNumber('')
  }

  async function deletePlayer(id: string) {
    await fetch(`/api/opponent-players/${id}`, { method: 'DELETE' })
    setPlayers(prev => prev.filter(p => p.id !== id))
  }

  async function addGame() {
    if (!selectedTeam) return
    const res = await fetch('/api/opponent-games', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opponent_team_id: selectedTeam.id, date: newGameDate, round: newGameRound || null, tournament_name: newGameTournament || null }) })
    if (!res.ok) { toast.error('경기 추가 실패'); return }
    const g = await res.json()
    setGames(prev => [g, ...prev])
    setNewGameRound('')
    toast.success('경기 추가됨')
  }

  async function deleteGame(id: string) {
    await fetch(`/api/opponent-games/${id}`, { method: 'DELETE' })
    setGames(prev => prev.filter(g => g.id !== id))
    if (selectedGame?.id === id) setSelectedGame(null)
    toast.success('경기 삭제됨')
  }

  async function recordEvent(type: string, result?: 'made' | 'missed') {
    if (!selectedGame || !selPlayer) return
    const res = await fetch('/api/opponent-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: selectedGame.id, player_id: selPlayer, quarter: recQuarter, type, result: result ?? null }),
    })
    if (!res.ok) { toast.error('기록 실패'); return }
    const saved = await res.json()
    setLastEventId(saved.id)
    const pNum = players.find(p => p.id === selPlayer)?.number ?? '?'
    setLastEventLabel(`#${pNum} — ${SHOT_TYPES.find(s => s.type === type)?.label ?? OTHER_EVENTS.find(s => s.type === type)?.label ?? type}${result ? (result === 'made' ? ' ✓' : ' ✗') : ''} Q${recQuarter}`)
    toast.success('기록 완료')
    loadEvents()
  }

  async function undoLast() {
    if (!lastEventId) return
    await fetch(`/api/opponent-events?id=${lastEventId}`, { method: 'DELETE' })
    setLastEventId(null)
    setLastEventLabel('')
    loadEvents()
    toast.success('마지막 기록 취소')
  }

  // ─── Tabs ─────────────────────────────────────────────────────────────────
  const tabStyle = (t: Tab) => cn(
    'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
    tab === t ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
  )

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <h1 className="text-2xl font-bold mb-1">상대팀 분석</h1>
      <p className="text-gray-400 text-sm mb-6">상대팀 경기 기록 및 공격 패턴 분석</p>

      {/* Team selector */}
      <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-400 shrink-0">팀 선택</span>
          <select
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white min-w-[180px]"
            value={selectedTeam?.id ?? ''}
            onChange={e => setSelectedTeam(teams.find(t => t.id === e.target.value) ?? null)}
          >
            <option value="">-- 팀을 선택하세요 --</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="flex gap-2 ml-auto">
            <input
              value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTeam()}
              placeholder="새 팀 이름"
              className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white w-36"
            />
            <button onClick={addTeam} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">
              <Plus size={14} /> 팀 추가
            </button>
          </div>
        </div>
      </div>

      {!selectedTeam ? (
        <div className="text-center py-20 text-gray-500">팀을 선택하거나 새로 추가하세요</div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex border-b border-gray-700 mb-6">
            <button className={tabStyle('manage')} onClick={() => setTab('manage')}>팀 관리</button>
            <button className={tabStyle('record')} onClick={() => setTab('record')}>경기 기록</button>
            <button className={tabStyle('analyze')} onClick={() => setTab('analyze')}>분석</button>
            <div className="ml-2 flex items-center">
              <button onClick={() => deleteTeam(selectedTeam.id)} className="text-gray-600 hover:text-red-400 transition-colors p-1">
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* ── TAB: 팀 관리 ── */}
          {tab === 'manage' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Players */}
              <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-4">
                <h2 className="font-semibold mb-3 text-gray-200">선수 등록 (등번호)</h2>
                <div className="flex gap-2 mb-4">
                  <input
                    value={newPlayerNumber} onChange={e => setNewPlayerNumber(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addPlayer()}
                    placeholder="등번호 (예: 7)"
                    className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white flex-1"
                  />
                  <button onClick={addPlayer} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">
                    <Plus size={14} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {players.map(p => (
                    <div key={p.id} className="flex items-center gap-1 bg-gray-800 rounded-lg px-2.5 py-1 text-sm">
                      <span className="font-bold text-white">#{p.number}</span>
                      {p.name && <span className="text-gray-400 text-xs">{p.name}</span>}
                      <button onClick={() => deletePlayer(p.id)} className="ml-1 text-gray-600 hover:text-red-400 transition-colors">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                  {players.length === 0 && <p className="text-gray-500 text-sm">등록된 선수 없음</p>}
                </div>
              </div>

              {/* Games */}
              <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-4">
                <h2 className="font-semibold mb-3 text-gray-200">경기 관리</h2>
                <div className="space-y-2 mb-4">
                  <input type="date" value={newGameDate} onChange={e => setNewGameDate(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white" />
                  <div className="flex gap-2">
                    <input value={newGameTournament} onChange={e => setNewGameTournament(e.target.value)}
                      placeholder="대회명 (선택)" className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white" />
                    <input value={newGameRound} onChange={e => setNewGameRound(e.target.value)}
                      placeholder="라운드 (선택)" className="w-28 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white" />
                  </div>
                  <button onClick={addGame} className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">
                    경기 추가
                  </button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {games.map(g => (
                    <div key={g.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 text-sm">
                      <div>
                        <span className="text-white font-medium">{g.date}</span>
                        {g.round && <span className="ml-2 text-gray-400 text-xs">{g.round}</span>}
                        {g.tournament_name && <span className="ml-2 text-blue-400 text-xs">{g.tournament_name}</span>}
                      </div>
                      <button onClick={() => deleteGame(g.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  {games.length === 0 && <p className="text-gray-500 text-sm">등록된 경기 없음</p>}
                </div>
              </div>
            </div>
          )}

          {/* ── TAB: 경기 기록 ── */}
          {tab === 'record' && (
            <div className="space-y-4">
              {/* Game + Quarter selector */}
              <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-4 flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">경기</span>
                  <select
                    className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white"
                    value={selectedGame?.id ?? ''}
                    onChange={e => setSelectedGame(games.find(g => g.id === e.target.value) ?? null)}
                  >
                    <option value="">-- 경기 선택 --</option>
                    {games.map(g => <option key={g.id} value={g.id}>{g.date}{g.round ? ` (${g.round})` : ''}</option>)}
                  </select>
                </div>
                {selectedGame && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">쿼터</span>
                    {[1,2,3,4].map(q => (
                      <button key={q} onClick={() => setRecQuarter(q)}
                        className={cn('w-8 h-8 rounded-lg text-sm font-bold transition-colors', recQuarter === q ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white')}
                      >Q{q}</button>
                    ))}
                  </div>
                )}
                {lastEventLabel && (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">{lastEventLabel}</span>
                    <button onClick={undoLast} className="flex items-center gap-1 px-2 py-1 bg-red-900/40 hover:bg-red-800/60 border border-red-700/50 text-red-400 text-xs rounded transition-colors">
                      <Undo2 size={12} /> 취소
                    </button>
                  </div>
                )}
              </div>

              {!selectedGame ? (
                <div className="text-center py-12 text-gray-500">경기를 선택하세요</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Player selector */}
                  <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-300 mb-3">선수 선택</h3>
                    {players.length === 0 && (
                      <p className="text-gray-500 text-xs mb-3">팀 관리 탭에서 선수를 먼저 등록하세요</p>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      {players.map(p => (
                        <button key={p.id} onClick={() => setSelPlayer(p.id)}
                          className={cn('py-2 rounded-lg text-sm font-bold transition-colors border',
                            selPlayer === p.id
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white'
                          )}
                        >#{p.number}</button>
                      ))}
                    </div>
                  </div>

                  {/* Event buttons */}
                  <div className="lg:col-span-2 bg-gray-900 border border-gray-700/50 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-300 mb-3">이벤트 기록</h3>

                    {!selPlayer && (
                      <p className="text-gray-500 text-sm text-center py-6">왼쪽에서 선수를 먼저 선택하세요</p>
                    )}

                    {selPlayer && !pendingShot && (
                      <div className="space-y-4">
                        {/* Shot buttons */}
                        <div>
                          <p className="text-xs text-gray-500 mb-2">슈팅</p>
                          <div className="flex flex-wrap gap-2">
                            {SHOT_TYPES.map(({ type, label, color }) => (
                              <button key={type} onClick={() => setPendingShot(type)}
                                className="px-3 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-80"
                                style={{ backgroundColor: color + 'CC' }}
                              >{label}</button>
                            ))}
                          </div>
                        </div>
                        {/* Other events */}
                        <div>
                          <p className="text-xs text-gray-500 mb-2">기타</p>
                          <div className="flex flex-wrap gap-2">
                            {OTHER_EVENTS.map(({ type, label, color }) => (
                              <button key={type} onClick={() => recordEvent(type)}
                                className={cn('px-3 py-2 rounded-lg text-sm font-semibold text-white transition-colors', color)}
                              >{label}</button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Shot result */}
                    {selPlayer && pendingShot && (
                      <div className="flex flex-col items-center gap-4 py-4">
                        <div className="text-gray-300 text-sm">
                          <span className="font-bold text-white">#{players.find(p => p.id === selPlayer)?.number}</span>
                          {' — '}
                          <span style={{ color: SHOT_TYPES.find(s => s.type === pendingShot)?.color }}>
                            {SHOT_TYPES.find(s => s.type === pendingShot)?.label}
                          </span>
                          {' '}결과를 선택하세요
                        </div>
                        <div className="flex gap-4">
                          <button onClick={() => { recordEvent(pendingShot, 'made'); setPendingShot(null) }}
                            className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-bold text-lg rounded-xl transition-colors">
                            성공 ✓
                          </button>
                          <button onClick={() => { recordEvent(pendingShot, 'missed'); setPendingShot(null) }}
                            className="px-8 py-3 bg-red-700 hover:bg-red-600 text-white font-bold text-lg rounded-xl transition-colors">
                            실패 ✗
                          </button>
                        </div>
                        <button onClick={() => setPendingShot(null)} className="text-xs text-gray-500 hover:text-gray-300">
                          취소
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recent events */}
              {selectedGame && events.length > 0 && (
                <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">최근 기록 ({events.length})</h3>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {[...events].reverse().slice(0, 20).map(ev => (
                      <div key={ev.id} className="flex items-center gap-2 text-xs text-gray-400 hover:bg-gray-800 px-2 py-1 rounded">
                        <span className="text-gray-500">Q{ev.quarter}</span>
                        <span className="font-bold text-white">#{ev.player?.number ?? '?'}</span>
                        <span>{SHOT_TYPES.find(s => s.type === ev.type)?.label ?? OTHER_EVENTS.find(s => s.type === ev.type)?.label ?? ev.type}</span>
                        {ev.result && <span className={ev.result === 'made' ? 'text-green-400' : 'text-red-400'}>{ev.result === 'made' ? '✓' : '✗'}</span>}
                        {ev.points > 0 && <span className="text-yellow-400">+{ev.points}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB: 분석 ── */}
          {tab === 'analyze' && (
            <div className="space-y-6">
              {!stats && <div className="text-center py-12 text-gray-500">로딩 중...</div>}
              {stats && stats.total_games === 0 && (
                <div className="text-center py-12 text-gray-500">기록된 경기가 없습니다. 경기 기록 탭에서 먼저 기록하세요.</div>
              )}

              {stats && stats.total_games > 0 && (
                <>
                  {/* ① 팀 공격 스타일 */}
                  <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-5">
                    <h2 className="font-semibold text-gray-100 mb-1">팀 공격 스타일</h2>
                    <p className="text-xs text-gray-500 mb-4">{stats.total_games}경기 누적</p>
                    <TeamShotSummary breakdown={stats.team_shot_breakdown} totalGames={stats.total_games} />

                    {/* Top scorers */}
                    <div className="mt-5 pt-4 border-t border-gray-700/50">
                      <p className="text-xs text-gray-400 mb-3 font-medium">주요 슈터 (슈팅 시도 상위)</p>
                      <div className="space-y-2">
                        {[...stats.players]
                          .sort((a, b) => b.fga - a.fga)
                          .slice(0, 5)
                          .map((p, i) => (
                            <div key={p.player_id} className="flex items-center gap-3">
                              <span className="text-gray-600 text-xs w-4">{i + 1}</span>
                              <span className="font-bold text-white text-sm w-8">#{p.player_number}</span>
                              <div className="flex-1">
                                <ShotBar breakdown={p.shot_breakdown} size="sm" />
                              </div>
                              <span className="text-gray-400 text-xs w-16 text-right">{p.fgm}/{p.fga} ({p.fg_pct}%)</span>
                              <span className="text-yellow-400 text-xs w-10 text-right font-bold">{p.pts}pts</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>

                  {/* ② 선수별 누적 스탯 테이블 */}
                  <div className="bg-gray-900 border border-gray-700/50 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-700/50">
                      <h2 className="font-semibold text-gray-100">선수별 누적 스탯</h2>
                      <p className="text-xs text-gray-500 mt-0.5">공격 스타일 막대 = 슈팅 비율 (색상: 노랑=3P, 파랑=미들, 청록=드라이브, 초록=레이업, 보라=골밑, 회색=FT)</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 border-b border-gray-700/50">
                            <th className="px-4 py-2 text-left font-medium">#</th>
                            <th className="px-3 py-2 text-center font-medium">G</th>
                            <th className="px-3 py-2 text-center font-medium">PTS</th>
                            <th className="px-3 py-2 text-center font-medium">FG</th>
                            <th className="px-3 py-2 text-center font-medium">FG%</th>
                            <th className="px-3 py-2 text-center font-medium">REB</th>
                            <th className="px-3 py-2 text-center font-medium">STL</th>
                            <th className="px-3 py-2 text-center font-medium">BLK</th>
                            <th className="px-3 py-2 text-center font-medium">TOV</th>
                            <th className="px-4 py-2 text-left font-medium min-w-[120px]">공격 스타일</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.players.map(p => (
                            <tr key={p.player_id} className="border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors">
                              <td className="px-4 py-2.5 font-bold text-white">#{p.player_number}</td>
                              <td className="px-3 py-2.5 text-center text-gray-300">{p.games}</td>
                              <td className="px-3 py-2.5 text-center font-bold text-yellow-400">{p.pts}</td>
                              <td className="px-3 py-2.5 text-center text-gray-300">{p.fgm}/{p.fga}</td>
                              <td className="px-3 py-2.5 text-center text-gray-300">{p.fg_pct}%</td>
                              <td className="px-3 py-2.5 text-center text-gray-300">{p.reb}</td>
                              <td className="px-3 py-2.5 text-center text-gray-300">{p.stl}</td>
                              <td className="px-3 py-2.5 text-center text-gray-300">{p.blk}</td>
                              <td className="px-3 py-2.5 text-center text-gray-300">{p.tov}</td>
                              <td className="px-4 py-2.5 min-w-[120px]">
                                <ShotBar breakdown={p.shot_breakdown} size="sm" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* ③ 경기별 드릴다운 */}
                  <div className="bg-gray-900 border border-gray-700/50 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-700/50">
                      <h2 className="font-semibold text-gray-100">경기별 상세</h2>
                    </div>
                    <div className="divide-y divide-gray-800/60">
                      {stats.games.map(g => (
                        <div key={g.game_id}>
                          <button
                            onClick={() => setExpandedGame(expandedGame === g.game_id ? null : g.game_id)}
                            className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-800/40 transition-colors text-left"
                          >
                            {expandedGame === g.game_id ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                            <span className="text-gray-200 text-sm font-medium">{g.date}</span>
                            {g.round && <span className="text-gray-400 text-xs bg-gray-800 px-2 py-0.5 rounded">{g.round}</span>}
                            {g.tournament_name && <span className="text-blue-400 text-xs">{g.tournament_name}</span>}
                            <span className="ml-auto text-xs text-gray-500">{g.players.length}명 기록</span>
                          </button>
                          {expandedGame === g.game_id && g.players.length > 0 && (
                            <div className="px-5 pb-4 bg-gray-950/30">
                              <table className="w-full text-xs mt-2">
                                <thead>
                                  <tr className="text-gray-500 border-b border-gray-700/50">
                                    <th className="py-1.5 text-left font-medium">#</th>
                                    <th className="py-1.5 text-center font-medium">PTS</th>
                                    <th className="py-1.5 text-center font-medium">FG</th>
                                    <th className="py-1.5 text-left font-medium pl-4 min-w-[100px]">공격 스타일</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {g.players.map(p => (
                                    <tr key={p.player_id} className="border-b border-gray-800/40">
                                      <td className="py-1.5 font-bold text-white">#{p.player_number}</td>
                                      <td className="py-1.5 text-center text-yellow-400 font-bold">{p.pts}</td>
                                      <td className="py-1.5 text-center text-gray-300">{p.fgm}/{p.fga}</td>
                                      <td className="py-1.5 pl-4 min-w-[100px]"><ShotBar breakdown={p.shot_breakdown} size="sm" /></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {expandedGame === g.game_id && g.players.length === 0 && (
                            <div className="px-5 pb-4 text-gray-500 text-xs">이 경기에 기록된 데이터 없음</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
