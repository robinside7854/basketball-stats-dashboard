// 옛 「milestones」 탭 → 피드 첫 화면. 마일스톤 보기는 2026-11-02 운영진 결정으로 뺐다(R6) — 옛 링크는 피드로 보낸다.
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
  redirect(highlightsFeedHref(orgSlug, leagueId, {}, await searchParams))
}
