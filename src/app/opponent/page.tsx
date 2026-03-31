'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Plus, Trash2, ChevronDown, ChevronRight, Undo2, Pencil, Check, X } from 'lucide-react'
import OpponentYouTubePlayer from '@/components/record/OpponentYouTubePlayer'
import { formatTimestamp } from '@/lib/youtube/utils'

// ─── Types ────────────────────────────────────────────────────────────────────
interface OppTeam   { id: string; name: string }
interface OppPlayer { id: string; team_id: string; number: string; name: string | null }
interface OppGame   {
  id: string; opponent_team_id: string
  date: string; vs_team: string | null
  our_score: number; opponent_score: number
  round: string | null; tournament_name: string | null
  youtube_url: string | null; youtube_start_offset: number
  is_complete: boolean
}
interface OppEvent  {
  id: string; game_id: string; player_id: string; quarter: number
  type: string; result: string | null; points: number
  video_timestamp: number; created_at: string
  player?: OppPlayer
}
interface ShotBreakdown { att: number; made: number; pts: number }
type ShotBreakdownMap = Record<string, ShotBreakdown>
interface OppPlayerStat {
  player_id: string; player_number: string; player_name: string | null
  games: number; pts: number; fgm: number; fga: number
  fg3m: number; fg3a: number; ftm: number; fta: number; oreb: number
  fg_pct: number | null; fg3_pct: number | null; ft_pct: number | null
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

// ─── Time helpers ─────────────────────────────────────────────────────────────
function parseMMSS(value: string): number {
  if (!value || !value.trim()) return 0
  const parts = value.trim().split(':')
  if (parts.length === 1) return parseInt(parts[0]) || 0
  return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0)
}

