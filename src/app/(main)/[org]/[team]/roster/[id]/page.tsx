'use client'
import React, { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, Camera } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { Player, PlayerBoxScore, Tournament } from '@/types/database'

interface ShotStat { label: string; made: number; attempted: number; pct: number }

const PIE_COLORS: Record<string, string> = {
  shot_post: '#ef4444',
  shot_layup: '#f97316',
  shot_2p_mid: '#eab308',
  shot_3p: '#3b82f6',
}
function ShotPieChart({ breakdown, total }: { breakdown: Record<string, ShotStat>; total: number }) {
  if (total === 0) return <div className="w-36 h-36 rounded-full bg-gray-800 flex items-center justify-center text-gray-600 text-xs">기록 없음</div>
  const cx = 60, cy = 60, r = 52
  let angle = -Math.PI / 2
  const slices = Object.entries(breakdown).map(([type, s]) => {
    const sweep = (s.attempted / total) * Math.PI * 2
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle)
    angle += sweep
    const x2 = cx + r * Math.cos(angle), y2 = cy + r * Math.sin(angle)
    const large = sweep > Math.PI ? 1 : 0
    return { type, s, path: `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z` }
  })
  return (
    <svg viewBox="0 0 120 120" className="w-40 h-40 shrink-0">
      {slices.map(({ type, path }) => (
        <path key={type} d={path} fill={PIE_COLORS[type] || '#6b7280'} stroke="#111827" strokeWidth="1.5" />
      ))}
      <circle cx={cx} cy={cy} r={28} fill="#111827" />
      <text x={cx} y={cy - 5} textAnchor="middle" fill="#9ca3af" fontSize="9">총 시도</text>
      <text x={cx} y={cy + 9} textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">{total}</text>
    </svg>
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

function calcAge(birthdate?: string) {
  if (!birthdate) return null
  const today = new Date(), bd = new Date(birthdate)
  let age = today.getFullYear() - bd.getFullYear()
  if (today.getMonth() < bd.getMonth() || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) age--
  return age
}

export default function PlayerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
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

  useEffect(() => {
    fetch(`/api/players/${id}/stats`)
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
  }, [id])

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !player) return
    setUploading(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `${id}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('player-photos')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) throw new Error(uploadError.message)
      const { data: { publicUrl } } = supabase.storage.from('player-photos').getPublicUrl(path)
      const res = await fetch(`/api/players/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_url: publicUrl }),
      })
      if (!res.ok) throw new Error('저장 실패')
      const updated = await res.json()
      setPlayer(updated)
      toast.success('사진이 등록되었습니다')
    } catch (err) {
      toast.error(`사진 업로드 실패: ${(err as Error).message}`)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-gray-500">
        <div className="text-center"><div className="text-4xl mb-4">🏀</div><p>로딩 중...</p></div>
      </div>
    )
  }
  if (!player) {
    return <div className="text-center py-32 text-gray-500">선수를 찾을 수 없습니다</div>
  }

  const age = calcAge(player.birthdate)
  const FIELD_SHOT_TYPES = ['shot_post', 'shot_layup', 'shot_2p_mid', 'shot_3p']

  return (
    <div className="space-y-8 max-w-4xl">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors">
        <ChevronLeft size={16} /> 선수 명단으로
      </button>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col sm:flex-row items-center sm:items-start gap-6">
        <div className="relative shrink-0">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          <div
            className="w-24 h-24 rounded-2xl bg-gray-800 flex items-center justify-center overflow-hidden cursor-pointer group border-2 border-gray-700 hover:border-blue-500 transition-colors"
            onClick={() => !uploading && fileRef.current?.click()}
            title="클릭하여 사진 변경"
          >
            {player.photo_url
              ? <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
              : <span className="text-3xl font-black text-blue-400">{player.number}</span>
            }
            <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploading
                ? <span className="text-white text-xs">업로드 중...</span>
                : <Camera size={20} className="text-white" />
              }
            </div>
          </div>
          <button
            onClick={() => !uploading && fileRef.current?.click()}
            className="mt-1.5 w-full text-xs text-gray-500 hover:text-blue-400 text-center transition-colors"
          >
            사진 변경
          </button>
        </div>

        <div className="text-center sm:text-left flex-1">
          <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
            <span className="text-blue-400 font-black text-2xl">#{player.number}</span>
            <h1 className="text-2xl font-bold text-white">{player.name}</h1>
            {player.is_pro && <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded font-bold">선출</span>}
          </div>
          <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start mb-3">
            {player.position?.split(',').map(p => p.trim()).filter(Boolean).map(pos => (
              <span key={pos} className={`text-xs px-2 py-0.5 rounded-full text-white ${POSITION_COLORS[pos] || 'bg-gray-600'}`}>{pos}</span>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 justify-center sm:justify-start text-sm text-gray-400">
            {player.height_cm && <span>키 {player.height_cm}cm</span>}
            {player.weight_kg && <span>몸무게 {player.weight_kg}kg</span>}
            {age !== null && <span>만 {age}세</span>}
            {player.birthdate && <span>{player.birthdate.replace(/-/g, '.')}</span>}
          </div>
        </div>
      </div>

      {totalShots > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-5 text-gray-300">공격 스타일</h2>
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8">
            <div className="flex flex-col items-center gap-3 shrink-0">
              <ShotPieChart breakdown={shotBreakdown} total={totalShots} />
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400">
                {FIELD_SHOT_TYPES.map(type => {
                  const s = shotBreakdown[type]
                  if (!s || s.attempted === 0) return null
                  const share = Math.round((s.attempted / totalShots) * 1000) / 10
                  return (
                    <div key={type} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: PIE_COLORS[type] }} />
                      <span>{s.label} {share}%</span>
                    </div>
                  )
                })}
              </div>
            </div>

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
                  {FIELD_SHOT_TYPES.map(type => {
                    const s = shotBreakdown[type]
                    return (
                      <tr key={type} className="border-b border-gray-800/60">
                        <td className="py-2 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[type] }} />
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

      {tournamentStats.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-300">대회별 성적</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-center border-collapse">
              <thead>
                <tr className="bg-gray-800 text-gray-400">
                  <th className="px-3 py-2 text-left">대회</th>
                  <th className="px-3 py-2">연도</th>
                  <th className="px-3 py-2">GP</th>
                  <th className="px-3 py-2">PPG</th>
                  <th className="px-3 py-2">RPG</th>
                  <th className="px-3 py-2">APG</th>
                  <th className="px-3 py-2">STL</th>
                  <th className="px-3 py-2">BLK</th>
                  <th className="px-3 py-2">TOV</th>
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
                        <td className="px-3 py-2 text-left">
                          <span className={`font-medium ${games_played > 0 ? 'text-blue-400 hover:underline' : 'text-white'}`}>
                            {tournament.name}
                            {games_played > 0 && <span className="ml-1 text-gray-600 text-xs">{isExpanded ? '▲' : '▼'}</span>}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-400">{tournament.year}</td>
                        {games_played === 0 ? (
                          <td colSpan={9} className="px-3 py-2 text-gray-600 italic">DNP</td>
                        ) : stats ? (
                          <>
                            <td className="px-3 py-2 text-gray-400">{games_played}</td>
                            <td className="px-3 py-2 font-bold text-white">{stats.pts_avg.toFixed(1)}</td>
                            <td className="px-3 py-2">{stats.reb_avg.toFixed(1)}</td>
                            <td className="px-3 py-2 text-blue-400">{stats.ast_avg.toFixed(1)}</td>
                            <td className="px-3 py-2 text-green-400">{stats.stl_avg.toFixed(1)}</td>
                            <td className="px-3 py-2 text-purple-400">{stats.blk_avg.toFixed(1)}</td>
                            <td className="px-3 py-2 text-red-400">{stats.tov_avg.toFixed(1)}</td>
                            <td className="px-3 py-2">{stats.fg_pct > 0 ? `${stats.fg_pct.toFixed(1)}%` : '-'}</td>
                            <td className="px-3 py-2">{stats.fg3_pct > 0 ? `${stats.fg3_pct.toFixed(1)}%` : '-'}</td>
                          </>
                        ) : (
                          <td colSpan={9} className="px-3 py-2 text-gray-600 italic">기록 없음</td>
                        )}
                      </tr>
                      {isExpanded && games.map((g) => {
                        const isWin = g.our_score > g.opponent_score
                        const s = g.stats
                        return (
                          <tr key={g.game_id} className="border-b border-gray-800/40 bg-gray-800/20 text-xs">
                            <td className="px-3 py-1.5 text-left text-gray-500 pl-6">
                              {g.date}
                              {g.round && <span className="ml-1 text-gray-600">({g.round})</span>}
                            </td>
                            <td className="px-3 py-1.5 text-left text-gray-400" colSpan={1}>vs {g.opponent}</td>
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

      {recentGames.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-300">최근 {recentGames.length}경기</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-center border-collapse">
              <thead>
                <tr className="bg-gray-800 text-gray-400">
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
                      <td className="px-3 py-2 text-left text-gray-400 whitespace-nowrap">{g.date}</td>
                      <td className="px-3 py-2 text-left whitespace-nowrap">
                        vs {g.opponent}
                        {g.round && <span className="ml-1 text-xs text-gray-500">[{g.round}]</span>}
                        {g.tournament_name && <span className="ml-1 text-xs text-gray-600">({g.tournament_name})</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isWin ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400'}`}>
                          {isWin ? 'W' : 'L'} {g.our_score}-{g.opponent_score}
                        </span>
                      </td>
                      {s ? (
                        <>
                          <td className="px-3 py-2 font-bold text-white">{s.pts}</td>
                          <td className="px-3 py-2">{s.reb}</td>
                          <td className="px-3 py-2 text-blue-400">{s.ast}</td>
                          <td className="px-3 py-2">{s.fgm}/{s.fga}</td>
                          <td className="px-3 py-2">{s.fg3m}/{s.fg3a}</td>
                        </>
                      ) : (
                        <td colSpan={6} className="px-3 py-2 text-gray-600 italic">기록 없음</td>
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
        <div className="text-center py-16 text-gray-500">
          <p>이 선수의 경기 기록이 없습니다</p>
        </div>
      )}
    </div>
  )
}
