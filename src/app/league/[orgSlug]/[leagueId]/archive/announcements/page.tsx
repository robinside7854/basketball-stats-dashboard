// 공지사항 아카이브 목록 — 아카이브 탭 하위
// Server 로드 (unstable_cache) → AnnouncementsArchiveClient (list · reader · editor)
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/admin'
import LeagueGroupTabs from '@/components/league/LeagueGroupTabs'
import AnnouncementsArchive from '@/components/league/announcements/AnnouncementsArchive'
import type { LeagueAnnouncement } from '@/lib/announcements/types'

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
  const announcements = await getCached(leagueId)()
  const base = `/league/${orgSlug}/${leagueId}`
  const groupTabs = [
    { href: `${base}/columns`, label: '매거진', active: false },
    { href: `${base}/stathead`, label: 'Stathead', active: false },
    { href: `${base}/highlights`, label: '하이라이트', active: false },
    { href: `${base}/archive/announcements`, label: '공지', active: true },
  ]

  return (
    <div className="space-y-4 lg:space-y-5">
      <LeagueGroupTabs tabs={groupTabs} />
      <div className="flex items-center gap-2 flex-wrap">
        <Link
          href={base}
          className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] rounded-sm cursor-pointer transition-colors"
          style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}
        >
          <ChevronLeft size={12} aria-hidden /> 홈
        </Link>
      </div>
      <AnnouncementsArchive
        leagueId={leagueId}
        initialAnnouncements={announcements}
      />
    </div>
  )
}
