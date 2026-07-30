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
  upcoming: 'bg-[var(--mm-yellow-soft)] text-[var(--mm-yellow-strong)]',
  active: 'bg-[var(--mm-positive)]/10 text-[var(--mm-positive)]',
  completed: 'bg-[var(--mm-panel-alt)] text-[var(--mm-muted)]',
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
        <Link href={`/admin/orgs/${orgSlug}`} className="text-[var(--mm-muted)] hover:text-[var(--mm-ink)] transition-colors cursor-pointer">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-[var(--mm-ink)]">리그 관리</h1>
          <span className="text-[var(--mm-muted)] text-sm">/{orgSlug}</span>
        </div>
        <Link
          href={`/admin/orgs/${orgSlug}/leagues/new`}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 text-sm font-medium transition-colors cursor-pointer"
        >
          <Plus size={15} />
          새 리그
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--mm-muted)]" />
        </div>
      ) : (!leagues || leagues.length === 0) ? (
        <div className="text-center py-16 border border-dashed border-[var(--mm-rule)] rounded-xl text-[var(--mm-muted)] space-y-3">
          <p>등록된 리그가 없습니다</p>
          <Link
            href={`/admin/orgs/${orgSlug}/leagues/new`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 text-sm font-medium transition-colors cursor-pointer"
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
              className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-5 hover:border-[var(--mm-muted)] transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[var(--mm-ink)] truncate">{league.name}</p>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium shrink-0 ${statusClass[league.status] ?? statusClass.upcoming}`}>
                      {statusLabel[league.status] ?? league.status}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--mm-muted)] mt-0.5">{league.season_year}시즌 · 시작일 {league.start_date}</p>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <Link
                    href={`/league/${orgSlug}/${league.id}`}
                    target="_blank"
                    className="p-2 rounded-lg text-[var(--mm-muted)] hover:text-[var(--mm-yellow-strong)] hover:bg-[var(--mm-panel-alt)] transition-colors cursor-pointer"
                    title="리그 대시보드 열기"
                  >
                    <ExternalLink size={15} />
                  </Link>
                  <button
                    onClick={() => deleteLeague(league)}
                    disabled={deletingId === league.id}
                    className="p-2 rounded-lg text-[var(--mm-muted)] hover:text-[var(--mm-negative)] hover:bg-[var(--mm-panel-alt)] transition-colors disabled:opacity-40 cursor-pointer"
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
