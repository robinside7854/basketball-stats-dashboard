import { notFound } from 'next/navigation'
import { TeamProvider, type TeamType } from '@/contexts/TeamContext'
import { OrgProvider } from '@/contexts/OrgContext'
import { createServerClient } from '@/lib/supabase/server'

const VALID_TEAMS: TeamType[] = ['youth', 'senior']

export default async function OrgTeamLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ org: string; team: string }>
}) {
  const { org, team: teamParam } = await params
  const team = teamParam as TeamType
  if (!VALID_TEAMS.includes(team)) notFound()

  const supabase = createServerClient()
  const { data } = await supabase
    .from('teams')
    .select('id')
    .eq('org_slug', org)
    .maybeSingle()
  if (!data) notFound()

  return (
    <OrgProvider org={org}>
      <TeamProvider team={team}>
        {children}
      </TeamProvider>
    </OrgProvider>
  )
}
