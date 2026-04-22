'use client'
import { useEffect, useState } from 'react'
import type { LeaguePlayer } from '@/types/league'

type PlayerStat = {
  player_id: string
  pts: number; fgm: number; fga: number; fg3m: number; fg3a: number
  ftm: number; fta: number; oreb: number; dreb: number; reb: number
  ast: number; stl: number; blk: number; tov: number; pf: number; min: number
}

interface Props {
  leagueId: string
  gameId: string
  players: LeaguePlayer[]
  refreshKey: number
}

export default function LeagueStatsPanel({ leagueId, gameId, players, refreshKey }: Props) {
  const [boxScores, setBoxScores] = useState<PlayerStat[]>([])
  const [totals, setTotals] = useState<Partial<PlayerStat>>({})

  useEffect(() => {
    if (!gameId) return
    fetch(`/api/leagues/${leagueId}/stats/${gameId}`)
      .then(r => r.json())
      .then(data => { setBoxScores(data.boxScores ?? []); setTotals(data.teamTotals ?? {}) })
      .catch(() => {})
  }, [leagueId, gameId, refreshKey])

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
