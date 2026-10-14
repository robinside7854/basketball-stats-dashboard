'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, ExternalLink, KeyRound, Tags } from 'lucide-react'
import Link from 'next/link'
import LeagueAdminRolePanel from '@/components/admin/LeagueAdminRolePanel'
import type { League } from '@/types/league'
import { siteUrl } from '@/lib/siteUrl'

const DOW_LABELS: Record<string, string> = {
  monday: '월요일', tuesday: '화요일', wednesday: '수요일', thursday: '목요일',
  friday: '금요일', saturday: '토요일', sunday: '일요일',
}
const STATUS_OPTIONS = [
  { value: 'upcoming', label: '예정', color: 'text-[var(--mm-yellow-strong)]' },
  { value: 'active',   label: '진행 중', color: 'text-[var(--mm-positive)]' },
  { value: 'completed', label: '완료', color: 'text-[var(--mm-muted)]' },
]

export default function LeagueAdminSettingsPage() {
  const params = useParams<{ leagueId: string }>()
  const { leagueId } = params
  const router = useRouter()

  const [league, setLeague] = useState<League | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await fetch(`/api/leagues/${leagueId}`)
      if (res.ok) {
        const data: League = await res.json()
        setLeague(data)
        setStatus(data.status)
      } else {
        router.push('/admin/leagues')
      }
      setLoading(false)
    }
    load()
  }, [leagueId, router])

  async function saveStatus() {
    setSaving(true)
    const res = await fetch(`/api/leagues/${leagueId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setSaving(false)
    if (res.ok) toast.success('상태 저장 완료')
    else toast.error('저장 실패')
  }

  if (loading) return <div className="flex justify-center items-center h-40"><Loader2 size={24} className="animate-spin text-[var(--mm-muted)]" /></div>
  if (!league) return null

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-3">
        <Link href="/admin/leagues" className="text-[var(--mm-muted)] hover:text-[var(--mm-ink)] transition-colors cursor-pointer">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-[var(--mm-ink)]">{league.name}</h1>
          <p className="text-[var(--mm-muted)] text-sm">{league.season_year}시즌 · {league.season_type === 'quarterly' ? '분기별' : '연간'}</p>
        </div>
        <a
          href={`${siteUrl()}/league/${league.org_slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-[var(--mm-muted)] hover:text-[var(--mm-ink)] px-2.5 py-1.5 rounded-lg border border-[var(--mm-rule)] hover:border-[var(--mm-muted)] transition-colors shrink-0 cursor-pointer"
        >
          <ExternalLink size={14} />
          대시보드
        </a>
      </div>

      {/* 리그 정보 (읽기 전용) */}
      <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-[var(--mm-ink)] text-sm">리그 정보</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-[var(--mm-muted)]">공개 슬러그</p><p className="text-[var(--mm-ink)] font-mono">/league/{league.org_slug}</p></div>
          <div><p className="text-xs text-[var(--mm-muted)]">정기 경기 요일</p><p className="text-[var(--mm-ink)]">{DOW_LABELS[league.match_day] ?? league.match_day}</p></div>
          <div><p className="text-xs text-[var(--mm-muted)]">첫 정기 일정</p><p className="text-[var(--mm-ink)]">{league.start_date}</p></div>
          <div><p className="text-xs text-[var(--mm-muted)]">시즌 구분</p><p className="text-[var(--mm-ink)]">{league.season_type === 'quarterly' ? '분기별 (3개월)' : '연간 (1년)'}</p></div>
        </div>
      </div>

      {/* 드래프트 관리 */}
      <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-[var(--mm-ink)] text-sm">드래프트</h2>
        <p className="text-xs text-[var(--mm-muted)]">단장·감독관 코드 발급, 팀장 지정, 풀 선별, 추첨·세션 진행을 관리합니다.</p>
        <Link
          href={`/admin/leagues/${leagueId}/draft`}
          className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 text-sm font-medium transition-colors cursor-pointer min-h-11"
        >
          <KeyRound size={14} /> 드래프트 관리 열기
        </Link>
      </div>

      {/* 플레이 스타일 라벨 — CEO 미리보기 + 회원 공개 스위치 (2026-10-14) */}
      <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-[var(--mm-ink)] text-sm">플레이 스타일 라벨</h2>
        <p className="text-xs text-[var(--mm-muted)] break-keep">선수 카드의 역할 라벨(스코어러·3점 슈터 등)을 전원 미리 보고, 회원 공개를 켜고 끕니다.</p>
        <Link
          href={`/admin/leagues/${leagueId}/role-labels`}
          className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl border border-[var(--mm-rule)] bg-[var(--mm-panel-alt)] text-[var(--mm-ink)] hover:border-[var(--mm-muted)] text-sm font-medium transition-colors cursor-pointer min-h-11"
        >
          <Tags size={14} /> 라벨 미리보기 열기
        </Link>
      </div>

      {/* 리그 상태 */}
      <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-[var(--mm-ink)] text-sm">리그 상태</h2>
        <div className="flex gap-2">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors cursor-pointer ${
                status === opt.value
                  ? 'border-[var(--mm-yellow-strong)] bg-[var(--mm-yellow-soft)] text-[var(--mm-ink)]'
                  : 'border-[var(--mm-rule)] bg-[var(--mm-panel-alt)] text-[var(--mm-muted)] hover:border-[var(--mm-muted)]'
              }`}
            >
              <span className={status === opt.value ? opt.color : ''}>{opt.label}</span>
            </button>
          ))}
        </div>
        <Button onClick={saveStatus} disabled={saving || status === league.status} className="w-full bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 cursor-pointer">
          {saving ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
          상태 저장
        </Button>
      </div>

      {/* 어드민 권한 관리 — 편집은 어드민 회원(또는 CEO)만 한다 (편집 PIN 은 2026-10-11 폐지) */}
      <LeagueAdminRolePanel leagueId={leagueId} />

    </div>
  )
}
