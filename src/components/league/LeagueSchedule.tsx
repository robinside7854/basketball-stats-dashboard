'use client'
import type { LeagueGame } from '@/types/league'

interface Props {
  games: LeagueGame[]
  limit?: number
}

export default function LeagueSchedule({ games, limit }: Props) {
  const displayed = limit ? games.slice(0, limit) : games

  if (displayed.length === 0) {
    return (
      <div className="text-center py-10 text-gray-500 text-sm">
        일정이 없습니다
      </div>
    )
  }

  const roundNums = Array.from(new Set(displayed.map(g => g.round_num))).sort((a, b) => a - b)

  return (
    <div className="space-y-5">
      {roundNums.map(r => {
        const roundGames = displayed.filter(g => g.round_num === r)
        const date = roundGames[0]?.date ?? ''
        return (
          <div key={r}>
            <p className="text-xs font-semibold text-gray-400 mb-2 px-1">
              R{r} · {date}
            </p>
            <div className="space-y-1.5">
              {roundGames.map(g => {
                const home = g.home_team
                const away = g.away_team
                const isComplete = g.is_complete
                return (
                  <div
                    key={g.id}
                    className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center"
                  >
                    {/* 홈팀 */}
                    <div className="flex-1 flex items-center justify-end gap-2">
                      <span className="text-sm font-medium text-white text-right">{home?.name ?? '?'}</span>
                      {home && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: home.color }} />}
                    </div>

                    {/* 스코어 */}
                    <div className="mx-4 min-w-[64px] text-center">
                      {isComplete ? (
                        <span className="text-base font-bold text-white font-mono">
                          {g.home_score} - {g.away_score}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500 border border-gray-700 rounded px-2 py-0.5">예정</span>
                      )}
                    </div>

                    {/* 어웨이팀 */}
                    <div className="flex-1 flex items-center gap-2">
                      {away && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: away.color }} />}
                      <span className="text-sm font-medium text-white">{away?.name ?? '?'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
