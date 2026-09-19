'use client'
import { useEffect, useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import type { LeaguePlayer } from '@/types/league'
import dynamic from 'next/dynamic'
import { accentOrInk } from '@/lib/util/contrastColor'

const PlayerQuickViewModal = dynamic(() => import('@/components/league/PlayerQuickViewModal'), { ssr: false })

type PlayerStat = {
  player_id: string
  pts: number; fgm: number; fga: number; fg3m: number; fg3a: number
  ftm: number; fta: number; oreb: number; dreb: number; reb: number
  ast: number; stl: number; blk: number; tov: number; pf: number; min: number
}

type RosterPlayer = LeaguePlayer & { team_id?: string; is_regular?: boolean }
type SortCol = 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'tov' | 'fgm' | 'fg_pct' | 'fg3m' | 'fg3_pct' | 'ftm' | 'ft_pct'
type SortDir = 'asc' | 'desc'

interface Props {
  leagueId: string
  gameId: string
  players: LeaguePlayer[]
  refreshKey: number
  homePlayers?: RosterPlayer[]
  awayPlayers?: RosterPlayer[]
  homeTeam?: { id: string; name: string; color: string }
  awayTeam?: { id: string; name: string; color: string }
}

const HEADERS: { col: SortCol; label: string; small?: boolean; mdOnly?: boolean }[] = [
  { col: 'pts', label: 'PTS' },
  { col: 'reb', label: 'REB' },
  { col: 'ast', label: 'AST' },
  { col: 'stl', label: 'STL', mdOnly: true },
  { col: 'blk', label: 'BLK', mdOnly: true },
  { col: 'tov', label: 'TOV' },
  { col: 'fgm', label: 'FG' },
  { col: 'fg_pct', label: 'FG%', small: true, mdOnly: true },
  { col: 'fg3m', label: '3P' },
  { col: 'fg3_pct', label: '3P%', small: true, mdOnly: true },
  { col: 'ftm', label: 'FT' },
  { col: 'ft_pct', label: 'FT%', small: true, mdOnly: true },
]
const COL_COUNT = HEADERS.length + 1

const EMPTY_STAT = (pid: string): PlayerStat => ({
  player_id: pid, pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0,
  ftm: 0, fta: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, min: 0,
})

function pct(made: number, att: number): string {
  return att > 0 ? `${Math.round(made / att * 100)}%` : '-'
}

// 팀 색이 없을 때의 폴백. 예전엔 회색 hex 리터럴을 accentOrInk 에 흘려보냈는데 그 값이
// 라이트 모드에서 2.9:1 이라 토큰으로 바꿨다(accentOrInk 는 hex 만 계산할 수 있어 분기한다).
function teamAccent(color?: string): string {
  return color ? accentOrInk(color) : 'var(--mm-muted)'
}
function teamTint(color?: string): string {
  return color ? `${color}22` : 'var(--mm-panel-alt)'
}

function pctVal(made: number, att: number): number {
  return att > 0 ? made / att : -1
}

function sumStats(list: PlayerStat[]): Partial<PlayerStat> {
  return list.reduce<Partial<PlayerStat>>((acc, s) => ({
    pts: (acc.pts ?? 0) + s.pts,
    fgm: (acc.fgm ?? 0) + s.fgm, fga: (acc.fga ?? 0) + s.fga,
    fg3m: (acc.fg3m ?? 0) + s.fg3m, fg3a: (acc.fg3a ?? 0) + s.fg3a,
    ftm: (acc.ftm ?? 0) + s.ftm, fta: (acc.fta ?? 0) + s.fta,
    oreb: (acc.oreb ?? 0) + s.oreb, dreb: (acc.dreb ?? 0) + s.dreb, reb: (acc.reb ?? 0) + s.reb,
    ast: (acc.ast ?? 0) + s.ast, stl: (acc.stl ?? 0) + s.stl, blk: (acc.blk ?? 0) + s.blk,
    tov: (acc.tov ?? 0) + s.tov, pf: (acc.pf ?? 0) + s.pf,
  }), {})
}

function getSortVal(s: PlayerStat, col: SortCol): number {
  switch (col) {
    case 'pts': return s.pts
    case 'reb': return s.reb
    case 'ast': return s.ast
    case 'stl': return s.stl
    case 'blk': return s.blk
    case 'tov': return s.tov
    case 'fgm': return s.fgm
    case 'fg_pct': return pctVal(s.fgm, s.fga)
    case 'fg3m': return s.fg3m
    case 'fg3_pct': return pctVal(s.fg3m, s.fg3a)
    case 'ftm': return s.ftm
    case 'ft_pct': return pctVal(s.ftm, s.fta)
  }
}

function applySortRows(rows: PlayerStat[], col: SortCol, dir: SortDir): PlayerStat[] {
  return [...rows].sort((a, b) => {
    const diff = getSortVal(a, col) - getSortVal(b, col)
    return dir === 'desc' ? -diff : diff
  })
}

export default function LeagueStatsPanel({
  leagueId, gameId, players, refreshKey,
  homePlayers = [], awayPlayers = [],
  homeTeam, awayTeam,
}: Props) {
  const [boxScores, setBoxScores] = useState<PlayerStat[]>([])
  const [totals, setTotals] = useState<Partial<PlayerStat>>({})
  const [sortCol, setSortCol] = useState<SortCol>('pts')
  const [quickViewId, setQuickViewId] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const playerMap = Object.fromEntries(players.map(p => [p.id, p]))

  useEffect(() => {
    if (!gameId) return
    fetch(`/api/leagues/${leagueId}/stats/${gameId}`)
      .then(r => r.json())
      .then(data => { setBoxScores(data.boxScores ?? []); setTotals(data.teamTotals ?? {}) })
      .catch(() => {})
  }, [leagueId, gameId, refreshKey])

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }

  function sortIcon(col: SortCol) {
    if (col !== sortCol) return <ChevronsUpDown size={14} className="inline ml-0.5 opacity-30" />
    return sortDir === 'desc'
      ? <ChevronDown size={14} className="inline ml-0.5" />
      : <ChevronUp size={14} className="inline ml-0.5" />
  }

  function renderThead() {
    return (
      <tr>
        <th className="t-th text-left">선수</th>
        {HEADERS.map(({ col, mdOnly, label }) => (
          <th
            key={col}
            onClick={() => handleSort(col)}
            className={`t-th cursor-pointer select-none transition-colors duration-200 ${mdOnly ? 'hidden md:table-cell' : ''}`}
            // 정렬 중인 열 강조 — 예전 blue-400 은 라이트 모드 패널에서 2.3:1 이라 읽히지 않았다
            style={sortCol === col ? { color: 'var(--mm-yellow-strong)' } : undefined}
          >
            {label}{sortIcon(col)}
          </th>
        ))}
      </tr>
    )
  }

  // mdOnly 인덱스 목록 (td 순서 맞추기용)
  const mdOnlyCols = new Set(HEADERS.filter(h => h.mdOnly).map(h => h.col))

  function renderRow(s: PlayerStat, p: RosterPlayer | undefined) {
    // 셀 클래스는 t-td / t-td-key 가 정본(가독성 업그레이드 2026-09-18). extraClass 는 색만 얹는다.
    const cells: { content: React.ReactNode; col: SortCol; key?: boolean; extraClass?: string }[] = [
      { col: 'pts',     content: s.pts,               key: true },
      { col: 'reb',     content: s.reb },
      { col: 'ast',     content: s.ast },
      { col: 'stl',     content: s.stl },
      { col: 'blk',     content: s.blk },
      { col: 'tov',     content: s.tov,               extraClass: 'text-[color:var(--mm-negative)]' },
      { col: 'fgm',     content: `${s.fgm}/${s.fga}` },
      { col: 'fg_pct',  content: pct(s.fgm, s.fga),  extraClass: 'text-[color:var(--mm-muted)]' },
      { col: 'fg3m',    content: `${s.fg3m}/${s.fg3a}` },
      { col: 'fg3_pct', content: pct(s.fg3m, s.fg3a), extraClass: 'text-[color:var(--mm-muted)]' },
      { col: 'ftm',     content: `${s.ftm}/${s.fta}` },
      { col: 'ft_pct',  content: pct(s.ftm, s.fta),  extraClass: 'text-[color:var(--mm-muted)]' },
    ]
    return (
      <tr key={s.player_id} className="text-[color:var(--mm-ink-soft)]">
        <td className="t-td text-left">
          <button
            onClick={() => setQuickViewId(s.player_id)}
            className="font-semibold text-[color:var(--mm-ink)] hover:text-[color:var(--mm-yellow-strong)] transition-colors duration-200 cursor-pointer text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
          >
            {p ? `${p.number ? `#${p.number} ` : ''}${p.name}` : s.player_id.slice(0, 6)}
          </button>
        </td>
        {cells.map(({ col, content, key, extraClass }) => (
          <td key={col} className={`${key ? 't-td-key' : 't-td'} ${extraClass ?? ''} ${mdOnlyCols.has(col) ? 'hidden md:table-cell' : ''}`}>
            {content}
          </td>
        ))}
      </tr>
    )
  }

  function renderSubtotal(label: string, color: string | undefined, t: Partial<PlayerStat>) {
    const fgm = t.fgm ?? 0; const fga = t.fga ?? 0
    const fg3m = t.fg3m ?? 0; const fg3a = t.fg3a ?? 0
    const ftm = t.ftm ?? 0; const fta = t.fta ?? 0
    return (
      <tr className="bg-[color:var(--mm-panel-alt)] border-t border-[color:var(--mm-rule)] font-bold">
        <td className="t-td text-left" style={{ color: teamAccent(color) }}>{label} 소계</td>
        <td className="t-td-key">{t.pts ?? 0}</td>
        <td className="t-td">{t.reb ?? 0}</td>
        <td className="t-td">{t.ast ?? 0}</td>
        <td className="t-td hidden md:table-cell">{t.stl ?? 0}</td>
        <td className="t-td hidden md:table-cell">{t.blk ?? 0}</td>
        <td className="t-td">{t.tov ?? 0}</td>
        <td className="t-td">{fgm}/{fga}</td>
        <td className="t-td text-[color:var(--mm-muted)] hidden md:table-cell">{pct(fgm, fga)}</td>
        <td className="t-td">{fg3m}/{fg3a}</td>
        <td className="t-td text-[color:var(--mm-muted)] hidden md:table-cell">{pct(fg3m, fg3a)}</td>
        <td className="t-td">{ftm}/{fta}</td>
        <td className="t-td text-[color:var(--mm-muted)] hidden md:table-cell">{pct(ftm, fta)}</td>
      </tr>
    )
  }

  function renderHeader(label: string, color: string | undefined) {
    return (
      <tr>
        <td colSpan={COL_COUNT} className="pt-2 pb-1">
          <div
            className="inline-block px-2 py-0.5 rounded t-label font-bold"
            style={{ color: teamAccent(color), backgroundColor: teamTint(color) }}
          >
            {label}
          </div>
        </td>
      </tr>
    )
  }

  function MobileCard({ s, p }: { s: PlayerStat; p: RosterPlayer | LeaguePlayer | undefined }) {
    return (
      <button
        onClick={() => setQuickViewId(s.player_id)}
        className="w-full text-left bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-lg px-2.5 py-2 min-h-11 cursor-pointer hover:bg-[color:var(--mm-yellow-soft)] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
      >
        <div className="flex items-center gap-2 mb-1.5">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[color:var(--mm-ink)] text-base truncate">
              {p ? <>{p.number != null && <span className="t-num text-[color:var(--mm-muted)] mr-1">#{p.number}</span>}{p.name}</> : s.player_id.slice(0, 6)}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right"><div className="t-num text-lg font-black text-[color:var(--mm-ink)] leading-none">{s.pts}</div><div className="t-label font-bold">PTS</div></div>
            <div className="text-right"><div className="t-num text-base font-bold text-[color:var(--mm-ink-soft)] leading-none">{s.reb}</div><div className="t-label font-bold">REB</div></div>
            <div className="text-right"><div className="t-num text-base font-bold text-[color:var(--mm-ink-soft)] leading-none">{s.ast}</div><div className="t-label font-bold">AST</div></div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1 pt-1 border-t border-[color:var(--mm-rule)] text-base text-[color:var(--mm-muted)]">
          <div className="text-center">FG <span className="t-num font-semibold text-[color:var(--mm-ink)]">{s.fgm}/{s.fga}</span> <span>({pct(s.fgm, s.fga)})</span></div>
          <div className="text-center">3P <span className="t-num font-semibold text-[color:var(--mm-ink)]">{s.fg3m}/{s.fg3a}</span></div>
          <div className="text-center">FT <span className="t-num font-semibold text-[color:var(--mm-ink)]">{s.ftm}/{s.fta}</span></div>
        </div>
      </button>
    )
  }

  const hasRoster = homePlayers.length > 0 || awayPlayers.length > 0

  // Legacy mode: 이벤트가 있는 선수만 (기존 동작 유지)
  if (!hasRoster) {
    const active = boxScores.filter(b => b.pts > 0 || b.reb > 0 || b.ast > 0 || b.stl > 0 || b.blk > 0 || b.tov > 0)
    if (active.length === 0) return null

    const sorted = applySortRows(active, sortCol, sortDir)

    return (
      <>
      {/* 모바일 카드뷰 */}
      <div className="md:hidden space-y-1.5">
        {sorted.map(s => (
          <MobileCard key={s.player_id} s={s} p={playerMap[s.player_id]} />
        ))}
      </div>
      {/* 데스크탑 테이블 */}
      <div className="hidden md:block bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-xl p-3 overflow-x-auto">
        <table className="w-full">
          <thead>{renderThead()}</thead>
          <tbody className="divide-y divide-[color:var(--mm-rule)]">
            {sorted.map(s => renderRow(s, playerMap[s.player_id] as RosterPlayer | undefined))}
          </tbody>
          {active.length > 1 && (
            <tfoot>
              <tr className="text-[color:var(--mm-muted)] border-t border-[color:var(--mm-rule)]">
                <td className="t-td text-left font-semibold">합계</td>
                <td className="t-td font-bold">{totals.pts ?? 0}</td>
                <td className="t-td">{totals.reb ?? 0}</td>
                <td className="t-td">{totals.ast ?? 0}</td>
                <td className="t-td">{totals.stl ?? 0}</td>
                <td className="t-td">{totals.blk ?? 0}</td>
                <td className="t-td">{totals.tov ?? 0}</td>
                <td className="t-td">{totals.fgm ?? 0}/{totals.fga ?? 0}</td>
                <td className="t-td">{pct(totals.fgm ?? 0, totals.fga ?? 0)}</td>
                <td className="t-td">{totals.fg3m ?? 0}/{totals.fg3a ?? 0}</td>
                <td className="t-td">{pct(totals.fg3m ?? 0, totals.fg3a ?? 0)}</td>
                <td className="t-td">{totals.ftm ?? 0}/{totals.fta ?? 0}</td>
                <td className="t-td">{pct(totals.ftm ?? 0, totals.fta ?? 0)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {quickViewId && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={quickViewId}
          playerName={playerMap[quickViewId]?.name ?? quickViewId.slice(0, 6)}
          onClose={() => setQuickViewId(null)}
        />
      )}
      </>
    )
  }

  // Roster 모드: 홈/어웨이 분리, 모든 선수 표시 (이벤트 없으면 0)
  const statsMap: Record<string, PlayerStat> = {}
  for (const s of boxScores) statsMap[s.player_id] = s

  const homeStatsRaw: PlayerStat[] = homePlayers.map(p => statsMap[p.id] ?? EMPTY_STAT(p.id))
  const awayStatsRaw: PlayerStat[] = awayPlayers.map(p => statsMap[p.id] ?? EMPTY_STAT(p.id))
  const homeTotals = sumStats(homeStatsRaw)
  const awayTotals = sumStats(awayStatsRaw)
  const allTotals = sumStats([...homeStatsRaw, ...awayStatsRaw])

  const homeStats = applySortRows(homeStatsRaw, sortCol, sortDir)
  const awayStats = applySortRows(awayStatsRaw, sortCol, sortDir)

  if (homePlayers.length === 0 && awayPlayers.length === 0) return null

  const homePlayerMap = Object.fromEntries(homePlayers.map(p => [p.id, p]))
  const awayPlayerMap = Object.fromEntries(awayPlayers.map(p => [p.id, p]))

  return (
    <>
    {/* 모바일 카드뷰 */}
    <div className="md:hidden space-y-2">
      {homePlayers.length > 0 && (
        <>
          <div className="inline-block px-2 py-0.5 rounded t-label font-bold mb-1"
            style={{ color: teamAccent(homeTeam?.color), backgroundColor: teamTint(homeTeam?.color) }}>
            {homeTeam?.name ?? '홈팀'}
          </div>
          <div className="space-y-1.5">
            {homeStats.map(s => <MobileCard key={s.player_id} s={s} p={homePlayerMap[s.player_id]} />)}
          </div>
          <div className="bg-[color:var(--mm-panel-alt)] rounded-lg px-2.5 py-1.5 text-base flex items-center justify-between gap-2 flex-wrap">
            <span style={{ color: teamAccent(homeTeam?.color) }} className="font-bold">{homeTeam?.name ?? '홈팀'} 합계</span>
            <span className="t-num text-[color:var(--mm-ink-soft)]">PTS <b className="text-[color:var(--mm-ink)]">{homeTotals.pts ?? 0}</b> · REB {homeTotals.reb ?? 0} · AST {homeTotals.ast ?? 0}</span>
          </div>
        </>
      )}
      {awayPlayers.length > 0 && (
        <>
          <div className="inline-block px-2 py-0.5 rounded t-label font-bold mt-3 mb-1"
            style={{ color: teamAccent(awayTeam?.color), backgroundColor: teamTint(awayTeam?.color) }}>
            {awayTeam?.name ?? '어웨이팀'}
          </div>
          <div className="space-y-1.5">
            {awayStats.map(s => <MobileCard key={s.player_id} s={s} p={awayPlayerMap[s.player_id]} />)}
          </div>
          <div className="bg-[color:var(--mm-panel-alt)] rounded-lg px-2.5 py-1.5 text-base flex items-center justify-between gap-2 flex-wrap">
            <span style={{ color: teamAccent(awayTeam?.color) }} className="font-bold">{awayTeam?.name ?? '어웨이팀'} 합계</span>
            <span className="t-num text-[color:var(--mm-ink-soft)]">PTS <b className="text-[color:var(--mm-ink)]">{awayTotals.pts ?? 0}</b> · REB {awayTotals.reb ?? 0} · AST {awayTotals.ast ?? 0}</span>
          </div>
        </>
      )}
    </div>
    {/* 데스크탑 테이블 */}
    <div className="hidden md:block bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-xl p-3 overflow-x-auto">
      <table className="w-full">
        <thead>{renderThead()}</thead>
        <tbody className="divide-y divide-[color:var(--mm-rule)]">
          {homePlayers.length > 0 && renderHeader(homeTeam?.name ?? '홈팀', homeTeam?.color)}
          {homeStats.map(s => renderRow(s, homePlayerMap[s.player_id]))}
          {homePlayers.length > 0 && renderSubtotal(homeTeam?.name ?? '홈팀', homeTeam?.color, homeTotals)}

          {awayPlayers.length > 0 && renderHeader(awayTeam?.name ?? '어웨이팀', awayTeam?.color)}
          {awayStats.map(s => renderRow(s, awayPlayerMap[s.player_id]))}
          {awayPlayers.length > 0 && renderSubtotal(awayTeam?.name ?? '어웨이팀', awayTeam?.color, awayTotals)}
        </tbody>
        <tfoot>
          <tr className="text-[color:var(--mm-ink-soft)] border-t-2 border-[color:var(--mm-rule)]">
            <td className="t-td text-left font-bold">전체 합계</td>
            <td className="t-td-key">{allTotals.pts ?? 0}</td>
            <td className="t-td">{allTotals.reb ?? 0}</td>
            <td className="t-td">{allTotals.ast ?? 0}</td>
            <td className="t-td">{allTotals.stl ?? 0}</td>
            <td className="t-td">{allTotals.blk ?? 0}</td>
            <td className="t-td">{allTotals.tov ?? 0}</td>
            <td className="t-td">{allTotals.fgm ?? 0}/{allTotals.fga ?? 0}</td>
            <td className="t-td text-[color:var(--mm-muted)]">{pct(allTotals.fgm ?? 0, allTotals.fga ?? 0)}</td>
            <td className="t-td">{allTotals.fg3m ?? 0}/{allTotals.fg3a ?? 0}</td>
            <td className="t-td text-[color:var(--mm-muted)]">{pct(allTotals.fg3m ?? 0, allTotals.fg3a ?? 0)}</td>
            <td className="t-td">{allTotals.ftm ?? 0}/{allTotals.fta ?? 0}</td>
            <td className="t-td text-[color:var(--mm-muted)]">{pct(allTotals.ftm ?? 0, allTotals.fta ?? 0)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    {quickViewId && (
      <PlayerQuickViewModal
        leagueId={leagueId}
        playerId={quickViewId}
        playerName={playerMap[quickViewId]?.name ?? quickViewId.slice(0, 6)}
        onClose={() => setQuickViewId(null)}
      />
    )}
    </>
  )
}
