'use client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2, X, BookOpen } from 'lucide-react'
import BadgeBookModal from '@/components/league/BadgeBookModal'

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

type BadgeResult = { id: string; name: string; nameEn: string; icon: string; tier: 'gold'|'silver'|'bronze'; category: string; description: string }

type WLStats = { ppg: number; rpg: number; apg: number; spg: number; bpg: number } | null

type Detail = {
  rankings: { ppg: number; rpg: number; apg: number; spg: number; bpg: number; total: number }
  badges: BadgeResult[]
  career_high: Record<string, { value: number; extra?: string; date?: string; opponent?: string; result?: string; score?: string }>
  shot_breakdown: { layup: { m: number; a: number; dist: number; fg_pct: number }; mid: { m: number; a: number; dist: number; fg_pct: number }; post: { m: number; a: number; dist: number; fg_pct: number }; three: { m: number; a: number; dist: number; fg_pct: number }; ft: { m: number; a: number; ft_pct: number }; total_fga: number }
  recent_games: Array<{ date?: string; opponent?: string; result?: string; score?: string; pts: number; reb: number; ast: number; fgm: number; fga: number }>
  win_loss?: {
    wins: number; losses: number; win_rate: number
    win_stats: WLStats; loss_stats: WLStats
    pts_share: number
  }
}

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

interface Props {
  leagueId: string
  playerId: string
  playerName: string // 로딩 전 즉시 표시용
  onClose: () => void
}

