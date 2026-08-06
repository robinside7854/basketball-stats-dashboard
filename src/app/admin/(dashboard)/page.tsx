import { createClient } from '@/lib/supabase/admin'
import { Users, Trophy, Calendar, Building2, Medal, Shield, CheckSquare } from 'lucide-react'
import Link from 'next/link'

async function getStats() {
  const supabase = createClient()
  const [orgs, players, tournaments, games, leagues, leagueTeams, leagueGames, recentLeagues] = await Promise.all([
    supabase.from('teams').select('id, org_slug, name, accent_color, is_active', { count: 'exact' }),
    supabase.from('players').select('id', { count: 'exact' }).eq('is_active', true),
    supabase.from('tournaments').select('id', { count: 'exact' }),
    supabase.from('games').select('id', { count: 'exact' }),
    supabase.from('leagues').select('id', { count: 'exact' }),
    supabase.from('league_teams').select('id', { count: 'exact' }),
    supabase.from('league_games').select('id', { count: 'exact' }).eq('is_complete', true),
    supabase.from('leagues').select('id, name, org_slug, status, season_year').order('created_at', { ascending: false }).limit(5),
  ])
  return {
    orgs: orgs.data ?? [],
    orgCount: orgs.count ?? 0,
    playerCount: players.count ?? 0,
    tournamentCount: tournaments.count ?? 0,
    gameCount: games.count ?? 0,
    leagueCount: leagues.count ?? 0,
    leagueTeamCount: leagueTeams.count ?? 0,
    leagueGameCount: leagueGames.count ?? 0,
    recentLeagues: recentLeagues.data ?? [],
  }
}

const STATUS_LABEL: Record<string, string> = { upcoming: '예정', active: '진행 중', completed: '완료' }
const STATUS_STYLE: Record<string, string> = {
  upcoming: 'bg-[var(--mm-yellow-soft)] text-[var(--mm-yellow-strong)]',
  active: 'bg-[var(--mm-positive)]/10 text-[var(--mm-positive)]',
  completed: 'bg-[var(--mm-panel-alt)] text-[var(--mm-muted)]',
}

export default async function AdminDashboardPage() {
  const { orgs, orgCount, playerCount, tournamentCount, gameCount, leagueCount, leagueTeamCount, leagueGameCount, recentLeagues } = await getStats()

  const tournamentKpis = [
    { label: '등록 팀', value: orgCount, icon: Building2, color: 'text-[var(--mm-ink)]', bg: 'bg-[var(--mm-panel-alt)] border-[var(--mm-rule)]' },
    { label: '활성 선수', value: playerCount, icon: Users, color: 'text-[var(--mm-positive)]', bg: 'bg-[var(--mm-positive)]/10 border-[var(--mm-positive)]/20' },
    { label: '대회', value: tournamentCount, icon: Trophy, color: 'text-[var(--mm-yellow-strong)]', bg: 'bg-[var(--mm-yellow-soft)] border-[var(--mm-yellow-strong)]/20' },
    { label: '경기', value: gameCount, icon: Calendar, color: 'text-[var(--mm-ink)]', bg: 'bg-[var(--mm-panel)] border-[var(--mm-rule)]' },
  ]

  const leagueKpis = [
    { label: '운영 리그', value: leagueCount, icon: Medal, color: 'text-[var(--mm-yellow-strong)]', bg: 'bg-[var(--mm-yellow-soft)] border-[var(--mm-yellow-strong)]/20' },
    { label: '참가 팀', value: leagueTeamCount, icon: Shield, color: 'text-[var(--mm-ink)]', bg: 'bg-[var(--mm-panel)] border-[var(--mm-rule)]' },
    { label: '완료 경기', value: leagueGameCount, icon: CheckSquare, color: 'text-[var(--mm-positive)]', bg: 'bg-[var(--mm-positive)]/10 border-[var(--mm-positive)]/20' },
  ]

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-[var(--mm-ink)]">대시보드</h1>
        <p className="text-[var(--mm-muted)] text-sm mt-1">전체 현황 요약</p>
      </div>

      {/* 토너먼트 섹션 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-[var(--mm-yellow-strong)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--mm-ink-soft)] uppercase tracking-wider">토너먼트</h2>
          <div className="flex-1 h-px bg-[var(--mm-rule)]" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {tournamentKpis.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`rounded-xl border p-5 ${bg}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-[var(--mm-muted)] font-medium">{label}</span>
                <Icon size={16} className={color} aria-hidden="true" />
              </div>
              <p className={`text-3xl font-black ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[var(--mm-ink)]">등록된 팀</h3>
            <Link href="/admin/teams/new" className="text-xs px-3 py-1.5 rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 font-medium transition-colors cursor-pointer min-h-11 flex items-center">
              + 새 팀 추가
            </Link>
          </div>
          <div className="space-y-2">
            {orgs.length === 0 && (
              <div className="text-center py-10 text-[var(--mm-muted)] border border-dashed border-[var(--mm-rule)] rounded-xl text-sm">
                등록된 팀이 없습니다
              </div>
            )}
            {orgs.map(org => (
              <Link
                key={org.id}
                href={`/admin/teams/${org.id}`}
                className="flex items-center gap-4 p-4 bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl hover:border-[var(--mm-muted)] transition-colors cursor-pointer"
              >
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: org.accent_color ?? '#3b82f6' }} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[var(--mm-ink)] text-sm">{org.name}</p>
                  <p className="text-xs text-[var(--mm-muted)]">{org.org_slug}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${org.is_active ? 'bg-[var(--mm-positive)]/10 text-[var(--mm-positive)]' : 'bg-[var(--mm-panel-alt)] text-[var(--mm-muted)]'}`}>
                  {org.is_active ? '활성' : '비활성'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 리그 섹션 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Medal size={16} className="text-[var(--mm-yellow-strong)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--mm-ink-soft)] uppercase tracking-wider">리그</h2>
          <div className="flex-1 h-px bg-[var(--mm-rule)]" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          {leagueKpis.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`rounded-xl border p-5 ${bg}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-[var(--mm-muted)] font-medium">{label}</span>
                <Icon size={16} className={color} />
              </div>
              <p className={`text-3xl font-black ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[var(--mm-ink)]">최근 리그</h3>
            <Link href="/admin/leagues/new" className="text-xs px-3 py-1.5 rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 font-medium transition-opacity cursor-pointer">
              + 새 리그 생성
            </Link>
          </div>
          <div className="space-y-2">
            {recentLeagues.length === 0 && (
              <div className="text-center py-10 text-[var(--mm-muted)] border border-dashed border-[var(--mm-rule)] rounded-xl text-sm">
                등록된 리그가 없습니다
              </div>
            )}
            {recentLeagues.map(league => (
              <Link
                key={league.id}
                href={`/admin/leagues/${league.id}`}
                className="flex items-center gap-4 p-4 bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl hover:border-[var(--mm-muted)] transition-colors cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[var(--mm-ink)] text-sm">{league.name}</p>
                  <p className="text-xs text-[var(--mm-muted)]">{league.org_slug} · {league.season_year}시즌</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[league.status] ?? 'bg-[var(--mm-panel-alt)] text-[var(--mm-muted)]'}`}>
                  {STATUS_LABEL[league.status] ?? league.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
