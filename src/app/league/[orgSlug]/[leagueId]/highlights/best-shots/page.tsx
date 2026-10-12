// 옛 「best-shots」 탭 → 피드 ?f=best (리뉴얼 4단계, 2026-10-12). 접근 판정은 피드가 옛 페이지와 같게 한다.
import { redirect } from 'next/navigation'
import { highlightsFeedHref } from '@/lib/highlights/feedRedirect'

export default async function BestShotsRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { orgSlug, leagueId } = await params
  redirect(highlightsFeedHref(orgSlug, leagueId, { f: 'best' }, await searchParams))
}
