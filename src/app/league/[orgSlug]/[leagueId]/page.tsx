import { createClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import LeagueStandings from '@/components/league/LeagueStandings'
import LeagueSchedule from '@/components/league/LeagueSchedule'
import type { League, LeagueStanding, LeagueGame, LeagueTeam } from '@/types/league'

export default async function LeagueDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
}) {
  const { orgSlug, leagueId } = await params
  const supabase = createClient()

  const [{ data: league }, { data: teams }, { data: games }, { data: allLeagues }] = await Promise.all([
    supabase.from('leagues').select('*').eq('id', leagueId).eq('org_slug', orgSlug).single(),
    supabase.from('league_teams').select('*').eq('league_id', leagueId),
    supabase.from('league_games').select('*').eq('league_id', leagueId).order('round_num', { ascending: true }),
    supabase.from('leagues').select('id, name, status, season_year').eq('org_slug', orgSlug).order('created_at', { ascending: false }),
  ])

  if (!league) notFound()

  const l = league as League
  const teamList = (teams as LeagueTeam[]) ?? []
  const teamMap = Object.fromEntries(teamList.map(t => [t.id, t]))

  const gameList = ((games as LeagueGame[]) ?? []).map(g => ({
    ...g,
    home_team: g.home_team_id ? teamMap[g.home_team_id] : null,
    away_team: g.away_team_id ? teamMap[g.away_team_id] : null,
  }))

  const standing: Record<string, LeagueStanding> = {}
  for (const t of teamList) {
    standing[t.id] = { team: t, played: 0, wins: 0, draws: 0, losses: 0, points: 0, goals_for: 0, goals_against: 0, goal_diff: 0 }
  }
  for (const g of gameList.filter(g => g.is_complete && g.home_team_id && g.away_team_id)) {
    const h = standing[g.home_team_id!]
    const a = standing[g.away_team_id!]
    if (!h || !a) continue
    h.played++; a.played++
    h.goals_for += g.home_score; h.goals_against += g.away_score
    a.goals_for += g.away_score; a.goals_against += g.home_score
    if (g.home_score > g.away_score) { h.wins++; h.points += 3; a.losses++ }
    else if (g.home_score < g.away_score) { a.wins++; a.points += 3; h.losses++ }
    else { h.draws++; h.points++; a.draws++; a.points++ }
  }
  for (const s of Object.values(standing)) s.goal_diff = s.goals_for - s.goals_against
  const standings = Object.values(standing).sort((a, b) => b.points - a.points || b.goal_diff - a.goal_diff || b.goals_for - a.goals_for)

  const statusColor: Record<string, string> = {
    upcoming: 'bg-yellow-900/40 text-yellow-400',
    active: 'bg-green-900/40 text-green-400',
    completed: 'bg-gray-800 text-gray-500',
  }
  const statusLabel: Record<string, string> = { upcoming: '예정', active: '진행 중', completed: '완료' }

  const otherLeagues = (allLeagues ?? []).filter(ol => ol.id !== leagueId)

  const today = new Date().toISOString().slice(0, 10)
  const nextGame = gameList
    .filter(g => !g.is_complete && g.date >= today && g.home_team_id && g.away_team_id)
    .sort((a, b) => a.date.localeCompare(b.date))[0]

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">{l.name}</h1>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[l.status] ?? 'bg-gray-800 text-gray-400'}`}>
            {statusLabel[l.status] ?? l.status}
          </span>
        </div>
        <p className="text-gray-500 text-sm">{l.season_year}시즌 · {l.season_type === 'quarterly' ? '분기별(3개월)' : '연간(1년)'} · 시작일 {l.start_date}</p>
      </div>

      {/* 시즌 전환 */}
      {otherLeagues.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {otherLeagues.map(ol => (
            <Link
              key={ol.id}
              href={`/league/${orgSlug}/${ol.id}`}
              className="text-sm px-4 py-2 rounded-full border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors cursor-pointer btn-press"
            >
              {ol.name} ({ol.season_year})
            </Link>
          ))}
        </div>
      )}

      {/* 순위표 */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-white">순위표</h2>
        </div>
        <div className="p-2">
          <LeagueStandings standings={standings} />
        </div>
      </div>

      {/* 다음 경기 하이라이트 */}
      {nextGame && (() => {
        const home = nextGame.home_team_id ? teamMap[nextGame.home_team_id] : null
        const away = nextGame.away_team_id ? teamMap[nextGame.away_team_id] : null
        const isToday = nextGame.date === today
        return (
          <div className="bg-gradient-to-r from-blue-950/40 via-gray-900 to-gray-900 border border-blue-900/40 rounded-2xl px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {isToday ? (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-green-400">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />오늘 경기
                  </span>
                ) : (
                  <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">다음 경기</span>
                )}
                <span className="text-xs text-gray-500">· {nextGame.date}</span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-4 mt-3">
              <div className="flex items-center gap-2">
                {home && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: home.color }} />}
                <span className="text-base font-black text-white">{home?.name ?? '—'}</span>
              </div>
              <span className="text-sm font-bold text-gray-600">VS</span>
              <div className="flex items-center gap-2">
                {away && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: away.color }} />}
                <span className="text-base font-black text-white">{away?.name ?? '—'}</span>
              </div>
            </div>
          </div>
        )
      })()}

      {/* 최근 일정 / 결과 */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="font-semibold text-white">일정 · 결과</h2>
          <Link
            href={`/league/${orgSlug}/${leagueId}/schedule`}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            전체 보기 →
          </Link>
        </div>
        <div className="p-4">
          <LeagueSchedule games={gameList} leagueId={leagueId} limit={6} />
        </div>
      </div>
    </div>
  )
}
