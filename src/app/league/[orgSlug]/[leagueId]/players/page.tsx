import { isLeaguePrivateGated } from '@/lib/auth/guard'
import PlayersPageClient from './PlayersPageClient'

type Params = { orgSlug: string; leagueId: string }

// 「선수」 탭(2026-10-16 부활) — 전체 명단을 카드로. 어드민은 「+ 선수 등록」만(수정·배정은 팀 탭).
// 서버 컴포넌트는 비공개 리그 게이트만 확인한다 — me/page.tsx 와 같은 패턴
// (layout·page 병렬 렌더라 layout 게이트 하나로는 raw HTML 누출을 못 막는다). API 도 canViewLeague 로 재확인한다.

export default async function PlayersPage({ params }: { params: Promise<Params> }) {
  const { leagueId } = await params
  if (await isLeaguePrivateGated(leagueId)) return null
  return <PlayersPageClient leagueId={leagueId} />
}
