import { createClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import OrgDetailClient from './OrgDetailClient'

export default async function AdminOrgDetailPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const supabase = createClient()

  const { data: teams } = await supabase.from('teams').select('*').eq('org_slug', orgSlug).order('sub_slug')
  if (!teams || teams.length === 0) notFound()

  // sub-team별 선수/대회 수 집계
  const statsPerTeam = await Promise.all(
    teams.map(async t => {
      const [players, tournaments] = await Promise.all([
        supabase.from('players').select('id', { count: 'exact' }).eq('team_id', t.id),
        supabase.from('tournaments').select('id', { count: 'exact' }).eq('team_id', t.id),
      ])
      return { teamId: t.id, players: players.count ?? 0, tournaments: tournaments.count ?? 0 }
    })
  )

  return (
    <OrgDetailClient
      orgSlug={orgSlug}
      teams={teams}
      statsPerTeam={statsPerTeam}
    />
  )
}
