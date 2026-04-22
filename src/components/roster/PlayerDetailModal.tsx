'use client'
import React, { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { X, Camera } from 'lucide-react'
import { toast } from 'sonner'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { Player, PlayerBoxScore, Tournament } from '@/types/database'
import { evaluateAllBadges, CATEGORY_LABELS } from '@/lib/stats/badges'
import type { EvaluatedBadge } from '@/lib/stats/badges'
import BadgeIcon, { TIER_STYLES } from '@/components/badges/BadgeIcon'

const BadgeMasterbook = dynamic(() => import('@/components/roster/BadgeMasterbook'), { ssr: false })
const GameBoxScoreModal = dynamic(() => import('@/components/GameBoxScoreModal'), { ssr: false })

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
  team?: string
  onClose: () => void
  onPlayerUpdate?: (player: Player) => void
}

export default function PlayerDetailModal({ playerId, team, onClose, onPlayerUpdate }: Props) {
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
  const [awards, setAwards] = useState<{ mvp_count: number; xfactor_count: number; warrior_count: number } | null>(null)
  const [quarterPts, setQuarterPts] = useState<{ q1: number; q2: number; q3: number; q4: number } | null>(null)
  const [evaluatedBadges, setEvaluatedBadges] = useState<EvaluatedBadge[]>([])
  const [activeBadgeCode, setActiveBadgeCode] = useState<string | null>(null)
  const [masterbookOpen, setMasterbookOpen] = useState(false)
  const [boxScoreGame, setBoxScoreGame] = useState<{ game_id: string; date: string; opponent: string; round: string | null; our_score: number; opponent_score: number; tournament_name: string } | null>(null)

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
        setAwards(d.awards ?? null)
        setQuarterPts(d.quarterPts ?? null)
        setLoading(false)
      })
  }, [playerId])

  // 팀 내 랭킹 + 뱃지 계산
  useEffect(() => {
    fetch(`/api/stats/season${team ? `?team=${team}` : ''}`)
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

        // 팀 평균 계산 (뱃지용)
        if (active.length === 0) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const avg = (fn: (p: any) => number) => active.reduce((s: number, p: any) => s + fn(p), 0) / active.length
        const teamAvg = {
          ftaPerGame:   avg(p => p.games_played > 0 ? (p.fta  ?? 0) / p.games_played : 0),
          fg3aPerGame:  avg(p => p.games_played > 0 ? (p.fg3a ?? 0) / p.games_played : 0),
          stlPerGame:   avg(p => p.games_played > 0 ? (p.stl  ?? 0) / p.games_played : 0),
          blkPerGame:   avg(p => p.games_played > 0 ? (p.blk  ?? 0) / p.games_played : 0),
          astPerGame:   avg(p => p.games_played > 0 ? (p.ast  ?? 0) / p.games_played : 0),
          ptsPerGame:   avg(p => p.pts_avg ?? 0),
          rebPerGame:   avg(p => p.reb_avg ?? 0),
          hustlePerGame: avg(p => p.games_played > 0 ? ((p.stl ?? 0) + (p.blk ?? 0) + (p.dreb ?? 0)) / p.games_played : 0),
        }

        // 선수 시즌 스탯
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const me = active.find((p: any) => p.player_id === playerId)
        if (!me) return

        const gp = me.games_played
        const fgm = me.fgm ?? 0; const fga = me.fga ?? 0
        const fg3m = me.fg3m ?? 0; const fg3a = me.fg3a ?? 0
        const fg2m = fgm - fg3m; const fg2a = fga - fg3a
        const ftm = me.ftm ?? 0; const fta = me.fta ?? 0
        const oreb = me.oreb ?? 0; const dreb = me.dreb ?? 0
        const ast = me.ast ?? 0; const tov = me.tov ?? 0
        const stl = me.stl ?? 0; const blk = me.blk ?? 0

        // double/triple double: per-game stats에서 계산
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gamesList: any[] = data.gamesByPlayer?.[playerId] ?? []
        let doubleDoubles = 0; let tripleDoubles = 0
        for (const g of gamesList) {
          const cats = [g.pts ?? 0, g.reb ?? 0, g.ast ?? 0, g.stl ?? 0, g.blk ?? 0].filter(v => v >= 10).length
          if (cats >= 3) tripleDoubles++
          else if (cats >= 2) doubleDoubles++
        }

        const allBadges = evaluateAllBadges({
          gamesPlayed: gp,
          totalTeamGames: data.totalGames ?? gp,
          pts: me.pts ?? 0,
          fgm, fga, fg2m, fg2a, fg3m, fg3a, ftm, fta,
          oreb, dreb, reb: oreb + dreb,
          ast, stl, blk, tov,
          ppg: me.pts_avg ?? 0,
          rpg: me.reb_avg ?? 0,
          apg: me.ast_avg ?? 0,
          spg: gp > 0 ? stl / gp : 0,
          bpg: gp > 0 ? blk / gp : 0,
          fg3Pct: fg3a > 0 ? (fg3m / fg3a) * 100 : 0,
          ftPct: fta > 0 ? (ftm / fta) * 100 : 0,
          astToTov: tov > 0 ? ast / tov : ast,
          doubleDoubles,
          tripleDoubles,
          q1pts: quarterPts?.q1 ?? 0,
          q2pts: quarterPts?.q2 ?? 0,
          q3pts: quarterPts?.q3 ?? 0,
          q4pts: quarterPts?.q4 ?? 0,
          ast3pts: me.ast3pts ?? 0,
          astPaint: (me as Record<string, unknown>).astPaint as number ?? 0,
          shotBreakdown,
        }, teamAvg)

        setEvaluatedBadges(allBadges)
      })
  }, [playerId, quarterPts])

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
      className="fixed inset-0 z-50 flex items-center justify-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* 배경 딤 */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* 모달 */}
      <div className="relative z-10 w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[90vh] bg-gray-950 border-0 sm:border border-gray-800 rounded-none sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl">
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

                    {/* AI 수상 배지 */}
                    {awards && (awards.mvp_count > 0 || awards.xfactor_count > 0 || awards.warrior_count > 0) && (
                      <div className="flex items-center gap-2 px-5 py-2.5 border-t border-gray-800/60" style={{ background: '#070E1A' }}>
                        <span className="text-xs text-gray-600 uppercase tracking-wider mr-1">Awards</span>
                        {awards.mvp_count > 0 && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-yellow-900/30 border border-yellow-700/50">
                            <span className="text-sm">🏅</span>
                            <span className="text-xs font-bold text-yellow-400">MVP</span>
                            <span className="text-xs font-black text-yellow-300 ml-0.5">{awards.mvp_count}</span>
                            <span className="text-xs text-yellow-600">회</span>
                          </div>
                        )}
                        {awards.xfactor_count > 0 && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-900/30 border border-purple-700/50">
                            <span className="text-sm">⚡</span>
                            <span className="text-xs font-bold text-purple-400">X-FACTOR</span>
                            <span className="text-xs font-black text-purple-300 ml-0.5">{awards.xfactor_count}</span>
                            <span className="text-xs text-purple-600">회</span>
                          </div>
                        )}
                        {awards.warrior_count > 0 && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-900/30 border border-orange-700/50">
                            <span className="text-sm">🔥</span>
                            <span className="text-xs font-bold text-orange-400">투혼상</span>
                            <span className="text-xs font-black text-orange-300 ml-0.5">{awards.warrior_count}</span>
                            <span className="text-xs text-orange-600">회</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 능력 뱃지 */}
                    {evaluatedBadges.length > 0 && (() => {
                      const earnedBadges = evaluatedBadges.filter(b => b.tier !== null)
                      // Sort: gold first, then silver, bronze
                      const tierOrder: Record<string, number> = { gold: 0, silver: 1, bronze: 2 }
                      const sortedBadges = [...earnedBadges].sort((a, b) => (tierOrder[a.tier!] ?? 3) - (tierOrder[b.tier!] ?? 3))
                      const activeBadge = evaluatedBadges.find(b => b.code === activeBadgeCode)

                      const goldC   = earnedBadges.filter(b => b.tier === 'gold').length
                      const silverC = earnedBadges.filter(b => b.tier === 'silver').length
                      const bronzeC = earnedBadges.filter(b => b.tier === 'bronze').length

                      return (
                        <div className="border-t border-gray-800/60" style={{ background: '#070E1A' }}>
                          <div className="px-5 py-3 space-y-2">
                            {/* 티어 요약 */}
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-gray-600 uppercase tracking-wider text-[10px] mr-1">Badges</span>
                              {goldC   > 0 && <span className="text-amber-400 font-bold">🥇 {goldC}</span>}
                              {silverC > 0 && <span className="text-slate-400 font-bold">🥈 {silverC}</span>}
                              {bronzeC > 0 && <span className="text-orange-400 font-bold">🥉 {bronzeC}</span>}
                              <button
                                onClick={() => setMasterbookOpen(true)}
                                className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-700/50 bg-gray-800/40 text-xs text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-colors cursor-pointer"
                              >
                                <span>📖</span>
                                <span>도감</span>
                              </button>
                            </div>

                            {/* 뱃지 아이콘 행 */}
                            <div className="flex flex-wrap gap-1.5">
                              {earnedBadges.length === 0 && (
                                <span className="text-xs text-gray-700 italic">아직 달성한 뱃지가 없습니다</span>
                              )}
                              {sortedBadges.map(badge => (
                                <button
                                  key={badge.code}
                                  onClick={() => setActiveBadgeCode(activeBadgeCode === badge.code ? null : badge.code)}
                                  onMouseEnter={() => setActiveBadgeCode(badge.code)}
                                  onMouseLeave={() => setActiveBadgeCode(null)}
                                  className="cursor-pointer"
                                  title={badge.name}
                                >
                                  <BadgeIcon code={badge.code} tier={badge.tier} size="sm" />
                                </button>
                              ))}
                            </div>

                            {/* 선택된 뱃지 상세 패널 */}
                            {activeBadge && activeBadge.tier && (
                              <div className={`rounded-xl p-3 border transition-all ${
                                activeBadge.tier === 'gold'   ? 'bg-amber-950/50 border-amber-600/40' :
                                activeBadge.tier === 'silver' ? 'bg-slate-800/50 border-slate-500/40' :
                                                                'bg-orange-950/50 border-orange-700/40'
                              }`}>
                                <div className="flex items-start gap-2.5">
                                  <BadgeIcon code={activeBadge.code} tier={activeBadge.tier} size="md" showLabel />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                      <span className="text-sm font-bold text-white">{activeBadge.name}</span>
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                        activeBadge.tier === 'gold'   ? 'bg-amber-900/60 text-amber-300' :
                                        activeBadge.tier === 'silver' ? 'bg-slate-700/60 text-slate-300' :
                                                                         'bg-orange-900/60 text-orange-300'
                                      }`}>{CATEGORY_LABELS[activeBadge.category]}</span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-0.5">{activeBadge.description}</p>
                                  </div>
                                </div>
                                <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
                                  <p className="text-[11px] text-gray-500">{activeBadge.thresholdLabel}</p>
                                  <p className="text-sm font-bold text-white">{activeBadge.achievedLabel}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })()}

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
                        <div className="grid grid-cols-3 sm:grid-cols-6 border-t border-gray-800" style={{ background: '#070E1A' }}>
                          {[
                            { label: 'GP',  value: String(totalGP), key: 'gp' },
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

              {/* 커리어 하이 */}
              {(() => {
                type ChGame = {
                  value: number; date: string; opponent: string; round: string | null
                  tournament_name: string; our_score: number; opponent_score: number
                  game_id: string; stats: PlayerBoxScore
                  sub?: string
                }
                const allGames: Array<{ game_id: string; stats: PlayerBoxScore; date: string; opponent: string; round: string | null; tournament_name: string; our_score: number; opponent_score: number }> = []
                for (const t of tournamentStats) {
                  for (const g of t.games) {
                    if (g.stats) allGames.push({ game_id: g.game_id, stats: g.stats, date: g.date, opponent: g.opponent, round: g.round, tournament_name: t.tournament.name, our_score: g.our_score, opponent_score: g.opponent_score })
                  }
                }
                if (allGames.length === 0) return null

                function best(
                  getValue: (s: PlayerBoxScore) => number,
                  tiebreakers: Array<(s: PlayerBoxScore) => number> = [],
                  filter?: (s: PlayerBoxScore) => boolean,
                  getSub?: (s: PlayerBoxScore) => string,
                ): ChGame | null {
                  const pool = filter ? allGames.filter(g => filter(g.stats)) : allGames
                  if (pool.length === 0) return null
                  const top = pool.reduce((b, g) => {
                    const bv = getValue(b.stats), gv = getValue(g.stats)
                    if (gv > bv) return g
                    if (gv < bv) return b
                    for (const tb of tiebreakers) {
                      const btb = tb(b.stats), gtb = tb(g.stats)
                      if (gtb > btb) return g
                      if (gtb < btb) return b
                    }
                    return b
                  })
                  const val = getValue(top.stats)
                  if (val === 0) return null
                  return {
                    value: val,
                    date: top.date, opponent: top.opponent, round: top.round,
                    tournament_name: top.tournament_name,
                    our_score: top.our_score, opponent_score: top.opponent_score,
                    game_id: top.game_id, stats: top.stats,
                    sub: getSub ? getSub(top.stats) : undefined,
                  }
                }

                const highs = {
                  pts:    best(s => s.pts,    [s => s.fg_pct, s => s.fga], undefined,
                               s => s.fga > 0 ? `FG ${s.fg_pct.toFixed(1)}% (${s.fgm}/${s.fga})` : ''),
                  reb:    best(s => s.reb,    [], undefined,
                               s => `OR ${s.oreb} / DR ${s.dreb}`),
                  ast:    best(s => s.ast),
                  stl:    best(s => s.stl),
                  blk:    best(s => s.blk),
                  fg_pct: best(s => s.fg_pct, [s => s.fga, s => s.pts], s => s.fga >= 4),
                  fg3m:   best(s => s.fg3m,   [s => s.fg3_pct]),
                  ftm:    best(s => s.ftm,    [s => s.ft_pct], undefined,
                               s => s.fta > 0 ? `FT ${s.ft_pct.toFixed(1)}% (${s.ftm}/${s.fta})` : ''),
                }

                if (Object.values(highs).every(v => v === null)) return null

                const ITEMS: { key: keyof typeof highs; label: string; color: string; fmt?: (v: number) => string }[] = [
                  { key: 'pts',    label: 'PTS',  color: 'text-yellow-400' },
                  { key: 'reb',    label: 'REB',  color: 'text-orange-400' },
                  { key: 'ast',    label: 'AST',  color: 'text-blue-400' },
                  { key: 'stl',    label: 'STL',  color: 'text-green-400' },
                  { key: 'blk',    label: 'BLK',  color: 'text-indigo-400' },
                  { key: 'fg_pct', label: 'FG%',  color: 'text-teal-400', fmt: v => `${v.toFixed(1)}%` },
                  { key: 'fg3m',   label: '3PM',  color: 'text-purple-400' },
                  { key: 'ftm',    label: 'FTM',  color: 'text-pink-400' },
                ]

                return (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <h2 className="text-base font-semibold mb-4 text-gray-300">커리어 하이</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {ITEMS.map(({ key, label, color, fmt }) => {
                        const h = highs[key]
                        if (!h) return null
                        const isWin = h.our_score > h.opponent_score
                        const displayVal = fmt ? fmt(h.value) : String(h.value)
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setBoxScoreGame({
                              game_id: h.game_id,
                              date: h.date,
                              opponent: h.opponent,
                              round: h.round,
                              our_score: h.our_score,
                              opponent_score: h.opponent_score,
                              tournament_name: h.tournament_name,
                            })}
                            className="text-left bg-gray-800/60 rounded-xl p-3.5 border border-gray-700/40 hover:border-gray-600 hover:bg-gray-800 transition-colors cursor-pointer"
                          >
                            <div className="flex items-end gap-1.5 mb-1">
                              <span className={`text-3xl font-black font-mono leading-none ${color}`}>{displayVal}</span>
                              <span className="text-xs text-gray-500 mb-0.5 uppercase tracking-wider">{label}</span>
                            </div>
                            {h.sub && <p className="text-[11px] text-gray-400 mb-2 font-mono">{h.sub}</p>}
                            {!h.sub && <div className="h-2" />}
                            <div className="border-t border-gray-700/40 pt-2.5 space-y-1">
                              <p className="text-xs text-gray-500">{h.date}</p>
                              <p className="text-xs text-white font-medium">
                                vs {h.opponent}
                                {h.round && <span className="text-gray-500 ml-1">[{h.round}]</span>}
                              </p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isWin ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400'}`}>
                                  {isWin ? 'W' : 'L'} {h.our_score}-{h.opponent_score}
                                </span>
                                <span className="text-xs text-gray-600 truncate">{h.tournament_name}</span>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
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
                                        <td className="px-3 py-1.5 font-bold text-amber-300">{s.game_score?.toFixed(1) ?? '-'}</td>
                                      </>
                                    ) : (
                                      <td colSpan={9} className="px-3 py-1.5 text-gray-600 italic">기록 없음</td>
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
                          <th className="px-3 py-2" title="Hollinger Game Score">GmSc</th>
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
                                  <td className="px-3 py-2 font-bold text-amber-300 text-xs">{s.game_score?.toFixed(1) ?? '-'}</td>
                                </>
                              ) : (
                                <td colSpan={7} className="px-3 py-2 text-gray-600 italic text-xs">기록 없음</td>
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

      {boxScoreGame && (
        <GameBoxScoreModal
          gameInfo={boxScoreGame}
          onClose={() => setBoxScoreGame(null)}
        />
      )}
      {masterbookOpen && (
        <BadgeMasterbook
          evaluatedBadges={evaluatedBadges.length > 0 ? evaluatedBadges : undefined}
          onClose={() => setMasterbookOpen(false)}
        />
      )}
    </div>
  )
}
