'use client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2, X, ChevronDown, ChevronUp, ChevronsUpDown, Youtube, CheckCircle2, Circle } from 'lucide-react'

type PlayerRow = {
  player_id: string; name: string; number: number | null
  team_id: string | null; team_name: string | null; team_color: string | null
  pts: number; reb: number; oreb: number; dreb: number
  ast: number; stl: number; blk: number; tov: number
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
  pts: number; reb: number; oreb: number; dreb: number
  ast: number; stl: number; blk: number; tov: number
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
  fg_pct: number | null; fg3_pct: number | null
}

type ColDef = { key: string; label: string; sortKey?: string }

interface Props {
  leagueId: string
  date: string
  onClose: () => void
}

function StatTable({ rows, showGP = false }: { rows: (PlayerRow | DailyStat)[]; showGP?: boolean }) {
  const [sortKey, setSortKey] = useState('pts')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const COLS: ColDef[] = [
    ...(showGP ? [{ key: 'gp', label: 'GP', sortKey: 'gp' }] : []),
    { key: 'pts',     label: 'PTS',  sortKey: 'pts'  },
    { key: 'reb',     label: 'REB',  sortKey: 'reb'  },
    { key: 'oreb',    label: 'OR',   sortKey: 'oreb' },
    { key: 'dreb',    label: 'DR',   sortKey: 'dreb' },
    { key: 'ast',     label: 'AST',  sortKey: 'ast'  },
    { key: 'stl',     label: 'STL',  sortKey: 'stl'  },
    { key: 'blk',     label: 'BLK',  sortKey: 'blk'  },
    { key: 'tov',     label: 'TOV',  sortKey: 'tov'  },
    { key: 'fgm_fga', label: 'FG',   sortKey: 'fgm'  },
    { key: 'fg_pct',  label: 'FG%',  sortKey: 'fg_pct' },
    { key: 'fg3m_fg3a', label: '3P', sortKey: 'fg3m' },
    { key: 'fg3_pct', label: '3P%',  sortKey: 'fg3_pct' },
    { key: 'ftm_fta', label: 'FT',   sortKey: 'ftm'  },
  ]

  function handleSort(sk: string) {
    if (sk === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(sk); setSortDir('desc') }
  }

  const sorted = [...rows].sort((a, b) => {
    const rr = (x: PlayerRow | DailyStat) => (x as Record<string, unknown>)[sortKey] as number ?? 0
    const diff = rr(a) - rr(b)
    return sortDir === 'desc' ? -diff : diff
  })

  function cellVal(rr: PlayerRow & DailyStat, key: string): string {
    if (key === 'gp')       return String(rr.gp ?? 1)
    if (key === 'pts')      return String(rr.pts)
    if (key === 'reb')      return String(rr.reb)
    if (key === 'oreb')     return String(rr.oreb ?? 0)
    if (key === 'dreb')     return String(rr.dreb ?? 0)
    if (key === 'ast')      return String(rr.ast)
    if (key === 'stl')      return String(rr.stl)
    if (key === 'blk')      return String(rr.blk)
    if (key === 'tov')      return String(rr.tov)
    if (key === 'fgm_fga')  return `${rr.fgm}/${rr.fga}`
    if (key === 'fg_pct')   return rr.fg_pct  != null ? `${rr.fg_pct}%`  : '—'
    if (key === 'fg3m_fg3a') return `${rr.fg3m}/${rr.fg3a}`
    if (key === 'fg3_pct')  return rr.fg3_pct != null ? `${rr.fg3_pct}%` : '—'
    if (key === 'ftm_fta')  return `${rr.ftm}/${rr.fta}`
    return '—'
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-2.5 px-3 text-sm text-gray-500 font-bold sticky left-0 bg-gray-900 min-w-[150px]">선수 / 팀</th>
            {COLS.map(c => (
              <th key={c.key}
                onClick={() => c.sortKey && handleSort(c.sortKey)}
                className={`py-2.5 px-2 text-center text-sm font-bold whitespace-nowrap cursor-pointer select-none transition-colors hover:text-gray-200 ${
                  sortKey === c.sortKey ? 'text-blue-400' : 'text-gray-500'
                }`}>
                {c.label}
                {c.sortKey && (sortKey === c.sortKey
                  ? (sortDir === 'desc' ? <ChevronDown size={9} className="inline ml-0.5" /> : <ChevronUp size={9} className="inline ml-0.5" />)
                  : <ChevronsUpDown size={9} className="inline ml-0.5 opacity-30" />)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const rr = r as PlayerRow & DailyStat
            return (
              <tr key={rr.player_id} className={`border-b border-gray-800/40 ${i % 2 === 0 ? '' : 'bg-gray-900/30'} hover:bg-gray-800/30`}>
                <td className="py-2 px-3 sticky left-0 bg-inherit">
                  <div className="flex items-center gap-2">
                    {rr.team_color && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: rr.team_color }} />}
                    <div>
                      <span className="font-bold text-white text-sm whitespace-nowrap">{rr.name}</span>
                      {rr.team_name && <p className="text-[10px] text-gray-500 leading-none mt-0.5">{rr.team_name}</p>}
                    </div>
                  </div>
                </td>
                {COLS.map(c => (
                  <td key={c.key} className={`py-2 px-2 text-center text-sm whitespace-nowrap tabular-nums ${
                    c.key === 'pts' ? 'font-black text-white' :
                    c.key === 'oreb' ? 'text-orange-400/80' :
                    c.key === 'dreb' ? 'text-blue-400/80' : 'text-gray-300'
                  } ${sortKey === c.sortKey ? 'text-yellow-400 font-bold' : ''}`}>
                    {cellVal(rr, c.key)}
                  </td>
                ))}
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
  const [activeTab, setActiveTab] = useState<'overall' | 'games'>('overall')

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
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-6"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      {/* 배경 오버레이 — 더 진하게 */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} />

      {/* 모달 본체 — 테두리/그림자 강화 */}
      <div className="relative bg-gray-900 border border-gray-600/80 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col z-10 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_24px_64px_rgba(0,0,0,0.9)]">

        {/* Header */}
        <div className="shrink-0 bg-gray-900 border-b border-gray-700/60 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="text-white font-black text-xl">{dateLabel} 박스스코어</h2>
            <p className="text-gray-400 text-sm mt-0.5">
              {games.length}경기 · <span className="text-green-400 font-bold">{completedCount}완료</span>
              {games.length - completedCount > 0 && <span className="text-gray-500"> · {games.length - completedCount}미완료</span>}
            </p>
          </div>
          <button onClick={onClose} className="rounded-xl hover:bg-gray-700/60 text-gray-400 hover:text-white cursor-pointer transition-colors inline-flex items-center justify-center min-h-10 min-w-10">
            <X size={20} />
          </button>
        </div>

        {/* 탭 바 */}
        {!loading && games.length > 0 && (
          <div className="shrink-0 flex border-b border-gray-700/60 bg-gray-900">
            {([
              { key: 'overall', label: '전체 스탯', count: dailyStats.length },
              { key: 'games',   label: '경기별',    count: games.length },
            ] as const).map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`px-6 py-3 text-sm font-bold border-b-2 transition-all duration-200 cursor-pointer ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}>
                {tab.label}
                <span className="ml-2 text-xs text-gray-600">{tab.count}</span>
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-gray-600" /></div>
        ) : games.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-base">이 날 기록된 경기가 없습니다</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">

            {/* 탭 1: 전체 스탯 */}
            {activeTab === 'overall' && (
              <div className="p-5 space-y-4">
                {/* 당일 스탯 리더 */}
                {dailyStats.length > 0 && (() => {
                  const MIN_FGA = 3, MIN_FG3A = 2
                  const byPts  = [...dailyStats].sort((a,b) => b.pts - a.pts)[0]
                  const byReb  = [...dailyStats].sort((a,b) => b.reb - a.reb)[0]
                  const byAst  = [...dailyStats].sort((a,b) => b.ast - a.ast)[0]
                  const byBlk  = [...dailyStats].sort((a,b) => b.blk - a.blk)[0]
                  const byStl  = [...dailyStats].sort((a,b) => b.stl - a.stl)[0]
                  const byFgPct = [...dailyStats]
                    .filter(p => p.fga >= MIN_FGA)
                    .sort((a,b) => (b.fg_pct ?? 0) - (a.fg_pct ?? 0))[0]
                  const byFg3  = [...dailyStats]
                    .filter(p => p.fg3a >= MIN_FG3A)
                    .sort((a,b) => b.fg3m - a.fg3m)[0]

                  const leaders = [
                    { icon: '🏀', label: '득점',   name: byPts?.name,   val: byPts?.pts != null ? `${byPts.pts}점` : null,      sub: `${byPts?.gp ?? 0}경기` },
                    { icon: '💪', label: '리바운드', name: byReb?.name,   val: byReb?.reb != null ? `${byReb.reb}개` : null,      sub: `OR ${byReb?.oreb ?? 0} / DR ${byReb?.dreb ?? 0}` },
                    { icon: '🎯', label: '어시스트', name: byAst?.name,   val: byAst?.ast != null ? `${byAst.ast}개` : null,      sub: `${byAst?.gp ?? 0}경기` },
                    { icon: '🚫', label: '블락',    name: byBlk?.name,   val: byBlk?.blk != null ? `${byBlk.blk}개` : null,      sub: `${byBlk?.gp ?? 0}경기` },
                    { icon: '✋', label: '스틸',    name: byStl?.name,   val: byStl?.stl != null ? `${byStl.stl}개` : null,      sub: `${byStl?.gp ?? 0}경기` },
                    { icon: '📊', label: '야투율',   name: byFgPct?.name, val: byFgPct?.fg_pct != null ? `${byFgPct.fg_pct}%` : null, sub: byFgPct ? `${byFgPct.fgm}/${byFgPct.fga}` : '' },
                    { icon: '🎪', label: '3점슛',   name: byFg3?.name,   val: byFg3?.fg3m != null ? `${byFg3.fg3m}개` : null,   sub: byFg3 && byFg3.fg3a > 0 ? `${byFg3.fg3_pct}%` : '' },
                  ]

                  return (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-2.5">당일 스탯 리더</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                        {leaders.map(({ icon, label, name, val, sub }) => (
                          <div key={label} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-3 flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-base">{icon}</span>
                              <span className="text-[10px] text-gray-500 font-bold uppercase">{label}</span>
                            </div>
                            <p className="text-xl font-black text-white tabular-nums leading-none">
                              {val ?? '—'}
                            </p>
                            <p className="text-xs text-gray-400 font-medium truncate">{name ?? '—'}</p>
                            {sub && <p className="text-[10px] text-gray-600">{sub}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {dailyStats.length > 0
                  ? <div className="bg-gray-900/80 border border-gray-700/50 rounded-xl overflow-hidden">
                      <StatTable rows={dailyStats} showGP />
                    </div>
                  : <p className="text-gray-600 text-sm text-center py-10">집계된 스탯이 없습니다</p>}
              </div>
            )}

            {/* 탭 2: 경기별 박스스코어 */}
            {activeTab === 'games' && (
            <div className="p-5 space-y-3">
            <section className="space-y-3">

              {games.map(g => {
                const isExpanded = expandedGame === g.id
                const embedUrl = g.youtube_url ? getYoutubeEmbedUrl(g.youtube_url, g.youtube_start_offset) : ''
                const homeWin = g.home_score > g.away_score

                return (
                  <div key={g.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    {/* 경기 헤더 */}
                    <button
                      className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-gray-800/60 cursor-pointer transition-colors duration-150"
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
        )}
      </div>
    </div>
  )
}
