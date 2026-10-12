// 옛 선수별 하이라이트 → 피드 ?player= (리뉴얼 4단계, 2026-10-12). 회원 게이트는 피드가 한다.
import { redirect } from 'next/navigation'
import { highlightsFeedHref } from '@/lib/highlights/feedRedirect'

export default async function PlayerHighlightsRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; leagueId: string; playerId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { orgSlug, leagueId, playerId } = await params
  redirect(highlightsFeedHref(orgSlug, leagueId, { player: playerId }, await searchParams))
}
