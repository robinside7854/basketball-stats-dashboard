import { notFound } from 'next/navigation'
import { TeamProvider, type TeamType } from '@/contexts/TeamContext'

const VALID_TEAMS: TeamType[] = ['youth', 'senior']

export default async function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ team: string }>
}) {
  const { team: teamParam } = await params
  const team = teamParam as TeamType
  if (!VALID_TEAMS.includes(team)) notFound()

  return (
    <TeamProvider team={team}>
      {children}
    </TeamProvider>
  )
}
