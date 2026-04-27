'use client'
import { useEffect, useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import type { LeaguePlayer } from '@/types/league'

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
  homeTeamId?: string
  awayTeamId?: string
  homePlayers?: RosterPlayer[]
  awayPlayers?: RosterPlayer[]
  homeTeam?: { id: string; name: string; color: string }
  awayTeam?: { id: string; name: string; color: string }
}

const HEADERS: { col: SortCol; label: string; small?: boolean }[] = [
  { col: 'pts', label: 'PTS' },
  { col: 'reb', label: 'REB' },
  { col: 'ast', label: 'AST' },
  { col: 'stl', label: 'STL' },
  { col: 'blk', label: 'BLK' },
  { col: 'tov', label: 'TOV' },
  { col: 'fgm', label: 'FG' },
  { col: 'fg_pct', label: 'FG%', small: true },
  { col: 'fg3m', label: '3P' },
  { col: 'fg3_pct', label: '3P%', small: true },
  { col: 'ftm', label: 'FT' },
  { col: 'ft_pct', label: 'FT%', small: true },
]
const COL_COUNT = HEADERS.length + 1

const EMPTY_STAT = (pid: string): PlayerStat => ({
  player_id: pid, pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0,
  ftm: 0, fta: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, min: 0,
})

function pct(made: number, att: number): string {
  return att > 0 ? `${Math.round(made / att * 100)}%` : '-'
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
  const [sortDir, setSortDir] = useState<SortDir>('desc')

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
    if (col !== sortCol) return <ChevronsUpDown size={8} className="inline ml-0.5 opacity-30" />
    return sortDir === 'desc'
      ? <ChevronDown size={8} className="inline ml-0.5" />
      : <ChevronUp size={8} className="inline ml-0.5" />
  }

  function renderThead() {
    return (
      <tr>
        <th className="text-left pb-1.5 pr-2 text-gray-500 text-[10px]">선수</th>
        {HEADERS.map(({ col, label, small }) => (
          <th
            key={col}
            onClick={() => handleSort(col)}
            className={`pb-1.5 px-1 cursor-pointer select-none whitespace-nowrap transition-colors hover:text-gray-200 ${small ? 'text-[9px]' : 'text-[10px]'} ${sortCol === col ? 'text-blue-400' : 'text-gray-500'}`}
          >
            {label}{sortIcon(col)}
          </th>
        ))}
      </tr>
    )
  }

  function renderRow(s: PlayerStat, p: RosterPlayer | undefined) {
    return (
      <tr key={s.player_id} className="text-gray-300">
        <td className="py-1 pr-2 font-medium text-white whitespace-nowrap">
          {p ? `${p.number ? `#${p.number} ` : ''}${p.name}` : s.player_id.slice(0, 6)}
        </td>
        <td className="py-1 px-1 text-center font-bold text-white">{s.pts}</td>
        <td className="py-1 px-1 text-center">{s.reb}</td>
        <td className="py-1 px-1 text-center">{s.ast}</td>
        <td className="py-1 px-1 text-center">{s.stl}</td>
        <td className="py-1 px-1 text-center">{s.blk}</td>
        <td className="py-1 px-1 text-center text-red-400">{s.tov}</td>
        <td className="py-1 px-1 text-center">{s.fgm}/{s.fga}</td>
        <td className="py-1 px-1 text-center text-gray-500 text-[10px]">{pct(s.fgm, s.fga)}</td>
        <td className="py-1 px-1 text-center">{s.fg3m}/{s.fg3a}</td>
        <td className="py-1 px-1 text-center text-gray-500 text-[10px]">{pct(s.fg3m, s.fg3a)}</td>
        <td className="py-1 px-1 text-center">{s.ftm}/{s.fta}</td>
        <td className="py-1 px-1 text-center text-gray-500 text-[10px]">{pct(s.ftm, s.fta)}</td>
      </tr>
    )
  }

  function renderSubtotal(label: string, color: string | undefined, t: Partial<PlayerStat>) {
    const fgm = t.fgm ?? 0; const fga = t.fga ?? 0
    const fg3m = t.fg3m ?? 0; const fg3a = t.fg3a ?? 0
    const ftm = t.ftm ?? 0; const fta = t.fta ?? 0
    return (
      <tr className="bg-gray-800/40 border-t border-gray-700 text-[10px] font-bold">
        <td className="py-1 pr-2 font-bold" style={{ color: color ?? '#9ca3af' }}>{label} 소계</td>
        <td className="py-1 px-1 text-center text-white">{t.pts ?? 0}</td>
        <td className="py-1 px-1 text-center">{t.reb ?? 0}</td>
        <td className="py-1 px-1 text-center">{t.ast ?? 0}</td>
        <td className="py-1 px-1 text-center">{t.stl ?? 0}</td>
        <td className="py-1 px-1 text-center">{t.blk ?? 0}</td>
        <td className="py-1 px-1 text-center">{t.tov ?? 0}</td>
        <td className="py-1 px-1 text-center">{fgm}/{fga}</td>
        <td className="py-1 px-1 text-center text-gray-500">{pct(fgm, fga)}</td>
        <td className="py-1 px-1 text-center">{fg3m}/{fg3a}</td>
        <td className="py-1 px-1 text-center text-gray-500">{pct(fg3m, fg3a)}</td>
        <td className="py-1 px-1 text-center">{ftm}/{fta}</td>
        <td className="py-1 px-1 text-center text-gray-500">{pct(ftm, fta)}</td>
      </tr>
    )
  }

  function renderHeader(label: string, color: string | undefined) {
    return (
      <tr>
        <td colSpan={COL_COUNT} className="pt-2 pb-1">
          <div
            className="inline-block px-2 py-0.5 rounded text-[11px] font-bold"
            style={{ color: color ?? '#9ca3af', backgroundColor: `${color ?? '#9ca3af'}22` }}
          >
            {label}
          </div>
        </td>
      </tr>
    )
  }

  const hasRoster = homePlayers.length > 0 || awayPlayers.length > 0

  // Legacy mode: 이벤트가 있는 선수만 (기존 동작 유지)
  if (!hasRoster) {
    const active = boxScores.filter(b => b.pts > 0 || b.reb > 0 || b.ast > 0 || b.stl > 0 || b.blk > 0 || b.tov > 0)
    if (active.length === 0) return null

    const playerMap = Object.fromEntries(players.map(p => [p.id, p]))
    const sorted = applySortRows(active, sortCol, sortDir)

    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>{renderThead()}</thead>
          <tbody className="divide-y divide-gray-800/50">
            {sorted.map(s => renderRow(s, playerMap[s.player_id] as RosterPlayer | undefined))}
          </tbody>
          {active.length > 1 && (
            <tfoot>
              <tr className="text-gray-500 border-t border-gray-700 text-[10px]">
                <td className="pt-1.5 pr-2 font-medium">합계</td>
                <td className="pt-1.5 px-1 text-center font-bold">{totals.pts ?? 0}</td>
                <td className="pt-1.5 px-1 text-center">{totals.reb ?? 0}</td>
                <td className="pt-1.5 px-1 text-center">{totals.ast ?? 0}</td>
                <td className="pt-1.5 px-1 text-center">{totals.stl ?? 0}</td>
                <td className="pt-1.5 px-1 text-center">{totals.blk ?? 0}</td>
                <td className="pt-1.5 px-1 text-center">{totals.tov ?? 0}</td>
                <td className="pt-1.5 px-1 text-center">{totals.fgm ?? 0}/{totals.fga ?? 0}</td>
                <td className="pt-1.5 px-1 text-center text-gray-500">{pct(totals.fgm ?? 0, totals.fga ?? 0)}</td>
                <td className="pt-1.5 px-1 text-center">{totals.fg3m ?? 0}/{totals.fg3a ?? 0}</td>
                <td className="pt-1.5 px-1 text-center text-gray-500">{pct(totals.fg3m ?? 0, totals.fg3a ?? 0)}</td>
                <td className="pt-1.5 px-1 text-center">{totals.ftm ?? 0}/{totals.fta ?? 0}</td>
                <td className="pt-1.5 px-1 text-center text-gray-500">{pct(totals.ftm ?? 0, totals.fta ?? 0)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
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
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 overflow-x-auto">
      <table className="w-full text-xs whitespace-nowrap">
        <thead>{renderThead()}</thead>
        <tbody className="divide-y divide-gray-800/50">
          {homePlayers.length > 0 && renderHeader(homeTeam?.name ?? '홈팀', homeTeam?.color)}
          {homeStats.map(s => renderRow(s, homePlayerMap[s.player_id]))}
          {homePlayers.length > 0 && renderSubtotal(homeTeam?.name ?? '홈팀', homeTeam?.color, homeTotals)}

          {awayPlayers.length > 0 && renderHeader(awayTeam?.name ?? '어웨이팀', awayTeam?.color)}
          {awayStats.map(s => renderRow(s, awayPlayerMap[s.player_id]))}
          {awayPlayers.length > 0 && renderSubtotal(awayTeam?.name ?? '어웨이팀', awayTeam?.color, awayTotals)}
        </tbody>
        <tfoot>
          <tr className="text-gray-400 border-t-2 border-gray-600 text-[10px]">
            <td className="pt-1.5 pr-2 font-bold">전체 합계</td>
            <td className="pt-1.5 px-1 text-center font-bold text-white">{allTotals.pts ?? 0}</td>
            <td className="pt-1.5 px-1 text-center">{allTotals.reb ?? 0}</td>
            <td className="pt-1.5 px-1 text-center">{allTotals.ast ?? 0}</td>
            <td className="pt-1.5 px-1 text-center">{allTotals.stl ?? 0}</td>
            <td className="pt-1.5 px-1 text-center">{allTotals.blk ?? 0}</td>
            <td className="pt-1.5 px-1 text-center">{allTotals.tov ?? 0}</td>
            <td className="pt-1.5 px-1 text-center">{allTotals.fgm ?? 0}/{allTotals.fga ?? 0}</td>
            <td className="pt-1.5 px-1 text-center text-gray-500">{pct(allTotals.fgm ?? 0, allTotals.fga ?? 0)}</td>
            <td className="pt-1.5 px-1 text-center">{allTotals.fg3m ?? 0}/{allTotals.fg3a ?? 0}</td>
            <td className="pt-1.5 px-1 text-center text-gray-500">{pct(allTotals.fg3m ?? 0, allTotals.fg3a ?? 0)}</td>
            <td className="pt-1.5 px-1 text-center">{allTotals.ftm ?? 0}/{allTotals.fta ?? 0}</td>
            <td className="pt-1.5 px-1 text-center text-gray-500">{pct(allTotals.ftm ?? 0, allTotals.fta ?? 0)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
