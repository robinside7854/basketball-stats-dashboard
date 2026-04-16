import { notFound } from 'next/navigation'
import { TeamProvider, type TeamType } from '@/contexts/TeamContext'

const VALID_TEAMS: TeamType[] = ['youth', 'senior']

export default function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { team: string }
}) {
  const team = params.team as TeamType
  if (!VALID_TEAMS.includes(team)) notFound()

  return (
    <TeamProvider team={team}>
      {children}
    </TeamProvider>
  )
}
