import { redirect } from 'next/navigation'

// 어워즈는 리더보드의 4번째 모드로 흡수됐다 — 옛 링크·북마크는 그 모드로 보낸다.
export default async function AwardsRedirect({ params }: { params: Promise<{ orgSlug: string; leagueId: string }> }) {
  const { orgSlug, leagueId } = await params
  redirect(`/league/${orgSlug}/${leagueId}/stats?mode=awards`)
}
