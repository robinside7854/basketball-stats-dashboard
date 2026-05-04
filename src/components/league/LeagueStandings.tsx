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
            {/* 모바일 전용 통합 W-D-L */}
            <th className="text-center py-2.5 px-2 text-xs font-semibold text-gray-500 w-16 md:hidden">전적</th>
            {/* 데스크탑 W/D/L 분리 */}
            <th className="text-center py-2.5 px-2 text-xs font-semibold text-gray-500 w-10 hidden md:table-cell">W</th>
            <th className="text-center py-2.5 px-2 text-xs font-semibold text-gray-500 w-10 hidden md:table-cell">D</th>
            <th className="text-center py-2.5 px-2 text-xs font-semibold text-gray-500 w-10 hidden md:table-cell">L</th>
            <th className="text-center py-2.5 px-2 text-xs font-semibold text-gray-500 w-10 hidden md:table-cell">GF</th>
            <th className="text-center py-2.5 px-2 text-xs font-semibold text-gray-500 w-10 hidden md:table-cell">GA</th>
            <th className="text-center py-2.5 px-2 text-xs font-semibold text-gray-500 w-12">GD</th>
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
                  <div className="w-full bg-gray-800 rounded-full h-1 mt-1">
                    <div
                      className="h-1 rounded-full transition-all"
                      style={{
                        width: `${s.played > 0 ? (s.wins / s.played * 100) : 0}%`,
                        backgroundColor: s.team.color ?? '#3b82f6',
                      }}
                    />
                  </div>
                </td>
                <td className="py-3 px-2 text-center text-gray-400">{s.played}</td>
                {/* 모바일: 통합 W-D-L (D=0이면 W-L만) */}
                <td className="py-3 px-2 text-center text-xs font-mono md:hidden whitespace-nowrap">
                  <span className="text-green-400 font-semibold">{s.wins}</span>
                  {s.draws > 0 && <><span className="text-gray-600">-</span><span className="text-gray-400">{s.draws}</span></>}
                  <span className="text-gray-600">-</span>
                  <span className="text-red-400">{s.losses}</span>
                </td>
                {/* 데스크탑 W/D/L 분리 */}
                <td className="py-3 px-2 text-center text-green-400 font-medium hidden md:table-cell">{s.wins}</td>
                <td className="py-3 px-2 text-center text-gray-400 hidden md:table-cell">{s.draws}</td>
                <td className="py-3 px-2 text-center text-red-400 hidden md:table-cell">{s.losses}</td>
                <td className="py-3 px-2 text-center text-gray-400 hidden md:table-cell">{s.goals_for}</td>
                <td className="py-3 px-2 text-center text-gray-400 hidden md:table-cell">{s.goals_against}</td>
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
