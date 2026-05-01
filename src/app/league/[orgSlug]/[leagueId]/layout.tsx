import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/admin'
import LeagueLayoutClient from './_components/LeagueLayoutClient'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
}): Promise<Metadata> {
  const { orgSlug, leagueId } = await params
  const supabase = createClient()
  const { data } = await supabase
    .from('leagues')
    .select('name')
    .eq('id', leagueId)
    .eq('org_slug', orgSlug)
    .single()
  const title = data?.name ? `${data.name} — 게임로그` : '리그 게임로그'
  return { title, description: `${data?.name ?? ''} 농구 리그 경기 기록 및 통계` }
}

export default async function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string; leagueId: string }>
}) {
  const { orgSlug, leagueId } = await params

  return (
    <LeagueLayoutClient orgSlug={orgSlug} leagueId={leagueId}>
      {children}
    </LeagueLayoutClient>
  )
}
