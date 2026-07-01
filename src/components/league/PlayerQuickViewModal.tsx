'use client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2, X, Crown } from 'lucide-react'
import LeaderBadgePanel, { type LeaderBadgeCounts } from '@/components/league/LeaderBadgePanel'
import { CountUp, FormDots } from '@/components/league/StatCell'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import HalfCourtShotChart from '@/components/league/HalfCourtShotChart'
import { type EvaluatedBadge } from '@/lib/stats/badges'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, PieChart, Pie, Cell as PieCell } from 'recharts'

type PlayerInfo = {
  id: string; name: string; number: number | null; position: string | null
  birth_date: string | null; plus_one: boolean
}

type SeasonStats = {
  gp: number; pts: number; reb: number; ast: number; stl: number; blk: number; tov: number
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
  ppg: number; rpg: number; apg: number; spg: number; bpg: number; topg: number
  fg_pct: number; fg3_pct: number; ft_pct: number; efg_pct: number
}

type WLStats = { ppg: number; rpg: number; apg: number; spg: number; bpg: number } | null

type Detail = {
  rankings: { ppg: number; rpg: number; apg: number; spg: number; bpg: number; total: number; win_rate_rank?: number }
  active_streaks?: { ten: number; twenty: number; three: number; win: number }
  badges: EvaluatedBadge[]
  career_high: Record<string, { value: number; extra?: string; date?: string; opponent?: string; result?: string; score?: string }>
  shot_breakdown: { layup: { m: number; a: number; dist: number; fg_pct: number }; mid: { m: number; a: number; dist: number; fg_pct: number }; post: { m: number; a: number; dist: number; fg_pct: number }; drive: { m: number; a: number; dist: number; fg_pct: number }; three: { m: number; a: number; dist: number; fg_pct: number }; ft: { m: number; a: number; ft_pct: number }; total_fga: number }
  recent_games: Array<{ date?: string; opponent?: string; result?: string; score?: string; pts: number; reb: number; ast: number; stl?: number; blk?: number; fgm: number; fga: number; fg3m?: number; fg3a?: number }>
  win_loss?: {
    wins: number; losses: number; win_rate: number
    win_stats: WLStats; loss_stats: WLStats
    pts_share: number
  }
  player_stats: {
    gp: number; ppg: number; rpg: number; apg: number; spg: number; bpg: number; topg: number
    fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
    pts: number; reb: number; ast: number; stl: number; blk: number; tov: number
    fg_pct: number; fg3_pct: number; ft_pct: number
  } | null
  monthly_stats?: Array<{
    month: string; label: string; gp: number
    ppg: number; rpg: number; apg: number; spg: number; bpg: number; fg_pct: number
  }>
  vs_opponents?: Array<{
    team_id: string; team_name: string; team_color: string
    gp: number
    pts: number; reb: number; oreb: number; dreb: number
    ast: number; stl: number; blk: number; tov: number
    fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
    ppg: number; rpg: number; apg: number; spg: number; bpg: number
    fg_pct: number | null; fg3_pct: number | null; ft_pct: number | null
    wins: number; losses: number
  }>
}

const MONTH_STATS = [
  {key:'ppg',label:'득점'},{key:'rpg',label:'리바'},
  {key:'apg',label:'어시'},{key:'spg',label:'스틸'},
  {key:'bpg',label:'블록'},{key:'fg_pct',label:'FG%'},
] as const
type MonthStatKey = typeof MONTH_STATS[number]['key']

function Cell({ label, value, highlight = false, mono = false }: {
  label: string; value: string | number
  highlight?: boolean; mono?: boolean
}) {
  return (
    <div className="bg-gray-800/50 rounded-md px-1.5 py-1 text-center">
      <div className="text-[9px] text-gray-500 font-bold uppercase">{label}</div>
      <div className={`text-sm tabular-nums leading-tight ${highlight ? 'text-white font-black' : mono ? 'text-gray-300 font-bold' : 'text-gray-200 font-bold'}`}>
        {value}
      </div>
    </div>
  )
}

