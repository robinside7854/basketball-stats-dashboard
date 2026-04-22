'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Loader2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
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

export default function LeaguesPage() {
  const params = useParams<{ orgSlug: string }>()
  const orgSlug = params.orgSlug
  const [leagues, setLeagues] = useState<League[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/leagues?org_slug=${orgSlug}`)
    if (res.ok) setLeagues(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [orgSlug])

  async function deleteLeague(league: League) {
    if (!confirm(`"${league.name}" 리그를 삭제하시겠습니까?\n경기, 선수, 팀 데이터가 모두 삭제됩니다.`)) return
    setDeletingId(league.id)
    const res = await fetch(`/api/leagues/${league.id}`, { method: 'DELETE' })
    setDeletingId(null)
    if (res.ok) {
      toast.success('리그가 삭제되었습니다')
      load()
    } else {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? '삭제 실패')
    }
  }

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

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-gray-500" />
        </div>
      ) : (!leagues || leagues.length === 0) ? (
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
        <div className="space-y-3">
          {leagues.map(league => (
            <div
              key={league.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white truncate">{league.name}</p>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium shrink-0 ${statusClass[league.status] ?? statusClass.upcoming}`}>
                      {statusLabel[league.status] ?? league.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{league.season_year}시즌 · 시작일 {league.start_date}</p>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <Link
                    href={`/league/${orgSlug}/${league.id}`}
                    target="_blank"
                    className="p-2 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-gray-800 transition-colors"
                    title="리그 대시보드 열기"
                  >
                    <ExternalLink size={15} />
                  </Link>
                  <button
                    onClick={() => deleteLeague(league)}
                    disabled={deletingId === league.id}
                    className="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-gray-800 transition-colors disabled:opacity-40 cursor-pointer"
                    title="리그 삭제"
                  >
                    {deletingId === league.id
                      ? <Loader2 size={15} className="animate-spin" />
                      : <Trash2 size={15} />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
