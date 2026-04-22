import LeagueLayoutClient from './_components/LeagueLayoutClient'

export default async function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string; leagueId: string }>
}) {
  const { orgSlug, leagueId } = await params

  return (
    <LeagueLayoutClient orgSlug={orgSlug} leagueId={leagueId}>
      {children}
    </LeagueLayoutClient>
  )
}
