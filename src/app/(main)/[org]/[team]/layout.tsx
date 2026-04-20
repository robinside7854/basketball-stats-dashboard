import { notFound } from 'next/navigation'
import { TeamProvider, type TeamType } from '@/contexts/TeamContext'
import { OrgProvider } from '@/contexts/OrgContext'

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

  // org 유효성은 페이지 레벨에서 API 응답으로 처리 (서버사이드 DB 쿼리 제거)
  if (!org || org.length < 2) notFound()

  return (
    <OrgProvider org={org}>
      <TeamProvider team={team}>
        {children}
      </TeamProvider>
    </OrgProvider>
  )
}
