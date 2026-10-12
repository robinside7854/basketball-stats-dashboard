// 옛 「milestones」 탭 → 피드 ?f=milestones (리뉴얼 4단계, 2026-10-12). 접근 판정은 피드가 옛 페이지와 같게 한다.
import { redirect } from 'next/navigation'
import { highlightsFeedHref } from '@/lib/highlights/feedRedirect'

export default async function MilestonesRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { orgSlug, leagueId } = await params
  redirect(highlightsFeedHref(orgSlug, leagueId, { f: 'milestones' }, await searchParams))
}
