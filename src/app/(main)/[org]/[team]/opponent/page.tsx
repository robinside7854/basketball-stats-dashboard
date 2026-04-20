'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { cn, sortJerseyNum } from '@/lib/utils'
import { Plus, Trash2, ChevronDown, ChevronRight, Undo2, Pencil, Check, X } from 'lucide-react'
import OpponentYouTubePlayer from '@/components/record/OpponentYouTubePlayer'
import { formatTimestamp } from '@/lib/youtube/utils'
import { useTeam } from '@/contexts/TeamContext'
import SubTabNav from '@/components/layout/SubTabNav'

const STATS_SUB_TABS = [
  { path: '/stats',    label: '시즌 통계' },
  { path: '/opponent', label: '상대 분석' },
]

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
  vs_team: string | null; round: string | null; tournament_name: string | null
  players: Array<{ player_id: string; player_number: string; player_name: string | null; pts: number; fga: number; fgm: number; fg3a: number; fg3m: number; fta: number; ftm: number; oreb: number; shot_breakdown: ShotBreakdownMap }>
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
  { type: 'shot_3p',     label: '3P',   abbr: '3', color: '#EAB308', pts: 3 },
  { type: 'shot_2p_mid', label: '미들',  abbr: 'M', color: '#3B82F6', pts: 2 },
  { type: 'shot_layup',  label: '레이업', abbr: 'L', color: '#22C55E', pts: 2 },
  { type: 'shot_post',   label: '골밑',  abbr: 'D', color: '#8B5CF6', pts: 2 },
  { type: 'free_throw',  label: 'FT',   abbr: 'F', color: '#94A3B8', pts: 1 },
]
const OTHER_EVENTS = [
  { type: 'oreb', label: '공격REB', colorClass: 'bg-green-700 hover:bg-green-600' },
]

function eventLabel(type: string) {
  return SHOT_TYPES.find(s => s.type === type)?.label
    ?? OTHER_EVENTS.find(s => s.type === type)?.label
    ?? type
}

