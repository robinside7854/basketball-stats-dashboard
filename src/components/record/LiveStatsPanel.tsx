'use client'
import { useEffect, useState } from 'react'
import type { PlayerBoxScore } from '@/types/database'

interface Props {
  gameId: string
  refreshKey: number
}

export default function LiveStatsPanel({ gameId, refreshKey }: Props) {
  const [boxScores, setBoxScores] = useState<PlayerBoxScore[]>([])
  const [teamTotals, setTeamTotals] = useState<Partial<PlayerBoxScore>>({})

  useEffect(() => {
    if (!gameId) return
    fetch(`/api/stats/${gameId}`)
      .then(r => r.json())
      .then(data => { setBoxScores(data.boxScores || []); setTeamTotals(data.teamTotals || {}) })
      .catch(() => {})
  }, [gameId, refreshKey])

  const active = boxScores.filter(b => b.min > 0 || b.pts > 0 || b.reb > 0 || b.ast > 0)
  if (active.length === 0) return null

  const totalFgPct = (teamTotals.fga ?? 0) > 0
    ? Math.round(((teamTotals.fgm ?? 0) / (teamTotals.fga ?? 1)) * 1000) / 10
    : 0

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex-shrink-0">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">실시간 스탯</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">파란날개 총 득점</span>
          <span className="text-lg font-black text-yellow-400">{teamTotals.pts ?? 0}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left py-1 pr-2 w-6">#</th>
              <th className="text-left py-1 pr-3">이름</th>
              <th className="py-1 px-1 text-center text-yellow-400">PTS</th>
              <th className="py-1 px-1 text-center">REB</th>
              <th className="py-1 px-1 text-center">AST</th>
              <th className="py-1 px-1 text-center">STL</th>
              <th className="py-1 px-1 text-center">BLK</th>
              <th className="py-1 px-1 text-center text-red-400">TOV</th>
              <th className="py-1 px-1 text-center">FG%</th>
            </tr>
          </thead>
          <tbody>
            {active.map(b => (
              <tr key={b.player_id} className="border-b border-gray-800/40 hover:bg-gray-800/30">
                <td className="py-1 pr-2 text-gray-400">{b.player_number}</td>
                <td className="py-1 pr-3 font-medium">{b.player_name}</td>
                <td className="py-1 px-1 text-center font-bold text-yellow-400">{b.pts}</td>
                <td className="py-1 px-1 text-center">{b.reb}</td>
                <td className="py-1 px-1 text-center">{b.ast}</td>
                <td className="py-1 px-1 text-center">{b.stl}</td>
                <td className="py-1 px-1 text-center">{b.blk}</td>
                <td className="py-1 px-1 text-center text-red-400">{b.tov}</td>
                <td className="py-1 px-1 text-center text-gray-300">
                  {b.fga > 0 ? `${b.fg_pct.toFixed(1)}%` : '-'}
                </td>
              </tr>
            ))}
            {/* 팀 합계 */}
            <tr className="border-t-2 border-blue-500/60 bg-gray-800/50 font-bold">
              <td colSpan={2} className="py-1.5 pr-3 text-blue-400">합계</td>
              <td className="py-1.5 px-1 text-center text-yellow-400">{teamTotals.pts ?? 0}</td>
              <td className="py-1.5 px-1 text-center">{teamTotals.reb ?? 0}</td>
              <td className="py-1.5 px-1 text-center">{teamTotals.ast ?? 0}</td>
              <td className="py-1.5 px-1 text-center">{teamTotals.stl ?? 0}</td>
              <td className="py-1.5 px-1 text-center">{teamTotals.blk ?? 0}</td>
              <td className="py-1.5 px-1 text-center text-red-400">{teamTotals.tov ?? 0}</td>
              <td className="py-1.5 px-1 text-center text-gray-300">
                {totalFgPct > 0 ? `${totalFgPct.toFixed(1)}%` : '-'}
                <span className="text-gray-500 font-normal ml-1">({teamTotals.fgm ?? 0}/{teamTotals.fga ?? 0})</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
