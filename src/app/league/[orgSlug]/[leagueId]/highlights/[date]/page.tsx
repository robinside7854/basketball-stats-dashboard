// 옛 날짜별 하이라이트 → 피드 ?date= (리뉴얼 4단계, 2026-10-12). 회원 게이트는 피드가 한다.
import { redirect } from 'next/navigation'
import { highlightsFeedHref } from '@/lib/highlights/feedRedirect'

export default async function HighlightsRoundRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; leagueId: string; date: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { orgSlug, leagueId, date } = await params
  const sp = await searchParams
  const feed: Record<string, string> = /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date } : {}
  redirect(highlightsFeedHref(orgSlug, leagueId, feed, sp))
}
