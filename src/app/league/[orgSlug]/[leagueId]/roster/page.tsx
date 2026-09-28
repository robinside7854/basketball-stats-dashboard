import { redirect } from 'next/navigation'
export default async function RosterRedirect({ params }: { params: Promise<{ orgSlug: string; leagueId: string }> }) {
  const { orgSlug, leagueId } = await params
  redirect(`/league/${orgSlug}/${leagueId}/teams?edit=1`)
}
