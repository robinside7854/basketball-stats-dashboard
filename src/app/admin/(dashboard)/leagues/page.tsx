'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, ExternalLink, Trophy, Trash2, Loader2, Settings } from 'lucide-react'
import { toast } from 'sonner'

type League = {
  id: string; name: string; org_slug: string; status: string
  season_year: number; season_type: string; start_date: string
}

const statusLabel: Record<string, string> = { upcoming: '예정', active: '진행 중', completed: '완료' }
const statusColor: Record<string, string> = {
  upcoming: 'bg-[var(--mm-yellow-soft)] text-[var(--mm-yellow-strong)]',
  active: 'bg-[var(--mm-positive)]/10 text-[var(--mm-positive)]',
  completed: 'bg-[var(--mm-panel-alt)] text-[var(--mm-muted)]',
}

export default function AdminLeaguesPage() {
  const [leagues, setLeagues] = useState<League[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/leagues')
    if (res.ok) setLeagues(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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

  const totalLeagues = leagues.length
  const activeLeagues = leagues.filter(l => l.status === 'active').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--mm-ink)]">리그 관리</h1>
          <p className="text-[var(--mm-muted)] text-sm mt-1">독립 리그 생성 및 운영 관리</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="text-xs text-[var(--mm-muted)]">전체</p>
              <p className="text-xl font-bold text-[var(--mm-ink)]">{loading ? '—' : totalLeagues}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--mm-muted)]">진행 중</p>
              <p className="text-xl font-bold text-[var(--mm-positive)]">{loading ? '—' : activeLeagues}</p>
            </div>
          </div>
          <Link
            href="/admin/leagues/new"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 text-sm font-medium transition-colors cursor-pointer"
          >
            <Plus size={15} />
            새 리그 생성
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-[var(--mm-muted)]" />
          </div>
        ) : totalLeagues === 0 ? (
          <div className="text-center py-16 border border-dashed border-[var(--mm-rule)] rounded-xl text-[var(--mm-muted)]">
            <Trophy size={32} className="mx-auto mb-3 text-[var(--mm-muted)]" />
            <p>아직 생성된 리그가 없습니다</p>
            <p className="text-sm mt-1">새 리그 생성 버튼을 눌러 시작하세요</p>
          </div>
        ) : (
          leagues.map(league => (
            <div key={league.id} className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-5 hover:border-[var(--mm-muted)] transition-colors">
              <div className="flex items-center gap-4">
                <Trophy size={16} className="text-[var(--mm-muted)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-[var(--mm-ink)]">{league.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[league.status] ?? 'bg-[var(--mm-panel-alt)] text-[var(--mm-muted)]'}`}>
                      {statusLabel[league.status] ?? league.status}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--mm-muted)] mt-0.5">
                    {league.season_year}시즌 · {league.season_type === 'quarterly' ? '분기별' : '연간'} · 시작일 {league.start_date}
                  </p>
                  <p className="text-xs text-[var(--mm-muted)] mt-0.5 font-mono">/league/{league.org_slug}/{league.id.slice(0, 8)}…</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/admin/leagues/${league.id}`}
                    className="flex items-center gap-1 text-xs text-[var(--mm-yellow-strong)] hover:opacity-80 px-2.5 py-1.5 rounded-lg border border-[var(--mm-yellow-strong)]/30 bg-[var(--mm-yellow-soft)] hover:border-[var(--mm-yellow-strong)]/60 transition-colors cursor-pointer"
                  >
                    <Settings size={12} />
                    관리
                  </Link>
                  <Link
                    href={`/league/${league.org_slug}/${league.id}`}
                    target="_blank"
                    className="flex items-center gap-1 text-xs text-[var(--mm-muted)] hover:text-[var(--mm-ink)] px-2.5 py-1.5 rounded-lg border border-[var(--mm-rule)] hover:border-[var(--mm-muted)] transition-colors cursor-pointer"
                  >
                    <ExternalLink size={12} />
                    대시보드
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
          ))
        )}
      </div>
    </div>
  )
}
