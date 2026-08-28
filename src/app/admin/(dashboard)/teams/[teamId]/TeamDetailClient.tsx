'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Eye, EyeOff, RefreshCw, Loader2, ExternalLink, Plus, Trophy, Layers, Trash2, Settings, Shield } from 'lucide-react'
import Link from 'next/link'
import { siteUrl } from '@/lib/siteUrl'
import { countLeagueScale } from '@/lib/admin/leagueScale'

interface Team {
  id: string
  org_slug: string
  sub_slug: string
  name: string
  accent_color: string | null
  is_active: boolean
  is_public: boolean
  edit_pin: string
}

// leagues 테이블 select('*') 응답 — types/league.ts 의 League 는 team_id/mode 를 선언하지
// 않는다 (/admin/leagues 페이지도 같은 이유로 로컬 타입을 쓴다).
interface TeamLeague {
  id: string
  name: string
  status: string
  season_year: number
  season_type: string
  start_date: string
  mode: 'league' | 'tournament'
}

interface Props {
  team: Team
  playerCount: number
}

const statusLabel: Record<string, string> = { upcoming: '예정', active: '진행 중', completed: '완료' }
const statusColor: Record<string, string> = {
  upcoming: 'bg-[var(--mm-yellow-soft)] text-[var(--mm-yellow-strong)]',
  active: 'bg-[var(--mm-positive)]/10 text-[var(--mm-positive)]',
  completed: 'bg-[var(--mm-panel-alt)] text-[var(--mm-muted)]',
}

// 회원 화면과 같은 말을 쓴다 — '시즌'/'토너먼트' 같은 어드민 전용 어휘를 새로 만들지 않는다.
const modeMeta: Record<TeamLeague['mode'], { label: string; icon: typeof Trophy; className: string }> = {
  league: { label: '리그', icon: Layers, className: 'bg-[var(--mm-panel-alt)] text-[var(--mm-ink)] border border-[var(--mm-rule)]' },
  tournament: { label: '대회', icon: Trophy, className: 'bg-[var(--mm-yellow-soft)] text-[var(--mm-yellow-strong)] border border-[var(--mm-yellow-strong)]/30' },
}

