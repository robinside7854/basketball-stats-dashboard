'use client'
import { Crown, Flame } from 'lucide-react'
import type { LeagueStanding } from '@/types/league'

interface Props {
  standings: LeagueStanding[]
}

export default function LeagueStandings({ standings }: Props) {
  if (standings.length === 0) {
    return (
      <div className="text-center py-10 text-[color:var(--mm-muted)] text-sm">
        아직 완료된 경기가 없습니다
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm lg:text-base">
        <thead>
          <tr className="border-b border-[color:var(--mm-rule)]">
            <th className="text-center py-2.5 lg:py-3 px-2 lg:px-3 text-xs lg:text-sm font-semibold text-[color:var(--mm-muted)] w-8 lg:w-10">#</th>
            <th className="text-left py-2.5 lg:py-3 px-2 lg:px-3 text-xs lg:text-sm font-semibold text-[color:var(--mm-muted)]">팀</th>
            <th className="text-center py-2.5 lg:py-3 px-2 text-xs lg:text-sm font-semibold text-[color:var(--mm-muted)] w-10 lg:w-12">G</th>
            {/* 모바일 전용 통합 W-D-L */}
            <th className="text-center py-2.5 px-2 text-xs font-semibold text-[color:var(--mm-muted)] w-16 md:hidden">전적</th>
            {/* 데스크탑 W/D/L 분리 */}
            <th className="text-center py-2.5 lg:py-3 px-2 text-xs lg:text-sm font-semibold text-[color:var(--mm-muted)] w-10 lg:w-12 hidden md:table-cell">W</th>
            <th className="text-center py-2.5 lg:py-3 px-2 text-xs lg:text-sm font-semibold text-[color:var(--mm-muted)] w-10 lg:w-12 hidden md:table-cell">D</th>
            <th className="text-center py-2.5 lg:py-3 px-2 text-xs lg:text-sm font-semibold text-[color:var(--mm-muted)] w-10 lg:w-12 hidden md:table-cell">L</th>
            <th className="text-center py-2.5 lg:py-3 px-2 text-xs lg:text-sm font-semibold text-[color:var(--mm-muted)] w-12 lg:w-14 hidden md:table-cell">GF</th>
            <th className="text-center py-2.5 lg:py-3 px-2 text-xs lg:text-sm font-semibold text-[color:var(--mm-muted)] w-12 lg:w-14 hidden md:table-cell">GA</th>
            <th className="text-center py-2.5 lg:py-3 px-2 text-xs lg:text-sm font-semibold text-[color:var(--mm-muted)] w-12 lg:w-14">GD</th>
            <th className="text-center py-2.5 lg:py-3 px-2 lg:px-3 text-xs lg:text-sm font-semibold text-[color:var(--mm-yellow-strong)] w-12 lg:w-14">PTS</th>
            <th className="text-center py-2.5 lg:py-3 px-2 text-xs lg:text-sm font-semibold text-[color:var(--mm-yellow-strong)] w-14 lg:w-16">STREAK</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, idx) => {
            const isFirst = idx === 0
            const rankColor = idx === 0
              ? 'text-[color:var(--mm-yellow-strong)]'
              : idx === 1
                ? 'text-[color:var(--mm-ink-soft)]'
                : idx === 2
                  ? 'text-[color:var(--mm-ink-soft)]'
                  : 'text-[color:var(--mm-muted)]'
            return (
              <tr
                key={s.team.id}
                className={`border-b border-[color:var(--mm-rule)] ${isFirst ? 'bg-[color:var(--mm-yellow-soft)]' : 'hover:bg-[color:var(--mm-panel-alt)]'} transition-colors duration-200`}
              >
                <td className="py-3 lg:py-4 px-2 lg:px-3 text-center">
                  <span className={`text-xs lg:text-sm font-black inline-flex items-center justify-center gap-0.5 ${rankColor}`}>
                    {idx === 0 && <Crown size={10} className="lg:w-3.5 lg:h-3.5" />}
                    {idx + 1}
                  </span>
                </td>
                <td className="py-3 lg:py-4 px-2 lg:px-3 min-w-[4.5rem] lg:min-w-[7rem]">
                  <div className="flex items-center gap-2 lg:gap-2.5">
                    <div className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full shrink-0" style={{ backgroundColor: s.team.color }} />
                    <span className={`font-medium lg:font-bold lg:text-lg whitespace-nowrap ${isFirst ? 'text-[color:var(--mm-ink)]' : 'text-[color:var(--mm-ink-soft)]'}`}>{s.team.name}</span>
                  </div>
                  <div className="w-full bg-[color:var(--mm-rule)] rounded-full h-1 mt-1">
                    <div
                      className="h-1 rounded-full transition-all duration-200"
                      style={{
                        width: `${s.played > 0 ? (s.wins / s.played * 100) : 0}%`,
                        backgroundColor: s.team.color ?? 'var(--mm-yellow)',
                      }}
                    />
                  </div>
                </td>
                <td className="py-3 lg:py-4 px-2 text-center text-[color:var(--mm-muted)] tabular-nums">{s.played}</td>
                {/* 모바일: 통합 W-D-L (D=0이면 W-L만) */}
                <td className="py-3 px-2 text-center text-xs font-mono md:hidden whitespace-nowrap">
                  <span className="text-[color:#059669] font-semibold">{s.wins}</span>
                  {s.draws > 0 && <><span className="text-[color:var(--mm-muted)]">-</span><span className="text-[color:var(--mm-muted)]">{s.draws}</span></>}
                  <span className="text-[color:var(--mm-muted)]">-</span>
                  <span className="text-[color:#DC2626]">{s.losses}</span>
                </td>
                {/* 데스크탑 W/D/L 분리 */}
                <td className="py-3 lg:py-4 px-2 text-center text-[color:#059669] font-medium tabular-nums hidden md:table-cell">{s.wins}</td>
                <td className="py-3 lg:py-4 px-2 text-center text-[color:var(--mm-muted)] tabular-nums hidden md:table-cell">{s.draws}</td>
                <td className="py-3 lg:py-4 px-2 text-center text-[color:#DC2626] tabular-nums hidden md:table-cell">{s.losses}</td>
                <td className="py-3 lg:py-4 px-2 text-center text-[color:var(--mm-muted)] tabular-nums hidden md:table-cell">{s.goals_for}</td>
                <td className="py-3 lg:py-4 px-2 text-center text-[color:var(--mm-muted)] tabular-nums hidden md:table-cell">{s.goals_against}</td>
                <td className="py-3 lg:py-4 px-2 text-center text-[color:var(--mm-muted)] tabular-nums">
                  {s.goal_diff > 0 ? `+${s.goal_diff}` : s.goal_diff}
                </td>
                <td className="py-3 lg:py-4 px-2 lg:px-3 text-center">
                  <span className={`font-bold lg:text-lg tabular-nums ${isFirst ? 'text-[color:var(--mm-yellow-strong)]' : 'text-[color:var(--mm-ink)]'}`}>{s.points}</span>
                </td>
                <td className="py-3 lg:py-4 px-2 text-center">
                  {s.streak ? (() => {
                    const { type, count } = s.streak
                    const hot = type === 'W' && count >= 3
                    const cls = type === 'W'
                      ? (hot ? 'text-[color:var(--mm-yellow-strong)] font-black' : 'text-[color:#059669] font-bold')
                      : type === 'L'
                        ? 'text-[color:#DC2626] font-bold'
                        : 'text-[color:var(--mm-muted)] font-medium'
                    return (
                      <span className={`inline-flex items-center gap-0.5 text-xs lg:text-sm ${cls}`}>
                        {type}{count}{hot && <Flame size={12} strokeWidth={2} aria-hidden />}
                      </span>
                    )
                  })() : <span className="text-[color:var(--mm-muted)] text-xs">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
