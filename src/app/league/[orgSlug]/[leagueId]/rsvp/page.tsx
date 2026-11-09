import { isLeaguePrivateGated } from '@/lib/auth/guard'
import RsvpPageClient from '@/components/league/rsvp/RsvpPageClient'

type Params = { orgSlug: string; leagueId: string }

// 주간 참가신청 명단 · 어드민 승인/배치 (2026-11-09) — 비공개 리그 게이트는 페이지마다 먼저(me/page.tsx 와 같은 이유).
export default async function RsvpPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<{ date?: string }> }) {
  const { orgSlug, leagueId } = await params
  const { date } = await searchParams
  if (await isLeaguePrivateGated(leagueId)) return null
  return <RsvpPageClient leagueId={leagueId} base={`/league/${orgSlug}/${leagueId}`} initialDate={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null} />
}
