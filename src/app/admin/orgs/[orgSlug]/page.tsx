import { createClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import OrgDetailClient from './OrgDetailClient'

export default async function AdminOrgDetailPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const supabase = createClient()

  const { data: org } = await supabase.from('teams').select('*').eq('org_slug', orgSlug).maybeSingle()
  if (!org) notFound()

  const [players, tournaments, games] = await Promise.all([
    supabase.from('players').select('id', { count: 'exact' }).eq('team_id', org.id),
    supabase.from('tournaments').select('id', { count: 'exact' }).eq('team_id', org.id),
    supabase.from('games').select('id', { count: 'exact' }),
  ])

  return (
    <OrgDetailClient
      org={org}
      stats={{
        players: players.count ?? 0,
        tournaments: tournaments.count ?? 0,
        games: games.count ?? 0,
      }}
    />
  )
}