export default function PlayerQuickViewModal({ leagueId, playerId, playerName, onClose }: Props) {
  const [player, setPlayer] = useState<PlayerInfo | null>(null)
  const [stats, setStats] = useState<SeasonStats | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showBadgeBook, setShowBadgeBook] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [playersRes, statsRes, detailRes] = await Promise.all([
        fetch(`/api/leagues/${leagueId}/players`),
        fetch(`/api/leagues/${leagueId}/stats?playerId=${playerId}`),
        fetch(`/api/leagues/${leagueId}/players/${playerId}/detail`),
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
    } finally { setLoading(false) }
  }, [leagueId, playerId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const positions = (player?.position ?? '').split(',').map(p => p.trim()).filter(Boolean)
  const age = calcAge(player?.birth_date ?? null)

  const TIER_COLOR = { gold: 'text-yellow-300', silver: 'text-gray-300', bronze: 'text-orange-400' } as const
  const TIER_BG   = { gold: 'bg-yellow-400/20 border-yellow-400/50 shadow-[0_0_8px_rgba(250,204,21,0.2)]', silver: 'bg-gray-300/15 border-gray-300/40', bronze: 'bg-orange-500/15 border-orange-500/40' } as const

  const earnedBadges = detail?.badges ?? []
  const earnedMap = Object.fromEntries(earnedBadges.map(b => [b.id, b]))

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto z-10 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-white font-black text-lg leading-none">
                {player?.number != null && <span className="text-gray-500 font-mono text-base mr-1.5">#{player.number}</span>}
                {player?.name ?? playerName}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                {positions.map(pos => (
                  <span key={pos} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-700/40">{pos}</span>
                ))}
                {player?.plus_one && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300">+1</span>
                )}
                {age && <span className="text-xs text-gray-600">만 {age}세</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowBadgeBook(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-900/30 hover:bg-indigo-900/50 border border-indigo-500/40 text-indigo-400 text-xs font-bold cursor-pointer transition-colors">
              <BookOpen size={12} /> 도감
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white cursor-pointer transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-600" /></div>
        ) : (
          <div className="space-y-0">
            {/* 시즌 스탯 */}
            {stats ? (
              <div className="px-5 py-4 border-b border-gray-800/60">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-3">시즌 스탯</p>
                <div className="grid grid-cols-6 gap-2 mb-3">
                  {[
                    { label: 'GP',  value: String(stats.gp),            rank: 0,                         accent: false },
                    { label: 'PPG', value: stats.ppg.toFixed(1),        rank: detail?.rankings.ppg ?? 0, accent: true  },
                    { label: 'RPG', value: stats.rpg.toFixed(1),        rank: detail?.rankings.rpg ?? 0, accent: false },
                    { label: 'APG', value: stats.apg.toFixed(1),        rank: detail?.rankings.apg ?? 0, accent: false },
                    { label: 'STL', value: stats.spg.toFixed(1),        rank: detail?.rankings.spg ?? 0, accent: false },
                    { label: 'BLK', value: stats.bpg.toFixed(1),        rank: detail?.rankings.bpg ?? 0, accent: false },
                  ].map(({ label, value, rank, accent }) => (
                    <div key={label} className={`rounded-xl p-2.5 text-center border ${accent ? 'bg-blue-900/20 border-blue-800/30' : 'bg-gray-900/50 border-gray-800/40'}`}>
                      <p className="text-[10px] text-gray-600 mb-1 uppercase">{label}</p>
                      <p className={`text-2xl font-black leading-none ${accent ? 'text-blue-300' : 'text-white'}`}>{value}</p>
                      {rank > 0 && (
                        <p className={`text-[10px] font-bold mt-1 ${rank === 1 ? 'text-yellow-400' : rank <= 3 ? 'text-orange-400' : 'text-gray-600'}`}>{rank}위</p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {[
                    { label: 'FG%', pct: stats.fg_pct, m: stats.fgm, a: stats.fga },
                    { label: '3P%', pct: stats.fg3_pct, m: stats.fg3m, a: stats.fg3a },
                    { label: 'FT%', pct: stats.ft_pct, m: stats.ftm, a: stats.fta },
                  ].map(({ label, pct, m, a }) => (
                    <div key={label} className="bg-gray-900/50 border border-gray-800/40 rounded-xl p-2.5 text-center">
                      <p className="text-xs text-gray-600 mb-1 uppercase">{label}</p>
                      <p className="text-xl font-black text-white leading-none">{a > 0 ? `${pct.toFixed(1)}%` : '—'}</p>
                      <p className="text-xs text-gray-700 mt-0.5">{m}/{a}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {[['PTS', stats.pts, true], ['REB', stats.reb], ['AST', stats.ast], ['STL', stats.stl], ['BLK', stats.blk], ['TOV', stats.tov]].map(([l, v, hi]) => (
                    <div key={l as string} className={`rounded-xl p-2 text-center border ${hi ? 'bg-blue-900/15 border-blue-800/25' : 'bg-gray-900/40 border-gray-800/30'}`}>
                      <p className="text-[8px] text-gray-600 mb-0.5 uppercase">{l as string}</p>
                      <p className={`text-sm font-black ${hi ? 'text-blue-300' : 'text-white'}`}>{v as number}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="px-5 py-6 text-center text-sm text-gray-600 border-b border-gray-800/60">아직 기록된 스탯이 없습니다</div>
            )}

            {/* 배지 — 보유한 것만 + 획득 기준 */}
            {earnedBadges.length > 0 && (
              <div className="px-5 py-4 border-b border-gray-800/60">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">보유 배지 {earnedBadges.length}개</p>
                  <button onClick={() => setShowBadgeBook(true)} className="text-[10px] text-indigo-400 hover:text-indigo-300 cursor-pointer">전체 도감 →</button>
                </div>
                <div className="space-y-2">
                  {earnedBadges.map(b => (
                    <div key={b.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${TIER_BG[b.tier]}`}>
                      <span className="text-2xl shrink-0">{b.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-sm font-black ${TIER_COLOR[b.tier]}`}>{b.name}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                            b.tier === 'gold'   ? 'bg-yellow-400/20 border-yellow-400/50 text-yellow-300' :
                            b.tier === 'silver' ? 'bg-gray-300/15 border-gray-300/40 text-gray-300' :
                                                  'bg-orange-500/15 border-orange-500/40 text-orange-400'
                          }`}>
                            {b.tier === 'gold' ? '🥇 GOLD' : b.tier === 'silver' ? '🥈 SILVER' : '🥉 BRONZE'}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 leading-snug">{b.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 출전 임팩트 */}
            {detail?.win_loss && (detail.win_loss.wins + detail.win_loss.losses) > 0 && (() => {
              const wl = detail.win_loss
              const WL_STATS: { key: keyof NonNullable<WLStats>; label: string }[] = [
                { key: 'ppg', label: 'PPG' }, { key: 'rpg', label: 'RPG' },
                { key: 'apg', label: 'APG' }, { key: 'spg', label: 'SPG' },
                { key: 'bpg', label: 'BPG' },
              ]
              return (
                <div className="px-5 py-4 border-b border-gray-800/60">
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-3">출전 임팩트</p>

                  {/* W-L + 승률 + 팀 기여도 */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 bg-gray-900/60 border border-gray-800/50 rounded-xl p-3 text-center">
                      <p className="text-[9px] text-gray-600 mb-1 uppercase">전적</p>
                      <p className="text-base font-black leading-none">
                        <span className="text-green-400">{wl.wins}W</span>
                        <span className="text-gray-600 mx-1">·</span>
                        <span className="text-red-400">{wl.losses}L</span>
                      </p>
                    </div>
                    <div className="flex-1 bg-gray-900/60 border border-gray-800/50 rounded-xl p-3 text-center">
                      <p className="text-[9px] text-gray-600 mb-1 uppercase">출전 승률</p>
                      <p className={`text-xl font-black leading-none ${wl.win_rate >= 60 ? 'text-green-400' : wl.win_rate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {wl.win_rate}%
                      </p>
                    </div>
                    <div className="flex-1 bg-gray-900/60 border border-gray-800/50 rounded-xl p-3 text-center">
                      <p className="text-[9px] text-gray-600 mb-1 uppercase">팀 득점 기여</p>
                      <p className="text-xl font-black text-blue-300 leading-none">{wl.pts_share}%</p>
                    </div>
                  </div>

                  {/* 팀 득점 기여 바 */}
                  <div className="mb-4">
                    <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(wl.pts_share, 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-600 mt-1">팀 전체 득점 중 이 선수 비중</p>
                  </div>

                  {/* 승/패 스탯 비교 */}
                  {(wl.win_stats || wl.loss_stats) && (
                    <div>
                      <div className="grid grid-cols-7 gap-1 text-center mb-1">
                        <div />
                        {WL_STATS.map(({ label }) => (
                          <div key={label} className="text-[9px] text-gray-600 font-bold uppercase">{label}</div>
                        ))}
                      </div>
                      {([
                        { label: '이길 때', stats: wl.win_stats,  color: 'text-green-400', bg: 'bg-green-900/10 border-green-800/30' },
                        { label: '질 때',   stats: wl.loss_stats, color: 'text-red-400',   bg: 'bg-red-900/10 border-red-800/30'   },
                      ] as const).map(({ label, stats, color, bg }) => (
                        <div key={label} className={`grid grid-cols-7 gap-1 items-center rounded-lg border px-2 py-2 mb-1.5 ${bg}`}>
                          <p className={`text-[10px] font-bold ${color} whitespace-nowrap`}>{label}</p>
                          {WL_STATS.map(({ key }) => (
                            <p key={key} className="text-[11px] font-black text-white text-center">
                              {stats ? stats[key] : '—'}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* 공격 스타일 */}
            {detail?.shot_breakdown && detail.shot_breakdown.total_fga > 0 && (
              <div className="px-5 py-4 border-b border-gray-800/60">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-3">공격 스타일</p>
                {(() => {
                  const sb = detail.shot_breakdown
                  const zones = [
                    { label: '레이업',  color: '#f97316', data: sb.layup },
                    { label: '미들슛', color: '#eab308', data: sb.mid   },
                    { label: '골밑슛', color: '#ef4444', data: sb.post  },
                    { label: '3점슛',  color: '#3b82f6', data: sb.three },
                  ].filter(z => z.data.a > 0)
                  return (
                    <div className="space-y-2">
                      <div className="flex h-3 rounded-full overflow-hidden">
                        {zones.map(z => <div key={z.label} style={{ width: `${z.data.dist}%`, backgroundColor: z.color }} />)}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {[...zones, ...(sb.ft.a > 0 ? [{ label: '자유투', color: '#9ca3af', data: { m: sb.ft.m, a: sb.ft.a, dist: 0, fg_pct: sb.ft.ft_pct } }] : [])].map(z => (
                          <div key={z.label} className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: z.color }} />
                              <span className="text-[11px] text-gray-400">{z.label}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="text-gray-600">{z.data.m}/{z.data.a}</span>
                              <span className="font-bold text-white">{z.data.fg_pct}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* 최근 5경기 */}
            {detail && detail.recent_games.length > 0 && (
              <div className="px-5 py-4">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-3">최근 5경기</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-800/60">
                        {['날짜','상대','결과','PTS','REB','AST','STL','BLK','FG','FG%','3P%'].map(h => (
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
                          <td className="py-1.5 text-gray-600 text-[10px] pr-1 whitespace-nowrap">{g.date?.slice(5) ?? '—'}</td>
                          <td className="py-1.5 text-gray-300 text-[11px] pr-1 whitespace-nowrap">vs {g.opponent ?? '—'}</td>
                          <td className="py-1.5 pr-1">
                            {g.result && <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${g.result === 'W' ? 'text-green-400 bg-green-900/40' : 'text-red-400 bg-red-900/40'}`}>{g.result} {g.score}</span>}
                          </td>
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

    {showBadgeBook && (
      <BadgeBookModal
        playerId={playerId}
        playerName={player?.name ?? playerName}
        leagueId={leagueId}
        onClose={() => setShowBadgeBook(false)}
      />
    )}
    </>
  )
}
