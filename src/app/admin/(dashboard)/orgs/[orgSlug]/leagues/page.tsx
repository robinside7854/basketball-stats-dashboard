import { createClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { ArrowLeft, Plus } from 'lucide-react'
import type { League } from '@/types/league'

const statusLabel: Record<string, string> = {
  upcoming: '예정',
  active: '진행 중',
  completed: '완료',
}

const statusClass: Record<string, string> = {
  upcoming: 'bg-gray-800 text-gray-400',
  active: 'bg-green-900/40 text-green-400',
  completed: 'bg-blue-900/40 text-blue-400',
}

export default async function LeaguesPage({
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
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href={`/admin/orgs/${orgSlug}`} className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">리그 관리</h1>
          <span className="text-gray-500 text-sm">/{orgSlug}</span>
        </div>
        <Link
          href={`/admin/orgs/${orgSlug}/leagues/new`}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          <Plus size={15} />
          새 리그
        </Link>
      </div>

      <div className="space-y-3">
        {(!leagues || leagues.length === 0) ? (
          <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl text-gray-500 space-y-3">
            <p>등록된 리그가 없습니다</p>
            <Link
              href={`/admin/orgs/${orgSlug}/leagues/new`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
            >
              <Plus size={14} />
              첫 번째 리그 만들기
            </Link>
          </div>
        ) : (
          (leagues as League[]).map(league => (
            <Link
              key={league.id}
              href={`/admin/orgs/${orgSlug}/leagues/${league.id}`}
              className="block bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">{league.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{league.season_year}시즌 · {league.season_type === 'quarterly' ? '분기별(3개월)' : '연간(1년)'}</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusClass[league.status] ?? statusClass.upcoming}`}>
                  {statusLabel[league.status] ?? league.status}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-2">시작일: {league.start_date}</p>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
