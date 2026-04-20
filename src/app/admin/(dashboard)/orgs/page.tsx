import { createClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Plus, ExternalLink } from 'lucide-react'

export default async function AdminOrgsPage() {
  const supabase = createClient()
  const { data: orgs } = await supabase.from('teams').select('*').order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Org 관리</h1>
          <p className="text-gray-400 text-sm mt-1">등록된 농구 클럽 조직 목록</p>
        </div>
        <Link
          href="/admin/orgs/new"
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          <Plus size={15} />
          새 Org 추가
        </Link>
      </div>

      <div className="space-y-3">
        {(!orgs || orgs.length === 0) && (
          <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl text-gray-500">
            아직 등록된 Org가 없습니다
          </div>
        )}
        {orgs?.map(org => (
          <div key={org.id} className="flex items-center gap-4 p-5 bg-gray-900 border border-gray-800 rounded-xl">
            <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: org.accent_color ?? '#3b82f6' }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-white">{org.name}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${org.is_active ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                  {org.is_active ? '활성' : '비활성'}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">/{org.org_slug}</p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`https://basketball-stats-dashboard.vercel.app/${org.org_slug}/youth`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-white px-2.5 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
              >
                <ExternalLink size={12} />
                사이트
              </a>
              <Link
                href={`/admin/orgs/${org.org_slug}`}
                className="text-xs text-blue-400 hover:text-blue-300 px-2.5 py-1.5 rounded-lg border border-blue-500/30 hover:border-blue-400/60 transition-colors"
              >
                관리
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
