import { createClient } from '@/lib/supabase/client'
import { redirect } from 'next/navigation'
import type { League } from '@/types/league'

export default async function LeagueIndexPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const supabase = createClient()

  const { data: leagues } = await supabase
    .from('leagues')
    .select('*')
    .eq('org_slug', orgSlug)
    .in('status', ['active', 'upcoming'])
    .order('created_at', { ascending: false })

  const activeLeague = (leagues as League[] | null)?.find(l => l.status === 'active')
  const upcomingLeague = (leagues as League[] | null)?.[0]
  const target = activeLeague ?? upcomingLeague

  if (target) {
    redirect(`/league/${orgSlug}/${target.id}`)
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-white">리그 준비 중</h1>
        <p className="text-gray-500 text-sm">현재 진행 중인 리그가 없습니다</p>
      </div>
    </div>
  )
}
