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
  const today = new Date().toISOString().slice(0, 10)

  // 날짜별 그룹화
  const dateMap: Record<string, LeagueGame[]> = {}
  for (const g of games) {
    if (!dateMap[g.date]) dateMap[g.date] = []
    dateMap[g.date].push(g)
  }
  // 완료 경기 있는 날짜 → 최신순, 나머지(예정) → 가장 가까운 미래 순
  const allDates = Object.keys(dateMap)
  const completedDates = allDates
    .filter(d => dateMap[d].some(g => g.is_complete))
    .sort((a, b) => b.localeCompare(a))
  const upcomingDates = allDates
    .filter(d => !dateMap[d].some(g => g.is_complete))
    .sort((a, b) => a.localeCompare(b))
  const sorted = [...completedDates, ...upcomingDates]
  const displayed = limit ? sorted.slice(0, limit) : sorted

  if (displayed.length === 0) {
    return <div className="text-center py-10 text-gray-500 text-sm">일정이 없습니다</div>
  }

  return (
    <>
      <div className="space-y-2">
        {displayed.map(date => {
          const dayGames = dateMap[date]
          const completed = dayGames.filter(g => g.is_complete)
          // 실제 진행된 경기 = 시작했거나 완료된 슬롯 (미사용 슬롯은 카운트 제외)
          const recorded = dayGames.filter(g => g.is_started || g.is_complete)
          const hasCompleted = completed.length > 0
          // 모든 진행된 경기가 완료 → 그 날은 완료 처리 (정원 9 미달이어도)
          const allDone = recorded.length > 0 && recorded.length === completed.length

          // 팀별 W/L 집계 (해당 날 완료된 경기 기준)
          const teamRecord: Record<string, { name: string; color: string; w: number; d: number; l: number }> = {}
          for (const g of completed) {
            const hId = g.home_team_id
            const aId = g.away_team_id
            if (!hId || !aId) continue
            const h = g.home_team
            const a = g.away_team
            if (h && !teamRecord[hId]) teamRecord[hId] = { name: h.name, color: h.color, w: 0, d: 0, l: 0 }
            if (a && !teamRecord[aId]) teamRecord[aId] = { name: a.name, color: a.color, w: 0, d: 0, l: 0 }
            if (g.home_score > g.away_score) { if (teamRecord[hId]) teamRecord[hId].w++; if (teamRecord[aId]) teamRecord[aId].l++ }
            else if (g.home_score < g.away_score) { if (teamRecord[aId]) teamRecord[aId].w++; if (teamRecord[hId]) teamRecord[hId].l++ }
            else { if (teamRecord[hId]) teamRecord[hId].d++; if (teamRecord[aId]) teamRecord[aId].d++ }
          }
          const teamRows = Object.values(teamRecord).sort((a, b) => (b.w*3+b.d) - (a.w*3+a.d) || a.l - b.l)

          const isToday = date === today
          const allUpcoming = !hasCompleted
          return (
            <button
              key={date}
              onClick={() => setBoxscoreDate(date)}
              className={`w-full text-left border rounded-xl px-4 py-3.5 transition-all duration-200 cursor-pointer group ${
                allUpcoming
                  ? 'bg-gray-800/30 border-gray-800 hover:border-blue-500/40 hover:bg-gray-800/50 hover:-translate-y-0.5 hover:shadow-md'
                  : 'bg-gray-900/60 border-gray-800 hover:border-blue-500/40 hover:bg-gray-900 hover:-translate-y-0.5 hover:shadow-md opacity-90'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                {/* 날짜 + 경기 수 */}
                <div className="flex items-center gap-2.5">
                  <BarChart2 size={14} className="text-gray-600 group-hover:text-blue-400 transition-colors shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className={`text-base font-bold ${hasCompleted ? 'text-gray-400' : 'text-white'}`}>{formatDate(date)}</p>
                      {allUpcoming && (
                        isToday ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-green-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />오늘
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-gray-500 px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700">예정</span>
                        )
                      )}
                      {allDone && (
                        <span className="text-[10px] font-bold text-green-400 px-1.5 py-0.5 rounded bg-green-900/30 border border-green-700/40">✓ 완료</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {hasCompleted
                        ? `${completed.length}/${recorded.length}경기 완료${recorded.length < dayGames.length ? ` · 미사용 슬롯 ${dayGames.length - recorded.length}` : ''}`
                        : `${dayGames.length}경기 예정`}
                    </p>
                  </div>
                </div>

                {/* 팀 W/L 요약 */}
                {teamRows.length > 0 && (
                  <div className="flex items-center gap-3 flex-wrap justify-end">
                    {teamRows.map(t => {
                      const total = t.w + t.d + t.l
                      const winPct = total > 0 ? Math.round(t.w / total * 100) : 0
                      return (
                        <div key={t.name} className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                          <span className="text-xs text-gray-400">{t.name}</span>
                          <span className="text-xs font-bold text-white tabular-nums">
                            {t.w}W {t.d > 0 ? <span className="text-yellow-500">{t.d}D </span> : ''}{t.l}L
                          </span>
                          <span className={`text-xs font-bold tabular-nums ${winPct >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                            {winPct}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                <ChevronRight size={14} className="text-gray-500 group-hover:text-blue-400 transition-colors shrink-0" />
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
