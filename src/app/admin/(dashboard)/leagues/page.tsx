import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Plus, ExternalLink, Trophy } from 'lucide-react'

export default async function AdminLeaguesPage() {
  const supabase = createClient()
  const { data: leagues } = await supabase
    .from('leagues')
    .select('*')
    .order('created_at', { ascending: false })

  const statusLabel: Record<string, string> = { upcoming: '예정', active: '진행 중', completed: '완료' }
  const statusColor: Record<string, string> = {
    upcoming: 'bg-yellow-900/40 text-yellow-400',
    active: 'bg-green-900/40 text-green-400',
    completed: 'bg-gray-800 text-gray-500',
  }

  const totalLeagues = leagues?.length ?? 0
  const activeLeagues = leagues?.filter(l => l.status === 'active').length ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">리그 관리</h1>
          <p className="text-gray-400 text-sm mt-1">독립 리그 생성 및 운영 관리</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="text-xs text-gray-500">전체</p>
              <p className="text-xl font-bold text-white">{totalLeagues}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">진행 중</p>
              <p className="text-xl font-bold text-green-400">{activeLeagues}</p>
            </div>
          </div>
          <Link
            href="/admin/leagues/new"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            <Plus size={15} />
            새 리그 생성
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        {totalLeagues === 0 && (
          <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl text-gray-500">
            <Trophy size={32} className="mx-auto mb-3 text-gray-700" />
            <p>아직 생성된 리그가 없습니다</p>
            <p className="text-sm mt-1">새 리그 생성 버튼을 눌러 시작하세요</p>
          </div>
        )}
        {(leagues ?? []).map(league => (
          <div key={league.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-4">
              <Trophy size={16} className="text-gray-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-white">{league.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[league.status] ?? 'bg-gray-800 text-gray-500'}`}>
                    {statusLabel[league.status] ?? league.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {league.season_year}시즌 · {league.total_rounds}라운드 · 시작일 {league.start_date}
                </p>
                <p className="text-xs text-gray-600 mt-0.5 font-mono">/league/{league.org_slug}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`https://basketball-stats-dashboard.vercel.app/league/${league.org_slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-white px-2.5 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
                >
                  <ExternalLink size={12} />
                  공개
                </a>
                <Link
                  href={`/admin/leagues/${league.id}`}
                  className="text-xs text-blue-400 hover:text-blue-300 px-2.5 py-1.5 rounded-lg border border-blue-500/30 hover:border-blue-400/60 transition-colors"
                >
                  관리
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
