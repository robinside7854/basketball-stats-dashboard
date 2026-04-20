import { createClient } from '@/lib/supabase/admin'
import { Users, Trophy, Calendar, Building2 } from 'lucide-react'
import Link from 'next/link'

async function getStats() {
  const supabase = createClient()
  const [orgs, players, tournaments, games] = await Promise.all([
    supabase.from('teams').select('id, org_slug, name, accent_color, is_active', { count: 'exact' }),
    supabase.from('players').select('id', { count: 'exact' }).eq('is_active', true),
    supabase.from('tournaments').select('id', { count: 'exact' }),
    supabase.from('games').select('id', { count: 'exact' }),
  ])
  return {
    orgs: orgs.data ?? [],
    orgCount: orgs.count ?? 0,
    playerCount: players.count ?? 0,
    tournamentCount: tournaments.count ?? 0,
    gameCount: games.count ?? 0,
  }
}

export default async function AdminDashboardPage() {
  const { orgs, orgCount, playerCount, tournamentCount, gameCount } = await getStats()

  const kpis = [
    { label: '등록 Org', value: orgCount, icon: Building2, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    { label: '활성 선수', value: playerCount, icon: Users, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
    { label: '대회', value: tournamentCount, icon: Trophy, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
    { label: '경기', value: gameCount, icon: Calendar, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">대시보드</h1>
        <p className="text-gray-400 text-sm mt-1">전체 현황 요약</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`rounded-xl border p-5 ${bg}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-400 font-medium">{label}</span>
              <Icon size={16} className={color} />
            </div>
            <p className={`text-3xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">등록된 Org</h2>
          <Link href="/admin/orgs/new" className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors">
            + 새 Org 추가
          </Link>
        </div>
        <div className="space-y-2">
          {orgs.length === 0 && (
            <div className="text-center py-12 text-gray-500 border border-dashed border-gray-800 rounded-xl">
              등록된 Org가 없습니다
            </div>
          )}
          {orgs.map(org => (
            <Link
              key={org.id}
              href={`/admin/orgs/${org.org_slug}`}
              className="flex items-center gap-4 p-4 bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-600 transition-colors"
            >
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: org.accent_color ?? '#3b82f6' }} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-sm">{org.name}</p>
                <p className="text-xs text-gray-500">{org.org_slug}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${org.is_active ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                {org.is_active ? '활성' : '비활성'}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
