'use client'
import type { LeagueStanding } from '@/types/league'

interface Props {
  standings: LeagueStanding[]
}

export default function LeagueStandings({ standings }: Props) {
  if (standings.length === 0) {
    return (
      <div className="text-center py-10 text-gray-500 text-sm">
        아직 완료된 경기가 없습니다
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 w-8">#</th>
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500">팀</th>
            <th className="text-center py-2.5 px-2 text-xs font-semibold text-gray-500 w-10">G</th>
            <th className="text-center py-2.5 px-2 text-xs font-semibold text-gray-500 w-10">W</th>
            <th className="text-center py-2.5 px-2 text-xs font-semibold text-gray-500 w-10">D</th>
            <th className="text-center py-2.5 px-2 text-xs font-semibold text-gray-500 w-10">L</th>
            <th className="text-center py-2.5 px-2 text-xs font-semibold text-gray-500 w-10">GF</th>
            <th className="text-center py-2.5 px-2 text-xs font-semibold text-gray-500 w-10">GA</th>
            <th className="text-center py-2.5 px-2 text-xs font-semibold text-gray-500 w-10">GD</th>
            <th className="text-center py-2.5 px-3 text-xs font-semibold text-blue-400 w-12">PTS</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, idx) => {
            const isFirst = idx === 0
            return (
              <tr
                key={s.team.id}
                className={`border-b border-gray-800/50 ${isFirst ? 'bg-blue-950/20' : 'hover:bg-gray-900/50'} transition-colors`}
              >
                <td className="py-3 px-3 text-center">
                  <span className={`text-xs font-bold ${isFirst ? 'text-blue-400' : 'text-gray-500'}`}>{idx + 1}</span>
                </td>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.team.color }} />
                    <span className={`font-medium ${isFirst ? 'text-white' : 'text-gray-300'}`}>{s.team.name}</span>
                  </div>
                </td>
                <td className="py-3 px-2 text-center text-gray-400">{s.played}</td>
                <td className="py-3 px-2 text-center text-green-400 font-medium">{s.wins}</td>
                <td className="py-3 px-2 text-center text-gray-400">{s.draws}</td>
                <td className="py-3 px-2 text-center text-red-400">{s.losses}</td>
                <td className="py-3 px-2 text-center text-gray-400">{s.goals_for}</td>
                <td className="py-3 px-2 text-center text-gray-400">{s.goals_against}</td>
                <td className="py-3 px-2 text-center text-gray-400">
                  {s.goal_diff > 0 ? `+${s.goal_diff}` : s.goal_diff}
                </td>
                <td className="py-3 px-3 text-center">
                  <span className={`font-bold ${isFirst ? 'text-blue-400' : 'text-white'}`}>{s.points}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
