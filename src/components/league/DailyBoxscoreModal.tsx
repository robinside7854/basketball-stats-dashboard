'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, X, ChevronDown, ChevronUp, ChevronsUpDown, Youtube, CheckCircle2, Circle, Trophy, Camera } from 'lucide-react'
import { toast } from 'sonner'
import { toPng } from 'html-to-image'
import ShareableBoxscore from '@/components/league/ShareableBoxscore'

type PlayerRow = {
  player_id: string; name: string; number: number | null
  team_id: string | null; team_name: string | null; team_color: string | null
  pts: number; reb: number; oreb: number; dreb: number
  ast: number; stl: number; blk: number; tov: number; pf: number
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
  team_id: string | null; team_name: string | null; team_color: string | null
  pts: number; reb: number; oreb: number; dreb: number
  ast: number; stl: number; blk: number; tov: number; pf: number
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
  fg_pct: number | null; fg3_pct: number | null
}

type TeamAgg = {
  id: string; name: string; color: string | null
  pts: number; reb: number; oreb: number; dreb: number
  ast: number; stl: number; blk: number; tov: number; pf: number
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
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
    ...(showGP ? [{ key: 'gp', label: 'G', sortKey: 'gp' }] : []),
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
          <tr style={{ borderBottom: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}>
            <th
              className="text-left py-2.5 px-3 text-[11px] font-black uppercase tracking-widest sticky left-0 min-w-[150px]"
              style={{ color: 'var(--mm-muted)', background: 'var(--mm-panel-alt)' }}
            >선수 / 팀</th>
            {COLS.map(c => {
              const isActive = sortKey === c.sortKey
              return (
                <th key={c.key}
                  onClick={() => c.sortKey && handleSort(c.sortKey)}
                  className="py-2.5 px-2 text-center text-[11px] font-jersey font-black whitespace-nowrap cursor-pointer select-none transition-colors uppercase tracking-widest"
                  style={{ color: isActive ? 'var(--mm-yellow-strong)' : 'var(--mm-muted)' }}>
                  {c.label}
                  {c.sortKey && (isActive
                    ? (sortDir === 'desc' ? <ChevronDown size={9} className="inline ml-0.5" /> : <ChevronUp size={9} className="inline ml-0.5" />)
                    : <ChevronsUpDown size={9} className="inline ml-0.5 opacity-30" />)}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const rr = r as PlayerRow & DailyStat
            const rowBg = i % 2 === 0 ? 'var(--mm-panel)' : 'var(--mm-panel-alt)'
            return (
              <tr
                key={rr.player_id}
                style={{ borderBottom: '1px solid var(--mm-rule)', background: rowBg }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--mm-yellow-soft)' }}
                onMouseLeave={e => { e.currentTarget.style.background = rowBg }}
              >
                <td className="py-2 px-3 sticky left-0" style={{ background: 'inherit' }}>
                  <div className="flex items-center gap-2">
                    {rr.team_color && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: rr.team_color }} />}
                    <div>
                      <span
                        className="font-jersey font-black text-sm whitespace-nowrap uppercase"
                        style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
                      >{rr.name}</span>
                      {rr.team_name && <p className="text-xs leading-none mt-0.5" style={{ color: 'var(--mm-muted)' }}>{rr.team_name}</p>}
                    </div>
                  </div>
                </td>
                {COLS.map(c => {
                  const isActive = sortKey === c.sortKey
                  // 셀 색상 우선순위: 정렬 활성 > 특수 컬럼 > 기본
                  let color = 'var(--mm-ink-soft)'
                  let fontWeight: number | undefined
                  if (isActive) { color = 'var(--mm-yellow-strong)'; fontWeight = 900 }
                  else if (c.key === 'pts') { color = 'var(--mm-ink)'; fontWeight = 900 }
                  else if (c.key === 'oreb') { color = '#EA580C' }  // orange accent
                  else if (c.key === 'dreb') { color = '#2563EB' }  // blue accent
                  return (
                    <td
                      key={c.key}
                      className="py-2 px-2 text-center text-sm whitespace-nowrap tabular-nums font-jersey"
                      style={{ color, fontWeight }}
                    >
                      {cellVal(rr, c.key)}
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
  const [activeTab, setActiveTab] = useState<'overall' | 'games' | 'team'>('overall')
  const [teamFilter, setTeamFilter] = useState<string>('all')
  // 상단 스코어보드 접기 (기본 펼침)
  const [scoreboardCollapsed, setScoreboardCollapsed] = useState(false)
  // 이미지 저장 진행 상태
  const [savingImage, setSavingImage] = useState(false)
  // 공유용 hidden 캡처 대상 ref (실제 캡처는 ShareableBoxscore)
  const shareCaptureRef = useRef<HTMLDivElement>(null)
  // 공유 렌더링 표시 flag — true 일 때만 off-screen 렌더
  const [renderingShare, setRenderingShare] = useState(false)

  async function saveAsImage() {
    if (games.length === 0) {
      toast.error('저장할 경기 데이터가 없습니다')
      return
    }
    setSavingImage(true)
    setRenderingShare(true)
    try {
      // React 가 hidden ShareableBoxscore 를 커밋할 때까지 대기 (2 rAF)
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      if (!shareCaptureRef.current) throw new Error('render 실패')
      const dataUrl = await toPng(shareCaptureRef.current, {
        backgroundColor: '#0a0f1c',
        pixelRatio: 2,
        cacheBust: true,
      })
      const link = document.createElement('a')
      link.download = `boxscore-${date}.png`
      link.href = dataUrl
      link.click()
      toast.success('박스스코어 공유 이미지 저장 완료')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(`이미지 저장 실패: ${msg}`)
    } finally {
      setSavingImage(false)
      setRenderingShare(false)
    }
  }

  // 팀 전적 계산 (공유 이미지용)
  const teamRecords = (() => {
    const map = new Map<string, { id: string; name: string; color: string | null; W: number; L: number; D: number; PF: number; PA: number }>()
    for (const g of games.filter(gg => gg.is_complete)) {
      if (!g.home_team || !g.away_team) continue
      const home = map.get(g.home_team.id) ?? { id: g.home_team.id, name: g.home_team.name, color: g.home_team.color, W: 0, L: 0, D: 0, PF: 0, PA: 0 }
      const away = map.get(g.away_team.id) ?? { id: g.away_team.id, name: g.away_team.name, color: g.away_team.color, W: 0, L: 0, D: 0, PF: 0, PA: 0 }
      home.PF += g.home_score; home.PA += g.away_score
      away.PF += g.away_score; away.PA += g.home_score
      if (g.home_score > g.away_score) { home.W++; away.L++ }
      else if (g.home_score < g.away_score) { home.L++; away.W++ }
      else { home.D++; away.D++ }
      map.set(g.home_team.id, home); map.set(g.away_team.id, away)
    }
    return [...map.values()]
  })()

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
  const recordedCount = games.filter(g => g.is_started || g.is_complete).length  // 실제 진행된 경기 (미사용 슬롯 제외)
  const skippedCount = games.length - recordedCount
  const allRecordedComplete = recordedCount > 0 && recordedCount === completedCount

  return (
    <div className="mm-brand fixed inset-0 z-50 flex items-center justify-center sm:p-6"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      {/* 배경 오버레이 — 더 진하게 */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} />

      {/* 모달 본체 */}
      <div
        className="relative w-full max-w-5xl max-h-[90vh] flex flex-col z-10 shadow-[0_24px_64px_rgba(0,0,0,0.55)]"
        style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}
      >
        <div className="flex flex-col min-h-0 flex-1" style={{ background: 'var(--mm-panel)' }}>

        {/* Header */}
        <div
          className="shrink-0 px-6 py-4 flex items-center justify-between"
          style={{ background: 'var(--mm-panel)', borderBottom: '1px solid var(--mm-rule)' }}
        >
          <div>
            <div className="flex items-center gap-2">
              <h2
                className="font-jersey font-black uppercase"
                style={{ color: 'var(--mm-ink)', fontSize: '24px', letterSpacing: '-0.005em' }}
              >
                {dateLabel} 박스스코어
              </h2>
              {allRecordedComplete && (
                <span
                  className="text-[11px] font-black uppercase tracking-widest"
                  style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', padding: '3px 8px' }}
                >
                  완료
                </span>
              )}
            </div>
            <p className="text-sm mt-0.5" style={{ color: 'var(--mm-ink-soft)' }}>
              진행 {recordedCount}경기 · <span className="font-bold" style={{ color: 'var(--mm-yellow-strong)' }}>{completedCount}완료</span>
              {recordedCount - completedCount > 0 && <span style={{ color: 'var(--mm-muted)' }}> · {recordedCount - completedCount}미완료</span>}
              {skippedCount > 0 && <span style={{ color: 'var(--mm-muted)' }}> · 미사용 슬롯 {skippedCount}</span>}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {/* 이미지 저장 — 팀 카톡방 공유용 클린 레이아웃 PNG */}
            {!loading && games.length > 0 && (
              <button
                onClick={saveAsImage}
                disabled={savingImage}
                title="팀 카톡방 공유용 박스스코어 PNG 저장"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-black uppercase tracking-widest cursor-pointer transition-colors disabled:opacity-50"
                style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
              >
                {savingImage ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                <span className="hidden sm:inline">공유 이미지 저장</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="cursor-pointer transition-colors inline-flex items-center justify-center min-h-10 min-w-10"
              style={{ color: 'var(--mm-ink-soft)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--mm-yellow-soft)'; e.currentTarget.style.color = 'var(--mm-ink)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mm-ink-soft)' }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 그날의 경기 전적 (스코어보드) — 접기/펼치기 가능 */}
        {!loading && games.length > 0 && (
          <div
            className="shrink-0"
            style={{ background: 'var(--mm-panel-alt)', borderBottom: '1px solid var(--mm-rule)' }}
          >
            <button
              onClick={() => setScoreboardCollapsed(v => !v)}
              className="w-full flex items-center justify-between px-6 py-2 cursor-pointer transition-colors group"
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--mm-yellow-soft)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span
                className="text-xs font-bold uppercase tracking-widest transition-colors"
                style={{ color: 'var(--mm-muted)' }}
              >
                경기별 스코어 {scoreboardCollapsed ? `(${games.length}경기 · 펼치기)` : '(접기)'}
              </span>
              {scoreboardCollapsed
                ? <ChevronDown size={16} style={{ color: 'var(--mm-muted)' }} />
                : <ChevronUp size={16} style={{ color: 'var(--mm-muted)' }} />}
            </button>
            {!scoreboardCollapsed && (
              <div className="px-6 pb-4 pt-2">
                <DailyScoreboard games={games} />
              </div>
            )}
          </div>
        )}

        {/* 탭 바 */}
        {!loading && games.length > 0 && (
          <div
            className="shrink-0 flex"
            style={{ background: 'var(--mm-panel)', borderBottom: '1px solid var(--mm-rule)' }}
          >
            {([
              { key: 'overall', label: '전체 스탯', count: dailyStats.length },
              { key: 'games',   label: '경기별',    count: games.length },
              { key: 'team',    label: '팀 비교',   count: 0 },
            ] as const).map(tab => {
              const active = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="px-6 py-3 text-xs font-black uppercase tracking-[0.18em] transition-all duration-200 cursor-pointer"
                  style={{
                    borderBottom: active ? '3px solid var(--mm-yellow)' : '3px solid transparent',
                    color: active ? 'var(--mm-ink)' : 'var(--mm-muted)',
                    background: active ? 'var(--mm-panel-alt)' : 'transparent',
                  }}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className="ml-2 text-[11px] tabular-nums" style={{ color: active ? 'var(--mm-yellow-strong)' : 'var(--mm-muted)' }}>{tab.count}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin" style={{ color: 'var(--mm-muted)' }} /></div>
        ) : games.length === 0 ? (
          <div className="text-center py-20" style={{ color: 'var(--mm-muted)' }}>
            <p className="text-base">이 날 기록된 경기가 없습니다</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">

            {/* 탭 1: 전체 스탯 */}
            {activeTab === 'overall' && (() => {
              // 팀 목록 추출 (team_id 있는 선수만)
              const teamList = Array.from(
                new Map(
                  dailyStats
                    .filter(d => d.team_id && d.team_name)
                    .map(d => [d.team_id!, { id: d.team_id!, name: d.team_name!, color: d.team_color }])
                ).values()
              )
              const filteredStats = teamFilter === 'all'
                ? dailyStats
                : dailyStats.filter(d => d.team_id === teamFilter)

              return (
              <div className="p-5 space-y-4">
                {/* 팀 필터 탭 */}
                {teamList.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => setTeamFilter('all')}
                      className="px-3 py-1.5 text-xs font-black uppercase tracking-widest transition-colors cursor-pointer"
                      style={teamFilter === 'all'
                        ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }
                        : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}
                    >전체</button>
                    {teamList.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setTeamFilter(t.id)}
                        className="px-3 py-1.5 text-xs font-black uppercase tracking-widest transition-colors cursor-pointer"
                        style={teamFilter === t.id
                          ? { backgroundColor: t.color ?? 'var(--mm-yellow)', borderColor: t.color ?? 'var(--mm-yellow)', border: '1px solid', color: '#fff' }
                          : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}
                      >{t.name}</button>
                    ))}
                  </div>
                )}
                {/* 당일 스탯 리더 */}
                {filteredStats.length > 0 && (() => {
                  const MIN_FGA = 3, MIN_FG3A = 2
                  const byPts  = [...filteredStats].sort((a,b) => b.pts - a.pts)[0]
                  const byReb  = [...filteredStats].sort((a,b) => b.reb - a.reb)[0]
                  const byAst  = [...filteredStats].sort((a,b) => b.ast - a.ast)[0]
                  const byBlk  = [...filteredStats].sort((a,b) => b.blk - a.blk)[0]
                  const byStl  = [...filteredStats].sort((a,b) => b.stl - a.stl)[0]
                  const byFgPct = [...filteredStats]
                    .filter(p => p.fga >= MIN_FGA)
                    .sort((a,b) => (b.fg_pct ?? 0) - (a.fg_pct ?? 0))[0]
                  const byFg3  = [...filteredStats]
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
                      <p
                        className="text-xs uppercase tracking-widest font-black mb-2.5"
                        style={{ color: 'var(--mm-yellow-strong)', letterSpacing: '0.20em' }}
                      >당일 스탯 리더</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                        {leaders.map(({ icon, label, name, val, sub }) => (
                          <div
                            key={label}
                            className="p-3 flex flex-col gap-0.5"
                            style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
                          >
                            {/* 카테고리 레이블 */}
                            <div className="flex items-center gap-1 mb-1">
                              <span className="text-sm">{icon}</span>
                              <span
                                className="text-[11px] font-black uppercase tracking-widest"
                                style={{ color: 'var(--mm-muted)' }}
                              >{label}</span>
                            </div>
                            {/* 선수 이름 — 주인공 */}
                            <p
                              className="text-base font-jersey font-black leading-tight truncate uppercase"
                              style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
                            >
                              {name ?? '—'}
                            </p>
                            {/* 기록 — 보조 */}
                            <p
                              className="text-sm font-jersey font-black tabular-nums"
                              style={{ color: 'var(--mm-yellow-strong)' }}
                            >
                              {val ?? ''}
                            </p>
                            {sub && <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>{sub}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {filteredStats.length > 0
                  ? <div className="overflow-hidden" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}>
                      <StatTable rows={filteredStats} showGP />
                    </div>
                  : <p className="text-sm text-center py-10" style={{ color: 'var(--mm-muted)' }}>집계된 스탯이 없습니다</p>}
              </div>
              )
            })()}

            {/* 탭 2: 경기별 박스스코어 */}
            {activeTab === 'games' && (
            <div className="p-5 space-y-3">
            <section className="space-y-3">

              {games.map(g => {
                const isExpanded = expandedGame === g.id
                const embedUrl = g.youtube_url ? getYoutubeEmbedUrl(g.youtube_url, g.youtube_start_offset) : ''
                const homeWin = g.home_score > g.away_score
                const winnerColor = homeWin ? (g.home_team?.color ?? 'var(--mm-yellow)') : (g.away_team?.color ?? 'var(--mm-yellow)')

                return (
                  <div
                    key={g.id}
                    className="overflow-hidden relative"
                    style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
                  >
                    {/* 승자 팀 좌측 4px 컬러 바 */}
                    {g.is_complete && (
                      <div
                        className="absolute inset-y-0 left-0 pointer-events-none"
                        style={{ width: '4px', background: winnerColor }}
                        aria-hidden
                      />
                    )}
                    {/* 경기 헤더 */}
                    <button
                      className="w-full text-left px-5 py-4 flex items-center gap-4 cursor-pointer transition-colors duration-150"
                      onClick={() => setExpandedGame(isExpanded ? null : g.id)}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--mm-yellow-soft)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {g.is_complete
                          ? <CheckCircle2 size={15} className="shrink-0" style={{ color: 'var(--mm-yellow-strong)' }} />
                          : <Circle size={15} className="shrink-0" style={{ color: 'var(--mm-muted)' }} />}
                        <span className="text-sm font-mono shrink-0" style={{ color: 'var(--mm-muted)' }}>#{g.slot_num}</span>

                        {/* 스코어보드 */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            {g.home_team && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.home_team.color }} />}
                            <span
                              className="font-jersey font-black text-sm truncate uppercase"
                              style={{ color: homeWin ? 'var(--mm-ink)' : 'var(--mm-muted)' }}
                            >{g.home_team?.name ?? '미정'}</span>
                            <span
                              className="text-xl font-jersey font-black tabular-nums"
                              style={{ color: homeWin ? 'var(--mm-ink)' : 'var(--mm-muted)' }}
                            >{g.home_score}</span>
                          </div>
                          <span className="text-sm font-bold shrink-0" style={{ color: 'var(--mm-muted)' }}>:</span>
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="text-xl font-jersey font-black tabular-nums"
                              style={{ color: !homeWin ? 'var(--mm-ink)' : 'var(--mm-muted)' }}
                            >{g.away_score}</span>
                            <span
                              className="font-jersey font-black text-sm truncate uppercase"
                              style={{ color: !homeWin ? 'var(--mm-ink)' : 'var(--mm-muted)' }}
                            >{g.away_team?.name ?? '미정'}</span>
                            {g.away_team && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.away_team.color }} />}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {g.youtube_url && <Youtube size={14} style={{ color: 'var(--mm-live)' }} />}
                        {isExpanded
                          ? <ChevronUp size={16} style={{ color: 'var(--mm-muted)' }} />
                          : <ChevronDown size={16} style={{ color: 'var(--mm-muted)' }} />}
                      </div>
                    </button>

                    {/* 펼쳐진 상세 */}
                    {isExpanded && (
                      <div className="space-y-4" style={{ borderTop: '1px solid var(--mm-rule)' }}>
                        {/* YouTube 영상 */}
                        {embedUrl && (
                          <div className="px-5 pt-4">
                            <div className="aspect-video overflow-hidden" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}>
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
                            : <p className="text-sm text-center py-4" style={{ color: 'var(--mm-muted)' }}>기록된 선수 데이터가 없습니다</p>}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
            </div>
            )}

            {/* 탭 3: 팀 비교 */}
            {activeTab === 'team' && (
              <div className="p-5">
                <TeamComparePanel dailyStats={dailyStats} games={games} />
              </div>
            )}

          </div>
        )}
        </div>
      </div>

      {/* Hidden 공유용 캡처 대상 — 저장 클릭 시에만 렌더 (off-screen) */}
      {renderingShare && (
        <div style={{
          position: 'fixed', left: '-99999px', top: 0,
          pointerEvents: 'none', opacity: 1,  // opacity 0 이면 html-to-image 가 놓칠 수 있음
        }} aria-hidden>
          <div ref={shareCaptureRef}>
            <ShareableBoxscore
              dateLabel={dateLabel}
              games={games.map(g => ({
                id: g.id, slot_num: g.slot_num,
                home_team: g.home_team, away_team: g.away_team,
                home_score: g.home_score, away_score: g.away_score,
                is_complete: g.is_complete,
              }))}
              dailyStats={dailyStats}
              teamRecords={teamRecords}
              leagueName="미라클모닝농구단"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── 팀 비교 패널 ──────────────────────────────────────────────
// 그날 출전한 모든 팀 목록 (선택지용)
function extractTeams(games: GameData[]): { id: string; name: string; color: string | null }[] {
  const map = new Map<string, { id: string; name: string; color: string | null }>()
  for (const g of games) {
    if (g.home_team) map.set(g.home_team.id, { id: g.home_team.id, name: g.home_team.name, color: g.home_team.color })
    if (g.away_team) map.set(g.away_team.id, { id: g.away_team.id, name: g.away_team.name, color: g.away_team.color })
  }
  return [...map.values()]
}

// 두 팀이 맞붙은 경기에서만 집계 (head-to-head 상대 전적)
function aggregateHeadToHead(
  games: GameData[],
  teamAId: string,
  teamBId: string,
  meta: Map<string, { name: string; color: string | null }>,
): { A: TeamAgg; B: TeamAgg; gameCount: number } {
  const h2hGames = games.filter(g => {
    if (!g.home_team || !g.away_team) return false
    const ids = [g.home_team.id, g.away_team.id]
    return ids.includes(teamAId) && ids.includes(teamBId)
  })

  const init = (id: string): TeamAgg => ({
    id,
    name: meta.get(id)?.name ?? '?',
    color: meta.get(id)?.color ?? null,
    pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
    fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
  })
  const A = init(teamAId)
  const B = init(teamBId)

  for (const g of h2hGames) {
    for (const p of g.players) {
      const target = p.team_id === teamAId ? A : p.team_id === teamBId ? B : null
      if (!target) continue
      target.pts += p.pts; target.reb += p.reb; target.oreb += p.oreb; target.dreb += p.dreb
      target.ast += p.ast; target.stl += p.stl; target.blk += p.blk; target.tov += p.tov; target.pf += (p.pf ?? 0)
      target.fgm += p.fgm; target.fga += p.fga; target.fg3m += p.fg3m; target.fg3a += p.fg3a
      target.ftm += p.ftm; target.fta += p.fta
    }
  }

  return { A, B, gameCount: h2hGames.length }
}

function TeamComparePanel({ dailyStats, games }: { dailyStats: DailyStat[]; games: GameData[] }) {
  void dailyStats  // 더 이상 직접 사용하지 않음 (games 기반 head-to-head 집계)
  const teams = extractTeams(games)
  const teamMeta = new Map(teams.map(t => [t.id, { name: t.name, color: t.color }]))

  const [teamAId, setTeamAId] = useState<string | null>(null)
  const [teamBId, setTeamBId] = useState<string | null>(null)

  // 기본값: 그날 첫 경기의 홈/어웨이
  useEffect(() => {
    if (teamAId && teamBId) return
    const firstGame = games.find(g => g.home_team && g.away_team)
    if (firstGame) {
      setTeamAId(firstGame.home_team!.id)
      setTeamBId(firstGame.away_team!.id)
    } else if (teams.length >= 2) {
      setTeamAId(teams[0].id)
      setTeamBId(teams[1].id)
    }
  }, [games, teams, teamAId, teamBId])

  const allComplete = games.length > 0 && games.every(g => g.is_complete)

  if (teams.length < 2) {
    return (
      <div className="text-center py-12" style={{ color: 'var(--mm-muted)' }}>
        <p className="text-sm">팀 비교를 위해 최소 2팀 이상의 기록이 필요합니다.</p>
      </div>
    )
  }

  if (!teamAId || !teamBId) return null

  // 같은 팀 선택 또는 맞붙은 경기 없음 → 필터는 계속 표시하고 본문만 안내 메시지로 대체
  if (teamAId === teamBId) {
    return (
      <div className="space-y-4">
        <TeamSelectorBars teams={teams} teamAId={teamAId} teamBId={teamBId} onChangeA={setTeamAId} onChangeB={setTeamBId} />
        <div className="text-center py-10" style={{ color: 'var(--mm-muted)', border: '1px dashed var(--mm-rule)' }}>
          <p className="text-sm">서로 다른 두 팀을 선택해주세요.</p>
        </div>
      </div>
    )
  }

  const h2h = aggregateHeadToHead(games, teamAId, teamBId, teamMeta)
  const A = h2h.A
  const B = h2h.B

  if (h2h.gameCount === 0) {
    return (
      <div className="space-y-4">
        <TeamSelectorBars teams={teams} teamAId={teamAId} teamBId={teamBId} onChangeA={setTeamAId} onChangeB={setTeamBId} />
        <div className="text-center py-10" style={{ color: 'var(--mm-muted)', border: '1px dashed var(--mm-rule)' }}>
          <p className="text-sm">
            <span className="font-bold" style={{ color: 'var(--mm-ink)' }}>{teamMeta.get(teamAId)?.name}</span>
            {' vs '}
            <span className="font-bold" style={{ color: 'var(--mm-ink)' }}>{teamMeta.get(teamBId)?.name}</span>
            {' — 이 날짜에 맞붙은 경기가 없습니다.'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--mm-muted)' }}>두 팀이 실제 맞붙은 경기 기록만 집계됩니다.</p>
        </div>
      </div>
    )
  }

  const pct = (m: number, a: number) => a > 0 ? Math.round(m / a * 1000) / 10 : 0
  const items: { label: string; a: number; b: number; suffix?: string; fraction?: [number, number, number, number] }[] = [
    { label: '득점', a: A.pts, b: B.pts },
    { label: '리바운드', a: A.reb, b: B.reb },
    { label: '오펜스\n리바운드', a: A.oreb, b: B.oreb },
    { label: '디펜스\n리바운드', a: A.dreb, b: B.dreb },
    { label: '어시스트', a: A.ast, b: B.ast },
    { label: '스틸', a: A.stl, b: B.stl },
    { label: '블록', a: A.blk, b: B.blk },
    { label: '턴오버', a: A.tov, b: B.tov },
    { label: '파울', a: A.pf, b: B.pf },
    { label: 'FG%', a: pct(A.fgm, A.fga), b: pct(B.fgm, B.fga), suffix: '%', fraction: [A.fgm, A.fga, B.fgm, B.fga] },
    { label: '3P%', a: pct(A.fg3m, A.fg3a), b: pct(B.fg3m, B.fg3a), suffix: '%', fraction: [A.fg3m, A.fg3a, B.fg3m, B.fg3a] },
    { label: 'FT%', a: pct(A.ftm, A.fta), b: pct(B.ftm, B.fta), suffix: '%', fraction: [A.ftm, A.fta, B.ftm, B.fta] },
  ]

  const colorA = A.color ?? '#dc2626'
  const colorB = B.color ?? '#2563eb'

  return (
    <div className="space-y-4">
      {!allComplete && (
        <div
          className="text-xs px-3 py-2 font-bold"
          style={{ color: 'var(--mm-black)', background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow)' }}
        >
          ⚠ 이 날의 일부 경기가 아직 마감되지 않았습니다 — 최종 수치는 마감 후 확정됩니다.
        </div>
      )}

      <TeamSelectorBars teams={teams} teamAId={teamAId} teamBId={teamBId} onChangeA={setTeamAId} onChangeB={setTeamBId} />

      {/* 팀명 헤더 + 맞대결 경기 수 */}
      <div
        className="flex items-center justify-center gap-6 py-2"
        style={{ borderBottom: '1px solid var(--mm-rule)' }}
      >
        <div className="text-right">
          <div className="text-lg font-jersey font-black uppercase" style={{ color: colorA, letterSpacing: '-0.005em' }}>{A.name}</div>
          <div className="text-[11px] font-bold tracking-widest uppercase" style={{ color: 'var(--mm-muted)' }}>HOME</div>
        </div>
        <div className="flex flex-col items-center">
          <span className="font-jersey font-black text-sm" style={{ color: 'var(--mm-muted)' }}>VS</span>
          <span className="text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>맞대결 {h2h.gameCount}경기</span>
        </div>
        <div className="text-left">
          <div className="text-lg font-jersey font-black uppercase" style={{ color: colorB, letterSpacing: '-0.005em' }}>{B.name}</div>
          <div className="text-[11px] font-bold tracking-widest uppercase" style={{ color: 'var(--mm-muted)' }}>AWAY</div>
        </div>
      </div>

      {/* 비교 막대 */}
      <div className="space-y-1.5">
        {items.map(item => {
          const max = Math.max(item.a, item.b, 1)
          const aWin = item.a > item.b
          const bWin = item.b > item.a
          const labelA = item.fraction
            ? `${item.a}% (${item.fraction[0]}/${item.fraction[1]})`
            : `${item.a}${item.suffix ?? ''}`
          const labelB = item.fraction
            ? `${item.b}% (${item.fraction[2]}/${item.fraction[3]})`
            : `${item.b}${item.suffix ?? ''}`
          return (
            <div key={item.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              {/* 좌측 (홈) — 막대 오른쪽 정렬, 라벨은 막대 왼쪽 */}
              <div className="flex items-center justify-end gap-2 min-h-[28px]">
                <span
                  className={`text-sm tabular-nums font-jersey font-black whitespace-nowrap ${aWin ? '' : 'opacity-60'}`}
                  style={aWin ? { color: colorA } : { color: 'var(--mm-muted)' }}
                >
                  {labelA}
                </span>
                <div className="h-5" style={{
                  width: `${(item.a / max) * 100}%`,
                  backgroundColor: colorA,
                  opacity: aWin ? 1 : 0.55,
                  minWidth: item.a > 0 ? 2 : 0,
                }} />
              </div>

              {/* 중앙 라벨 */}
              <div className="text-center px-2">
                <span
                  className="text-[11px] font-black uppercase tracking-widest whitespace-pre-line leading-tight block"
                  style={{ color: 'var(--mm-muted)' }}
                >
                  {item.label}
                </span>
              </div>

              {/* 우측 (어웨이) */}
              <div className="flex items-center justify-start gap-2 min-h-[28px]">
                <div className="h-5" style={{
                  width: `${(item.b / max) * 100}%`,
                  backgroundColor: colorB,
                  opacity: bWin ? 1 : 0.55,
                  minWidth: item.b > 0 ? 2 : 0,
                }} />
                <span
                  className={`text-sm tabular-nums font-jersey font-black whitespace-nowrap ${bWin ? '' : 'opacity-60'}`}
                  style={bWin ? { color: colorB } : { color: 'var(--mm-muted)' }}
                >
                  {labelB}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 그날의 스코어보드 ─────────────────────────────────────────
function DailyScoreboard({ games }: { games: GameData[] }) {
  const completed = games.filter(g => g.is_complete)
  const ongoing = games.filter(g => g.is_started && !g.is_complete)
  const upcoming = games.filter(g => !g.is_started)

  // 팀별 전적 (완료 경기만)
  const recordMap = new Map<string, { id: string; name: string; color: string | null; W: number; L: number; D: number; PF: number; PA: number }>()
  for (const g of completed) {
    if (!g.home_team || !g.away_team) continue
    const home = recordMap.get(g.home_team.id) ?? { id: g.home_team.id, name: g.home_team.name, color: g.home_team.color, W: 0, L: 0, D: 0, PF: 0, PA: 0 }
    const away = recordMap.get(g.away_team.id) ?? { id: g.away_team.id, name: g.away_team.name, color: g.away_team.color, W: 0, L: 0, D: 0, PF: 0, PA: 0 }
    home.PF += g.home_score; home.PA += g.away_score
    away.PF += g.away_score; away.PA += g.home_score
    if (g.home_score > g.away_score) { home.W++; away.L++ }
    else if (g.home_score < g.away_score) { home.L++; away.W++ }
    else { home.D++; away.D++ }
    recordMap.set(g.home_team.id, home)
    recordMap.set(g.away_team.id, away)
  }
  const records = [...recordMap.values()].sort((a, b) => (b.W - b.L) - (a.W - a.L) || (b.PF - b.PA) - (a.PF - a.PA))

  return (
    <div className="space-y-3">
      {/* 경기별 스코어 카드 — 승자 확실히 부각 (트로피 · 폰트 굵기 · 승자쪽 배경 컬러 힌트) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {[...completed, ...ongoing, ...upcoming].map(g => {
          const homeWin = g.is_complete && g.home_score > g.away_score
          const awayWin = g.is_complete && g.away_score > g.home_score
          const draw   = g.is_complete && g.home_score === g.away_score
          const homeColor = g.home_team?.color ?? '#9ca3af'
          const awayColor = g.away_team?.color ?? '#9ca3af'
          return (
            <div
              key={g.id}
              className="px-3 py-2.5 relative overflow-hidden"
              style={{
                background: g.is_complete ? 'var(--mm-panel)' : g.is_started ? 'var(--mm-yellow-soft)' : 'var(--mm-panel-alt)',
                border: '1px solid var(--mm-rule)',
              }}
            >
              {/* 승자 쪽에 미묘한 배경 그라디언트 힌트 (좌/우) */}
              {homeWin && (
                <div className="absolute inset-y-0 left-0 w-1/2 opacity-[0.10] pointer-events-none"
                     style={{ background: `linear-gradient(to right, ${homeColor}, transparent)` }} />
              )}
              {awayWin && (
                <div className="absolute inset-y-0 right-0 w-1/2 opacity-[0.10] pointer-events-none"
                     style={{ background: `linear-gradient(to left, ${awayColor}, transparent)` }} />
              )}
              <div className="relative">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-mono" style={{ color: 'var(--mm-muted)' }}>#{g.slot_num}</span>
                  {g.is_complete && (
                    <span
                      className="text-[10px] font-black uppercase tracking-widest"
                      style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', padding: '2px 6px' }}
                    >완료</span>
                  )}
                  {!g.is_complete && g.is_started && (
                    <span
                      className="text-[10px] font-black uppercase tracking-widest"
                      style={{ background: 'var(--mm-live)', color: '#fff', padding: '2px 6px' }}
                    >진행 중</span>
                  )}
                  {!g.is_started && (
                    <span className="text-xs font-bold uppercase" style={{ color: 'var(--mm-muted)' }}>예정</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* HOME */}
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: homeColor }} />
                    {homeWin && <Trophy size={11} className="shrink-0" style={{ color: 'var(--mm-yellow-strong)' }} fill="currentColor" />}
                    <span
                      className="text-sm truncate font-jersey uppercase"
                      style={{
                        color: homeWin ? 'var(--mm-ink)' : g.is_complete ? (draw ? 'var(--mm-ink-soft)' : 'var(--mm-muted)') : 'var(--mm-ink-soft)',
                        fontWeight: homeWin ? 900 : 700,
                        textDecoration: g.is_complete && !homeWin && !draw ? 'line-through' : 'none',
                      }}
                    >
                      {g.home_team?.name ?? '미정'}
                    </span>
                  </div>
                  <span
                    className="text-xl font-jersey tabular-nums"
                    style={{
                      color: homeWin ? 'var(--mm-ink)' : g.is_complete ? (draw ? 'var(--mm-ink-soft)' : 'var(--mm-muted)') : 'var(--mm-ink-soft)',
                      fontWeight: 900,
                    }}
                  >{g.home_score}</span>
                  <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>:</span>
                  <span
                    className="text-xl font-jersey tabular-nums"
                    style={{
                      color: awayWin ? 'var(--mm-ink)' : g.is_complete ? (draw ? 'var(--mm-ink-soft)' : 'var(--mm-muted)') : 'var(--mm-ink-soft)',
                      fontWeight: 900,
                    }}
                  >{g.away_score}</span>
                  {/* AWAY */}
                  <div className="flex-1 min-w-0 flex items-center gap-1.5 justify-end">
                    <span
                      className="text-sm truncate text-right font-jersey uppercase"
                      style={{
                        color: awayWin ? 'var(--mm-ink)' : g.is_complete ? (draw ? 'var(--mm-ink-soft)' : 'var(--mm-muted)') : 'var(--mm-ink-soft)',
                        fontWeight: awayWin ? 900 : 700,
                        textDecoration: g.is_complete && !awayWin && !draw ? 'line-through' : 'none',
                      }}
                    >
                      {g.away_team?.name ?? '미정'}
                    </span>
                    {awayWin && <Trophy size={11} className="shrink-0" style={{ color: 'var(--mm-yellow-strong)' }} fill="currentColor" />}
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: awayColor }} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 팀별 일일 전적 (완료 경기 기반) */}
      {records.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span
            className="text-[11px] font-black uppercase tracking-widest mr-1"
            style={{ color: 'var(--mm-muted)' }}
          >일일 전적</span>
          {records.map(r => (
            <div
              key={r.id}
              className="inline-flex items-center gap-1.5 px-2 py-1"
              style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}
            >
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.color ?? 'var(--mm-muted)' }} />
              <span className="text-xs font-jersey font-black uppercase" style={{ color: 'var(--mm-ink)' }}>{r.name}</span>
              <span className="text-xs tabular-nums">
                <span className="font-bold" style={{ color: '#059669' }}>{r.W}승</span>
                {r.D > 0 && <span className="ml-1" style={{ color: 'var(--mm-muted)' }}>{r.D}무</span>}
                <span className="font-bold ml-1" style={{ color: '#DC2626' }}>{r.L}패</span>
              </span>
              <span className="text-xs tabular-nums" style={{ color: 'var(--mm-muted)' }}>({r.PF}-{r.PA})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TeamSelectorBars({
  teams, teamAId, teamBId, onChangeA, onChangeB,
}: {
  teams: { id: string; name: string; color: string | null }[]
  teamAId: string | null
  teamBId: string | null
  onChangeA: (id: string) => void
  onChangeB: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{ color: 'var(--mm-muted)' }}>HOME</p>
        <div className="flex flex-wrap gap-1.5">
          {teams.map(t => (
            <button
              key={t.id}
              onClick={() => onChangeA(t.id)}
              className="px-2.5 py-1 text-xs font-black uppercase tracking-widest transition-colors cursor-pointer"
              style={teamAId === t.id
                ? { backgroundColor: t.color ?? 'var(--mm-yellow)', borderColor: t.color ?? 'var(--mm-yellow)', border: '1px solid', color: '#fff' }
                : { background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)' }}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{ color: 'var(--mm-muted)' }}>AWAY</p>
        <div className="flex flex-wrap gap-1.5">
          {teams.map(t => (
            <button
              key={t.id}
              onClick={() => onChangeB(t.id)}
              className="px-2.5 py-1 text-xs font-black uppercase tracking-widest transition-colors cursor-pointer"
              style={teamBId === t.id
                ? { backgroundColor: t.color ?? 'var(--mm-yellow)', borderColor: t.color ?? 'var(--mm-yellow)', border: '1px solid', color: '#fff' }
                : { background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)' }}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
