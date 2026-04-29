'use client'
import { useState } from 'react'
import { BarChart2, ChevronRight } from 'lucide-react'
import type { LeagueGame } from '@/types/league'
import DailyBoxscoreModal from '@/components/league/DailyBoxscoreModal'

interface Props {
  games: LeagueGame[]
  leagueId: string
  limit?: number
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`
}

export default function LeagueSchedule({ games, leagueId, limit }: Props) {
  const [boxscoreDate, setBoxscoreDate] = useState<string | null>(null)

  // 날짜별 그룹화 (날짜 내림차순 — 최근 먼저)
  const dateMap: Record<string, LeagueGame[]> = {}
  for (const g of games) {
    if (!dateMap[g.date]) dateMap[g.date] = []
    dateMap[g.date].push(g)
  }
  const dates = Object.keys(dateMap).sort((a, b) => b.localeCompare(a))
  const displayed = limit ? dates.slice(0, limit) : dates

  if (displayed.length === 0) {
    return <div className="text-center py-10 text-gray-500 text-sm">일정이 없습니다</div>
  }

  return (
    <>
      <div className="space-y-2">
        {displayed.map(date => {
          const dayGames = dateMap[date]
          const completed = dayGames.filter(g => g.is_complete)
          const hasCompleted = completed.length > 0

          // 팀별 W/L 집계 (해당 날 완료된 경기 기준)
          const teamRecord: Record<string, { name: string; color: string; w: number; l: number }> = {}
          for (const g of completed) {
            const hId = g.home_team_id
            const aId = g.away_team_id
            if (!hId || !aId) continue
            const h = g.home_team
            const a = g.away_team
            if (h && !teamRecord[hId]) teamRecord[hId] = { name: h.name, color: h.color, w: 0, l: 0 }
            if (a && !teamRecord[aId]) teamRecord[aId] = { name: a.name, color: a.color, w: 0, l: 0 }
            if (g.home_score > g.away_score) { if (teamRecord[hId]) teamRecord[hId].w++; if (teamRecord[aId]) teamRecord[aId].l++ }
            else if (g.home_score < g.away_score) { if (teamRecord[aId]) teamRecord[aId].w++; if (teamRecord[hId]) teamRecord[hId].l++ }
            else { if (teamRecord[hId]) { teamRecord[hId].w++; } if (teamRecord[aId]) { teamRecord[aId].w++; } }
          }
          const teamRows = Object.values(teamRecord).sort((a, b) => b.w - a.w || a.l - b.l)

          return (
            <button
              key={date}
              onClick={() => setBoxscoreDate(date)}
              className="w-full text-left bg-gray-900/60 border border-gray-800 hover:border-blue-500/40 hover:bg-gray-900 rounded-xl px-4 py-3.5 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between gap-3">
                {/* 날짜 + 경기 수 */}
                <div className="flex items-center gap-2.5">
                  <BarChart2 size={14} className="text-gray-600 group-hover:text-blue-400 transition-colors shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-white">{formatDate(date)}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {hasCompleted ? `${completed.length}/${dayGames.length}경기 완료` : `${dayGames.length}경기 예정`}
                    </p>
                  </div>
                </div>

                {/* 팀 W/L 요약 */}
                {teamRows.length > 0 && (
                  <div className="flex items-center gap-3 flex-wrap justify-end">
                    {teamRows.map(t => {
                      const total = t.w + t.l
                      const winPct = total > 0 ? Math.round(t.w / total * 100) : 0
                      return (
                        <div key={t.name} className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                          <span className="text-xs text-gray-400">{t.name}</span>
                          <span className="text-xs font-bold text-white tabular-nums">
                            {t.w}W {t.l}L
                          </span>
                          <span className={`text-[10px] font-bold tabular-nums ${winPct >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                            {winPct}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                <ChevronRight size={14} className="text-gray-700 group-hover:text-blue-400 transition-colors shrink-0" />
              </div>
            </button>
          )
        })}
      </div>

      {boxscoreDate && (
        <DailyBoxscoreModal
          leagueId={leagueId}
          date={boxscoreDate}
          onClose={() => setBoxscoreDate(null)}
        />
      )}
    </>
  )
}
