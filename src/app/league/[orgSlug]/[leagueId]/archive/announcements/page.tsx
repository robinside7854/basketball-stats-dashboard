// 공지사항 아카이브 목록 — 아카이브 탭 하위
// Server 로드 (unstable_cache) → AnnouncementsArchiveClient (list · reader · editor)
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/admin'
import LeagueGroupTabs from '@/components/league/LeagueGroupTabs'
import AnnouncementsArchive from '@/components/league/announcements/AnnouncementsArchive'
import type { LeagueAnnouncement } from '@/lib/announcements/types'
import { isLeaguePrivateGated } from '@/lib/auth/guard'

const getCached = (leagueId: string) =>
  unstable_cache(
    async (): Promise<LeagueAnnouncement[]> => {
      const sb = createClient()
      const { data } = await sb
        .from('league_announcements')
        .select('id, title, body_markdown, pinned, published_at, created_by, updated_at')
        .eq('league_id', leagueId)
        .order('pinned', { ascending: false })
        .order('published_at', { ascending: false })
        .limit(200)
      return (data ?? []) as LeagueAnnouncement[]
    },
    ['league-announcements-archive', leagueId],
    { tags: [`league-${leagueId}-announcements`], revalidate: 300 },
  )

export default async function AnnouncementsArchivePage({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
}) {
  const { orgSlug, leagueId } = await params

  // 비공개 리그 raw HTML 누출 방지 — layout.tsx 주석 참조 (Next 가 layout·page 병렬 렌더).
  if (await isLeaguePrivateGated(leagueId)) return null

  const announcements = await getCached(leagueId)()
  const base = `/league/${orgSlug}/${leagueId}`
  // 공지는 영상이 아니라 소식이므로 홈 우산 소속 — 하이라이트가 아니라 홈으로 돌아가는
  // 항목을 짝지어 둔다(예전엔 하이라이트→공지 편도였음, 2026-08-07 정리).
  const groupTabs = [
    { href: base, label: '홈', active: false },
    { href: `${base}/archive/announcements`, label: '공지', active: true },
  ]

  return (
    <div className="space-y-4 lg:space-y-5">
      <LeagueGroupTabs tabs={groupTabs} />
      <AnnouncementsArchive
        leagueId={leagueId}
        initialAnnouncements={announcements}
      />
    </div>
  )
}