// ─── Labeled stacked bar ──────────────────────────────────────────────────────
function ShotBarLabeled({
  breakdown, height = 'md', showLabels = true,
}: {
  breakdown: ShotBreakdownMap; height?: 'sm' | 'md' | 'lg'; showLabels?: boolean
}) {
  const total = SHOT_TYPES.reduce((s, t) => s + (breakdown[t.type]?.att ?? 0), 0)
  if (total === 0) return <span className="text-gray-600 text-xs">-</span>

  const hClass = height === 'lg' ? 'h-12' : height === 'md' ? 'h-9' : 'h-6'
  const sorted = [...SHOT_TYPES]
    .map(t => ({ ...t, att: breakdown[t.type]?.att ?? 0, pct: Math.round(((breakdown[t.type]?.att ?? 0) / total) * 100) }))
    .filter(t => t.att > 0)
    .sort((a, b) => b.att - a.att)

  return (
    <div className={`flex w-full ${hClass} rounded-lg overflow-hidden gap-[2px]`}>
      {sorted.map(({ type, label, abbr, color, att, pct }) => (
        <div
          key={type}
          className="flex items-center justify-center overflow-hidden shrink-0"
          style={{ width: `${pct}%`, backgroundColor: color }}
          title={`${label}: ${att}회 (${pct}%)`}
        >
          {showLabels && pct >= 8 ? (
            <span className="text-white font-black drop-shadow select-none" style={{ fontSize: height === 'sm' ? '10px' : '12px' }}>{abbr}</span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

// ─── Donut chart (SVG) ─────────────────────────────────────────────────────────
function DonutChart({ breakdown, size = 80 }: { breakdown: ShotBreakdownMap; size?: number }) {
  const total = SHOT_TYPES.reduce((s, t) => s + (breakdown[t.type]?.att ?? 0), 0)
  if (total === 0) return <div style={{ width: size, height: size }} className="rounded-full bg-gray-800" />

  const cx = size / 2, cy = size / 2
  const outerR = (size / 2) * 0.88
  const innerR = (size / 2) * 0.52

  const slices = [...SHOT_TYPES]
    .map(t => ({ ...t, att: breakdown[t.type]?.att ?? 0 }))
    .filter(t => t.att > 0)
    .sort((a, b) => b.att - a.att)

  function arc(startAngle: number, endAngle: number): string {
    const x1 = cx + outerR * Math.cos(startAngle), y1 = cy + outerR * Math.sin(startAngle)
    const x2 = cx + outerR * Math.cos(endAngle),   y2 = cy + outerR * Math.sin(endAngle)
    const ix1 = cx + innerR * Math.cos(endAngle),  iy1 = cy + innerR * Math.sin(endAngle)
    const ix2 = cx + innerR * Math.cos(startAngle),iy2 = cy + innerR * Math.sin(startAngle)
    const large = endAngle - startAngle > Math.PI ? 1 : 0
    return `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${large} 0 ${ix2} ${iy2} Z`
  }

  // top type label for center
  const top = slices[0]
  const topPct = Math.round((top.att / total) * 100)

  let angle = -Math.PI / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      {slices.map(s => {
        const sweep = (s.att / total) * 2 * Math.PI
        const end = angle + sweep
        const path = arc(angle, end)
        angle = end
        return <path key={s.type} d={path} fill={s.color} stroke="#111827" strokeWidth="1.5" />
      })}
      {/* center label */}
      <text x={cx} y={cy - 4} textAnchor="middle" fill="white" fontSize={size * 0.14} fontWeight="700" style={{ fontFamily: 'inherit' }}>
        {top.label}
      </text>
      <text x={cx} y={cy + size * 0.14} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize={size * 0.12} fontWeight="600">
        {topPct}%
      </text>
    </svg>
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
  const team = useTeam()
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
  const recQuarter = 1
  const [selPlayer, setSelPlayer]     = useState<string | null>(null)
  const [pendingShot, setPendingShot] = useState<string | null>(null)
  const [lastEventId, setLastEventId] = useState<string | null>(null)
  const [lastEventLabel, setLastEventLabel] = useState('')
  const ytPlayerRef = useRef<YT.Player | null>(null)

  // Stats
  const [stats, setStats]               = useState<OppStats | null>(null)
  const [expandedGame, setExpandedGame] = useState<string | null>(null)
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<string>('pts')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')

  // ── Loaders ──
  useEffect(() => {
    fetch(`/api/opponent-teams?team=${team}`).then(r => r.json()).then(setTeams)
  }, [team])

  useEffect(() => {
    if (!selectedTeam) return
    fetch(`/api/opponent-players?teamId=${selectedTeam.id}`).then(r => r.json()).then((data: OppPlayer[]) => setPlayers([...data].sort((a, b) => sortJerseyNum(a.number, b.number))))
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
    const res = await fetch('/api/opponent-teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newTeamName.trim(), team_type: team }) })
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
    setPlayers(prev => [...prev, p].sort((a, b) => sortJerseyNum(a.number, b.number)))
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
    setLastEventLabel(`${pLabel} — ${eventLabel(type)}${result ? (result === 'made' ? ' ✓' : ' ✗') : ''}${tsLabel}`)
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
      <SubTabNav tabs={STATS_SUB_TABS} />

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
                    setLastEventId(null); setLastEventLabel('')
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
                                className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all shrink-0"
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

                    {/* Game info + 누적 스코어 */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm">
                      <div className="flex items-center gap-4 flex-wrap">
                        <span className="text-gray-400">{selectedGame.date}</span>
                        {selectedGame.vs_team && <span className="text-blue-400 font-medium">vs {selectedGame.vs_team}</span>}
                        {selectedGame.round && <span className="text-gray-500 text-xs bg-gray-800 px-2 py-0.5 rounded">{selectedGame.round}</span>}
                        {selectedGame.tournament_name && <span className="text-gray-400 text-xs">{selectedGame.tournament_name}</span>}
                        <span className="ml-auto text-gray-500 text-xs">{events.length}개 기록</span>
                      </div>
                      {/* 누적 득점 합계 */}
                      {events.length > 0 && (() => {
                        const total = events.reduce((s, e) => s + e.points, 0)
                        return (
                          <div className="mt-2 pt-2 border-t border-gray-800 flex items-center gap-2">
                            <span className="text-xs text-gray-500">누적 득점</span>
                            <span className="text-xl font-black font-mono text-yellow-400 ml-auto">{total}</span>
                            <span className="text-xs text-gray-500">점</span>
                          </div>
                        )
                      })()}
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
                      <p className="text-xs text-gray-400 mb-4 font-medium">주요 슈터 (슈팅 시도 상위 7)</p>
                      {(() => {
                        const top7 = [...stats.players].sort((a, b) => b.fga - a.fga).slice(0, 7)
                        const top5 = top7.slice(0, 5)
                        const rest = top7.slice(5)

                        const totalAtt = (p: typeof top7[0]) =>
                          SHOT_TYPES.reduce((s, t) => s + (p.shot_breakdown[t.type]?.att ?? 0), 0)

                        const PlayerCard = (p: typeof top7[0], i: number) => {
                          const tot = totalAtt(p)
                          const top2 = [...SHOT_TYPES]
                            .map(t => ({ ...t, att: p.shot_breakdown[t.type]?.att ?? 0 }))
                            .filter(t => t.att > 0)
                            .sort((a, b) => b.att - a.att)
                            .slice(0, 2)
                          return (
                            <div key={p.player_id} className="bg-gray-800/40 rounded-xl p-2 sm:p-3 flex flex-col items-center gap-1.5 border border-gray-700/30">
                              {/* rank + name */}
                              <div className="flex items-center gap-1 w-full">
                                <span className="text-gray-500 text-[10px] shrink-0">{i + 1}</span>
                                <span className="font-bold text-white text-xs truncate">
                                  #{p.player_number}{p.player_name ? ` ${p.player_name}` : ''}
                                </span>
                              </div>
                              {/* donut — responsive size */}
                              <DonutChart breakdown={p.shot_breakdown} size={96} />
                              {/* stats */}
                              <div className="flex items-center justify-between w-full" style={{ fontSize: '10px' }}>
                                <span className="text-gray-400">{p.fgm}/{p.fga}</span>
                                <span className="text-yellow-400 font-bold">{p.pts}pts</span>
                              </div>
                              {/* top 2 attack options */}
                              {top2.length > 0 && (
                                <div className="flex flex-col gap-0.5 w-full">
                                  {top2.map((t, idx) => (
                                    <span key={t.type} className="flex items-center gap-0.5 w-full rounded px-1 py-0.5 font-semibold text-white" style={{ backgroundColor: t.color + 'bb', fontSize: '10px' }}>
                                      <span className="shrink-0">{idx + 1}.</span>
                                      <span className="truncate">{t.label}</span>
                                      <span className="ml-auto shrink-0">{tot > 0 ? Math.round((t.att / tot) * 100) : 0}%</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        }

                        return (
                          <div className="space-y-3">
                            {/* Top 5 — 모바일 3열, sm 이상 5열 */}
                            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                              {top5.map((p, i) => PlayerCard(p, i))}
                            </div>
                            {/* 6~7위 — 동일 그리드 */}
                            {rest.length > 0 && (
                              <>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-px bg-gray-700/50" />
                                  <span className="text-xs text-gray-600">6~7위</span>
                                  <div className="flex-1 h-px bg-gray-700/50" />
                                </div>
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                  {rest.map((p, i) => PlayerCard(p, 5 + i))}
                                </div>
                              </>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  </div>

                  {/* ② 선수별 누적 스탯 */}
                  {(() => {
                    const toggleSort = (key: string) => {
                      if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
                      else { setSortKey(key); setSortDir('desc') }
                    }
                    const SortTh = ({ k, label, cls = 'text-center' }: { k: string; label: React.ReactNode; cls?: string }) => (
                      <th
                        className={`px-3 py-2 font-medium cursor-pointer select-none hover:text-gray-300 transition-colors ${cls}`}
                        onClick={() => toggleSort(k)}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          {label}
                          {sortKey === k ? (
                            <span className="text-blue-400">{sortDir === 'desc' ? ' ↓' : ' ↑'}</span>
                          ) : (
                            <span className="text-gray-700"> ↕</span>
                          )}
                        </span>
                      </th>
                    )
                    const getValue = (p: OppPlayerStat, key: string): number => {
                      if (key === 'number') return parseInt(p.player_number) || 0
                      if (key === 'games') return p.games
                      if (key === 'pts') return p.pts
                      if (key === 'fga') return p.fga
                      if (key === 'fg_pct') return p.fg_pct ?? -1
                      if (key === 'fg3a') return p.fg3a
                      if (key === 'fg3_pct') return p.fg3_pct ?? -1
                      if (key === 'fta') return p.fta
                      if (key === 'ft_pct') return p.ft_pct ?? -1
                      if (key === 'oreb') return p.oreb
                      return 0
                    }
                    const sorted = [...stats.players].sort((a, b) => {
                      if (sortKey === 'number') {
                        const r = sortJerseyNum(a.player_number, b.player_number)
                        return sortDir === 'desc' ? -r : r
                      }
                      const va = getValue(a, sortKey), vb = getValue(b, sortKey)
                      return sortDir === 'desc' ? vb - va : va - vb
                    })
                    return (
                  <div className="bg-gray-900 border border-gray-700/50 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-700/50">
                      <h2 className="font-semibold text-gray-100">선수별 누적 스탯</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 border-b border-gray-700/50">
                            <SortTh k="number" label="선수" cls="text-left px-4 py-2" />
                            <SortTh k="games" label="G" />
                            <SortTh k="pts" label="PTS" />
                            <SortTh k="fga" label="FG" />
                            <SortTh k="fg_pct" label="FG%" />
                            <SortTh k="fg3a" label="3P" />
                            <SortTh k="fg3_pct" label="3P%" />
                            <SortTh k="fta" label="FT" />
                            <SortTh k="ft_pct" label="FT%" />
                            <SortTh k="oreb" label="OR" />
                            <th className="px-4 py-2 text-left font-medium min-w-[200px]">
                              <div className="flex flex-col gap-1">
                                <span>공격 스타일</span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {SHOT_TYPES.map(t => (
                                    <div key={t.type} className="flex items-center gap-0.5">
                                      <span className="inline-flex items-center justify-center w-4 h-4 rounded text-white font-black text-[9px]" style={{ backgroundColor: t.color }}>{t.abbr}</span>
                                      <span className="text-gray-500 text-[10px]">{t.label}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map(p => (
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
                              <td className="px-4 py-2.5 min-w-[200px]"><ShotBarLabeled breakdown={p.shot_breakdown} height="sm" showLabels={true} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                    )
                  })()}

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
                            {g.vs_team && <span className="text-white text-xs font-semibold">vs {g.vs_team}</span>}
                            {g.round && <span className="text-gray-400 text-xs bg-gray-800 px-2 py-0.5 rounded">{g.round}</span>}
                            {g.tournament_name && <span className="text-blue-400 text-xs">{g.tournament_name}</span>}
                            <span className="ml-auto text-xs text-gray-500">{g.players.length}명 기록</span>
                          </button>
                          {expandedGame === g.game_id && (
                            <div className="px-5 pb-4 bg-gray-950/30">
                              {g.players.length === 0 ? (
                                <p className="text-gray-500 text-xs py-2">이 경기에 기록된 데이터 없음</p>
                              ) : (
                                <div className="overflow-x-auto mt-2">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-500 border-b border-gray-700/50">
                                      <th className="py-1.5 text-left font-medium pr-3">선수</th>
                                      <th className="py-1.5 text-center font-medium px-2">PTS</th>
                                      <th className="py-1.5 text-center font-medium px-2">FG</th>
                                      <th className="py-1.5 text-center font-medium px-2">FG%</th>
                                      <th className="py-1.5 text-center font-medium px-2">3P</th>
                                      <th className="py-1.5 text-center font-medium px-2">3P%</th>
                                      <th className="py-1.5 text-center font-medium px-2">FT</th>
                                      <th className="py-1.5 text-center font-medium px-2">FT%</th>
                                      <th className="py-1.5 text-center font-medium px-2">OR</th>
                                      <th className="py-1.5 text-left font-medium pl-3 min-w-[160px]">
                                        <div className="flex flex-col gap-0.5">
                                          <span>공격 스타일</span>
                                          <div className="flex items-center gap-1 flex-wrap">
                                            {SHOT_TYPES.map(t => (
                                              <div key={t.type} className="flex items-center gap-0.5">
                                                <span className="inline-flex items-center justify-center w-3 h-3 rounded text-white font-black" style={{ backgroundColor: t.color, fontSize: '8px' }}>{t.abbr}</span>
                                                <span className="text-gray-600" style={{ fontSize: '9px' }}>{t.label}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {g.players.map(p => {
                                      const fgPct = p.fga > 0 ? Math.round((p.fgm / p.fga) * 1000) / 10 : null
                                      const fg3Pct = p.fg3a > 0 ? Math.round((p.fg3m / p.fg3a) * 1000) / 10 : null
                                      const ftPct = p.fta > 0 ? Math.round((p.ftm / p.fta) * 1000) / 10 : null
                                      return (
                                      <tr key={p.player_id} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                                        <td className="py-1.5 pr-3">
                                          <span className="font-bold text-white">#{p.player_number}</span>
                                          {p.player_name && <span className="ml-1 text-gray-400">{p.player_name}</span>}
                                        </td>
                                        <td className="py-1.5 text-center font-bold text-yellow-400 px-2">{p.pts}</td>
                                        <td className="py-1.5 text-center text-gray-300 px-2">{p.fgm}/{p.fga}</td>
                                        <td className={cn('py-1.5 text-center font-medium px-2', fgPct !== null && fgPct < 30 ? 'text-red-400' : 'text-gray-300')}>
                                          {fgPct !== null ? `${fgPct}%` : '-'}
                                        </td>
                                        <td className="py-1.5 text-center text-gray-300 px-2">{p.fg3m}/{p.fg3a}</td>
                                        <td className={cn('py-1.5 text-center font-medium px-2', fg3Pct !== null && fg3Pct < 30 ? 'text-red-400' : 'text-gray-300')}>
                                          {fg3Pct !== null ? `${fg3Pct}%` : '-'}
                                        </td>
                                        <td className="py-1.5 text-center text-gray-300 px-2">{p.ftm}/{p.fta}</td>
                                        <td className={cn('py-1.5 text-center font-medium px-2', ftPct !== null && ftPct < 60 ? 'text-red-400' : 'text-gray-300')}>
                                          {ftPct !== null ? `${ftPct}%` : '-'}
                                        </td>
                                        <td className="py-1.5 text-center text-gray-300 px-2">{p.oreb}</td>
                                        <td className="py-1.5 pl-3 min-w-[160px]"><ShotBarLabeled breakdown={p.shot_breakdown} height="sm" showLabels={true} /></td>
                                      </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                                </div>
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
