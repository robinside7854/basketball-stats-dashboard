'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { siteHost } from '@/lib/siteUrl'

// 리그는 조직이 아니라 **팀**에 매달린다(leagues.team_id NOT NULL). 이 화면이 team_id 를
// 안 보내서 API 가 오랫동안 501 이었다 — 어느 팀의 시즌인지 알 수 없었기 때문이다.
// 팀 대시보드에서 넘어오면 ?team_id= 로 이미 정해져 오고, 메뉴에서 바로 들어오면 고른다.
interface AdminTeam {
  id: string
  name: string
  org_slug: string
  sub_slug: string | null
}

export default function NewLeaguePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [pin, setPin] = useState('')
  const [pinVisible, setPinVisible] = useState(false)
  const [loading, setLoading] = useState(false)

  const [teams, setTeams] = useState<AdminTeam[]>([])
  const [teamId, setTeamId] = useState(searchParams.get('team_id') ?? '')
  const [teamsLoading, setTeamsLoading] = useState(true)
  const [teamsError, setTeamsError] = useState<string | null>(null)

  const loadTeams = useCallback(async () => {
    setTeamsLoading(true)
    setTeamsError(null)
    const res = await fetch('/api/admin/teams').catch(() => null)
    if (res?.ok) {
      setTeams(await res.json())
    } else {
      // 조회 실패를 빈 목록으로 두면 "팀이 하나도 없다"로 오인한다 — 반드시 에러로 표시.
      const d = res ? await res.json().catch(() => ({})) : {}
      setTeamsError(d.error ?? '팀 목록을 불러오지 못했습니다')
      setTeams([])
    }
    setTeamsLoading(false)
  }, [])

  useEffect(() => { loadTeams() }, [loadTeams])

  function handleNameChange(v: string) {
    setName(v)
    const auto = v.toLowerCase()
      .replace(/[가-힣]/g, c => {
        // 간단한 음역: 한글은 그냥 제거하고 영문/숫자만 유지
        return ''
      })
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    setSlug(auto || '')
  }

  function randomPin() {
    setPin(String(Math.floor(1000 + Math.random() * 9000)))
    setPinVisible(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!teamId) { toast.error('어느 팀의 리그인지 선택하세요'); return }
    if (!name.trim()) { toast.error('리그 이름을 입력하세요'); return }
    if (!slug.trim()) { toast.error('슬러그 URL을 입력하세요'); return }
    if (!/^\d{4}$/.test(pin)) { toast.error('PIN은 숫자 4자리여야 합니다'); return }

    setLoading(true)
    const res = await fetch('/api/leagues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_id: teamId, name: name.trim(), slug: slug.trim(), edit_pin: pin }),
    })
    setLoading(false)

    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? '생성 실패')
      return
    }
    toast.success('리그가 생성되었습니다')
    router.push('/admin/leagues')
  }

  return (
    <div className="max-w-md space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/leagues" className="text-[var(--mm-muted)] hover:text-[var(--mm-ink)] transition-colors cursor-pointer">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-[var(--mm-ink)]">새 리그 생성</h1>
          <p className="text-[var(--mm-muted)] text-sm">생성 후 리그 대시보드에서 상세 설정을 진행합니다</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-6 space-y-5">

        {/* 소속 팀 — 리그가 매달리는 단위 */}
        <div className="space-y-1.5">
          <label htmlFor="league-team" className="text-xs text-[var(--mm-muted)] font-medium">소속 팀 *</label>
          {teamsLoading ? (
            <div className="flex items-center gap-2 text-xs text-[var(--mm-muted)] py-2">
              <Loader2 size={14} className="animate-spin" /> 팀 목록 불러오는 중
            </div>
          ) : teamsError ? (
            <div role="alert" className="text-xs text-[var(--mm-negative)] border border-dashed border-[var(--mm-negative)]/40 rounded-lg p-3">
              <p>{teamsError}</p>
              <button type="button" onClick={loadTeams} className="mt-2 underline underline-offset-2 cursor-pointer">
                다시 시도
              </button>
            </div>
          ) : (
            <select
              id="league-team"
              value={teamId}
              onChange={e => setTeamId(e.target.value)}
              className="w-full min-h-11 rounded-lg bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] text-[var(--mm-ink)] px-3 text-sm cursor-pointer"
            >
              <option value="">팀을 선택하세요</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.sub_slug && t.sub_slug !== 'main' ? ` (${t.sub_slug})` : ''}
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-[var(--mm-muted)]">공개 주소가 이 팀 기준으로 만들어집니다</p>
        </div>

        {/* 리그 이름 */}
        <div className="space-y-1.5">
          <label className="text-xs text-[var(--mm-muted)] font-medium">리그 이름 *</label>
          <Input
            value={name}
            onChange={e => handleNameChange(e.target.value)}
            placeholder="예) 미라클모닝 2026 봄리그"
            className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]"
            autoFocus
          />
        </div>

        {/* 슬러그 */}
        <div className="space-y-1.5">
          <label className="text-xs text-[var(--mm-muted)] font-medium">공개 URL 슬러그 *</label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--mm-muted)] shrink-0 font-mono">/league/</span>
            <Input
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="miracle-morning"
              className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] font-mono"
            />
          </div>
          {slug && (
            <p className="text-xs text-[var(--mm-muted)] font-mono">
              {siteHost()}/league/{slug}
            </p>
          )}
        </div>

        {/* PIN */}
        <div className="space-y-1.5">
          <label className="text-xs text-[var(--mm-muted)] font-medium">편집 PIN *</label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                type={pinVisible ? 'text' : 'password'}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4자리 숫자"
                maxLength={4}
                className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] font-mono text-xl tracking-[0.5em] pr-10"
              />
            </div>
            <button
              type="button"
              onClick={() => setPinVisible(v => !v)}
              className="p-2.5 rounded-lg border border-[var(--mm-rule)] text-[var(--mm-muted)] hover:text-[var(--mm-ink)] transition-colors cursor-pointer shrink-0"
            >
              {pinVisible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button
              type="button"
              onClick={randomPin}
              className="px-3 py-2 rounded-lg border border-[var(--mm-rule)] text-[var(--mm-muted)] hover:text-[var(--mm-ink)] text-xs transition-colors cursor-pointer shrink-0"
            >
              랜덤
            </button>
          </div>
          <p className="text-xs text-[var(--mm-muted)]">리그 대시보드의 편집 모드 진입 시 사용합니다</p>
        </div>

        <Button type="submit" disabled={loading} className="w-full bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 cursor-pointer mt-2">
          {loading ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
          리그 생성 및 대시보드 열기
        </Button>
      </form>
    </div>
  )
}
