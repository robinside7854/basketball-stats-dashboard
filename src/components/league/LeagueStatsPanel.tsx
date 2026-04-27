'use client'
import { useEffect, useState } from 'react'
import type { LeaguePlayer } from '@/types/league'

type PlayerStat = {
  player_id: string
  pts: number; fgm: number; fga: number; fg3m: number; fg3a: number
  ftm: number; fta: number; oreb: number; dreb: number; reb: number
  ast: number; stl: number; blk: number; tov: number; pf: number; min: number
}

type RosterPlayer = LeaguePlayer & { team_id?: string; is_regular?: boolean }

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

const EMPTY_STAT = (pid: string): PlayerStat => ({
  player_id: pid, pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0,
  ftm: 0, fta: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, min: 0,
})

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

export default function LeagueStatsPanel({
  leagueId, gameId, players, refreshKey,
  homePlayers = [], awayPlayers = [],
  homeTeam, awayTeam,
}: Props) {
  const [boxScores, setBoxScores] = useState<PlayerStat[]>([])
  const [totals, setTotals] = useState<Partial<PlayerStat>>({})

  useEffect(() => {
    if (!gameId) return
    fetch(`/api/leagues/${leagueId}/stats/${gameId}`)
      .then(r => r.json())
      .then(data => { setBoxScores(data.boxScores ?? []); setTotals(data.teamTotals ?? {}) })
      .catch(() => {})
  }, [leagueId, gameId, refreshKey])

  const hasRoster = homePlayers.length > 0 || awayPlayers.length > 0

  // Legacy mode: 이벤트가 있는 선수만 (기존 동작 유지)
  if (!hasRoster) {
    const active = boxScores.filter(b => b.pts > 0 || b.reb > 0 || b.ast > 0 || b.stl > 0 || b.blk > 0 || b.tov > 0)
    if (active.length === 0) return null

    const playerMap = Object.fromEntries(players.map(p => [p.id, p]))

    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr className="text-gray-500 text-[10px]">
              <th className="text-left pb-1.5 pr-2">선수</th>
              <th className="pb-1.5 px-1">PTS</th>
              <th className="pb-1.5 px-1">REB</th>
              <th className="pb-1.5 px-1">AST</th>
              <th className="pb-1.5 px-1">STL</th>
              <th className="pb-1.5 px-1">BLK</th>
              <th className="pb-1.5 px-1">TOV</th>
              <th className="pb-1.5 px-1">FG</th>
              <th className="pb-1.5 px-1">3P</th>
              <th className="pb-1.5 px-1">FT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {active.sort((a, b) => b.pts - a.pts).map(s => {
              const p = playerMap[s.player_id]
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
                  <td className="py-1 px-1 text-center">{s.fg3m}/{s.fg3a}</td>
                  <td className="py-1 px-1 text-center">{s.ftm}/{s.fta}</td>
                </tr>
              )
            })}
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
                <td className="pt-1.5 px-1 text-center">{totals.fg3m ?? 0}/{totals.fg3a ?? 0}</td>
                <td className="pt-1.5 px-1 text-center">{totals.ftm ?? 0}/{totals.fta ?? 0}</td>
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

  const homeStats: PlayerStat[] = homePlayers.map(p => statsMap[p.id] ?? EMPTY_STAT(p.id))
  const awayStats: PlayerStat[] = awayPlayers.map(p => statsMap[p.id] ?? EMPTY_STAT(p.id))
  const homeTotals = sumStats(homeStats)
  const awayTotals = sumStats(awayStats)

  if (homePlayers.length === 0 && awayPlayers.length === 0) return null

  const homePlayerMap = Object.fromEntries(homePlayers.map(p => [p.id, p]))
  const awayPlayerMap = Object.fromEntries(awayPlayers.map(p => [p.id, p]))

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
        <td className="py-1 px-1 text-center">{s.fg3m}/{s.fg3a}</td>
        <td className="py-1 px-1 text-center">{s.ftm}/{s.fta}</td>
      </tr>
    )
  }

  function renderSubtotal(label: string, color: string | undefined, t: Partial<PlayerStat>) {
    return (
      <tr className="bg-gray-800/40 border-t border-gray-700 text-[10px] font-bold">
        <td className="py-1 pr-2 font-bold" style={{ color: color ?? '#9ca3af' }}>{label} 소계</td>
        <td className="py-1 px-1 text-center text-white">{t.pts ?? 0}</td>
        <td className="py-1 px-1 text-center">{t.reb ?? 0}</td>
        <td className="py-1 px-1 text-center">{t.ast ?? 0}</td>
        <td className="py-1 px-1 text-center">{t.stl ?? 0}</td>
        <td className="py-1 px-1 text-center">{t.blk ?? 0}</td>
        <td className="py-1 px-1 text-center">{t.tov ?? 0}</td>
        <td className="py-1 px-1 text-center">{t.fgm ?? 0}/{t.fga ?? 0}</td>
        <td className="py-1 px-1 text-center">{t.fg3m ?? 0}/{t.fg3a ?? 0}</td>
        <td className="py-1 px-1 text-center">{t.ftm ?? 0}/{t.fta ?? 0}</td>
      </tr>
    )
  }

  function renderHeader(label: string, color: string | undefined) {
    return (
      <tr>
        <td colSpan={10} className="pt-2 pb-1">
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

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 overflow-x-auto">
      <table className="w-full text-xs whitespace-nowrap">
        <thead>
          <tr className="text-gray-500 text-[10px]">
            <th className="text-left pb-1.5 pr-2">선수</th>
            <th className="pb-1.5 px-1">PTS</th>
            <th className="pb-1.5 px-1">REB</th>
            <th className="pb-1.5 px-1">AST</th>
            <th className="pb-1.5 px-1">STL</th>
            <th className="pb-1.5 px-1">BLK</th>
            <th className="pb-1.5 px-1">TOV</th>
            <th className="pb-1.5 px-1">FG</th>
            <th className="pb-1.5 px-1">3P</th>
            <th className="pb-1.5 px-1">FT</th>
          </tr>
        </thead>
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
            <td className="pt-1.5 px-1 text-center font-bold text-white">{totals.pts ?? 0}</td>
            <td className="pt-1.5 px-1 text-center">{totals.reb ?? 0}</td>
            <td className="pt-1.5 px-1 text-center">{totals.ast ?? 0}</td>
            <td className="pt-1.5 px-1 text-center">{totals.stl ?? 0}</td>
            <td className="pt-1.5 px-1 text-center">{totals.blk ?? 0}</td>
            <td className="pt-1.5 px-1 text-center">{totals.tov ?? 0}</td>
            <td className="pt-1.5 px-1 text-center">{totals.fgm ?? 0}/{totals.fga ?? 0}</td>
            <td className="pt-1.5 px-1 text-center">{totals.fg3m ?? 0}/{totals.fg3a ?? 0}</td>
            <td className="pt-1.5 px-1 text-center">{totals.ftm ?? 0}/{totals.fta ?? 0}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
