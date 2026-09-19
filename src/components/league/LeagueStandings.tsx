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
      {/* 셀 크기·굵기는 globals.css 의 t-th / t-td / t-td-key 가 정본이다(가독성 업그레이드 2026-09-18).
          표 루트에 text-sm 을 다시 주면 그 값이 셀 바닥값을 이겨 표마다 크기가 갈라진다. */}
      <table className="w-full">
        <thead>
          <tr className="border-b border-[color:var(--mm-rule)]">
            <th className="t-th w-8 lg:w-10">#</th>
            <th className="t-th text-left">팀</th>
            <th className="t-th w-10 lg:w-12">G</th>
            {/* 모바일 전용 통합 W-D-L */}
            <th className="t-th w-16 md:hidden">전적</th>
            {/* 데스크탑 W/D/L 분리 */}
            <th className="t-th w-10 lg:w-12 hidden md:table-cell">W</th>
            <th className="t-th w-10 lg:w-12 hidden md:table-cell">D</th>
            <th className="t-th w-10 lg:w-12 hidden md:table-cell">L</th>
            <th className="t-th w-12 lg:w-14 hidden md:table-cell">GF</th>
            <th className="t-th w-12 lg:w-14 hidden md:table-cell">GA</th>
            <th className="t-th w-12 lg:w-14">GD</th>
            <th className="t-th w-12 lg:w-14" style={{ color: 'var(--mm-yellow-strong)' }}>PTS</th>
            <th className="t-th w-14 lg:w-16" style={{ color: 'var(--mm-yellow-strong)' }}>STREAK</th>
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
                <td className="t-td">
                  <span className={`font-black inline-flex items-center justify-center gap-0.5 ${rankColor}`}>
                    {idx === 0 && <Crown size={14} />}
                    {idx + 1}
                  </span>
                </td>
                {/* 팀명 칸만 nowrap 을 푼다 — 긴 팀명이 한 줄로 버티면 390px 에서 표가 가로로 넘친다 */}
                <td className="t-td text-left whitespace-normal min-w-[4.5rem] lg:min-w-[7rem]">
                  <div className="flex items-center gap-2 lg:gap-2.5">
                    <div className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full shrink-0" style={{ backgroundColor: s.team.color }} />
                    <span className={`font-semibold lg:text-lg break-keep min-w-0 ${isFirst ? 'text-[color:var(--mm-ink)]' : 'text-[color:var(--mm-ink-soft)]'}`} style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{s.team.name}</span>
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
                <td className="t-td text-[color:var(--mm-muted)]">{s.played}</td>
                {/* 모바일: 통합 W-D-L (D=0이면 W-L만) */}
                <td className="t-td md:hidden">
                  <span className="text-[color:#059669] font-semibold">{s.wins}</span>
                  {s.draws > 0 && <><span className="text-[color:var(--mm-muted)]">-</span><span className="text-[color:var(--mm-muted)]">{s.draws}</span></>}
                  <span className="text-[color:var(--mm-muted)]">-</span>
                  <span className="text-[color:var(--mm-negative)]">{s.losses}</span>
                </td>
                {/* 데스크탑 W/D/L 분리 */}
                <td className="t-td text-[color:#059669] font-semibold hidden md:table-cell">{s.wins}</td>
                <td className="t-td text-[color:var(--mm-muted)] hidden md:table-cell">{s.draws}</td>
                <td className="t-td text-[color:var(--mm-negative)] hidden md:table-cell">{s.losses}</td>
                <td className="t-td text-[color:var(--mm-muted)] hidden md:table-cell">{s.goals_for}</td>
                <td className="t-td text-[color:var(--mm-muted)] hidden md:table-cell">{s.goals_against}</td>
                <td className="t-td text-[color:var(--mm-muted)]">
                  {s.goal_diff > 0 ? `+${s.goal_diff}` : s.goal_diff}
                </td>
                <td className="t-td-key">
                  <span className="lg:text-lg" style={isFirst ? { color: 'var(--mm-yellow-strong)' } : undefined}>{s.points}</span>
                </td>
                <td className="t-td">
                  {s.streak ? (() => {
                    const { type, count } = s.streak
                    const hot = type === 'W' && count >= 3
                    const cls = type === 'W'
                      ? (hot ? 'text-[color:var(--mm-yellow-strong)] font-black' : 'text-[color:#059669] font-bold')
                      : type === 'L'
                        ? 'text-[color:var(--mm-negative)] font-bold'
                        : 'text-[color:var(--mm-muted)] font-medium'
                    return (
                      <span className={`inline-flex items-center gap-0.5 ${cls}`}>
                        {type}{count}{hot && <Flame size={14} aria-hidden />}
                      </span>
                    )
                  })() : <span className="text-[color:var(--mm-muted)]">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
