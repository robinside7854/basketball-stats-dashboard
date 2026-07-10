// NBA.com 오마주 — Recent Games ScoreStrip
// 가로 스크롤 rail. 각 카드: 상단 LIVE/FINAL 배지 + home/away 2행
// 각 행: 팀 컬러 3px 좌측 바 | tricode (Bebas) | 이름 (sans, 한글) | 스코어 (Bebas tabular)
// LIVE 카드: 배지에 animate-pulse-red 애니메이션.
// 서버 컴포넌트.

import Link from 'next/link'

export type NbaGame = {
  id: string
  date: string          // YYYY-MM-DD
  isLive: boolean
  isComplete: boolean
  home: { name: string; tri: string; color: string; score: number | null }
  away: { name: string; tri: string; color: string; score: number | null }
  homeWon: boolean
  awayWon: boolean
  timeLabel: string     // "LIVE" or "FINAL · 04/03" or "04/07 20:00"
}

type Props = {
  games: NbaGame[]
  orgSlug: string
  leagueId: string
}

function scoreClass(row: { won: boolean; complete: boolean }): string {
  if (row.won) return 'text-amber-400'
  if (row.complete) return 'text-gray-500'
  return 'text-white'
}
function labelClass(row: { won: boolean; complete: boolean }): string {
  if (row.won) return 'text-white'
  if (row.complete) return 'text-gray-500'
  return 'text-white'
}

export default function NbaScoreStrip({ games, orgSlug, leagueId }: Props) {
  if (games.length === 0) return null
  return (
    <section className="border-x border-b border-gray-800 bg-gray-950">
      <header className="flex items-baseline justify-between px-6 md:px-8 pt-5 pb-2.5">
        <h3 className="font-display text-[22px] uppercase tracking-wide text-white">Recent Games</h3>
        <span className="text-[11px] tracking-[0.16em] uppercase text-gray-500 font-bold">Last {games.length}</span>
      </header>
      <div className="flex gap-3 overflow-x-auto px-6 md:px-8 pb-6 scrollbar-hide">
        {games.map(g => {
          const home = { won: g.homeWon, complete: g.isComplete }
          const away = { won: g.awayWon, complete: g.isComplete }
          return (
            <Link
              key={g.id}
              href={`/league/${orgSlug}/${leagueId}/record?date=${g.date}`}
              className="shrink-0 w-[260px] bg-gray-900 border border-gray-800 p-3 hover:shadow-[0_10px_36px_0_rgba(0,0,0,0.35)] hover:border-gray-700 transition-all duration-200 cursor-pointer"
            >
              {/* 상태 배지 */}
              <span
                className={`inline-flex items-center gap-1.5 text-[10px] font-black tracking-[0.16em] uppercase mb-2.5 ${
                  g.isLive
                    ? 'bg-red-600 text-white px-1.5 py-0.5 rounded-sm animate-pulse-red'
                    : 'text-gray-500'
                }`}
              >
                {g.isLive && <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />}
                {g.timeLabel}
              </span>

              {/* 홈 팀 */}
              <div className="grid grid-cols-[3px_44px_1fr_auto] gap-2 items-center py-1.5">
                <span className="self-stretch min-h-[24px]" style={{ background: g.home.color }} />
                <span className={`font-display text-base tracking-wider uppercase ${labelClass(home)}`}>{g.home.tri}</span>
                <span className="text-xs text-gray-400 truncate">{g.home.name}</span>
                <span className={`font-display tabular-nums text-[28px] leading-none ${scoreClass(home)}`}>
                  {g.home.score ?? '—'}
                </span>
              </div>
              {/* 어웨이 팀 */}
              <div className="grid grid-cols-[3px_44px_1fr_auto] gap-2 items-center py-1.5 border-t border-gray-800">
                <span className="self-stretch min-h-[24px]" style={{ background: g.away.color }} />
                <span className={`font-display text-base tracking-wider uppercase ${labelClass(away)}`}>{g.away.tri}</span>
                <span className="text-xs text-gray-400 truncate">{g.away.name}</span>
                <span className={`font-display tabular-nums text-[28px] leading-none ${scoreClass(away)}`}>
                  {g.away.score ?? '—'}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