function formatMMSS(seconds: number): string {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ─── Shot / event config ──────────────────────────────────────────────────────
const SHOT_TYPES = [
  { type: 'shot_3p',     label: '3P',   color: '#EAB308', pts: 3 },
  { type: 'shot_2p_mid', label: '미들',  color: '#3B82F6', pts: 2 },
  { type: 'shot_layup',  label: '레이업', color: '#22C55E', pts: 2 },
  { type: 'shot_post',   label: '골밑',  color: '#8B5CF6', pts: 2 },
  { type: 'free_throw',  label: 'FT',   color: '#94A3B8', pts: 1 },
]
const OTHER_EVENTS = [
  { type: 'oreb', label: '공격REB', colorClass: 'bg-green-700 hover:bg-green-600' },
]

function eventLabel(type: string) {
  return SHOT_TYPES.find(s => s.type === type)?.label
    ?? OTHER_EVENTS.find(s => s.type === type)?.label
    ?? type
}

// ─── Labeled stacked bar (D안) ────────────────────────────────────────────────
function ShotBarLabeled({ breakdown, height = 'md' }: { breakdown: ShotBreakdownMap; height?: 'sm' | 'md' | 'lg' }) {
  const total = SHOT_TYPES.reduce((s, t) => s + (breakdown[t.type]?.att ?? 0), 0)
  if (total === 0) return <span className="text-gray-600 text-xs">-</span>

  const hClass = height === 'lg' ? 'h-12' : height === 'md' ? 'h-9' : 'h-6'
  const sorted = [...SHOT_TYPES]
    .map(t => ({ ...t, att: breakdown[t.type]?.att ?? 0, pct: Math.round(((breakdown[t.type]?.att ?? 0) / total) * 100) }))
    .filter(t => t.att > 0)
    .sort((a, b) => b.att - a.att)

  return (
    <div className={`flex w-full ${hClass} rounded-lg overflow-hidden gap-[2px]`}>
      {sorted.map(({ type, label, color, att, pct }) => (
        <div
          key={type}
          className="flex items-center justify-center overflow-hidden transition-all relative shrink-0"
          style={{ width: `${pct}%`, backgroundColor: color }}
          title={`${label}: ${att}회 (${pct}%)`}
        >
          {pct >= 14 ? (
            <div className="flex flex-col items-center leading-tight select-none">
              <span className="text-white font-bold drop-shadow" style={{ fontSize: height === 'sm' ? '10px' : '11px' }}>{label}</span>
              <span className="text-white/90 font-semibold drop-shadow" style={{ fontSize: height === 'sm' ? '9px' : '10px' }}>{pct}%</span>
            </div>
          ) : pct >= 7 ? (
            <span className="text-white font-bold drop-shadow select-none" style={{ fontSize: '9px' }}>{pct}%</span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

// ─── Team shot summary ────────────────────────────────────────────────────────
function TeamShotSummary({ breakdown, totalGames }: { breakdown: ShotBreakdownMap; totalGames: number }) {
  const totalAtt = SHOT_TYPES.reduce((s, t) => s + (breakdown[t.type]?.att ?? 0), 0)
  if (totalAtt === 0) return <p className="text-gray-500 text-sm">기록된 슈팅 없음</p>

  const sorted = [...SHOT_TYPES]
    .map(t => ({ ...t, b: breakdown[t.type] ?? { att: 0, made: 0, pts: 0 } }))
    .filter(t => t.b.att > 0)
    .sort((a, b) => b.b.att - a.b.att)

  return (
    <div className="space-y-4">
      {/* 메인 라벨 바 */}
      <ShotBarLabeled breakdown={breakdown} height="lg" />

      {/* 상세 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-2">
        {sorted.map(({ type, label, color, b }) => {
          const pct = Math.round((b.att / totalAtt) * 100)
          const fgPct = b.att > 0 ? Math.round((b.made / b.att) * 100) : 0
          return (
            <div key={type} className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/40 flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs font-semibold text-gray-200">{label}</span>
              </div>
              <div className="text-2xl font-black text-white mt-0.5">{pct}%</div>
              <div className="text-xs text-gray-400">{b.made}/{b.att} 성공</div>
              <div className="text-xs text-gray-500">성공률 {fgPct}%</div>
              <div className="text-xs text-gray-600">{totalGames > 0 ? (b.att / totalGames).toFixed(1) : 0}회/경기</div>
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
  const [teams, setTeams]           = useState<OppTeam[]>([])
  const [selectedTeam, setSelectedTeam] = useState<OppTeam | null>(null)
  const [newTeamName, setNewTeamName]   = useState('')

  // Players
  const [players, setPlayers]           = useState<OppPlayer[]>([])
  const [newPlayerNumber, setNewPlayerNumber] = useState('')
  const [editingPlayer, setEditingPlayer]     = useState<string | null>(null)
  const [editingName, setEditingName]         = useState('')

  // Games
  const [games, setGames]               = useState<OppGame[]>([])
  const [selectedGame, setSelectedGame] = useState<OppGame | null>(null)
  const [newGameDate, setNewGameDate]   = useState(new Date().toISOString().split('T')[0])
  const [newGameVsTeam, setNewGameVsTeam]         = useState('')
  const [newGameRound, setNewGameRound]           = useState('')
  const [newGameTournament, setNewGameTournament] = useState('')
  const [newGameYouTubeUrl, setNewGameYouTubeUrl] = useState('')
  const [newGameStartOffset, setNewGameStartOffset] = useState('') // MM:SS 형식

  // Recording
  const [events, setEvents]           = useState<OppEvent[]>([])
  const [recQuarter, setRecQuarter]   = useState(1)
  const [selPlayer, setSelPlayer]     = useState<string | null>(null)
  const [pendingShot, setPendingShot] = useState<string | null>(null)
  const [lastEventId, setLastEventId] = useState<string | null>(null)
  const [lastEventLabel, setLastEventLabel] = useState('')
  const ytPlayerRef = useRef<YT.Player | null>(null)

  // Stats
  const [stats, setStats]               = useState<OppStats | null>(null)
  const [expandedGame, setExpandedGame] = useState<string | null>(null)
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null)

  // ── Loaders ──
  useEffect(() => {
    fetch('/api/opponent-teams').then(r => r.json()).then(setTeams)
  }, [])

  useEffect(() => {
    if (!selectedTeam) return
    fetch(`/api/opponent-players?teamId=${selectedTeam.id}`).then(r => r.json()).then(setPlayers)
    fetch(`/api/opponent-games?teamId=${selectedTeam.id}`).then(r => r.json()).then(setGames)
    setSelectedGame(null); setStats(null)
  }, [selectedTeam])

  const loadEvents = useCallback(() => {
    if (!selectedGame) return
    fetch(`/api/opponent-events?gameId=${selectedGame.id}`).then(r => r.json()).then(setEvents)
  }, [selectedGame])
  useEffect(() => { loadEvents() }, [loadEvents])

  const loadStats = useCallback(() => {
    if (!selectedTeam) return
    fetch(`/api/opponent-stats?teamId=${selectedTeam.id}`).then(r => r.json()).then(setStats)
  }, [selectedTeam])
  useEffect(() => { if (tab === 'analyze' && selectedTeam) loadStats() }, [tab, selectedTeam, loadStats])

  // ── Team actions ──
  async function addTeam() {
    if (!newTeamName.trim()) return
    const res = await fetch('/api/opponent-teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newTeamName.trim() }) })
    if (!res.ok) { toast.error('팀 추가 실패'); return }
    const t = await res.json()
    setTeams(prev => [t, ...prev]); setNewTeamName('')
    toast.success(`${t.name} 추가됨`)
  }

  async function deleteTeam(id: string) {
    if (!confirm('팀과 모든 관련 데이터를 삭제합니다. 계속하시겠습니까?')) return
    await fetch(`/api/opponent-teams/${id}`, { method: 'DELETE' })
    setTeams(prev => prev.filter(t => t.id !== id))
    if (selectedTeam?.id === id) setSelectedTeam(null)
    toast.success('팀 삭제됨')
  }

  // ── Player actions ──
  async function addPlayer() {
    if (!newPlayerNumber.trim() || !selectedTeam) return
    const res = await fetch('/api/opponent-players', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team_id: selectedTeam.id, number: newPlayerNumber.trim() }) })
    if (!res.ok) { toast.error('선수 추가 실패'); return }
    const p = await res.json()
    setPlayers(prev => [...prev, p].sort((a, b) => Number(a.number) - Number(b.number)))
    setNewPlayerNumber('')
  }

  async function savePlayerName(id: string) {
    const res = await fetch(`/api/opponent-players/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editingName.trim() || null }) })
    if (!res.ok) { toast.error('저장 실패'); return }
    const updated = await res.json()
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, name: updated.name } : p))
    setEditingPlayer(null)
  }

  async function deletePlayer(id: string) {
    await fetch(`/api/opponent-players/${id}`, { method: 'DELETE' })
    setPlayers(prev => prev.filter(p => p.id !== id))
  }

  // ── Game actions ──
  async function addGame() {
    if (!selectedTeam) return
    const res = await fetch('/api/opponent-games', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        opponent_team_id: selectedTeam.id,
        date: newGameDate,
        vs_team: newGameVsTeam.trim() || null,
        round: newGameRound.trim() || null,
        tournament_name: newGameTournament.trim() || null,
        youtube_url: newGameYouTubeUrl.trim() || null,
        youtube_start_offset: parseMMSS(newGameStartOffset),
      }),
    })
    if (!res.ok) { toast.error('경기 추가 실패'); return }
    const g = await res.json()
    setGames(prev => [g, ...prev])
    setNewGameVsTeam(''); setNewGameRound(''); setNewGameYouTubeUrl(''); setNewGameStartOffset('')
    toast.success('경기 추가됨')
  }

  async function deleteGame(id: string) {
    await fetch(`/api/opponent-games/${id}`, { method: 'DELETE' })
    setGames(prev => prev.filter(g => g.id !== id))
    if (selectedGame?.id === id) setSelectedGame(null)
    toast.success('경기 삭제됨')
  }

  // ── Recording ──
  function getCurrentTimestamp() {
    if (!ytPlayerRef.current) return 0
    try { return Math.floor(ytPlayerRef.current.getCurrentTime()) } catch { return 0 }
  }

  async function recordEvent(type: string, result?: 'made' | 'missed') {
    if (!selectedGame || !selPlayer) return
    const ts = getCurrentTimestamp()
    const res = await fetch('/api/opponent-events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: selectedGame.id, player_id: selPlayer, quarter: recQuarter, type, result: result ?? null, video_timestamp: ts }),
    })
    if (!res.ok) { toast.error('기록 실패'); return }
    const saved = await res.json()
    setLastEventId(saved.id)
    const pNum = players.find(p => p.id === selPlayer)?.number ?? '?'
    const pName = players.find(p => p.id === selPlayer)?.name
    const pLabel = pName ? `${pName}(#${pNum})` : `#${pNum}`
    const tsLabel = ts > 0 ? ` [${formatTimestamp(ts)}]` : ''
    setLastEventLabel(`${pLabel} — ${eventLabel(type)}${result ? (result === 'made' ? ' ✓' : ' ✗') : ''} Q${recQuarter}${tsLabel}`)
    toast.success('기록 완료')
    loadEvents()
  }

  async function undoLast() {
    if (!lastEventId) return
    await fetch(`/api/opponent-events?id=${lastEventId}`, { method: 'DELETE' })
    setLastEventId(null); setLastEventLabel('')
    loadEvents(); toast.success('마지막 기록 취소')
  }

  async function deleteEvent(id: string) {
    setDeletingEventId(id)
    await fetch(`/api/opponent-events?id=${id}`, { method: 'DELETE' })
    if (lastEventId === id) { setLastEventId(null); setLastEventLabel('') }
    setDeletingEventId(null)
    loadEvents(); toast.success('기록 삭제됨')
  }

  async function completeGame() {
    if (!selectedGame) return
    if (!confirm('이 경기 기록을 완료 처리합니까?')) return
    const res = await fetch(`/api/opponent-games/${selectedGame.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_complete: true }),
    })
    if (!res.ok) { toast.error('완료 처리 실패'); return }
    const updated = await res.json()
    setSelectedGame(updated)
    setGames(prev => prev.map(g => g.id === updated.id ? updated : g))
    toast.success('경기 기록 완료!')
  }

  async function reopenGame() {
    if (!selectedGame) return
    const res = await fetch(`/api/opponent-games/${selectedGame.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_complete: false }),
    })
    if (!res.ok) return
    const updated = await res.json()
    setSelectedGame(updated)
    setGames(prev => prev.map(g => g.id === updated.id ? updated : g))
    toast.success('기록 재개')
  }

  const tabStyle = (t: Tab) => cn(
    'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
    tab === t ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
  )

  return (
    <div className="container mx-auto px-4 py-6 max-w-[1600px]">
      <h1 className="text-2xl font-bold mb-1">상대팀 분석</h1>
      <p className="text-gray-400 text-sm mb-6">상대팀 경기 기록 및 공격 패턴 분석</p>

      {/* Team selector bar */}
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
            <input value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTeam()}
              placeholder="새 팀 이름"
              className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white w-36" />
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

          {/* ══ TAB: 팀 관리 ══ */}
          {tab === 'manage' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Players */}
              <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-4">
                <h2 className="font-semibold mb-3 text-gray-200">선수 등록</h2>
                <div className="flex gap-2 mb-4">
                  <input value={newPlayerNumber} onChange={e => setNewPlayerNumber(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addPlayer()}
                    placeholder="등번호 (예: 7)"
                    className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white flex-1" />
                  <button onClick={addPlayer} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">
                    <Plus size={14} />
                  </button>
                </div>
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {players.map(p => (
                    <div key={p.id} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                      <span className="font-bold text-white w-10 shrink-0">#{p.number}</span>
                      {editingPlayer === p.id ? (
                        <>
                          <input
                            value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') savePlayerName(p.id); if (e.key === 'Escape') setEditingPlayer(null) }}
                            autoFocus
                            placeholder="이름 입력"
                            className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-0.5 text-sm text-white"
                          />
                          <button onClick={() => savePlayerName(p.id)} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
                          <button onClick={() => setEditingPlayer(null)} className="text-gray-500 hover:text-gray-300"><X size={14} /></button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm text-gray-300">{p.name ?? <span className="text-gray-600 italic">이름 없음</span>}</span>
                          <button onClick={() => { setEditingPlayer(p.id); setEditingName(p.name ?? '') }}
                            className="text-gray-600 hover:text-blue-400 transition-colors"><Pencil size={13} /></button>
                          <button onClick={() => deletePlayer(p.id)} className="text-gray-600 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                        </>
                      )}
                    </div>
                  ))}
                  {players.length === 0 && <p className="text-gray-500 text-sm text-center py-4">등록된 선수 없음</p>}
                </div>
              </div>

              {/* Games */}
              <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-4">
                <h2 className="font-semibold mb-3 text-gray-200">경기 관리</h2>
                <div className="space-y-2 mb-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">날짜</label>
                      <input type="date" value={newGameDate} onChange={e => setNewGameDate(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">상대방 (vs)</label>
                      <input value={newGameVsTeam} onChange={e => setNewGameVsTeam(e.target.value)}
                        placeholder="예: 청팀"
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">대회명</label>
                      <input value={newGameTournament} onChange={e => setNewGameTournament(e.target.value)}
                        placeholder="선택"
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">라운드</label>
                      <input value={newGameRound} onChange={e => setNewGameRound(e.target.value)}
                        placeholder="선택"
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">YouTube URL</label>
                    <input value={newGameYouTubeUrl} onChange={e => setNewGameYouTubeUrl(e.target.value)}
                      placeholder="https://youtu.be/..."
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">영상 시작 오프셋 (분:초)</label>
                    <input
                      value={newGameStartOffset}
                      onChange={e => setNewGameStartOffset(e.target.value)}
                      onBlur={e => setNewGameStartOffset(formatMMSS(parseMMSS(e.target.value)))}
                      placeholder="0:00"
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white"
                    />
                  </div>
                  <button onClick={addGame} className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">
                    경기 추가
                  </button>
                </div>
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {games.map(g => (
                    <div key={g.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 text-sm">
                      <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                        {g.is_complete && <span className="text-green-400 text-xs font-bold">✓</span>}
                        <span className={cn('font-medium', g.is_complete ? 'text-gray-400' : 'text-white')}>{g.date}</span>
                        {g.vs_team && <span className="text-blue-400 text-xs">vs {g.vs_team}</span>}
                        {g.round && <span className="text-gray-500 text-xs">{g.round}</span>}
                        {g.youtube_url && <span className="text-green-500 text-xs">▶</span>}
                      </div>
                      <button onClick={() => deleteGame(g.id)} className="text-gray-600 hover:text-red-400 transition-colors ml-2 shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  {games.length === 0 && <p className="text-gray-500 text-sm text-center py-4">등록된 경기 없음</p>}
                </div>
              </div>
            </div>
          )}

          {/* ══ TAB: 경기 기록 ══ */}
          {tab === 'record' && (
            <div className="space-y-3">
              {/* Top selector bar */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 flex flex-wrap items-center gap-3">
                <select
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
                  value={selectedGame?.id ?? ''}
                  onChange={e => {
                    const g = games.find(g => g.id === e.target.value) ?? null
                    setSelectedGame(g); setSelPlayer(null); setPendingShot(null)
                    setLastEventId(null); setLastEventLabel(''); setRecQuarter(1)
                    ytPlayerRef.current = null
                  }}
                >
                  <option value="">-- 경기 선택 --</option>
                  {games.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.date}{g.vs_team ? ` vs ${g.vs_team}` : ''}{g.round ? ` (${g.round})` : ''}
                    </option>
                  ))}
                </select>

                {selectedGame && (
                  <div className="flex items-center gap-1">
                    {[1,2,3,4].map(q => (
                      <button key={q} onClick={() => setRecQuarter(q)}
                        className={cn('w-8 h-8 rounded-lg text-sm font-bold transition-colors',
                          recQuarter === q ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                        )}>Q{q}</button>
                    ))}
                  </div>
                )}

                <div className="ml-auto flex items-center gap-2 flex-wrap">
                  {lastEventLabel && (
                    <>
                      <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">{lastEventLabel}</span>
                      <button onClick={undoLast} className="flex items-center gap-1 px-2 py-1 bg-red-900/40 hover:bg-red-800/60 border border-red-700/50 text-red-400 text-xs rounded transition-colors">
                        <Undo2 size={12} /> 취소
                      </button>
                    </>
                  )}
                  {selectedGame && !selectedGame.is_complete && (
                    <button onClick={completeGame} className="flex items-center gap-1 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors">
                      <Check size={13} /> 기록 완료
                    </button>
                  )}
                  {selectedGame?.is_complete && (
                    <button onClick={reopenGame} className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors">
                      기록 재개
                    </button>
                  )}
                </div>
              </div>

              {!selectedGame ? (
                <div className="text-center py-20 text-gray-500">
                  <p className="mb-2">경기를 선택하세요</p>
                  <p className="text-xs text-gray-600">팀 관리 탭에서 먼저 경기를 등록하세요</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                  {/* ── Left: Player + Events (2/5) ── */}
                  <div className="lg:col-span-2 space-y-3">
                    {/* Player selector */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                      <p className="text-xs text-gray-500 mb-2 font-medium">선수 선택</p>
                      {players.length === 0 && (
                        <p className="text-gray-600 text-xs mb-2">팀 관리 탭에서 선수를 먼저 등록하세요</p>
                      )}
                      <div className="grid grid-cols-4 gap-1.5">
                        {players.map(p => (
                          <button key={p.id} onClick={() => setSelPlayer(p.id)}
                            className={cn(
                              'flex flex-col items-center py-2 px-1 rounded-lg text-xs font-bold transition-colors border',
                              selPlayer === p.id
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white'
                            )}>
                            <span className="text-base font-black">#{p.number}</span>
                            {p.name && <span className="text-[10px] opacity-70 mt-0.5 truncate w-full text-center">{p.name}</span>}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Event buttons */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                      {!selPlayer ? (
                        <p className="text-gray-500 text-sm text-center py-4">선수를 먼저 선택하세요</p>
                      ) : pendingShot ? (
                        /* Shot result */
                        <div className="flex flex-col items-center gap-3 py-2">
                          <div className="text-sm text-gray-300">
                            <span className="font-bold text-white">
                              {players.find(p => p.id === selPlayer)?.name ?? `#${players.find(p => p.id === selPlayer)?.number}`}
                            </span>
                            {' — '}
                            <span style={{ color: SHOT_TYPES.find(s => s.type === pendingShot)?.color }}>
                              {SHOT_TYPES.find(s => s.type === pendingShot)?.label}
                            </span>
                          </div>
                          <div className="flex gap-3 w-full">
                            <button onClick={() => { recordEvent(pendingShot, 'made'); setPendingShot(null) }}
                              className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white font-bold text-lg rounded-xl transition-colors">
                              성공 ✓
                            </button>
                            <button onClick={() => { recordEvent(pendingShot, 'missed'); setPendingShot(null) }}
                              className="flex-1 py-3 bg-red-700 hover:bg-red-600 text-white font-bold text-lg rounded-xl transition-colors">
                              실패 ✗
                            </button>
                          </div>
                          <button onClick={() => setPendingShot(null)} className="text-xs text-gray-500 hover:text-gray-300">취소</button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs text-gray-500 mb-2">슈팅</p>
                            <div className="grid grid-cols-3 gap-1.5">
                              {SHOT_TYPES.map(({ type, label, color }) => (
                                <button key={type} onClick={() => setPendingShot(type)}
                                  className="py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 active:scale-95"
                                  style={{ backgroundColor: color + 'CC' }}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-2">기타</p>
                            <div className="grid grid-cols-3 gap-1.5">
                              {OTHER_EVENTS.map(({ type, label, colorClass }) => (
                                <button key={type} onClick={() => recordEvent(type)}
                                  className={cn('py-2 rounded-lg text-sm font-semibold text-white transition-colors active:scale-95', colorClass)}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Recent events */}
                    {events.length > 0 && (
                      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                        <p className="text-xs text-gray-500 mb-2 font-medium">기록 목록 ({events.length}) — 휴지통으로 개별 삭제</p>
                        <div className="space-y-0.5 max-h-52 overflow-y-auto">
                          {[...events].reverse().map(ev => (
                            <div key={ev.id} className="flex items-center gap-2 text-xs text-gray-400 px-1 py-0.5 hover:bg-gray-800/50 rounded group">
                              <span className="text-gray-600 w-5 shrink-0">Q{ev.quarter}</span>
                              {ev.video_timestamp > 0 && (
                                <span className="text-gray-600 text-[10px] w-10 shrink-0">{formatTimestamp(ev.video_timestamp)}</span>
                              )}
                              <span className="font-bold text-white shrink-0">
                                {ev.player?.name ?? `#${ev.player?.number ?? '?'}`}
                              </span>
                              <span className="flex-1">{eventLabel(ev.type)}</span>
                              {ev.result && <span className={ev.result === 'made' ? 'text-green-400' : 'text-red-400'}>{ev.result === 'made' ? '✓' : '✗'}</span>}
                              {ev.points > 0 && <span className="text-yellow-400">+{ev.points}</span>}
                              <button
                                onClick={() => deleteEvent(ev.id)}
                                disabled={deletingEventId === ev.id}
                                className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all shrink-0"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Right: YouTube Player (3/5) ── */}
                  <div className="lg:col-span-3 space-y-3">
                    {selectedGame.youtube_url ? (
                      <OpponentYouTubePlayer
                        youtubeUrl={selectedGame.youtube_url}
                        startOffset={selectedGame.youtube_start_offset ?? 0}
                        onPlayerReady={player => { ytPlayerRef.current = player }}
                        onPlayerDestroy={() => { ytPlayerRef.current = null }}
                      />
                    ) : (
                      <div className="bg-gray-900 border border-gray-800 rounded-xl flex items-center justify-center aspect-video">
                        <div className="text-center">
                          <p className="text-gray-500 text-sm mb-1">YouTube 영상 없음</p>
                          <p className="text-gray-600 text-xs">팀 관리 탭의 경기 수정에서 YouTube URL을 추가하세요</p>
                        </div>
                      </div>
                    )}

                    {/* Game info */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm">
                      <div className="flex items-center gap-4 flex-wrap">
                        <span className="text-gray-400">{selectedGame.date}</span>
                        {selectedGame.vs_team && <span className="text-blue-400 font-medium">vs {selectedGame.vs_team}</span>}
                        {selectedGame.round && <span className="text-gray-500 text-xs bg-gray-800 px-2 py-0.5 rounded">{selectedGame.round}</span>}
                        {selectedGame.tournament_name && <span className="text-gray-400 text-xs">{selectedGame.tournament_name}</span>}
                        <span className="ml-auto text-gray-500 text-xs">{events.length}개 기록</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ TAB: 분석 ══ */}
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
                      <p className="text-xs text-gray-400 mb-4 font-medium">주요 슈터 (슈팅 시도 상위)</p>
                      <div className="space-y-3">
                        {[...stats.players].sort((a, b) => b.fga - a.fga).slice(0, 5).map((p, i) => (
                          <div key={p.player_id} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-600 text-xs w-4">{i + 1}</span>
                                <span className="font-bold text-white text-sm">
                                  #{p.player_number}{p.player_name ? ` ${p.player_name}` : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                <span className="text-gray-400">{p.fgm}/{p.fga} ({p.fg_pct ?? '-'}%)</span>
                                <span className="text-yellow-400 font-bold">{p.pts}pts</span>
                              </div>
                            </div>
                            <ShotBarLabeled breakdown={p.shot_breakdown} height="md" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* ② 선수별 누적 스탯 */}
                  <div className="bg-gray-900 border border-gray-700/50 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-700/50">
                      <h2 className="font-semibold text-gray-100">선수별 누적 스탯</h2>
                      <p className="text-xs text-gray-500 mt-0.5">공격 스타일 막대: 노랑=3P · 파랑=미들 · 초록=레이업 · 보라=골밑 · 회색=FT</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 border-b border-gray-700/50">
                            <th className="px-4 py-2 text-left font-medium">선수</th>
                            <th className="px-3 py-2 text-center font-medium">G</th>
                            <th className="px-3 py-2 text-center font-medium">PTS</th>
                            <th className="px-3 py-2 text-center font-medium">FG</th>
                            <th className="px-3 py-2 text-center font-medium">FG%</th>
                            <th className="px-3 py-2 text-center font-medium">3P</th>
                            <th className="px-3 py-2 text-center font-medium">3P%</th>
                            <th className="px-3 py-2 text-center font-medium">FT</th>
                            <th className="px-3 py-2 text-center font-medium">FT%</th>
                            <th className="px-3 py-2 text-center font-medium">OR</th>
                            <th className="px-4 py-2 text-left font-medium min-w-[200px]">공격 스타일</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.players.map(p => (
                            <tr key={p.player_id} className="border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors">
                              <td className="px-4 py-2.5">
                                <span className="font-bold text-white">#{p.player_number}</span>
                                {p.player_name && <span className="ml-1.5 text-gray-300 text-xs">{p.player_name}</span>}
                              </td>
                              <td className="px-3 py-2.5 text-center text-gray-300">{p.games}</td>
                              <td className="px-3 py-2.5 text-center font-bold text-yellow-400">{p.pts}</td>
                              <td className="px-3 py-2.5 text-center text-gray-300">{p.fgm}/{p.fga}</td>
                              <td className={cn('px-3 py-2.5 text-center font-medium', p.fg_pct !== null && p.fg_pct < 30 ? 'text-red-400' : 'text-gray-300')}>
                                {p.fg_pct !== null ? `${p.fg_pct}%` : '-'}
                              </td>
                              <td className="px-3 py-2.5 text-center text-gray-300">{p.fg3m}/{p.fg3a}</td>
                              <td className={cn('px-3 py-2.5 text-center font-medium', p.fg3_pct !== null && p.fg3_pct < 30 ? 'text-red-400' : 'text-gray-300')}>
                                {p.fg3_pct !== null ? `${p.fg3_pct}%` : '-'}
                              </td>
                              <td className="px-3 py-2.5 text-center text-gray-300">{p.ftm}/{p.fta}</td>
                              <td className={cn('px-3 py-2.5 text-center font-medium', p.ft_pct !== null && p.ft_pct < 60 ? 'text-red-400' : 'text-gray-300')}>
                                {p.ft_pct !== null ? `${p.ft_pct}%` : '-'}
                              </td>
                              <td className="px-3 py-2.5 text-center text-gray-300">{p.oreb}</td>
                              <td className="px-4 py-2.5 min-w-[200px]"><ShotBarLabeled breakdown={p.shot_breakdown} height="sm" /></td>
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
                          {expandedGame === g.game_id && (
                            <div className="px-5 pb-4 bg-gray-950/30">
                              {g.players.length === 0 ? (
                                <p className="text-gray-500 text-xs py-2">이 경기에 기록된 데이터 없음</p>
                              ) : (
                                <table className="w-full text-xs mt-2">
                                  <thead>
                                    <tr className="text-gray-500 border-b border-gray-700/50">
                                      <th className="py-1.5 text-left font-medium">선수</th>
                                      <th className="py-1.5 text-center font-medium">PTS</th>
                                      <th className="py-1.5 text-center font-medium">FG</th>
                                      <th className="py-1.5 text-left font-medium pl-4 min-w-[160px]">공격 스타일</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {g.players.map(p => (
                                      <tr key={p.player_id} className="border-b border-gray-800/40">
                                        <td className="py-1.5">
                                          <span className="font-bold text-white">#{p.player_number}</span>
                                          {p.player_name && <span className="ml-1 text-gray-400">{p.player_name}</span>}
                                        </td>
                                        <td className="py-1.5 text-center text-yellow-400 font-bold">{p.pts}</td>
                                        <td className="py-1.5 text-center text-gray-300">{p.fgm}/{p.fga}</td>
                                        <td className="py-1.5 pl-4 min-w-[160px]"><ShotBarLabeled breakdown={p.shot_breakdown} height="sm" /></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
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
