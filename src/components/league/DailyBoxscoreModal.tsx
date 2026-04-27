'use client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2, X, ChevronDown, ChevronUp, Youtube, CheckCircle2, Circle } from 'lucide-react'

type PlayerRow = {
  player_id: string; name: string; number: number | null
  team_id: string | null; team_name: string | null; team_color: string | null
  pts: number; reb: number; ast: number; stl: number; blk: number; tov: number
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
  fg_pct: number | null; fg3_pct: number | null
}

type GameData = {
  id: string; slot_num: number; round_num: number
  is_complete: boolean; is_started: boolean
  home_score: number; away_score: number
  home_team: { id: string; name: string; color: string } | null
  away_team: { id: string; name: string; color: string } | null
  youtube_url: string | null; youtube_start_offset: number
  players: PlayerRow[]
}

type DailyStat = {
  player_id: string; name: string; number: number | null; gp: number
  pts: number; reb: number; ast: number; stl: number; blk: number; tov: number
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
  fg_pct: number | null; fg3_pct: number | null
}

interface Props {
  leagueId: string
  date: string
  onClose: () => void
}

function StatTable({ rows, showGP = false }: { rows: (PlayerRow | DailyStat)[]; showGP?: boolean }) {
  const COLS = [
    ...(showGP ? [{ key: 'gp', label: 'GP' }] : []),
    { key: 'pts', label: 'PTS' }, { key: 'reb', label: 'REB' }, { key: 'ast', label: 'AST' },
    { key: 'stl', label: 'STL' }, { key: 'blk', label: 'BLK' }, { key: 'tov', label: 'TOV' },
    { key: 'fgm_fga', label: 'FG' }, { key: 'fg_pct', label: 'FG%' },
    { key: 'fg3m_fg3a', label: '3P' }, { key: 'fg3_pct', label: '3P%' },
    { key: 'ftm_fta', label: 'FT' },
  ]
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-2 px-3 text-xs text-gray-500 font-bold sticky left-0 bg-gray-900 min-w-[120px]">선수</th>
            {COLS.map(c => (
              <th key={c.key} className="py-2 px-2 text-center text-xs text-gray-500 font-bold whitespace-nowrap">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const rr = r as PlayerRow & DailyStat
            return (
              <tr key={rr.player_id} className={`border-b border-gray-800/40 ${i % 2 === 0 ? '' : 'bg-gray-900/30'} hover:bg-gray-800/30`}>
                <td className="py-2 px-3 sticky left-0 bg-inherit">
                  <div className="flex items-center gap-2">
                    {rr.team_color && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: rr.team_color }} />}
                    <span className="font-bold text-white text-sm whitespace-nowrap">{rr.name}</span>
                  </div>
                </td>
                {COLS.map(c => {
                  let val: string = '—'
                  if (c.key === 'gp') val = String(rr.gp ?? 1)
                  else if (c.key === 'pts') val = String(rr.pts)
                  else if (c.key === 'reb') val = String(rr.reb)
                  else if (c.key === 'ast') val = String(rr.ast)
                  else if (c.key === 'stl') val = String(rr.stl)
                  else if (c.key === 'blk') val = String(rr.blk)
                  else if (c.key === 'tov') val = String(rr.tov)
                  else if (c.key === 'fgm_fga') val = `${rr.fgm}/${rr.fga}`
                  else if (c.key === 'fg_pct')  val = rr.fg_pct  != null ? `${rr.fg_pct}%`  : '—'
                  else if (c.key === 'fg3m_fg3a') val = `${rr.fg3m}/${rr.fg3a}`
                  else if (c.key === 'fg3_pct') val = rr.fg3_pct != null ? `${rr.fg3_pct}%` : '—'
                  else if (c.key === 'ftm_fta') val = `${rr.ftm}/${rr.fta}`
                  const isHighlight = c.key === 'pts'
                  return (
                    <td key={c.key} className={`py-2 px-2 text-center text-sm ${isHighlight ? 'font-black text-white' : 'text-gray-300'} whitespace-nowrap`}>
                      {val}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function getYoutubeEmbedUrl(url: string, offset: number): string {
  try {
    const u = new URL(url)
    let vid = ''
    if (u.hostname.includes('youtu.be')) vid = u.pathname.slice(1)
    else vid = u.searchParams.get('v') ?? ''
    if (!vid) return ''
    return `https://www.youtube.com/embed/${vid}?start=${offset}&autoplay=0&rel=0`
  } catch { return '' }
}

export default function DailyBoxscoreModal({ leagueId, date, onClose }: Props) {
  const [games, setGames] = useState<GameData[]>([])
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedGame, setExpandedGame] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/daily-boxscore?date=${date}`)
      if (r.ok) {
        const d = await r.json()
        setGames(d.games ?? [])
        setDailyStats(d.daily_stats ?? [])
      }
    } finally { setLoading(false) }
  }, [leagueId, date])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const dateLabel = (() => {
    const d = new Date(date + 'T00:00:00')
    const days = ['일','월','화','수','목','금','토']
    return `${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`
  })()

  const completedCount = games.filter(g => g.is_complete).length

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-5xl my-4 z-10 shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="text-white font-black text-xl">{dateLabel} 박스스코어</h2>
            <p className="text-gray-500 text-sm mt-0.5">
              {games.length}경기 · <span className="text-green-400 font-bold">{completedCount}완료</span>
              {games.length - completedCount > 0 && <span className="text-gray-600"> · {games.length - completedCount}미완료</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-800 text-gray-500 hover:text-white cursor-pointer transition-colors">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-gray-600" /></div>
        ) : games.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-base">이 날 기록된 경기가 없습니다</p>
          </div>
        ) : (
          <div className="p-6 space-y-6">

            {/* 당일 전체 스탯 */}
            {dailyStats.length > 0 && (
              <section>
                <h3 className="text-base font-black text-white mb-3 flex items-center gap-2">
                  <span className="w-1 h-5 rounded-full bg-blue-500 inline-block" />
                  당일 전체 스탯 합산
                </h3>
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <StatTable rows={dailyStats} showGP />
                </div>
              </section>
            )}

            {/* 경기별 박스스코어 */}
            <section className="space-y-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span className="w-1 h-5 rounded-full bg-amber-500 inline-block" />
                경기별 박스스코어
              </h3>

              {games.map(g => {
                const isExpanded = expandedGame === g.id
                const embedUrl = g.youtube_url ? getYoutubeEmbedUrl(g.youtube_url, g.youtube_start_offset) : ''
                const homeWin = g.home_score > g.away_score

                return (
                  <div key={g.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    {/* 경기 헤더 */}
                    <button
                      className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-gray-800/40 cursor-pointer transition-colors"
                      onClick={() => setExpandedGame(isExpanded ? null : g.id)}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {g.is_complete
                          ? <CheckCircle2 size={15} className="text-green-400 shrink-0" />
                          : <Circle size={15} className="text-gray-600 shrink-0" />}
                        <span className="text-gray-500 text-sm font-mono shrink-0">#{g.slot_num}</span>

                        {/* 스코어보드 */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            {g.home_team && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.home_team.color }} />}
                            <span className={`font-bold text-sm truncate ${homeWin ? 'text-white' : 'text-gray-500'}`}>{g.home_team?.name ?? '미정'}</span>
                            <span className={`text-xl font-black tabular-nums ${homeWin ? 'text-white' : 'text-gray-500'}`}>{g.home_score}</span>
                          </div>
                          <span className="text-gray-600 text-sm font-bold shrink-0">:</span>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-xl font-black tabular-nums ${!homeWin ? 'text-white' : 'text-gray-500'}`}>{g.away_score}</span>
                            <span className={`font-bold text-sm truncate ${!homeWin ? 'text-white' : 'text-gray-500'}`}>{g.away_team?.name ?? '미정'}</span>
                            {g.away_team && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.away_team.color }} />}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {g.youtube_url && <Youtube size={14} className="text-red-400" />}
                        {isExpanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                      </div>
                    </button>

                    {/* 펼쳐진 상세 */}
                    {isExpanded && (
                      <div className="border-t border-gray-800 space-y-4">
                        {/* YouTube 영상 */}
                        {embedUrl && (
                          <div className="px-5 pt-4">
                            <div className="aspect-video rounded-xl overflow-hidden bg-gray-800">
                              <iframe
                                src={embedUrl}
                                className="w-full h-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            </div>
                          </div>
                        )}
                        {/* 박스스코어 테이블 */}
                        <div className="px-5 pb-4">
                          {g.players.length > 0
                            ? <StatTable rows={g.players} />
                            : <p className="text-gray-600 text-sm text-center py-4">기록된 선수 데이터가 없습니다</p>}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
