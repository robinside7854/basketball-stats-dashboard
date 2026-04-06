'use client'
import React, { useEffect, useRef, useState } from 'react'
import { X, Camera } from 'lucide-react'
import { toast } from 'sonner'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { Player, PlayerBoxScore, Tournament } from '@/types/database'

interface ShotStat { label: string; made: number; attempted: number; pct: number }

const SHOT_COLORS: Record<string, string> = {
  shot_post: '#ef4444',
  shot_layup: '#f97316',
  shot_2p_mid: '#eab308',
  shot_3p: '#3b82f6',
}

function ShotStyleChart({ breakdown, total }: { breakdown: Record<string, ShotStat>; total: number }) {
  if (total === 0) return <div className="text-gray-600 text-xs py-4">기록 없음</div>
  const types = Object.entries(breakdown)
    .filter(([, s]) => s.attempted > 0)
    .sort((a, b) => b[1].attempted - a[1].attempted)
  return (
    <div className="w-full">
      {/* 스택바 */}
      <div className="flex h-5 rounded-lg overflow-hidden mb-4 gap-px">
        {types.map(([type, s]) => (
          <div
            key={type}
            style={{ width: `${(s.attempted / total) * 100}%`, backgroundColor: SHOT_COLORS[type] ?? '#6b7280' }}
            title={`${s.label} ${Math.round((s.attempted / total) * 1000) / 10}%`}
          />
        ))}
      </div>
      {/* 개별 비율바 */}
      <div className="space-y-2.5">
        {types.map(([type, s]) => {
          const pct = Math.round((s.attempted / total) * 1000) / 10
          return (
            <div key={type} className="flex items-center gap-2">
              <div className="w-14 text-xs text-gray-400 text-right shrink-0">{s.label}</div>
              <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: SHOT_COLORS[type] ?? '#6b7280' }}
                />
              </div>
              <div className="w-10 text-xs font-bold text-right shrink-0" style={{ color: SHOT_COLORS[type] ?? '#9ca3af' }}>{pct}%</div>
            </div>
          )
        })}
      </div>
      <div className="text-xs text-gray-600 mt-3">총 {total}회 시도</div>
    </div>
  )
}

interface RecentGame {
  game_id: string; date: string; opponent: string; round: string | null
  our_score: number; opponent_score: number; tournament_name: string | null
  stats: PlayerBoxScore | null
}
interface GameDetail {
  game_id: string; date: string; opponent: string; round: string | null
  our_score: number; opponent_score: number
  stats: PlayerBoxScore | null
}
interface TournamentStat {
  tournament: Tournament; games_played: number
  stats: (PlayerBoxScore & { pts_avg: number; reb_avg: number; ast_avg: number; stl_avg: number; blk_avg: number; tov_avg: number }) | null
  games: GameDetail[]
}

const POSITION_COLORS: Record<string, string> = {
  PG: 'bg-blue-600', SG: 'bg-green-600', SF: 'bg-yellow-600', PF: 'bg-purple-600', C: 'bg-red-600',
}
const FIELD_SHOT_TYPES = ['shot_post', 'shot_layup', 'shot_2p_mid', 'shot_3p']

function calcAge(birthdate?: string) {
  if (!birthdate) return null
  const today = new Date(), bd = new Date(birthdate)
  let age = today.getFullYear() - bd.getFullYear()
  if (today.getMonth() < bd.getMonth() || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) age--
  return age
}

interface Props {
  playerId: string
  onClose: () => void
  onPlayerUpdate?: (player: Player) => void
}

