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
    <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-3 flex-shrink-0">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-[var(--mm-muted)] font-semibold uppercase tracking-wide">실시간 스탯</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--mm-muted)]">파란날개 총 득점</span>
          <span className="text-lg font-black text-[var(--mm-yellow-strong)]">{teamTotals.pts ?? 0}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[var(--mm-muted)] border-b border-[var(--mm-rule)]">
              <th className="text-left py-1 pr-2 w-6">#</th>
              <th className="text-left py-1 pr-3">이름</th>
              <th className="py-1 px-1 text-center text-[var(--mm-yellow-strong)]">PTS</th>
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
              <tr key={b.player_id} className="border-b border-[var(--mm-rule)]/40 hover:bg-[var(--mm-panel-alt)]/30">
                <td className="py-1 pr-2 text-[var(--mm-muted)]">{b.player_number}</td>
                <td className="py-1 pr-3 font-medium text-[var(--mm-ink)]">{b.player_name}</td>
                <td className="py-1 px-1 text-center font-bold text-[var(--mm-yellow-strong)]">{b.pts}</td>
                <td className="py-1 px-1 text-center text-[var(--mm-ink)]">{b.reb}</td>
                <td className="py-1 px-1 text-center text-[var(--mm-ink)]">{b.ast}</td>
                <td className="py-1 px-1 text-center text-[var(--mm-ink)]">{b.stl}</td>
                <td className="py-1 px-1 text-center text-[var(--mm-ink)]">{b.blk}</td>
                <td className="py-1 px-1 text-center text-red-400">{b.tov}</td>
                <td className="py-1 px-1 text-center text-[var(--mm-muted)]">
                  {b.fga > 0 ? `${b.fg_pct.toFixed(1)}%` : '-'}
                </td>
              </tr>
            ))}
            {/* 팀 합계 */}
            <tr className="border-t-2 border-[color:var(--mm-yellow)]/60 bg-[var(--mm-panel-alt)]/50 font-bold">
              <td colSpan={2} className="py-1.5 pr-3 text-[var(--mm-yellow-strong)]">합계</td>
              <td className="py-1.5 px-1 text-center text-[var(--mm-yellow-strong)]">{teamTotals.pts ?? 0}</td>
              <td className="py-1.5 px-1 text-center text-[var(--mm-ink)]">{teamTotals.reb ?? 0}</td>
              <td className="py-1.5 px-1 text-center text-[var(--mm-ink)]">{teamTotals.ast ?? 0}</td>
              <td className="py-1.5 px-1 text-center text-[var(--mm-ink)]">{teamTotals.stl ?? 0}</td>
              <td className="py-1.5 px-1 text-center text-[var(--mm-ink)]">{teamTotals.blk ?? 0}</td>
              <td className="py-1.5 px-1 text-center text-red-400">{teamTotals.tov ?? 0}</td>
              <td className="py-1.5 px-1 text-center text-[var(--mm-muted)]">
                {totalFgPct > 0 ? `${totalFgPct.toFixed(1)}%` : '-'}
                <span className="text-[var(--mm-muted)] font-normal ml-1">({teamTotals.fgm ?? 0}/{teamTotals.fga ?? 0})</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
