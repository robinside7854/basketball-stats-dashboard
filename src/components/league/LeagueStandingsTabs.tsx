'use client'
import { useState } from 'react'
import LeagueStandings from './LeagueStandings'
import type { LeagueStanding, Quarter } from '@/types/league'

type QuarterStandings = {
  quarter: Quarter
  standings: LeagueStanding[]
}

interface Props {
  cumulative: LeagueStanding[]
  quarters: QuarterStandings[]
}

export default function LeagueStandingsTabs({ cumulative, quarters }: Props) {
  // 기본값: is_current인 분기가 있으면 그 분기, 없으면 누적
  const currentQuarter = quarters.find(q => q.quarter.is_current)
  const [activeId, setActiveId] = useState<string>(currentQuarter ? currentQuarter.quarter.id : 'cumulative')

  const tabs: { id: string; label: string }[] = [
    { id: 'cumulative', label: '누적' },
    ...quarters.map(q => ({
      id: q.quarter.id,
      label: `${q.quarter.quarter}분기`,
    })),
  ]

  const activeStandings =
    activeId === 'cumulative'
      ? cumulative
      : (quarters.find(q => q.quarter.id === activeId)?.standings ?? [])

  return (
    <div>
      {/* 탭 바 */}
      {tabs.length > 1 && (
        <div className="flex gap-1 overflow-x-auto scrollbar-hide border-b border-gray-800 px-3">
          {tabs.map(t => {
            const isActive = t.id === activeId
            const isCurrent = quarters.find(q => q.quarter.id === t.id)?.quarter.is_current
            return (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`shrink-0 px-3 lg:px-4 py-2 lg:py-2.5 text-xs lg:text-sm font-bold border-b-2 transition-colors cursor-pointer ${
                  isActive
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {t.label}
                {isCurrent && (
                  <span className="ml-1 w-1.5 h-1.5 rounded-full bg-green-400 inline-block align-middle" />
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* 본문 */}
      <LeagueStandings standings={activeStandings} />
    </div>
  )
}