export default function PlayerDetailModal({ playerId, onClose, onPlayerUpdate }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [player, setPlayer] = useState<Player | null>(null)
  const [recentGames, setRecentGames] = useState<RecentGame[]>([])
  const [shotBreakdown, setShotBreakdown] = useState<Record<string, ShotStat>>({})
  const [totalShots, setTotalShots] = useState(0)
  const [freeThrow, setFreeThrow] = useState<ShotStat | null>(null)
  const [tournamentStats, setTournamentStats] = useState<TournamentStat[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [expandedTournament, setExpandedTournament] = useState<string | null>(null)
  const [teamRankings, setTeamRankings] = useState<Record<string, { rank: number; isTie: boolean }>>({})
  const [chartMetric, setChartMetric] = useState<'PPG' | 'RPG' | 'APG' | 'FG%' | '3P%'>('PPG')

  useEffect(() => {
    fetch(`/api/players/${playerId}/stats`)
      .then(r => r.json())
      .then(d => {
        setPlayer(d.player)
        setRecentGames(d.recentGames || [])
        setShotBreakdown(d.shotBreakdown || {})
        setTotalShots(d.totalShotAttempts || 0)
        setFreeThrow(d.freeThrow || null)
        setTournamentStats(d.tournamentStats || [])
        setLoading(false)
      })
  }, [playerId])

  // 팀 내 랭킹 계산
  useEffect(() => {
    fetch('/api/stats/season')
      .then(r => r.json())
      .then(data => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const active = (data.players ?? []).filter((p: any) => p.games_played > 0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        function rank(getValue: (p: any) => number) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sorted = [...active].sort((a: any, b: any) => getValue(b) - getValue(a))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const me = sorted.find((p: any) => p.player_id === playerId)
          if (!me) return null
          const val = getValue(me)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const idx = sorted.findIndex((p: any) => getValue(p) === val)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return { rank: idx + 1, isTie: sorted.filter((p: any) => getValue(p) === val).length > 1 }
        }
        setTeamRankings({
          ppg: rank(p => p.pts_avg) ?? { rank: 0, isTie: false },
          rpg: rank(p => p.reb_avg) ?? { rank: 0, isTie: false },
          apg: rank(p => p.ast_avg) ?? { rank: 0, isTie: false },
          stl: rank(p => p.games_played > 0 ? p.stl / p.games_played : 0) ?? { rank: 0, isTie: false },
          blk: rank(p => p.games_played > 0 ? p.blk / p.games_played : 0) ?? { rank: 0, isTie: false },
        })
      })
  }, [playerId])

  // ESC 키로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !player) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('playerId', playerId)
      const res = await fetch('/api/players/upload-photo', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '업로드 실패')
      setPlayer(prev => prev ? { ...prev, photo_url: data.url } : prev)
      onPlayerUpdate?.({ ...player, photo_url: data.url })
      toast.success('사진이 등록되었습니다')
    } catch (err) {
      toast.error(`사진 업로드 실패: ${(err as Error).message}`)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* 배경 딤 */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* 모달 */}
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] bg-gray-950 border border-gray-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* 헤더 닫기 버튼 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 shrink-0">
          <span className="text-sm text-gray-400 font-medium">
            {player ? <><span className="text-blue-400 font-bold">#{player.number}</span> <span className="text-white">{player.name}</span></> : '선수 상세 정보'}
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-800">
            <X size={18} />
          </button>
        </div>

        {/* 스크롤 영역 */}
        <div className="overflow-y-auto flex-1 p-5 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-24 text-gray-500">
              <div className="text-center"><div className="text-4xl mb-4">🏀</div><p>로딩 중...</p></div>
            </div>
          ) : !player ? (
            <div className="text-center py-24 text-gray-500">선수를 찾을 수 없습니다</div>
          ) : (
            <>
              {/* === NBA 스타일 배너 === */}
              {(() => {
                const totalGP = tournamentStats.reduce((s, t) => s + t.games_played, 0)
                const totalPts = tournamentStats.reduce((s, t) => s + (t.stats?.pts ?? 0), 0)
                const totalReb = tournamentStats.reduce((s, t) => s + (t.stats?.reb ?? 0), 0)
                const totalAst = tournamentStats.reduce((s, t) => s + (t.stats?.ast ?? 0), 0)
                const ppg = totalGP > 0 ? (totalPts / totalGP).toFixed(1) : '-'
                const rpg = totalGP > 0 ? (totalReb / totalGP).toFixed(1) : '-'
                const apg = totalGP > 0 ? (totalAst / totalGP).toFixed(1) : '-'
                const age = calcAge(player.birthdate)
                const positions = player.position?.split(',').map(p => p.trim()).filter(Boolean) ?? []
                return (
                  <div className="space-y-0 rounded-xl overflow-hidden border border-gray-800">
                    {/* 배너 */}
                    <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #070E1A 0%, #0D1A2E 100%)', minHeight: '200px' }}>
                      {/* 배경 번호 워터마크 */}
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-white/5 select-none leading-none pointer-events-none" style={{ fontSize: '160px' }}>
                        {player.number}
                      </div>

                      <div className="flex items-stretch">
                        {/* 선수 사진 */}
                        <div className="relative w-36 sm:w-44 shrink-0" style={{ minHeight: '200px' }}>
                          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                          <div
                            className="w-full h-full cursor-pointer group overflow-hidden"
                            onClick={() => !uploading && fileRef.current?.click()}
                          >
                            {player.photo_url
                              ? <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover object-top" />
                              : <div className="w-full h-full flex items-center justify-center"><span className="text-7xl font-black text-blue-300/30">{player.number}</span></div>
                            }
                            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                              {uploading ? <span className="text-white text-xs">업로드 중...</span> : <><Camera size={22} className="text-white" /><span className="text-white text-xs">사진 변경</span></>}
                            </div>
                          </div>
                          <div className="absolute inset-y-0 right-0 w-10 pointer-events-none" style={{ background: 'linear-gradient(to right, transparent, #070E1A)' }} />
                        </div>

                        {/* 선수 정보 */}
                        <div className="flex-1 px-5 py-5 z-10 flex flex-col justify-center">
                          <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
                            파란날개 &nbsp;|&nbsp; #{player.number}{positions[0] && ` | ${positions[0]}`}
                          </p>
                          <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight tracking-wide mb-3">
                            {player.name}
                          </h1>
                          <div className="flex flex-wrap gap-1.5 mb-4">
                            {positions.map(pos => (
                              <span key={pos} className={`text-xs px-2 py-0.5 rounded text-white font-bold ${POSITION_COLORS[pos] || 'bg-gray-600'}`}>{pos}</span>
                            ))}
                            {player.is_pro && <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded font-bold">선출</span>}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-2 border-t border-white/10 pt-3">
                            {player.height_cm && <div><p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">HEIGHT</p><p className="text-sm font-bold text-white">{player.height_cm}cm</p></div>}
                            {player.weight_kg && <div><p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">WEIGHT</p><p className="text-sm font-bold text-white">{player.weight_kg}kg</p></div>}
                            {age !== null && <div><p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">AGE</p><p className="text-sm font-bold text-white">만 {age}세</p></div>}
                            {player.birthdate && <div><p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">BIRTHDATE</p><p className="text-sm font-bold text-white">{player.birthdate.replace(/-/g, '.')}</p></div>}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 주요 스탯 바 */}
                    {totalGP > 0 && (() => {
                      const totalStl = tournamentStats.reduce((s, t) => s + (t.stats?.stl ?? 0), 0)
                      const totalBlk = tournamentStats.reduce((s, t) => s + (t.stats?.blk ?? 0), 0)
                      const slg = totalGP > 0 ? (totalStl / totalGP).toFixed(1) : '-'
                      const bpg = totalGP > 0 ? (totalBlk / totalGP).toFixed(1) : '-'
                      const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }
                      function RankBadge({ statKey }: { statKey: string }) {
                        const r = teamRankings[statKey]
                        if (!r || r.rank === 0) return null
                        return (
                          <div className="flex items-center justify-center gap-1 mt-1">
                            {MEDAL[r.rank] && <span>{MEDAL[r.rank]}</span>}
                            <span className={`text-xs font-bold ${r.rank === 1 ? 'text-yellow-400' : r.rank === 2 ? 'text-gray-300' : r.rank === 3 ? 'text-amber-600' : 'text-gray-500'}`}>
                              {r.isTie ? `(T)${r.rank}위` : `${r.rank}위`}
                            </span>
                          </div>
                        )
                      }
                      return (
                        <div className="grid grid-cols-5 border-t border-gray-800" style={{ background: '#070E1A' }}>
                          {[
                            { label: 'PPG', value: ppg, key: 'ppg' },
                            { label: 'RPG', value: rpg, key: 'rpg' },
                            { label: 'APG', value: apg, key: 'apg' },
                            { label: 'STL', value: slg, key: 'stl' },
                            { label: 'BLK', value: bpg, key: 'blk' },
                          ].map(({ label, value, key }, i) => (
                            <div key={label} className={`py-3 text-center ${i > 0 ? 'border-l border-gray-800' : ''}`}>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{label}</p>
                              <p className="text-2xl font-black font-mono text-white">{value}</p>
                              <RankBadge statKey={key} />
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                )
              })()}

              {/* 공격 스타일 */}
              {totalShots > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h2 className="text-base font-semibold mb-4 text-gray-300">공격 스타일</h2>
                  <div className="flex flex-col sm:flex-row items-start gap-6">
                    <div className="w-full sm:w-56 shrink-0">
                      <ShotStyleChart breakdown={shotBreakdown} total={totalShots} />
                    </div>
                    <div className="hidden sm:block w-px self-stretch bg-gray-800" />
                    <div className="flex-1 w-full">
                      <p className="text-xs text-gray-500 mb-3">구역별 야투율</p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-500 text-xs border-b border-gray-800">
                            <th className="text-left pb-2 font-normal">구역</th>
                            <th className="text-right pb-2 font-normal">성공/시도</th>
                            <th className="text-right pb-2 font-normal w-16">성공률</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...FIELD_SHOT_TYPES]
                            .sort((a, b) => (shotBreakdown[b]?.attempted ?? 0) - (shotBreakdown[a]?.attempted ?? 0))
                            .map(type => {
                            const s = shotBreakdown[type]
                            return (
                              <tr key={type} className="border-b border-gray-800/60">
                                <td className="py-2 flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SHOT_COLORS[type] }} />
                                  {s?.label ?? type}
                                </td>
                                <td className="py-2 text-right text-gray-400">{s?.made ?? 0}/{s?.attempted ?? 0}</td>
                                <td className="py-2 text-right font-bold text-white">{s?.attempted ? `${s.pct}%` : '-'}</td>
                              </tr>
                            )
                          })}
                          {freeThrow && (
                            <tr className="border-b border-gray-800/60">
                              <td className="py-2 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-gray-500 shrink-0" />
                                자유투
                              </td>
                              <td className="py-2 text-right text-gray-400">{freeThrow.made}/{freeThrow.attempted}</td>
                              <td className="py-2 text-right font-bold text-white">{freeThrow.attempted ? `${freeThrow.pct}%` : '-'}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* 대회별 추이 차트 */}
              {(() => {
                const chartData = tournamentStats
                  .filter(t => t.games_played > 0 && t.stats)
                  .map(t => ({
                    name: t.tournament.name.length > 8 ? t.tournament.name.slice(0, 8) + '…' : t.tournament.name,
                    PPG: t.stats!.pts_avg,
                    RPG: t.stats!.reb_avg,
                    APG: t.stats!.ast_avg,
                    'FG%': t.stats!.fg_pct,
                    '3P%': t.stats!.fg3_pct,
                  }))
                if (chartData.length < 2) return null
                const METRIC_COLOR: Record<string, string> = {
                  PPG: '#3b82f6', RPG: '#f97316', APG: '#22c55e', 'FG%': '#eab308', '3P%': '#a855f7'
                }
                const METRIC_TABS = ['PPG', 'RPG', 'APG', 'FG%', '3P%'] as const
                return (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-base font-semibold text-gray-300">대회별 추이</h2>
                      <div className="flex gap-1">
                        {METRIC_TABS.map(m => (
                          <button
                            key={m}
                            onClick={() => setChartMetric(m)}
                            className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${chartMetric === m ? 'text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                            style={chartMetric === m ? { backgroundColor: METRIC_COLOR[m] } : undefined}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={chartData} margin={{ top: 4, right: 16, left: -20, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }}
                          labelStyle={{ color: '#d1d5db' }}
                          itemStyle={{ color: METRIC_COLOR[chartMetric] }}
                        />
                        <Line
                          type="monotone"
                          dataKey={chartMetric}
                          stroke={METRIC_COLOR[chartMetric]}
                          strokeWidth={2.5}
                          dot={{ fill: METRIC_COLOR[chartMetric], r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )
              })()}

              {/* 대회별 성적 */}
              {tournamentStats.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h2 className="text-base font-semibold mb-4 text-gray-300">대회별 성적</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-center border-collapse">
                      <thead>
                        <tr className="bg-gray-800 text-gray-400 text-xs">
                          <th className="px-3 py-2 text-left whitespace-nowrap">대회</th>
                          <th className="px-3 py-2 whitespace-nowrap">연도</th>
                          <th className="px-3 py-2 whitespace-nowrap">GP</th>
                          <th className="px-3 py-2">PPG</th>
                          <th className="px-3 py-2">RPG</th>
                          <th className="px-3 py-2">APG</th>
                          <th className="px-3 py-2">STLPG</th>
                          <th className="px-3 py-2">BLKPG</th>
                          <th className="px-3 py-2">TOVPG</th>
                          <th className="px-3 py-2">FG%</th>
                          <th className="px-3 py-2">3P%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tournamentStats.map(({ tournament, games_played, stats, games }) => {
                          const isExpanded = expandedTournament === tournament.id
                          return (
                            <React.Fragment key={tournament.id}>
                              <tr
                                className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer"
                                onClick={() => games_played > 0 ? setExpandedTournament(isExpanded ? null : tournament.id) : undefined}
                              >
                                <td className="px-3 py-2 text-left whitespace-nowrap">
                                  <span className={`font-medium text-xs ${games_played > 0 ? 'text-blue-400' : 'text-white'}`}>
                                    {tournament.name}
                                    {games_played > 0 && <span className="ml-1 text-gray-600">{isExpanded ? '▲' : '▼'}</span>}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-gray-400 text-xs">{tournament.year}</td>
                                {games_played === 0 ? (
                                  <td colSpan={9} className="px-3 py-2 text-gray-600 italic text-xs">DNP</td>
                                ) : stats ? (
                                  <>
                                    <td className="px-3 py-2 text-gray-400 text-xs">{games_played}</td>
                                    <td className="px-3 py-2 font-bold text-white text-xs">{stats.pts_avg.toFixed(1)}</td>
                                    <td className="px-3 py-2 text-xs">{stats.reb_avg.toFixed(1)}</td>
                                    <td className="px-3 py-2 text-blue-400 text-xs">{stats.ast_avg.toFixed(1)}</td>
                                    <td className="px-3 py-2 text-green-400 text-xs">{stats.stl_avg.toFixed(1)}</td>
                                    <td className="px-3 py-2 text-purple-400 text-xs">{stats.blk_avg.toFixed(1)}</td>
                                    <td className="px-3 py-2 text-red-400 text-xs">{stats.tov_avg.toFixed(1)}</td>
                                    <td className="px-3 py-2 text-xs">{stats.fg_pct > 0 ? `${stats.fg_pct.toFixed(1)}%` : '-'}</td>
                                    <td className="px-3 py-2 text-xs">{stats.fg3_pct > 0 ? `${stats.fg3_pct.toFixed(1)}%` : '-'}</td>
                                  </>
                                ) : (
                                  <td colSpan={9} className="px-3 py-2 text-gray-600 italic text-xs">기록 없음</td>
                                )}
                              </tr>
                              {isExpanded && games.map((g) => {
                                const isWin = g.our_score > g.opponent_score
                                const s = g.stats
                                return (
                                  <tr key={g.game_id} className="border-b border-gray-800/40 bg-gray-800/20 text-xs">
                                    <td className="px-3 py-1.5 text-left text-gray-500 pl-6 whitespace-nowrap">
                                      {g.date}
                                      {g.round && <span className="ml-1 text-gray-600">({g.round})</span>}
                                    </td>
                                    <td className="px-3 py-1.5 text-left text-gray-400 whitespace-nowrap" colSpan={2}>vs {g.opponent}</td>
                                    <td className="px-3 py-1.5">
                                      <span className={`px-1.5 py-0.5 rounded font-bold ${isWin ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400'}`}>
                                        {isWin ? 'W' : 'L'} {g.our_score}-{g.opponent_score}
                                      </span>
                                    </td>
                                    {s ? (
                                      <>
                                        <td className="px-3 py-1.5 font-bold text-white">{s.pts}</td>
                                        <td className="px-3 py-1.5">{s.reb}</td>
                                        <td className="px-3 py-1.5 text-blue-400">{s.ast}</td>
                                        <td className="px-3 py-1.5 text-green-400">{s.stl}</td>
                                        <td className="px-3 py-1.5 text-purple-400">{s.blk}</td>
                                        <td className="px-3 py-1.5 text-red-400">{s.tov}</td>
                                        <td className="px-3 py-1.5">{s.fgm}/{s.fga}</td>
                                        <td className="px-3 py-1.5">{s.fg3m}/{s.fg3a}</td>
                                      </>
                                    ) : (
                                      <td colSpan={8} className="px-3 py-1.5 text-gray-600 italic">기록 없음</td>
                                    )}
                                  </tr>
                                )
                              })}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 최근 5경기 */}
              {recentGames.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h2 className="text-base font-semibold mb-4 text-gray-300">최근 {recentGames.length}경기</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-center border-collapse">
                      <thead>
                        <tr className="bg-gray-800 text-gray-400 text-xs">
                          <th className="px-3 py-2 text-left">날짜</th>
                          <th className="px-3 py-2 text-left">상대</th>
                          <th className="px-3 py-2">결과</th>
                          <th className="px-3 py-2">PTS</th>
                          <th className="px-3 py-2">REB</th>
                          <th className="px-3 py-2">AST</th>
                          <th className="px-3 py-2">FG</th>
                          <th className="px-3 py-2">3P</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentGames.map(g => {
                          const isWin = g.our_score > g.opponent_score
                          const s = g.stats
                          return (
                            <tr key={g.game_id} className="border-b border-gray-800 hover:bg-gray-800/50">
                              <td className="px-3 py-2 text-left text-gray-400 whitespace-nowrap text-xs">{g.date}</td>
                              <td className="px-3 py-2 text-left whitespace-nowrap text-xs">
                                vs {g.opponent}
                                {g.round && <span className="ml-1 text-gray-500">[{g.round}]</span>}
                                {g.tournament_name && <span className="ml-1 text-gray-600">({g.tournament_name})</span>}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isWin ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400'}`}>
                                  {isWin ? 'W' : 'L'} {g.our_score}-{g.opponent_score}
                                </span>
                              </td>
                              {s ? (
                                <>
                                  <td className="px-3 py-2 font-bold text-white text-xs">{s.pts}</td>
                                  <td className="px-3 py-2 text-xs">{s.reb}</td>
                                  <td className="px-3 py-2 text-blue-400 text-xs">{s.ast}</td>
                                  <td className="px-3 py-2 text-xs">{s.fgm}/{s.fga}</td>
                                  <td className="px-3 py-2 text-xs">{s.fg3m}/{s.fg3a}</td>
                                </>
                              ) : (
                                <td colSpan={6} className="px-3 py-2 text-gray-600 italic text-xs">기록 없음</td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {recentGames.length === 0 && totalShots === 0 && tournamentStats.every(t => t.games_played === 0) && (
                <div className="text-center py-12 text-gray-500">
                  <p>이 선수의 경기 기록이 없습니다</p>
                  <p className="text-sm mt-1">경기 기록 탭에서 이벤트를 기록하세요</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