export default function TeamDetailClient({ team, playerCount }: Props) {
  const router = useRouter()

  // ── 기본 정보 ──────────────────────────────────────
  const [name, setName] = useState(team.name)
  const [savingName, setSavingName] = useState(false)

  async function saveName() {
    if (!name.trim()) { toast.error('팀 이름을 입력하세요'); return }
    setSavingName(true)
    const res = await fetch(`/api/admin/teams/${team.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
    setSavingName(false)
    if (res.ok) { toast.success('저장 완료'); router.refresh() }
    else { const d = await res.json().catch(() => ({})); toast.error(d.error ?? '저장 실패') }
  }

  // ── PIN ────────────────────────────────────────────
  const [pin, setPin] = useState(team.edit_pin ?? '')
  const [pinVisible, setPinVisible] = useState(false)
  const [savingPin, setSavingPin] = useState(false)

  async function savePin() {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) { toast.error('PIN은 숫자 4자리여야 합니다'); return }
    setSavingPin(true)
    const res = await fetch(`/api/admin/teams/${team.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edit_pin: pin }),
    })
    setSavingPin(false)
    if (res.ok) toast.success('PIN 저장 완료')
    else toast.error('저장 실패')
  }

  function reissuePin() {
    if (!confirm('PIN을 재발급하면 기존 PIN은 즉시 무효화됩니다.')) return
    const newPin = String(Math.floor(1000 + Math.random() * 9000))
    setPin(newPin)
    setPinVisible(true)
    toast.message(`새 PIN: ${newPin} — 저장 버튼을 눌러야 반영됩니다`)
  }

  // ── 이 팀의 리그·대회 ───────────────────────────────
  const [leagues, setLeagues] = useState<TeamLeague[]>([])
  const [loadingLeagues, setLoadingLeagues] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadLeagues = useCallback(async () => {
    setLoadingLeagues(true)
    setLoadError(null)
    const res = await fetch(`/api/leagues?team_id=${team.id}`)
    if (res.ok) {
      setLeagues(await res.json())
    } else {
      // 조회 실패를 빈 목록처럼 보여주면 "대회가 하나도 없다"로 오인한다 — 반드시 에러로 표시.
      const d = await res.json().catch(() => ({}))
      setLoadError(d.error ?? '대회 목록을 불러오지 못했습니다')
    }
    setLoadingLeagues(false)
  }, [team.id])

  useEffect(() => { loadLeagues() }, [loadLeagues])

  async function deleteLeague(league: TeamLeague) {
    // 규모를 숫자로 보여준다 — "데이터가 모두 삭제됩니다"는 운영자가 지난 시즌 전체 기록으로
    // 읽지 못한다. 개수를 못 세면 지어내지 말고 못 셌다고 말한다.
    const scale = await countLeagueScale(league.id)
    const scope = scale
      ? `${scale.games}경기와 그 기록, ${scale.teams}개 팀에 배정된 선수 ${scale.players}명의 리그 정보가 삭제됩니다.`
      : '삭제될 규모(경기·팀·선수 수)를 확인하지 못했습니다. 이 리그의 경기와 그 기록이 모두 사라집니다.'
    if (!confirm(`"${league.name}" 리그를 삭제하시겠습니까?\n\n${scope}\n이 작업은 되돌릴 수 없습니다.`)) return
    setDeletingId(league.id)
    const res = await fetch(`/api/leagues/${league.id}`, { method: 'DELETE' })
    setDeletingId(null)
    if (res.ok) { toast.success('삭제되었습니다'); loadLeagues() }
    else { const d = await res.json().catch(() => ({})); toast.error(d.error ?? '삭제 실패') }
  }

  const accentColor = team.accent_color ?? '#3b82f6'

  return (
    <div className="space-y-6 max-w-2xl">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/admin/leagues" className="p-2 -ml-2 text-[var(--mm-muted)] hover:text-[var(--mm-ink)] transition-colors cursor-pointer rounded-lg min-h-11 min-w-11 flex items-center justify-center">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: accentColor }} aria-hidden />
            <h1 className="text-2xl font-bold text-[var(--mm-ink)] truncate">{team.name}</h1>
            {!team.is_public && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--mm-panel-alt)] text-[var(--mm-muted)] border border-[var(--mm-rule)]">
                <Shield size={14} /> 비공개
              </span>
            )}
          </div>
          <span className="text-[var(--mm-muted)] text-sm font-mono">/{team.org_slug}/{team.sub_slug}</span>
        </div>
        <a
          href={`${siteUrl()}/${team.org_slug}/${team.sub_slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-[var(--mm-muted)] hover:text-[var(--mm-ink)] px-2.5 py-1.5 rounded-lg border border-[var(--mm-rule)] hover:border-[var(--mm-muted)] transition-colors cursor-pointer shrink-0 min-h-11"
        >
          <ExternalLink size={14} />
          사이트
        </a>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 gap-3">
        {[['선수', playerCount], ['리그·대회', loadingLeagues ? '—' : leagues.length]].map(([label, val]) => (
          <div key={label} className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-[var(--mm-ink)]">{val}</p>
            <p className="text-xs text-[var(--mm-muted)] mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* 기본 정보 */}
      <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-[var(--mm-ink)]">기본 정보</h2>
        <div>
          <label className="text-xs text-[var(--mm-muted)] mb-1.5 block">팀 이름</label>
          <div className="flex gap-2">
            <Input value={name} onChange={e => setName(e.target.value)} className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]" />
            <Button onClick={saveName} disabled={savingName} className="bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 cursor-pointer shrink-0 min-h-11">
              {savingName ? <Loader2 size={14} className="animate-spin" /> : '저장'}
            </Button>
          </div>
        </div>
      </div>

      {/* 편집 PIN */}
      <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-6 space-y-3">
        <h2 className="font-semibold text-[var(--mm-ink)]">편집 PIN</h2>
        <p className="text-xs text-[var(--mm-muted)]">이 팀의 경기 기록 편집 모드 진입 시 사용하는 PIN입니다</p>
        {/* 375px 에서 입력 + 버튼 3개가 한 줄에 안 들어간다 — 줄바꿈 허용 */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-0 basis-40">
            <Input
              type={pinVisible ? 'text' : 'password'}
              value={pin}
              onChange={e => setPin(e.target.value.slice(0, 4))}
              maxLength={4}
              placeholder="4자리 PIN"
              className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] font-mono text-xl tracking-[0.5em] pr-10"
            />
          </div>
          <button
            onClick={() => setPinVisible(v => !v)}
            aria-label={pinVisible ? 'PIN 숨기기' : 'PIN 보기'}
            className="p-2.5 rounded-lg border border-[var(--mm-rule)] text-[var(--mm-muted)] hover:text-[var(--mm-ink)] hover:border-[var(--mm-muted)] transition-colors cursor-pointer shrink-0 min-h-11 min-w-11 flex items-center justify-center"
          >
            {pinVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            onClick={reissuePin}
            disabled={savingPin}
            title="랜덤 PIN 재발급"
            aria-label="랜덤 PIN 재발급"
            className="p-2.5 rounded-lg border border-[var(--mm-rule)] text-[var(--mm-muted)] hover:text-[var(--mm-ink)] hover:border-[var(--mm-muted)] transition-colors cursor-pointer shrink-0 min-h-11 min-w-11 flex items-center justify-center"
          >
            {savingPin ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
          <Button onClick={savePin} disabled={savingPin} className="bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 shrink-0 cursor-pointer min-h-11">
            저장
          </Button>
        </div>
      </div>

      {/* 리그·대회 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1 flex-wrap gap-2">
          <h2 className="font-semibold text-[var(--mm-ink)]">리그·대회</h2>
          <Link
            href={`/admin/leagues/new?team_id=${team.id}`}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 text-sm font-medium transition-colors cursor-pointer min-h-11"
          >
            <Plus size={16} />
            새 대회 생성
          </Link>
        </div>

        {loadingLeagues ? (
          <div className="flex justify-center py-10">
            <Loader2 size={20} className="animate-spin text-[var(--mm-muted)]" />
          </div>
        ) : loadError ? (
          <div className="text-center py-10 border border-dashed border-[var(--mm-negative)]/40 rounded-xl text-[var(--mm-negative)]">
            <p>{loadError}</p>
            <button onClick={loadLeagues} className="mt-3 text-sm underline underline-offset-2 cursor-pointer">다시 시도</button>
          </div>
        ) : leagues.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-[var(--mm-rule)] rounded-xl text-[var(--mm-muted)] text-sm">
            아직 이 팀의 리그·대회가 없습니다
          </div>
        ) : (
          <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl divide-y divide-[var(--mm-rule)] overflow-hidden">
            {leagues.map(league => {
              const meta = modeMeta[league.mode] ?? modeMeta.league
              const ModeIcon = meta.icon
              // 모바일에서는 정보 줄과 액션 줄을 세로로 쌓는다 — 한 줄이면 버튼 3개가 화면 밖으로 밀린다
              return (
                <div key={league.id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 hover:bg-[var(--mm-panel-alt)] transition-colors">
                  <ModeIcon size={16} className="text-[var(--mm-muted)] shrink-0 hidden sm:block" aria-hidden />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-[var(--mm-ink)]">{league.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.className}`}>{meta.label}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[league.status] ?? 'bg-[var(--mm-panel-alt)] text-[var(--mm-muted)]'}`}>
                        {statusLabel[league.status] ?? league.status}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--mm-muted)] mt-0.5">{league.season_year}시즌 · 시작일 {league.start_date}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Link
                      href={`/admin/leagues/${league.id}`}
                      className="flex items-center gap-1 text-xs text-[var(--mm-yellow-strong)] hover:opacity-80 px-2.5 py-1.5 rounded-lg border border-[var(--mm-yellow-strong)]/30 bg-[var(--mm-yellow-soft)] hover:border-[var(--mm-yellow-strong)]/60 transition-colors cursor-pointer min-h-11"
                    >
                      <Settings size={14} /> 관리
                    </Link>
                    <Link
                      href={`/league/${team.org_slug}/${league.id}`}
                      target="_blank"
                      className="flex items-center gap-1 text-xs text-[var(--mm-muted)] hover:text-[var(--mm-ink)] px-2.5 py-1.5 rounded-lg border border-[var(--mm-rule)] hover:border-[var(--mm-muted)] transition-colors cursor-pointer min-h-11"
                    >
                      <ExternalLink size={14} /> 대시보드
                    </Link>
                    <button
                      onClick={() => deleteLeague(league)}
                      disabled={deletingId === league.id}
                      // 되돌릴 수 없는 유일한 버튼 — 옆의 관리·대시보드와 같은 회색으로 두지 않는다
                      className="p-2.5 rounded-lg border border-[var(--mm-negative)]/30 bg-[var(--mm-negative-bg)] text-[var(--mm-negative)] hover:border-[var(--mm-negative)]/60 hover:opacity-90 transition-colors disabled:opacity-40 cursor-pointer min-h-11 min-w-11 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-negative)]"
                      title="삭제"
                      aria-label={`${league.name} 삭제`}
                    >
                      {deletingId === league.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
