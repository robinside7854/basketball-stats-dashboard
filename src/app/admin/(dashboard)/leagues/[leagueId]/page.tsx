'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, ExternalLink, Eye, EyeOff, RefreshCw, KeyRound } from 'lucide-react'
import Link from 'next/link'
import LeagueAdminRolePanel from '@/components/admin/LeagueAdminRolePanel'
import type { League } from '@/types/league'
import { siteUrl } from '@/lib/siteUrl'
import { countLeagueScale } from '@/lib/admin/leagueScale'

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
  const [pin, setPin] = useState('')
  const [pinVisible, setPinVisible] = useState(false)
  const [pinLoadFailed, setPinLoadFailed] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      // 리그 조회와 PIN 조회를 분리한다 — 공개 GET /api/leagues/[id] 에는 더 이상
      // edit_pin 이 실리지 않는다(전용 GET .../edit-pin). CEO 는 NextAuth 세션(쿠키)이
      // 같은 오리진 fetch 에 자동 동봉되므로 별도 헤더 없이 통과한다.
      const [res, pinRes] = await Promise.all([
        fetch(`/api/leagues/${leagueId}`),
        fetch(`/api/leagues/${leagueId}/edit-pin`),
      ])
      if (res.ok) {
        const data: League = await res.json()
        setLeague(data)
        setStatus(data.status)
      } else {
        router.push('/admin/leagues')
      }
      if (pinRes.ok) {
        const pinData: { edit_pin: string } = await pinRes.json()
        setPin(pinData.edit_pin ?? '')
        setPinLoadFailed(false)
      } else {
        // 실패 시 '0000' 같은 가짜 기본값을 넣지 않는다 — 그대로 저장하면 PIN 이 진짜 0000 으로 바뀐다.
        setPin('')
        setPinLoadFailed(true)
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

  async function savePin() {
    if (!/^\d{4}$/.test(pin)) { toast.error('PIN은 숫자 4자리여야 합니다'); return }
    setSaving(true)
    const res = await fetch(`/api/leagues/${leagueId}/edit-pin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edit_pin: pin }),
    })
    setSaving(false)
    if (res.ok) { toast.success('PIN 저장 완료'); setPinLoadFailed(false) }
    else toast.error('저장 실패')
  }

  function reissuePin() {
    if (!confirm('PIN을 재발급하면 기존 PIN은 즉시 무효화됩니다.')) return
    setPin(String(Math.floor(1000 + Math.random() * 9000)))
    setPinVisible(true)
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
          <ExternalLink size={12} />
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

      {/* 팀 구성·일정·결과 */}
      <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-[var(--mm-ink)] text-sm">팀 구성·일정·결과</h2>
        <p className="text-xs text-[var(--mm-muted)]">참가 팀 구성, 선수 배정, 일정 생성, 경기 결과 입력을 관리합니다.</p>
        <Link
          href={`/admin/leagues/${leagueId}/manage`}
          className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] text-[var(--mm-ink)] hover:border-[var(--mm-muted)] text-sm font-medium transition-colors cursor-pointer min-h-11"
        >
          관리 화면 열기
        </Link>
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

      {/* 어드민 권한 관리 — 편집 권한을 PIN 에서 로그인 회원으로 이관 */}
      <LeagueAdminRolePanel leagueId={leagueId} />

      {/* PIN 관리 */}
      <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-[var(--mm-ink)] text-sm">편집 PIN 관리</h2>
        <p className="text-xs text-[var(--mm-muted)]">
          리그 대시보드에서 편집 모드 진입 시 사용하는 4자리 PIN입니다.
          위 어드민 권한으로 대체 중이며, 어드민 지정이 자리잡으면 제거될 예정입니다.
        </p>
        {/* 375px 에서 입력 + 버튼 3개가 한 줄에 안 들어간다 — 줄바꿈 허용 */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-0 basis-40">
            <Input
              type={pinVisible ? 'text' : 'password'}
              value={pin}
              onChange={e => setPin(e.target.value.slice(0, 4))}
              maxLength={4}
              placeholder={pinLoadFailed ? '조회 실패 — 새 PIN 입력' : '4자리 PIN'}
              className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] font-mono text-xl tracking-[0.5em]"
            />
          </div>
          <button
            onClick={() => setPinVisible(v => !v)}
            aria-label={pinVisible ? 'PIN 숨기기' : 'PIN 보기'}
            className="p-2.5 rounded-lg border border-[var(--mm-rule)] text-[var(--mm-muted)] hover:text-[var(--mm-ink)] transition-colors cursor-pointer shrink-0 min-h-11 min-w-11 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)]"
          >
            {pinVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            onClick={reissuePin}
            title="랜덤 재발급"
            aria-label="랜덤 PIN 재발급"
            className="p-2.5 rounded-lg border border-[var(--mm-rule)] text-[var(--mm-muted)] hover:text-[var(--mm-ink)] transition-colors cursor-pointer shrink-0 min-h-11 min-w-11 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)]"
          >
            <RefreshCw size={14} />
          </button>
          <Button onClick={savePin} disabled={saving} className="bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 cursor-pointer shrink-0 min-h-11">
            저장
          </Button>
        </div>
        {pinLoadFailed && (
          <p className="text-xs text-[var(--mm-negative)]">현재 PIN을 불러오지 못했습니다. 확인이 필요하면 다시 시도하거나, 새 PIN을 입력해 재발급하세요.</p>
        )}
      </div>

      {/* 일정 생성 */}
      <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-[var(--mm-ink)] text-sm">일정 관리</h2>
        <p className="text-xs text-[var(--mm-muted)]">리그 팀 구성 완료 후 일정을 자동 생성합니다. 기존 일정과 그 경기의 기록이 함께 삭제되므로, 기록이 있는 리그에서는 서버가 거절합니다.</p>
        <Button
          onClick={async () => {
            // "일정이 삭제됩니다"는 운영자가 '설정 몇 줄'로 읽는다 — 실제로 사라질 경기 수를 세어 보여준다.
            const scale = await countLeagueScale(leagueId)
            const scope = scale
              ? `현재 등록된 ${scale.games}경기와 그 경기의 기록(이벤트)이 모두 삭제되고 새 일정이 만들어집니다.`
              : '삭제될 경기 수를 확인하지 못했습니다. 기존 일정과 그 경기의 기록(이벤트)이 모두 사라집니다.'
            if (!confirm(`${scope}\n이 작업은 되돌릴 수 없습니다.\n계속하시겠습니까?`)) return
            const res = await fetch(`/api/leagues/${leagueId}/schedule`, { method: 'POST' })
            const d = await res.json().catch(() => ({}))
            if (res.ok) {
              toast.success(`일정 ${d.count}개 생성 완료`)
            } else {
              toast.error(d.error ?? '생성 실패')
            }
          }}
          variant="outline"
          // 이 버튼은 '생성'이라는 이름과 달리 기존 경기·기록을 먼저 지운다 — 파괴 액션 색으로 분리한다
          className="w-full border-[var(--mm-negative)]/40 bg-[var(--mm-negative-bg)] text-[var(--mm-negative)] hover:border-[var(--mm-negative)]/70 hover:bg-[var(--mm-negative-bg)] hover:text-[var(--mm-negative)] cursor-pointer min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--mm-negative)]"
        >
          일정 자동 생성 (기존 기록 삭제)
        </Button>
      </div>
    </div>
  )
}
