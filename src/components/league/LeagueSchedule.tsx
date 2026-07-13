'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { BarChart2, ChevronRight } from 'lucide-react'
import type { LeagueGame } from '@/types/league'

interface Props {
  games: LeagueGame[]
  leagueId: string
  limit?: number
  /** 명시적 orgSlug — 없으면 useParams 에서 orgSlug 또는 org 로 조회 */
  orgSlug?: string
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`
}

export default function LeagueSchedule({ games, leagueId, limit, orgSlug }: Props) {
  const params = useParams<{ orgSlug?: string; org?: string }>()
  const resolvedOrgSlug = orgSlug ?? params?.orgSlug ?? params?.org ?? ''
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
    return <div className="text-center py-10 text-[color:var(--mm-muted)] text-sm">일정이 없습니다</div>
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
            <Link
              key={date}
              href={`/league/${resolvedOrgSlug}/${leagueId}/boxscore/${date}`}
              className={`block w-full text-left rounded-sm px-4 py-3.5 lg:px-5 lg:py-4 transition-shadow duration-200 cursor-pointer group bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1 ${
                allUpcoming ? '' : 'opacity-95'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 lg:gap-4">
                {/* 날짜 + 경기 수 */}
                <div className="flex items-center gap-2.5 lg:gap-3 shrink-0 min-w-0">
                  <BarChart2 size={14} className="lg:w-4 lg:h-4 text-[color:var(--mm-muted)] group-hover:text-[color:var(--mm-yellow-strong)] transition-colors shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className={`text-base lg:text-lg font-bold whitespace-nowrap ${hasCompleted ? 'text-[color:var(--mm-ink-soft)]' : 'text-[color:var(--mm-ink)]'}`}>{formatDate(date)}</p>
                      {allUpcoming && (
                        isToday ? (
                          <span className="flex items-center gap-1 text-xs lg:text-xs font-bold text-[color:var(--mm-black)] bg-[color:var(--mm-yellow)] px-1.5 py-0.5 rounded">
                            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--mm-black)] animate-pulse inline-block" />오늘
                          </span>
                        ) : (
                          <span className="text-xs lg:text-xs font-bold text-[color:var(--mm-muted)] px-1.5 py-0.5 rounded bg-[color:var(--mm-panel-alt)] border border-[color:var(--mm-rule)]">예정</span>
                        )
                      )}
                      {allDone && (
                        <span className="text-xs lg:text-xs font-bold text-[color:var(--mm-black)] bg-[color:var(--mm-yellow)] px-1.5 py-0.5 rounded">완료</span>
                      )}
                    </div>
                    <p className="text-xs lg:text-sm text-[color:var(--mm-muted)] mt-0.5 whitespace-nowrap">
                      {hasCompleted
                        ? `${completed.length}/${recorded.length}경기 완료${recorded.length < dayGames.length ? ` · 미사용 ${dayGames.length - recorded.length}` : ''}`
                        : `${dayGames.length}경기 예정`}
                    </p>
                  </div>
                </div>

                {/* 팀 W/L 요약 */}
                {teamRows.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-2.5 lg:gap-x-4 gap-y-1.5 justify-end min-w-0">
                    {teamRows.map(t => {
                      const total = t.w + t.d + t.l
                      const winPct = total > 0 ? Math.round(t.w / total * 100) : 0
                      return (
                        <div key={t.name} className="flex items-center gap-1.5 lg:gap-2">
                          <div className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                          <span className="text-xs lg:text-base text-[color:var(--mm-ink-soft)] font-medium break-keep" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{t.name}</span>
                          <span className="text-xs lg:text-base font-bold text-[color:var(--mm-ink)] tabular-nums">
                            {t.w}W {t.d > 0 ? <span className="text-[color:var(--mm-yellow-strong)]">{t.d}D </span> : ''}{t.l}L
                          </span>
                          <span className="text-xs lg:text-base font-bold tabular-nums" style={{ color: winPct >= 50 ? '#059669' : '#DC2626' }}>
                            {winPct}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                <ChevronRight size={14} className="lg:w-4 lg:h-4 text-[color:var(--mm-muted)] group-hover:text-[color:var(--mm-yellow-strong)] transition-colors shrink-0" />
              </div>
            </Link>
          )
        })}
      </div>
    </>
  )
}