function MonthlyStatsChart({ data }: { data: NonNullable<Detail['monthly_stats']> }) {
  const [monthStat, setMonthStat] = useState<MonthStatKey>('ppg')
  return (
    <div className="px-5 py-4 border-b border-gray-800/60">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-600 uppercase tracking-widest font-bold">월별 성장지표</p>
        <div className="flex gap-1">
          {MONTH_STATS.map(s => (
            <button key={s.key} onClick={() => setMonthStat(s.key)}
              className={`px-2 py-0.5 text-[10px] font-bold rounded border cursor-pointer transition-colors ${
                monthStat === s.key ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
              }`}>{s.label}</button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={data} margin={{top:4,right:4,bottom:0,left:-20}}>
          <XAxis dataKey="label" tick={{fill:'#6b7280',fontSize:10}} axisLine={false} tickLine={false} />
          <YAxis tick={{fill:'#6b7280',fontSize:9}} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{background:'#1f2937',border:'1px solid #374151',borderRadius:6,fontSize:11}}
            formatter={(v) => [String(v), MONTH_STATS.find(s=>s.key===monthStat)?.label ?? '']}
          />
          <Bar dataKey={monthStat} fill="#3b82f6" radius={[3,3,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

type Quarter = { id: string; year: number; quarter: number; is_current: boolean }

function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  const b = new Date(birthDate)
  if (isNaN(b.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const md = now.getMonth() - b.getMonth()
  if (md < 0 || (md === 0 && now.getDate() < b.getDate())) age--
  return age
}

const POSITION_COLORS: Record<string, string> = {
  PG: 'bg-purple-900/40 text-purple-300 border-purple-700/40',
  SG: 'bg-blue-900/40 text-blue-300 border-blue-700/40',
  SF: 'bg-green-900/40 text-green-300 border-green-700/40',
  PF: 'bg-orange-900/40 text-orange-300 border-orange-700/40',
  C:  'bg-red-900/40 text-red-300 border-red-700/40',
}

function pctColor(pct: number): string {
  if (pct >= 50) return 'text-emerald-400'
  if (pct >= 30) return 'text-yellow-400'
  return 'text-red-400'
}

interface Props {
  leagueId: string
  playerId: string
  playerName: string // 로딩 전 즉시 표시용
  onClose: () => void
  isEditMode?: boolean
  leagueHeaders?: Record<string, string>
  onSaved?: () => void
  onDeleted?: () => void
}

export default function PlayerQuickViewModal({ leagueId, playerId, playerName, onClose, isEditMode, leagueHeaders, onSaved, onDeleted }: Props) {
  const [player, setPlayer] = useState<PlayerInfo | null>(null)
  const [stats, setStats] = useState<SeasonStats | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [leaderBadges, setLeaderBadges] = useState<LeaderBadgeCounts | null>(null)
  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [selectedQuarterId, setSelectedQuarterId] = useState<string | null>(null)
  const [quarterDetail, setQuarterDetail] = useState<Detail | null>(null)
  const [quarterLoading, setQuarterLoading] = useState(false)
  const [showEditPanel, setShowEditPanel] = useState(false)
  const [togglingP1, setTogglingP1] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', position: '', birth_date: '' })
  const [savingEdit, setSavingEdit] = useState(false)
  const [statUnit, setStatUnit] = useState<'round'|'game'>('round')
  const [shotView, setShotView] = useState<'court'|'donut'>('court')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [playersRes, statsRes, detailRes, quartersRes, leaderRes] = await Promise.all([
        fetch(`/api/leagues/${leagueId}/players`),
        fetch(`/api/leagues/${leagueId}/stats?playerId=${playerId}`),
        fetch(`/api/leagues/${leagueId}/players/${playerId}/detail?unit=${statUnit}`),
        fetch(`/api/leagues/${leagueId}/quarters`),
        fetch(`/api/leagues/${leagueId}/leader-badges?playerId=${playerId}`),
      ])
      if (playersRes.ok) {
        const all: PlayerInfo[] = await playersRes.json()
        setPlayer(all.find(p => p.id === playerId) ?? null)
      }
      if (statsRes.ok) {
        const d = await statsRes.json()
        setStats(d.players?.[0] ?? null)
      }
      if (detailRes.ok) setDetail(await detailRes.json())
      if (quartersRes.ok) {
        const qs: Quarter[] = await quartersRes.json()
        setQuarters(qs)
      }
      if (leaderRes.ok) {
        const lb = await leaderRes.json()
        setLeaderBadges(lb[playerId] ?? null)
      }
    } finally { setLoading(false) }
  }, [leagueId, playerId, statUnit])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => {
    if (player) setEditForm({ name: player.name, position: player.position ?? '', birth_date: player.birth_date ?? '' })
  }, [player])

  // 분기 선택 시 해당 분기 detail 패치
  useEffect(() => {
    if (!selectedQuarterId) { setQuarterDetail(null); return }
    let cancelled = false
    setQuarterLoading(true)
    fetch(`/api/leagues/${leagueId}/players/${playerId}/detail?quarterId=${selectedQuarterId}&unit=${statUnit}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setQuarterDetail(d) })
      .finally(() => { if (!cancelled) setQuarterLoading(false) })
    return () => { cancelled = true }
  }, [leagueId, playerId, selectedQuarterId, statUnit])

  const activeDetail = selectedQuarterId ? (quarterDetail ?? detail) : detail

  const positions = (player?.position ?? '').split(',').map(p => p.trim()).filter(Boolean)
  const age = calcAge(player?.birth_date ?? null)

  // 분기 탭 레이블
  const quarterLabel = (q: Quarter) => `${String(q.year).slice(2)}.${q.quarter}Q`

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-gray-900 border-0 sm:border border-gray-700 rounded-none sm:rounded-2xl w-full max-w-lg sm:max-w-xl h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto z-10 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700 px-5 pt-safe-or-3 pb-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-white font-black text-lg leading-none flex items-center gap-2 flex-wrap">
                {player?.number != null && <span className="jersey-num text-sm">{player.number}</span>}
                <span>{player?.name ?? playerName}</span>
              </h2>
              <div className="flex items-center gap-2 mt-1">
                {positions.map(pos => (
                  <span key={pos} className={`text-xs font-bold px-1.5 py-0.5 rounded border ${POSITION_COLORS[pos] ?? 'bg-blue-900/40 text-blue-300 border-blue-700/40'}`}>{pos}</span>
                ))}
                {player?.plus_one && (
                  <span className="text-xs font-black px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300">+1</span>
                )}
                {age && <span className="text-xs text-gray-600">만 {age}세</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEditMode && (
              <button
                onClick={() => setShowEditPanel(v => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors border ${showEditPanel ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:text-white'}`}
              >
                <span>✏️</span> 편집
              </button>
            )}
            <button onClick={onClose} className="rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white cursor-pointer transition-colors inline-flex items-center justify-center min-h-11 min-w-11">
              <X size={18} />
            </button>
          </div>
        </div>

        {showEditPanel && isEditMode && (() => {
          const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const
          const positionList = editForm.position
            ? editForm.position.split(',').map(s => s.trim()).filter(Boolean)
            : []
          const togglePosition = (p: string) => {
            const next = positionList.includes(p)
              ? positionList.filter(x => x !== p)
              : [...positionList, p]
            setEditForm(f => ({ ...f, position: next.join(',') }))
          }
          return (
          <div className="px-5 py-4 border-b border-gray-800 bg-gray-800/30 space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">선수 정보 수정</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">이름</label>
                <input value={editForm.name} onChange={e => setEditForm(f => ({...f, name: e.target.value}))}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-2.5 py-1.5 text-xs" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">생년월일</label>
                <input type="date" value={editForm.birth_date} onChange={e => setEditForm(f => ({...f, birth_date: e.target.value}))}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-2.5 py-1.5 text-xs" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-gray-500 block mb-1">포지션 (다중 선택)</label>
                <div className="flex flex-wrap gap-1.5">
                  {POSITIONS.map(p => {
                    const active = positionList.includes(p)
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => togglePosition(p)}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold border transition-colors cursor-pointer ${
                          active
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="col-span-2">
                <button onClick={async () => {
                  if (!leagueHeaders) return
                  setSavingEdit(true)
                  const res = await fetch(`/api/leagues/${leagueId}/players?playerId=${playerId}`, {
                    method: 'PATCH', headers: {...leagueHeaders, 'Content-Type': 'application/json'},
                    body: JSON.stringify({ name: editForm.name, position: editForm.position || null, birth_date: editForm.birth_date || null }),
                  })
                  setSavingEdit(false)
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({ error: '저장 실패' }))
                    alert(err.error || '저장 실패')
                    return
                  }
                  onSaved?.(); setShowEditPanel(false)
                }} disabled={savingEdit} className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                  {savingEdit ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
            {/* Plus_one toggle */}
            <div className="flex items-center justify-between py-2 px-3 bg-gray-800/60 rounded-lg">
              <span className="text-xs text-gray-400">+1 플러스원 선수</span>
              <button onClick={async () => {
                if (!leagueHeaders || !player) return
                setTogglingP1(true)
                const newVal = !player.plus_one
                await fetch(`/api/leagues/${leagueId}/players?playerId=${playerId}`, {
                  method: 'PATCH', headers: {...leagueHeaders, 'Content-Type': 'application/json'},
                  body: JSON.stringify({ plus_one: newVal }),
                })
                setTogglingP1(false); onSaved?.()
              }} disabled={togglingP1} className={`px-3 py-1 rounded-full text-xs font-bold cursor-pointer transition-colors disabled:opacity-50 ${player?.plus_one ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300' : 'bg-gray-700 border border-gray-600 text-gray-400 hover:border-amber-500/40'}`}>
                {player?.plus_one ? '+1 ON' : '+1 OFF'}
              </button>
            </div>
            {/* Delete */}
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} className="w-full py-2 rounded-lg bg-red-900/20 border border-red-800/40 text-red-400 text-xs font-bold cursor-pointer hover:bg-red-900/40 transition-colors">
                선수 삭제
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={async () => {
                  if (!leagueHeaders) return
                  setDeleting(true)
                  await fetch(`/api/leagues/${leagueId}/players?playerId=${playerId}`, { method: 'DELETE', headers: leagueHeaders })
                  setDeleting(false); onDeleted?.(); onClose()
                }} disabled={deleting} className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                  {deleting ? '삭제 중...' : '삭제 확인'}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-bold cursor-pointer">취소</button>
              </div>
            )}
          </div>
          )
        })()}

        <div className="h-0.5 w-full bg-gradient-to-r from-blue-500/60 via-blue-500/20 to-transparent" />

        {loading ? (
          <div className="flex justify-center py-16"><BasketballLoader size={28} /></div>
        ) : (
          <div className="space-y-0">
            {/* 시즌 스탯 */}
            {activeDetail?.player_stats ? (
              <div className="px-5 py-4 border-b border-gray-800/60">
                {/* 분기 필터 탭 */}
                <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-0.5">
                  {quarters.length > 0 && (
                    <>
                      <button
                        onClick={() => setSelectedQuarterId(null)}
                        className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold cursor-pointer transition-colors border ${
                          selectedQuarterId === null
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-gray-800/60 border-gray-700/50 text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        전체
                      </button>
                      {quarters.map(q => (
                        <button
                          key={q.id}
                          onClick={() => setSelectedQuarterId(q.id)}
                          className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold cursor-pointer transition-colors border ${
                            selectedQuarterId === q.id
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'bg-gray-800/60 border-gray-700/50 text-gray-400 hover:text-gray-200'
                          }`}
                        >
                          {quarterLabel(q)}
                          {q.is_current && <span className="ml-1 text-[9px] text-blue-300">현재</span>}
                        </button>
                      ))}
                    </>
                  )}
                  <div className="flex items-center gap-1 bg-gray-800/40 rounded-lg p-0.5 ml-auto shrink-0">
                    {(['round','game'] as const).map(u => (
                      <button key={u} onClick={() => setStatUnit(u)}
                        className={`px-2.5 py-0.5 text-[10px] font-bold rounded cursor-pointer transition-colors ${
                          statUnit === u ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-200'
                        }`}>
                        {u === 'round' ? 'R' : 'G'}
                      </button>
                    ))}
                  </div>
                </div>

                {quarterLoading ? (
                  <div className="flex justify-center py-8"><BasketballLoader size={22} /></div>
                ) : (
                  <>
                    <p className="text-xs text-gray-600 uppercase tracking-widest font-bold mb-3">시즌 스탯</p>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-3">
                      {[
                        { label: statUnit === 'round' ? 'R' : 'G', value: activeDetail?.player_stats?.gp ?? 0,  decimals: 0, rank: 0,                         accent: false },
                        { label: 'PPG', value: activeDetail?.player_stats?.ppg ?? 0, decimals: 1, rank: detail?.rankings.ppg ?? 0, accent: true  },
                        { label: 'RPG', value: activeDetail?.player_stats?.rpg ?? 0, decimals: 1, rank: detail?.rankings.rpg ?? 0, accent: false },
                        { label: 'APG', value: activeDetail?.player_stats?.apg ?? 0, decimals: 1, rank: detail?.rankings.apg ?? 0, accent: false },
                        { label: 'STL', value: activeDetail?.player_stats?.spg ?? 0, decimals: 1, rank: detail?.rankings.spg ?? 0, accent: false },
                        { label: 'BLK', value: activeDetail?.player_stats?.bpg ?? 0, decimals: 1, rank: detail?.rankings.bpg ?? 0, accent: false },
                      ].map(({ label, value, decimals, rank, accent }) => (
                        <div key={label} className={`rounded-xl p-2.5 text-center border ${accent ? 'bg-orange-900/20 border-orange-700/50' : 'bg-gray-800/50 border-gray-700/60'}`}>
                          <p className="font-jersey text-xs font-bold text-gray-600 mb-1 uppercase tracking-widest">{label}</p>
                          <p className={`font-display text-4xl leading-none ${accent ? 'text-orange-300' : 'text-white'}`}>
                            <CountUp value={value} decimals={decimals} />
                          </p>
                          {rank > 0 && (
                            <p className={`text-[10px] font-bold mt-1 flex items-center justify-center gap-0.5 ${rank === 1 ? 'text-yellow-400' : rank <= 3 ? 'text-orange-400' : 'text-gray-600'}`}>
                              {rank === 1 && <Crown size={8} />}
                              {rank}위
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      {[
                        { label: 'FG%', pct: activeDetail?.player_stats?.fg_pct ?? 0, m: activeDetail?.player_stats?.fgm ?? 0, a: activeDetail?.player_stats?.fga ?? 0 },
                        { label: '3P%', pct: activeDetail?.player_stats?.fg3_pct ?? 0, m: activeDetail?.player_stats?.fg3m ?? 0, a: activeDetail?.player_stats?.fg3a ?? 0 },
                        { label: 'FT%', pct: activeDetail?.player_stats?.ft_pct ?? 0, m: activeDetail?.player_stats?.ftm ?? 0, a: activeDetail?.player_stats?.fta ?? 0 },
                      ].map(({ label, pct, m, a }) => (
                        <div key={label} className="bg-gray-900/50 border border-gray-800/40 rounded-xl p-2.5 text-center">
                          <p className="text-xs text-gray-600 mb-1 uppercase">{label}</p>
                          <p className="text-xl font-black text-white leading-none">
                            {a > 0 ? <><CountUp value={pct} decimals={1} />%</> : '—'}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{m}/{a}</p>
                        </div>
                      ))}
                    </div>

                    {/* 능력치 레이더 — 리그 백분위 (rankings 기반) */}
                    {activeDetail?.player_stats && detail?.rankings && (() => {
                      const total = detail.rankings.total ?? 1
                      const pctile = (rank: number) => rank > 0 && total > 0
                        ? Math.round((total - rank + 1) / total * 100)
                        : 50
                      const radarData = [
                        { stat: '득점',     value: pctile(detail.rankings.ppg ?? 0) },
                        { stat: '리바운드', value: pctile(detail.rankings.rpg ?? 0) },
                        { stat: '어시스트', value: pctile(detail.rankings.apg ?? 0) },
                        { stat: '스틸',     value: pctile(detail.rankings.spg ?? 0) },
                        { stat: '블록',     value: pctile(detail.rankings.bpg ?? 0) },
                      ]
                      return (
                        <div className="mt-2">
                          <ResponsiveContainer width="100%" height={160}>
                            <RadarChart data={radarData} margin={{top:8,right:20,bottom:8,left:20}}>
                              <PolarGrid stroke="#374151" />
                              <PolarAngleAxis dataKey="stat" tick={{fill:'#9ca3af',fontSize:10,fontWeight:600}} />
                              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                              <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} strokeWidth={2} />
                            </RadarChart>
                          </ResponsiveContainer>
                          <p className="text-[9px] text-gray-600 text-center mt-0.5">리그 백분위 (100 = 1위)</p>
                        </div>
                      )
                    })()}

                    {/* 승/패/승률 row */}
                    {activeDetail?.win_loss && (activeDetail.win_loss.wins + activeDetail.win_loss.losses) > 0 && (() => {
                      const wl = activeDetail.win_loss!
                      const total = ranked_total(detail)
                      // 최근 5R 의 결과를 닷으로 (오래된 → 최신 순)
                      const recent = (activeDetail?.recent_games ?? []).slice(0, 5)
                      const form = [...recent].reverse().map(g => {
                        const r = g.result
                        return (r === 'W' || r === 'L' || r === 'D') ? r : null
                      })
                      return (
                        <div className="mt-2 bg-gray-900/50 border border-gray-800/40 rounded-xl px-3 py-2.5 flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-3">
                            <span className="text-green-400 font-black text-base">{wl.wins}W</span>
                            <span className="text-gray-600">·</span>
                            <span className="text-red-400 font-black text-base">{wl.losses}L</span>
                            {form.length > 0 && (
                              <div className="flex items-center gap-1.5 ml-1">
                                <span className="text-[9px] text-gray-600 font-bold uppercase tracking-wide">최근</span>
                                <FormDots results={form} size={7} />
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">출전 승률</span>
                            <span className={`font-black text-base ${wl.win_rate >= 60 ? 'text-green-400' : wl.win_rate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {wl.win_rate}%
                            </span>
                            {total > 0 && (() => {
                              const rank = computeWinRateRank(activeDetail)
                              return rank > 0 ? (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-800 ${rank === 1 ? 'text-yellow-400' : rank <= 3 ? 'text-orange-400' : 'text-gray-500'}`}>{rank}위</span>
                              ) : null
                            })()}
                          </div>
                        </div>
                      )
                    })()}

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mt-2">
                      {([
                        ['PTS', activeDetail?.player_stats?.pts ?? 0, true ],
                        ['REB', activeDetail?.player_stats?.reb ?? 0, false],
                        ['AST', activeDetail?.player_stats?.ast ?? 0, false],
                        ['STL', activeDetail?.player_stats?.stl ?? 0, false],
                        ['BLK', activeDetail?.player_stats?.blk ?? 0, false],
                        ['TOV', activeDetail?.player_stats?.tov ?? 0, false],
                      ] as const).map(([l, v, hi]) => (
                        <div key={l} className={`rounded-xl p-2 text-center border ${hi ? 'bg-blue-900/30 border-blue-700/50' : 'bg-gray-800/50 border-gray-700/60'}`}>
                          <p className="text-[10px] text-gray-600 mb-0.5 uppercase">{l}</p>
                          <p className={`text-base font-black ${hi ? 'text-blue-300' : 'text-white'}`}>
                            <CountUp value={v} decimals={0} />
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="px-5 py-6 text-center text-sm text-gray-600 border-b border-gray-800/60">아직 기록된 스탯이 없습니다</div>
            )}

            {/* 리더 뱃지 — 부문별 1등 카운트 (POTM) */}
            {leaderBadges && (
              <LeaderBadgePanel badges={leaderBadges} />
            )}

            {/* 출전 임팩트 */}
            {detail?.win_loss && (detail.win_loss.wins + detail.win_loss.losses) > 0 && (() => {
              const wl = detail.win_loss
              const WL_STATS: { key: keyof NonNullable<WLStats>; label: string }[] = [
                { key: 'ppg', label: 'PPG' }, { key: 'rpg', label: 'RPG' },
                { key: 'apg', label: 'APG' }, { key: 'spg', label: 'SPG' },
                { key: 'bpg', label: 'BPG' },
              ]
              const streaks = detail?.active_streaks
              const streakChips = streaks ? ([
                { count: streaks.ten,    label: '두자릿수 득점', icon: '🔥', color: 'amber',    minShow: 2 },
                { count: streaks.twenty, label: '20+ 득점',      icon: '⭐', color: 'orange',  minShow: 2 },
                { count: streaks.three,  label: '3P 메이드',     icon: '🎯', color: 'blue',     minShow: 2 },
                { count: streaks.win,    label: '출전 연승',     icon: '🟢', color: 'emerald',  minShow: 2 },
              ] as const).filter(c => c.count >= c.minShow) : []
              const STREAK_CLS: Record<typeof streakChips[number]['color'], string> = {
                amber:   'bg-amber-900/30 border-amber-700/50 text-amber-300',
                orange:  'bg-orange-900/30 border-orange-700/50 text-orange-300',
                blue:    'bg-blue-900/30 border-blue-700/50 text-blue-300',
                emerald: 'bg-emerald-900/30 border-emerald-700/50 text-emerald-300',
              }
              return (
                <div className="px-5 py-4 border-b border-gray-800/60">
                  <p className="text-xs text-gray-600 uppercase tracking-widest font-bold mb-3">출전 임팩트</p>

                  {/* W-L + 승률 + 팀 기여도 */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 bg-gray-900/60 border border-gray-800/50 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-gray-600 mb-1 uppercase">전적</p>
                      <p className="text-base font-black leading-none">
                        <span className="text-green-400">{wl.wins}W</span>
                        <span className="text-gray-600 mx-1">·</span>
                        <span className="text-red-400">{wl.losses}L</span>
                      </p>
                    </div>
                    <div className="flex-1 bg-gray-900/60 border border-gray-800/50 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-gray-600 mb-1 uppercase">출전 승률</p>
                      <p className={`text-xl font-black leading-none ${wl.win_rate >= 60 ? 'text-green-400' : wl.win_rate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {wl.win_rate}%
                      </p>
                    </div>
                    <div className="flex-1 bg-gray-900/60 border border-gray-800/50 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-gray-600 mb-1 uppercase">팀 득점 기여</p>
                      <p className="text-xl font-black text-blue-300 leading-none">{wl.pts_share}%</p>
                    </div>
                  </div>

                  {/* Active Streaks — 2회 이상만 표시 */}
                  {streakChips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {streakChips.map(c => (
                        <span key={c.label}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold ${STREAK_CLS[c.color]}`}>
                          <span>{c.icon}</span>
                          <span>{c.label}</span>
                          <span className="font-black">{c.count}{statUnit === 'round' ? 'R' : 'G'}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 승/패 스탯 비교 */}
                  {(wl.win_stats || wl.loss_stats) && (
                    <div>
                      <div className="grid grid-cols-7 gap-1 text-center mb-1">
                        <div />
                        {WL_STATS.map(({ label }) => (
                          <div key={label} className="text-[10px] text-gray-600 font-bold uppercase">{label}</div>
                        ))}
                      </div>
                      {([
                        { label: '이길 때', stats: wl.win_stats,  color: 'text-green-400', bg: 'bg-green-900/10 border-green-800/30' },
                        { label: '질 때',   stats: wl.loss_stats, color: 'text-red-400',   bg: 'bg-red-900/10 border-red-800/30'   },
                      ] as const).map(({ label, stats: wls, color, bg }) => (
                        <div key={label} className={`grid grid-cols-7 gap-1 items-center rounded-lg border px-2 py-2 mb-1.5 ${bg}`}>
                          <p className={`text-[10px] font-bold ${color} whitespace-nowrap`}>{label}</p>
                          {WL_STATS.map(({ key }) => (
                            <p key={key} className="text-sm font-black text-white text-center">
                              {wls ? wls[key] : '—'}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* 공격 스타일 — 골밑 → 레이업/드라이브 → 미들 → 3점 */}
            {activeDetail?.shot_breakdown && activeDetail.shot_breakdown.total_fga > 0 && (
              <div className="px-5 py-4 border-b border-gray-800/60">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-jersey text-xs text-orange-400 uppercase tracking-[0.18em] font-bold">공격 스타일</p>
                  {/* 코트 / 도넛 토글 */}
                  <div className="flex rounded-lg overflow-hidden border border-gray-700 shrink-0">
                    {(['court', 'donut'] as const).map(v => (
                      <button key={v} onClick={() => setShotView(v)}
                        className={`px-2.5 py-1 text-[10px] font-bold cursor-pointer transition-colors ${
                          shotView === v ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                        }`}>
                        {v === 'court' ? '코트' : '도넛'}
                      </button>
                    ))}
                  </div>
                </div>
                {(() => {
                  const sb = activeDetail.shot_breakdown
                  // 골밑 + 드라이브/레이업 합산 표기
                  const slashLayup = {
                    label: '레이업/드라이브',
                    color: '#f97316',
                    m: sb.layup.m + (sb.drive?.m ?? 0),
                    a: sb.layup.a + (sb.drive?.a ?? 0),
                    dist: sb.layup.dist + (sb.drive?.dist ?? 0),
                    fg_pct: (() => {
                      const totalA = sb.layup.a + (sb.drive?.a ?? 0)
                      const totalM = sb.layup.m + (sb.drive?.m ?? 0)
                      return totalA > 0 ? +(totalM / totalA * 100).toFixed(1) : 0
                    })(),
                  }
                  const rawZones = [
                    { label: '골밑',         color: '#ef4444', data: sb.post  },
                    { label: '레이업/드라이브', color: '#f97316', data: { m: slashLayup.m, a: slashLayup.a, dist: slashLayup.dist, fg_pct: slashLayup.fg_pct } },
                    { label: '미들슛',        color: '#eab308', data: sb.mid   },
                    { label: '3점슛',         color: '#3b82f6', data: sb.three },
                  ].filter(z => z.data.a > 0)

                  const ftZone = sb.ft.a > 0
                    ? [{ label: '자유투', color: '#9ca3af', data: { m: sb.ft.m, a: sb.ft.a, dist: 0, fg_pct: sb.ft.ft_pct } }]
                    : []

                  // 도넛 데이터 — 비중 0 제외, 야투 시도 4종만 (자유투는 별도)
                  const donutData = rawZones
                    .filter(z => z.data.dist > 0)
                    .map(z => ({
                      name: z.label,
                      value: +z.data.dist.toFixed(1),
                      fg_pct: z.data.fg_pct,
                      m: z.data.m,
                      a: z.data.a,
                      color: z.color,
                    }))
                  const totalFGA = sb.total_fga
                  const totalFGM = sb.layup.m + (sb.drive?.m ?? 0) + sb.mid.m + sb.post.m + sb.three.m
                  const overallFGPct = totalFGA > 0 ? +(totalFGM / totalFGA * 100).toFixed(1) : 0

                  // 코트 차트용 zones 구조 (m/a/fg_pct)
                  const courtZones = {
                    post:  { m: sb.post.m,                          a: sb.post.a,                          fg_pct: sb.post.fg_pct  },
                    layup: { m: slashLayup.m,                       a: slashLayup.a,                       fg_pct: slashLayup.fg_pct },
                    mid:   { m: sb.mid.m,                           a: sb.mid.a,                           fg_pct: sb.mid.fg_pct   },
                    three: { m: sb.three.m,                         a: sb.three.a,                         fg_pct: sb.three.fg_pct },
                  }

                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                        {/* 좌측: 코트 또는 도넛 (토글) */}
                        {shotView === 'court' ? (
                          <div className="flex justify-center">
                            <HalfCourtShotChart zones={courtZones} size={320} />
                          </div>
                        ) : (
                          <div className="relative" style={{ height: 180 }}>
                            <ResponsiveContainer width="100%" height={180}>
                              <PieChart>
                                <Pie
                                  data={donutData}
                                  dataKey="value"
                                  nameKey="name"
                                  innerRadius="58%"
                                  outerRadius="86%"
                                  paddingAngle={2}
                                  stroke="none"
                                  isAnimationActive
                                  animationDuration={600}
                                >
                                  {donutData.map((d, i) => <PieCell key={i} fill={d.color} />)}
                                </Pie>
                                <Tooltip
                                  content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null
                                    const p = payload[0].payload as typeof donutData[number]
                                    return (
                                      <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs shadow-xl">
                                        <p className="font-black" style={{ color: p.color }}>{p.name}</p>
                                        <p className="text-gray-300 mt-0.5">{p.m}/{p.a} · FG {p.fg_pct}%</p>
                                        <p className="text-gray-500">비중 {p.value}%</p>
                                      </div>
                                    )
                                  }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                            {/* 중앙 라벨 */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="text-center">
                                <p className="font-display text-3xl text-white leading-none">
                                  <CountUp value={totalFGA} />
                                </p>
                                <p className="font-jersey text-[9px] text-gray-500 uppercase tracking-wider font-bold mt-1">시도</p>
                                <p className={`text-[11px] font-bold mt-0.5 ${pctColor(overallFGPct)}`}>{overallFGPct}%</p>
                              </div>
                            </div>
                          </div>
                        )}
                        {/* 존별 카드 리스트 (도넛 우측) */}
                        <div className="space-y-1.5">
                          {[...rawZones, ...ftZone].map(z => {
                            const pct = z.data.fg_pct
                            const colorClass = pctColor(pct)
                            return (
                              <div key={z.label} className="bg-gray-800/50 border border-gray-700/50 rounded-lg px-2.5 py-2 flex items-center gap-2">
                                <div className="w-1.5 h-8 rounded-full shrink-0" style={{ backgroundColor: z.color }} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] text-gray-400 font-bold uppercase truncate leading-tight">{z.label}</p>
                                  <p className="text-[10px] text-gray-500 leading-tight">{z.data.m}/{z.data.a}{z.data.dist > 0 ? ` · ${(+z.data.dist).toFixed(1)}%` : ''}</p>
                                </div>
                                <div className="text-right">
                                  <p className={`text-lg font-black leading-none ${colorClass}`}>{pct}%</p>
                                  <div className="w-10 h-1 rounded-full bg-gray-700 overflow-hidden mt-1 ml-auto">
                                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: z.color }} />
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Career High Day — 하루(같은 날의 여러 경기 합산) 기준 최고점 */}
            {detail?.career_high && Object.keys(detail.career_high).length > 0 && (() => {
              const CH_LABEL: Record<string, string> = {
                pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK',
                fgPct: 'FG%', fg3m: '3PM',
              }
              const CH_ORDER = ['pts', 'reb', 'ast', 'stl', 'blk', 'fg3m', 'fgPct']
              const entries = CH_ORDER
                .filter(k => detail.career_high[k])
                .map(k => [k, detail.career_high[k]] as const)
              if (entries.length === 0) return null
              return (
                <div className="px-5 py-4 border-b border-gray-800/60">
                  <p className="text-xs text-gray-600 uppercase tracking-widest font-bold mb-3">
                    Career High <span className="text-amber-400">Day</span>
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {entries.map(([key, ch]) => (
                      <div key={key} className="bg-gray-900/60 border border-gray-800/50 rounded-xl px-3 py-2.5">
                        <div className="flex items-baseline gap-1.5">
                          <p className="text-3xl font-black text-yellow-300 leading-none">{ch.value}</p>
                          <p className="text-[10px] text-gray-500 font-bold">{CH_LABEL[key] ?? key.toUpperCase()}</p>
                        </div>
                        {ch.date && (
                          <p className="text-[10px] text-gray-400 mt-1.5 font-medium">{ch.date}</p>
                        )}
                        {ch.extra && <p className="text-[10px] text-gray-500 mt-0.5">{ch.extra}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* 상대팀별 스탯 (vs Opponents) */}
            {detail?.vs_opponents && detail.vs_opponents.length > 0 && (
              <div className="px-5 py-4 border-b border-gray-800/60">
                <p className="text-xs text-gray-600 uppercase tracking-widest font-bold mb-3">
                  상대팀별 스탯
                  <span className="text-[10px] text-gray-600 ml-2 font-normal">친선전 제외 · G는 출전 슬롯(쿼터) 수</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {detail.vs_opponents.map(o => (
                    <div key={o.team_id} className="bg-gray-900/60 border border-gray-800/50 rounded-xl px-4 py-3"
                         style={{ borderLeft: `3px solid ${o.team_color}` }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: o.team_color }} />
                          <span className="font-bold text-white text-sm whitespace-nowrap">vs {o.team_name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-gray-500 tabular-nums">{o.gp} G</span>
                          <span className="text-[10px] tabular-nums">
                            <span className="text-green-400 font-bold">{o.wins}W</span>
                            <span className="text-gray-600">·</span>
                            <span className="text-red-400 font-bold">{o.losses}L</span>
                          </span>
                        </div>
                      </div>

                      {/* 주요 지표 6개 */}
                      <div className="grid grid-cols-3 gap-1.5 mb-2">
                        <Cell label="PPG" value={o.ppg} highlight />
                        <Cell label="RPG" value={o.rpg} />
                        <Cell label="APG" value={o.apg} />
                        <Cell label="STL" value={o.spg} mono />
                        <Cell label="BLK" value={o.bpg} mono />
                        <Cell label="FG%" value={o.fg_pct != null ? `${o.fg_pct}%` : '—'} mono />
                      </div>

                      {/* 누적 보조 */}
                      <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-gray-800/40 text-[10px] text-gray-500">
                        <div className="text-center">총 {o.pts} pts</div>
                        <div className="text-center">FG <span className="text-gray-300">{o.fgm}/{o.fga}</span></div>
                        <div className="text-center">3P <span className="text-gray-300">{o.fg3m}/{o.fg3a}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 월별 성장지표 */}
            {activeDetail?.monthly_stats && activeDetail.monthly_stats.length >= 2 && (
              <MonthlyStatsChart data={activeDetail.monthly_stats} />
            )}

            {/* 최근 5R (R = 라운드 단위, 같은 날 여러 경기는 합산. 단일 상대 개념 없음) */}
            {detail && detail.recent_games.length > 0 && (
              <div className="px-5 py-4">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-3">최근 5R</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-800/60">
                        {['날짜','PTS','REB','AST','STL','BLK','FG','FG%','3P%'].map(h => (
                          <th key={h} className="pb-1.5 text-[10px] text-gray-600 font-bold text-right first:text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.recent_games.map((g, i) => {
                        const r = g as typeof g & { stl?: number; blk?: number; fg3m?: number; fg3a?: number }
                        const fgPct  = g.fga > 0 ? Math.round(g.fgm / g.fga * 100) : null
                        const fg3Pct = (r.fg3a ?? 0) > 0 ? Math.round((r.fg3m ?? 0) / (r.fg3a ?? 1) * 100) : null
                        return (
                        <tr key={i} className="border-b border-gray-800/30 last:border-0">
                          <td className="py-1.5 text-gray-300 text-[11px] pr-2 whitespace-nowrap">{g.date?.slice(5) ?? '—'}</td>
                          <td className="py-1.5 text-right text-white font-bold">{g.pts}</td>
                          <td className="py-1.5 text-right text-gray-300">{g.reb}</td>
                          <td className="py-1.5 text-right text-gray-300">{g.ast}</td>
                          <td className="py-1.5 text-right text-purple-400">{r.stl ?? 0}</td>
                          <td className="py-1.5 text-right text-indigo-400">{r.blk ?? 0}</td>
                          <td className="py-1.5 text-right text-gray-500 text-[10px]">{g.fgm}/{g.fga}</td>
                          <td className="py-1.5 text-right text-gray-400 text-[10px]">{fgPct != null ? `${fgPct}%` : '—'}</td>
                          <td className="py-1.5 text-right text-yellow-600 text-[10px]">{fg3Pct != null ? `${fg3Pct}%` : '—'}</td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    </>
  )
}

function ranked_total(detail: Detail | null): number {
  return detail?.rankings?.total ?? 0
}

function computeWinRateRank(detail: Detail | null): number {
  return detail?.rankings?.win_rate_rank ?? 0
}
