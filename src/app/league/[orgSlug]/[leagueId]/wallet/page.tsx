import { isLeaguePrivateGated } from '@/lib/auth/guard'
import WalletPageClient from '@/components/league/wallet/WalletPageClient'

type Params = { orgSlug: string; leagueId: string }

// 미라클 월렛(포인트 지갑, 2026-11-09) — 비공개 리그 게이트는 페이지마다 먼저(me/page.tsx 와 같은 이유).
export default async function WalletPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<{ tab?: string }> }) {
  const { leagueId } = await params
  const { tab } = await searchParams
  if (await isLeaguePrivateGated(leagueId)) return null
  return <WalletPageClient leagueId={leagueId} initialTab={tab === 'admin' ? 'admin' : 'me'} />
}
