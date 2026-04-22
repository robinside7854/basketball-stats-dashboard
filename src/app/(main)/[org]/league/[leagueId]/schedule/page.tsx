import { createClient } from '@/lib/supabase/client'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import LeagueSchedule from '@/components/league/LeagueSchedule'
import type { League, LeagueGame, LeagueTeam } from '@/types/league'

export default async function LeagueSchedulePage({
  params,
}: {
  params: Promise<{ org: string; leagueId: string }>
}) {
  const { org, leagueId } = await params
  const supabase = createClient()

  const { data: league } = await supabase
    .from('leagues')
    .select('*')
    .eq('id', leagueId)
    .eq('org_slug', org)
    .single()

  if (!league) notFound()

  const l = league as League

  const { data: teams } = await supabase
    .from('league_teams')
    .select('*')
    .eq('league_id', leagueId)

  const teamMap = Object.fromEntries(((teams as LeagueTeam[]) ?? []).map(t => [t.id, t]))

  const { data: games } = await supabase
    .from('league_games')
    .select('*')
    .eq('league_id', leagueId)
    .order('round_num', { ascending: true })

  const gameList = ((games as LeagueGame[]) ?? []).map(g => ({
    ...g,
    home_team: g.home_team_id ? teamMap[g.home_team_id] : null,
    away_team: g.away_team_id ? teamMap[g.away_team_id] : null,
  }))

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/${org}/league/${leagueId}`} className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white">전체 일정</h1>
            <p className="text-gray-500 text-sm">{l.name} · {l.season_year}시즌</p>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <LeagueSchedule games={gameList} />
        </div>
      </div>
    </div>
  )
}
