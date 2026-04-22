import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Plus, ExternalLink, Trophy } from 'lucide-react'

export default async function AdminLeaguesPage() {
  const adminSupabase = createAdminClient()
  const supabase = createClient()

  // 모든 org 목록
  const { data: teams } = await adminSupabase
    .from('teams')
    .select('org_slug, name, accent_color')
    .order('org_slug')

  // org별 그룹핑 (중복 제거)
  const orgMap = new Map<string, { slug: string; name: string; color: string }>()
  for (const t of teams ?? []) {
    if (!orgMap.has(t.org_slug)) {
      const orgName = t.name.replace(/ (청년부|장년부|youth|senior)$/i, '')
      orgMap.set(t.org_slug, { slug: t.org_slug, name: orgName, color: t.accent_color ?? '#3b82f6' })
    }
  }
  const orgs = Array.from(orgMap.values())

  // 리그 목록 (전체)
  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, org_slug, name, status, season_year, total_rounds')
    .order('created_at', { ascending: false })

  const leaguesByOrg = new Map<string, typeof leagues>()
  for (const l of leagues ?? []) {
    if (!leaguesByOrg.has(l.org_slug)) leaguesByOrg.set(l.org_slug, [])
    leaguesByOrg.get(l.org_slug)!.push(l)
  }

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
          <p className="text-gray-400 text-sm mt-1">동호회별 자체 리그 생성 및 관리</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-gray-500">전체 리그</p>
            <p className="text-lg font-bold text-white">{totalLeagues}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">진행 중</p>
            <p className="text-lg font-bold text-green-400">{activeLeagues}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {orgs.length === 0 && (
          <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl text-gray-500">
            등록된 Org가 없습니다
          </div>
        )}
        {orgs.map(org => {
          const orgLeagues = leaguesByOrg.get(org.slug) ?? []
          const activeLeague = orgLeagues.find(l => l.status === 'active')

          return (
            <div key={org.slug} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {/* Org 헤더 */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: org.color }} />
                  <div>
                    <p className="font-semibold text-white">{org.name}</p>
                    <p className="text-xs text-gray-500">/{org.slug}</p>
                  </div>
                  {activeLeague && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 font-medium">
                      리그 진행 중
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`https://basketball-stats-dashboard.vercel.app/league/${org.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-white px-2.5 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
                  >
                    <ExternalLink size={12} />
                    공개 페이지
                  </a>
                  <Link
                    href={`/admin/orgs/${org.slug}/leagues/new`}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 px-2.5 py-1.5 rounded-lg border border-blue-500/30 hover:border-blue-400/60 transition-colors"
                  >
                    <Plus size={12} />
                    리그 생성
                  </Link>
                </div>
              </div>

              {/* 리그 목록 */}
              {orgLeagues.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-gray-600">
                  아직 생성된 리그가 없습니다
                </div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {orgLeagues.map(league => (
                    <div key={league.id} className="flex items-center justify-between px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Trophy size={14} className="text-gray-600 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-white">{league.name}</p>
                          <p className="text-xs text-gray-500">{league.season_year}시즌 · {league.total_rounds}라운드</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[league.status] ?? 'bg-gray-800 text-gray-500'}`}>
                          {statusLabel[league.status] ?? league.status}
                        </span>
                        <Link
                          href={`/admin/orgs/${org.slug}/leagues/${league.id}`}
                          className="text-xs text-gray-400 hover:text-white px-2.5 py-1 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
                        >
                          관리
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
