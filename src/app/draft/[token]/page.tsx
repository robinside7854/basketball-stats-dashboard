// 드래프트 공유 포털 페이지 (server) — 토큰 lookup → 클라이언트 컴포넌트로 위임.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/admin'
import DraftPortalClient from './DraftPortalClient'

export const dynamic = 'force-dynamic'

export default async function DraftPortalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!token || token.length < 8) notFound()

  const supabase = createClient()
  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, league_id, quarter_id')
    .eq('share_token', token)
    .maybeSingle()
  if (!draft) notFound()

  const [{ data: league }, { data: quarter }] = await Promise.all([
    supabase.from('leagues').select('name, org_slug').eq('id', draft.league_id).maybeSingle(),
    supabase.from('league_quarters').select('year, quarter').eq('id', draft.quarter_id).maybeSingle(),
  ])

  return (
    <DraftPortalClient
      leagueId={draft.league_id}
      quarterId={draft.quarter_id}
      draftId={draft.id}
      leagueName={league?.name ?? '드래프트'}
      orgSlug={league?.org_slug ?? ''}
      year={quarter?.year ?? null}
      quarter={quarter?.quarter ?? null}
    />
  )
}
