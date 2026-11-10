'use client'
import { useOpenPlayerCard } from '@/contexts/PlayerCardContext'
import PlayerName from '@/components/league/ui/PlayerName'
// 「나」(/me) 개인 화면 — **나에게만 있는 것만** (2026-10-15 정리)
//
// 숫자(하루 평균·순위·야투율·트렌드·진행 중 연속 기록)는 선수 카드가 정본이다. 종전엔 여기서도 같은 숫자를
//   다른 자격 규칙으로 따로 보여 줘 카드와 갈렸다(「선수 숫자는 한 벌」) → 그 블록들을 걷어내고
//   맨 위에 「내 선수 카드 열기」 하나를 크게 둔다(지금 분기로 열린다).
// 배치 (모바일 한 줄 · PC ≥lg 두 칸)
//   왼쪽: 프로필 머리 · 마지막 출전(친선일 포함) · 「내 선수 카드 열기」
//   계정(아이디 · 비밀번호 변경 · 앱 설치 · 로그아웃)은 페이지 아래 AccountCard 하나로 모았다(2026-10-17).
//   오른쪽: 내 베스트샷(+ 최근 하이라이트) — 출석률 카드는 2026-11-10 운영진 결정으로 뺐다(AttendanceCard 는 남김)
//   숫자는 전부 auth/dashboard 하나가 준다(친선 제외 — 화면에서 다시 계산하지 않는다).
//   ⚠ 평균·연속 단위는 「하루」다 — 「경기당」·「라운드」라 쓰지 말 것.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  Film, User as UserIcon, ChevronRight, IdCard, Flame, X, KeyRound,
  CalendarCheck, Pin, Play, AlertCircle, LogOut,
} from 'lucide-react'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'
import { useLeagueQuarter } from '@/contexts/LeagueQuarterContext'
import SectionCard from '@/components/league/ui/SectionCard'
import Avatar from '@/components/league/ui/Avatar'
import Chip from '@/components/league/ui/Chip'
import EmptyState from '@/components/league/ui/EmptyState'
import { DashboardCardsSkeleton } from './MePageSkeleton'
import { HomeMeProvider } from '@/components/league/home/HomeMeContext'
import MyLastDay from '@/components/league/home/MyLastDay'
import InstallAppButton from '@/components/InstallAppButton'
import LastPlayedLine from '@/components/league/ui/LastPlayedLine'
import { shouldShowLastPlayed, type LastPlayedData } from '@/lib/format/lastPlayed'
import { Ring } from '@/components/league/ui/viz'
import { SHOT_TYPE_LABEL } from '@/lib/highlights/clip'
import type { HighlightClip } from '@/lib/highlights/types'
// (폭죽 Confetti 는 마일스톤 체이서와 함께 2026-11-02 뺐다 — 컴포넌트 파일은 남아 있다)

// 비밀번호 변경 모달 · 클릭 시에만 로드
const PasswordChangeModal = dynamic(() => import('./PasswordChangeModal'), { ssr: false })
// 베스트샷 재생기 · 클릭 시에만 로드
const HighlightsClipModal = dynamic(() => import('@/components/highlights/HighlightsClipModal'), { ssr: false })

interface Weekly { available: boolean; date?: string }
interface Chaser {
  metric: 'pts' | 'reb' | 'ast' | 'stl' | 'blk'
  metricLabel: string
  current: number
  nextThreshold: number
  remaining: number
  progressPct: number
}
interface AttendancePeriod {
  attended: number
  /** 리그가 연 날 전체 */
  total: number
  /** 그중 내 첫 기록일 이후 — 출석 분모 */
  since_join?: number
  /** 내 첫 기록일부터의 경기일 */
  days?: Array<{ date: string; played: boolean }>
}
interface AttendanceData {
  joined_on?: string | null
  quarter: AttendancePeriod
  season: AttendancePeriod
  /** 분기마다(오래된 → 최근, 2026-11-03) — 옛 응답엔 없다 */
  quarters?: Array<AttendancePeriod & { id: string; label: string; is_current: boolean }>
  current_streak: number
  longest_streak: number
}
interface DashboardData {
  /** 「26.4Q」 — 분기가 없으면 null */
  quarter_label?: string | null
  weekly: Weekly
  milestoneChasers: Chaser[]
  attendance?: AttendanceData
  pinned_clips?: HighlightClip[]
  /** 마지막 출전(친선일 포함) — null = 출전 기록 없음 · undefined = 옛 응답 */
  last_played?: LastPlayedData | null
}

interface Props {
  leagueId: string
  orgSlug: string
  /** 브라우저 경로 기준 리그 base(`/league/<org>/<slug>`) — 없으면 UUID 경로로 만든다 */
  base?: string
  /** PC(lg↑)에서 왼쪽 칸 프로필 아래에 붙일 카드(월렛·바로가기·계정). 폰에서는 그리지 않는다. */
  side?: ReactNode
  /** 왼쪽 칸 맨 위(폰은 맨 위) — 월렛·드래프트 바로가기. 칸 폭에 맞춰 다른 박스와 끝선이 같다(2026-11-10 운영진) */
  top?: ReactNode
}

export default function PersonalDashboard({ leagueId, orgSlug, base, side, top }: Props) {
  const { user, loading: authLoading } = useCurrentUser()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  // 내 선수 카드 — 레이아웃의 전역 카드 하나로 연다(2026-10-14, contexts/PlayerCardContext). 지금 분기로 연다.
  const openPlayerCard = useOpenPlayerCard()
  const { currentQuarter } = useLeagueQuarter()
  // #1 비로그인 로그인 티저 — 30일 억제. 초기 true(플래시 방지) → 마운트 후 판정.
  const [teaserDismissed, setTeaserDismissed] = useState(true)
  useEffect(() => {
    try {
      const ts = localStorage.getItem('mm_login_teaser_dismissed')
      setTeaserDismissed(ts ? Date.now() - Number(ts) < 30 * 24 * 3600 * 1000 : false)
    } catch { /* 무시 */ }
  }, [])

  // 2026-10-27 속도: 종전엔 /auth/me 응답(로그인 확인)을 기다린 뒤에야 대시보드를 요청해 두 번을 줄줄이 기다렸다.
  //   서버가 쿠키로 다시 확인하므로 로그인 확인과 같이 출발시킨다. 비회원이면 401 — 조용히 넘긴다(화면은 티저).
  //   로그인 확인이 끝나며 user 가 생겨도 다시 받지 않는다 — 다만 401 을 받은 뒤 로그인했으면(로그인 창) 그때 다시 받는다.
  const unauthorizedRef = useRef(false)
  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/auth/dashboard`, { cache: 'no-store' })
      if (r.status === 401 || r.status === 403) { unauthorizedRef.current = true; setData(null); return }
      unauthorizedRef.current = false
      if (!r.ok) throw new Error(String(r.status))
      setData(await r.json())
    } catch {
      // 실패하면 「불러오는 중」에 멈추지 않고 다시 시도할 수 있게 알린다
      setError(true)
    } finally { setLoading(false) }
  }, [leagueId])

  useEffect(() => { load() }, [load])
  const userId = user?.id ?? null
  useEffect(() => {
    if (userId && unauthorizedRef.current) load()
  }, [userId, load])

  if (authLoading) return null
  if (!user) {
    if (teaserDismissed) return null
    return (
      <LoginTeaser
        onDismiss={() => {
          try { localStorage.setItem('mm_login_teaser_dismissed', String(Date.now())) } catch { /* 무시 */ }
          setTeaserDismissed(true)
        }}
      />
    )
  }

  const leagueBase = base ?? `/league/${orgSlug}/${leagueId}`
  // 옛 주소(/highlights/player/{id})는 redirect 한 번을 더 거친다 — 지금 주소로 바로
  const myHighlightsHref = `${leagueBase}/highlights?player=${user.player_id}`
  // 최근 하이라이트 = 내가 마지막으로 뛴 날의 박스스코어 — `?hl=mine` 이면 그 화면이 「내 기록」 하이라이트 재생기를 바로 연다
  const highlightsHref = data?.weekly.available && data.weekly.date
    ? `${leagueBase}/boxscore/${data.weekly.date}?hl=mine`
    : null
  const ready = !loading && !!data
  const myName = user.name ?? user.login_id
  const openMyCard = () => openPlayerCard?.({ playerId: user.player_id, playerName: myName, quarterId: currentQuarter?.id ?? null })

  return (
    <>
      <div className="grid gap-3 lg:gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
        {/* ── 왼쪽: 나 + (PC) 월렛·바로가기·계정 ──
            2026-11-09 운영진: PC 에서 월렛·계정이 맨 아래라 스크롤해야 보였다 → 왼쪽 칸 프로필 아래로 올렸다(side).
            폰은 그대로 맨 아래(MePageClient 가 lg:hidden 으로 한 번 더 그린다).
            칸이 길어져 화면보다 커질 수 있어 따라오기(sticky)는 뺐다 — 아래쪽이 영영 안 보일 수 있다. */}
        <div className="min-w-0 space-y-3 lg:space-y-4">
          {top}
          <SectionCard variant="standalone" emphasized pad="none">
            {/* 헤더 · 유저 프로필 */}
            <header className="flex items-center gap-3 md:gap-4 px-4 md:px-5 py-3 md:py-4" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
              <Avatar src={user.photo_url} name={myName} size={56} decorative priority />
              <div className="flex-1 min-w-0">
                <PlayerName
                  id={user.player_id}
                  name={myName}
                  hitArea={false}
                  className="font-jersey font-black text-xl md:text-2xl truncate max-w-full"
                  style={{ color: 'var(--mm-ink)', letterSpacing: '-0.01em' }}
                />
                {/* 「나의 기록」은 페이지 제목(내 기록)과 겹쳐 뺐다 — 등번호만 남긴다 */}
                {user.number != null && (
                  <div className="text-xs md:text-sm font-medium mt-0.5 tabular-nums" style={{ color: 'var(--mm-muted)' }}>
                    #{user.number}
                  </div>
                )}
              </div>
            </header>

            {/* 내가 마지막으로 뛴 날 (2026-10-26 점검 MVP 1) — 「내 기록」 첫 화면에 숫자가 하나도 없었다.
                홈과 같은 카드(MyLastDay) · 같은 계산(그날 박스스코어 한 번). */}
            {ready && data.last_played?.date && (
              <div className="px-3 sm:px-4 pt-3">
                <HomeMeProvider leagueId={leagueId} latestDate={data.last_played.date} serverMember>
                  <MyLastDay base={leagueBase} />
                </HomeMeProvider>
              </div>
            )}

            {/* 마지막 출전 + 그 뒤 결장 경기일 (2026-10-14) — 친선일 포함 · 출석 지표.
                (2026-10-16) 최근 28일 안에 출전이 없을 때만 보인다 — 선수 카드와 같은 기준(shouldShowLastPlayed). */}
            {ready && shouldShowLastPlayed(data.last_played) && (
              <LastPlayedLine lastPlayed={data.last_played} className="px-4 sm:px-5 pt-3" />
            )}

            {/* 내 숫자는 전부 선수 카드에 — 하루 평균·순위·야투율·트렌드·연속 기록(스탯 탭과 같은 한 벌) */}
            <div className="px-4 sm:px-5 py-3 sm:py-4">
              <button
                type="button"
                onClick={openMyCard}
                disabled={!openPlayerCard}
                className="mm-press w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-base font-black min-h-[52px] cursor-pointer transition-[filter] hover:brightness-95 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
                style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', borderRadius: 'var(--mm-radius-chip)' }}
              >
                <IdCard size={20} aria-hidden />
                내 선수 카드 열기
              </button>
              <p className="text-xs font-medium mt-2 text-center break-keep" style={{ color: 'var(--mm-muted)' }}>
                하루 평균 · 순위 · 슛 · 연속 기록 — {currentQuarter ? `${String(currentQuarter.year).slice(2)}.${currentQuarter.quarter}Q 기준으로 열려요` : '전체 기간으로 열려요'}
              </p>
            </div>

          </SectionCard>
          {side && <div className="hidden lg:block space-y-3 lg:space-y-4">{side}</div>}
        </div>

        {/* ── 오른쪽: 나에게만 있는 것 ── */}
        {error && !loading ? (
          <SectionCard variant="standalone" pad="none">
            <EmptyState
              variant="compact"
              icon={AlertCircle}
              title="기록을 불러오지 못했어요"
              description="잠시 뒤 다시 시도해 주세요."
              action={
                <button
                  type="button"
                  onClick={() => { load() }}
                  className="mm-press inline-flex items-center justify-center min-h-11 px-4 text-sm font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                  style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}
                >
                  다시 시도
                </button>
              }
            />
          </SectionCard>
        ) : !ready ? (
          <DashboardCardsSkeleton />
        ) : (
          <div className="min-w-0 space-y-3 lg:space-y-4">
            {/* 출석률 카드는 2026-11-10 운영진 결정으로 뺐다 — 베스트샷이 오른쪽 칸 맨 위 */}
            <BestShotsCard
              clips={data.pinned_clips ?? []}
              playerName={myName}
              allHref={myHighlightsHref}
              weekly={data.weekly}
              recentHref={highlightsHref}
            />
            {/* 마일스톤 체이서는 2026-11-02 운영진 결정으로 뺐다(R6) */}
          </div>
        )}
      </div>
    </>
  )
}

// ─── 계정 ─────────────────────────────────────────────────────
// 아이디 · 비밀번호 변경 · 앱 설치 · 로그아웃을 한 카드에 모은다(2026-10-17 — 종전엔 프로필 카드 아래와
//   페이지 맨 아래 두 곳으로 갈라져 있었다). 비로그인이면 앱 설치만 남는다.
//   「초기 비번」 칩이 경고 신호다 — 버튼까지 노랗게 칠하면 「내 선수 카드 열기」와 노랑이 겹쳐 둘 다 약해진다.
const NEUTRAL_BTN =
  'mm-press inline-flex items-center gap-1.5 min-h-[44px] px-3.5 border text-sm font-bold cursor-pointer transition-colors hover:border-[color:var(--mm-ink-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]'

export function AccountCard({ leagueId, className = '' }: { leagueId: string; className?: string }) {
  const { user, refresh, logout } = useCurrentUser()
  const [pwOpen, setPwOpen] = useState(false)
  return (
    <SectionCard variant="standalone" pad="none" className={className}>
      {user && (
        <div className="px-4 md:px-5 pt-4">
          <CardTitle icon={UserIcon} title="계정" />
          <div className="flex items-center gap-2 min-w-0 text-sm" style={{ color: 'var(--mm-muted)' }}>
            <span className="truncate">아이디 <b style={{ color: 'var(--mm-ink-soft)' }}>{user.login_id}</b></span>
            {user.is_default_password && (
              <span
                className="shrink-0 inline-flex items-center text-xs font-black px-1.5 py-0.5"
                style={{ background: 'var(--mm-yellow-soft)', color: 'var(--mm-ink)', border: '1px solid var(--mm-yellow-strong)', borderRadius: 'var(--mm-radius-chip)' }}
              >
                초기 비번
              </span>
            )}
          </div>
          {user.is_default_password && (
            <p className="text-xs font-medium mt-1 break-keep" style={{ color: 'var(--mm-ink-soft)' }}>
              처음 받은 비밀번호 그대로예요. 바꿔 두면 안전해요.
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 px-4 md:px-5 py-4">
        {user && (
          <button
            type="button"
            onClick={() => setPwOpen(true)}
            className={NEUTRAL_BTN}
            style={{ borderColor: 'var(--mm-rule)', color: 'var(--mm-ink)', background: 'var(--mm-panel)', borderRadius: 'var(--mm-radius-ctl)' }}
          >
            <KeyRound size={16} aria-hidden />
            비밀번호 변경
          </button>
        )}
        {/* 앱 설치 — 설치 불가·이미 설치됨이면 스스로 아무것도 렌더하지 않는다 */}
        <InstallAppButton />
        {user && (
          <button
            type="button"
            onClick={() => logout()}
            className={`${NEUTRAL_BTN} sm:ml-auto`}
            style={{ borderColor: 'var(--mm-rule)', color: 'var(--mm-muted)', borderRadius: 'var(--mm-radius-ctl)' }}
          >
            <LogOut size={16} aria-hidden />
            로그아웃
          </button>
        )}
      </div>

      {pwOpen && user && (
        <PasswordChangeModal
          leagueId={leagueId}
          isDefaultPassword={user.is_default_password}
          onClose={() => setPwOpen(false)}
          onDone={() => { refresh() }}
        />
      )}
    </SectionCard>
  )
}

// 카드 머리 — 아이콘 + 제목 + (보조 글) + (오른쪽 칩)
function CardTitle({ icon: Icon, title, sub, right }: {
  icon: LucideIcon; title: string; sub?: string; right?: ReactNode
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap mb-3">
      <Icon size={16} aria-hidden style={{ color: 'var(--mm-ink-soft)' }} />
      <h3 className="font-black text-base md:text-lg" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>{title}</h3>
      {sub && <span className="text-xs font-medium ml-1 break-keep" style={{ color: 'var(--mm-muted)' }}>{sub}</span>}
      {right && <span className="ml-auto">{right}</span>}
    </div>
  )
}

// ─── 출석률 ───────────────────────────────────────────────────
// 내가 뛴 날 / 리그가 열린 날(정규 경기일 · 친선 제외). 경기일마다 칸 하나.
//   분모는 내 첫 기록일부터 센다(2026-10-12) — 중간에 들어온 회원이 들어오기 전 경기일을 결장으로 잡히지 않게.
//   날짜 칸도 첫 기록일부터만 그린다.
//   (2026-11-03 운영진) 「전체 · 분기마다」 칩으로 골라 본다 — 기본은 지금 분기(열린 날이 없으면 전체).
//   고른 기간을 크게, 아래 한 줄에 비교용으로 전체(분기를 골랐을 때) 또는 지금 분기(전체를 골랐을 때).
type PeriodKey = 'all' | string
function AttendanceCard({ attendance }: {
  attendance?: AttendanceData; quarterLabel?: string | null
}) {
  const pct = (a: number, t: number) => (t > 0 ? Math.round((a / t) * 100) : 0)
  const denom = (x: AttendancePeriod) => x.since_join ?? x.total
  // 옛 응답(quarters 없음)이면 지금 분기 하나만 있는 것으로 본다
  const quarters = attendance?.quarters
    ?? (attendance && attendance.quarter.total > 0 ? [{ ...attendance.quarter, id: 'current', label: '이번 분기', is_current: true }] : [])
  const currentQ = quarters.find(x => x.is_current) ?? null
  const [picked, setPicked] = useState<PeriodKey | null>(null)
  const key: PeriodKey = picked ?? (currentQ ? currentQ.id : 'all')
  const pickedQ = key === 'all' ? null : quarters.find(x => x.id === key) ?? null
  const cur: AttendancePeriod | null = attendance ? (pickedQ ?? attendance.season) : null
  const periodName = pickedQ ? (pickedQ.is_current ? `이번 분기(${pickedQ.label})` : pickedQ.label) : '전체'
  // 비교 한 줄 — 분기를 보면 전체, 전체를 보면 지금 분기
  const other = attendance ? (pickedQ ? { name: '전체', p: attendance.season } : currentQ ? { name: '이번 분기', p: currentQ as AttendancePeriod } : null) : null
  const joinedOn = attendance?.joined_on ?? null
  const joinedMid = !!cur && !!joinedOn && denom(cur) < cur.total
  const days = cur?.days ?? []
  return (
    <SectionCard variant="standalone">
      <CardTitle
        icon={CalendarCheck}
        title="출석률"
        sub="내가 뛴 날 / 리그가 열린 날"
      />
      {!attendance || !cur || attendance.season.total === 0 ? (
        <EmptyState variant="compact" icon={CalendarCheck} title="아직 열린 경기일이 없어요" />
      ) : (
        <>
          {/* 기간 고르기 — 전체 + 분기마다(줄바꿈, 가로 스크롤 없음) */}
          {quarters.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="출석률 기간">
              {[{ id: 'all', label: '전체' }, ...quarters.map(x => ({ id: x.id, label: x.label }))].map(o => (
                <Chip key={o.id} as="button" size="sm" selected={key === o.id} onClick={() => setPicked(o.id)}>{o.label}</Chip>
              ))}
            </div>
          )}
          <div className="flex items-center gap-4">
            <Ring
              ratio={denom(cur) > 0 ? cur.attended / denom(cur) : 0}
              size={76}
              stroke={8}
              label={`${periodName} 출석률 ${pct(cur.attended, denom(cur))}%`}
            >
              <span className="text-sm">{pct(cur.attended, denom(cur))}%</span>
            </Ring>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-sm md:text-base font-bold tabular-nums break-keep" style={{ color: 'var(--mm-ink)' }}>
                {periodName} {denom(cur)}일 중 <b className="font-black">{cur.attended}</b>일
              </div>
              {joinedMid && joinedOn && (
                <div className="text-xs font-medium tabular-nums break-keep" style={{ color: 'var(--mm-ink-soft)' }}>
                  첫 기록 {formatDate(joinedOn)}부터 셌어요 · 그 전 {cur.total - denom(cur)}일은 빼요
                </div>
              )}
              {other && other.p.total > 0 && (
                <div className="text-xs font-medium tabular-nums break-keep" style={{ color: 'var(--mm-muted)' }}>
                  {other.name} {other.p.attended} / {denom(other.p)}일 · {pct(other.p.attended, denom(other.p))}%
                </div>
              )}
              {(attendance.current_streak >= 2 || attendance.longest_streak >= 2) && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {attendance.current_streak >= 2 && (
                    <Chip tone="accent" icon={Flame}>{attendance.current_streak}일 연속 출석</Chip>
                  )}
                  {attendance.longest_streak >= 2 && (
                    <Chip tone="neutral">최장 {attendance.longest_streak}일</Chip>
                  )}
                </div>
              )}
            </div>
          </div>
          {days.length > 0 && (
            <div className="mt-4">
              <ul className="flex flex-wrap gap-1.5" aria-label={`${periodName} 경기일별 출전${joinedMid ? ' (내 첫 기록일부터)' : ''}`}>
                {days.map(d => (
                  <li
                    key={d.date}
                    title={`${formatDate(d.date)} · ${d.played ? '출전' : '결장'}`}
                    aria-label={`${formatDate(d.date)} ${d.played ? '출전' : '결장'}`}
                    className="w-4 h-4 sm:w-[18px] sm:h-[18px]"
                    style={{
                      borderRadius: 4,
                      background: d.played ? 'var(--mm-yellow-strong)' : 'transparent',
                      border: d.played ? '1px solid var(--mm-yellow-strong)' : '1.5px solid var(--mm-rule)',
                    }}
                  />
                ))}
              </ul>
              <div className="flex items-center gap-3 mt-2 text-[11px] font-medium" style={{ color: 'var(--mm-muted)' }}>
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden className="inline-block w-2.5 h-2.5" style={{ borderRadius: 2, background: 'var(--mm-yellow-strong)' }} />출전
                </span>
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden className="inline-block w-2.5 h-2.5" style={{ borderRadius: 2, border: '1.5px solid var(--mm-rule)' }} />결장
                </span>
                <span className="ml-auto break-keep text-right">{joinedMid ? '첫 기록 날부터 → 최근' : '오래된 날 → 최근'}</span>
              </div>
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}

// ─── 내 베스트샷 ───────────────────────────────────────────────
// 핀 고정한 클립(개수 제한 없음 — 2026-11-02, 종전 최대 3). 고르는 곳은 내 하이라이트 화면의 핀 버튼이다.
function BestShotsCard({ clips, playerName, allHref, weekly, recentHref }: {
  clips: HighlightClip[]; playerName: string; allHref: string; weekly: Weekly; recentHref: string | null
}) {
  const [openAt, setOpenAt] = useState<number | null>(null)
  return (
    <SectionCard variant="standalone" pad="none">
      <div className="px-4 pt-4 lg:px-6 lg:pt-5">
        <CardTitle
          icon={Pin}
          title="내 베스트샷"
          sub={clips.length > 0 ? `${clips.length}개` : undefined}
          right={
            <Link
              href={allHref}
              className="mm-press inline-flex items-center gap-0.5 min-h-[36px] text-xs font-bold cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
              style={{ color: 'var(--mm-ink-soft)', borderRadius: 'var(--mm-radius-ctl)' }}
            >
              전체 하이라이트 <ChevronRight size={14} aria-hidden />
            </Link>
          }
        />
      </div>
      <div className="px-4 pb-4 lg:px-6 lg:pb-5">
        {clips.length === 0 ? (
          <EmptyState
            variant="compact"
            framed
            icon={Pin}
            title="아직 고른 베스트샷이 없어요"
            description="내 하이라이트에서 마음에 드는 슛을 핀으로 고정하면 여기 모여요"
          />
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            {clips.map((c, i) => (
              <li key={c.event_id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setOpenAt(i)}
                  className="group block w-full text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                  style={{ borderRadius: 'var(--mm-radius-chip)' }}
                  aria-label={`베스트샷 ${i + 1} 재생 — ${SHOT_TYPE_LABEL[c.shot_type] ?? c.shot_type}${c.game_date ? ` · ${formatDate(c.game_date)}` : ''}`}
                >
                  <span
                    className="relative block w-full aspect-video overflow-hidden"
                    style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-chip)', border: '1px solid var(--mm-rule)' }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- YouTube 썸네일(옵티마이저 허용 호스트 아님) · 다른 하이라이트 화면과 같은 방식 */}
                    <img
                      src={`https://i.ytimg.com/vi/${c.video_id}/mqdefault.jpg`}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                    />
                    <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full" style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)' }}>
                        <Play size={14} fill="currentColor" />
                      </span>
                    </span>
                    <span
                      className="absolute top-1 left-1 text-[11px] font-black tabular-nums px-1.5 leading-[18px]"
                      style={{ background: 'var(--mm-black)', color: 'var(--mm-yellow)', borderRadius: 3 }}
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                  </span>
                  <span className="block mt-1.5 text-xs sm:text-sm font-bold truncate" style={{ color: 'var(--mm-ink)' }}>
                    {SHOT_TYPE_LABEL[c.shot_type] ?? c.shot_type}{c.points ? ` · ${c.points}점` : ''}
                  </span>
                  {c.game_date && (
                    <span className="block text-[11px] font-bold truncate tabular-nums" style={{ color: 'var(--mm-muted)' }}>
                      {formatDate(c.game_date)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* 최근 하이라이트 — 내가 마지막으로 뛴 날 박스스코어 → 「내 기록」 하이라이트 재생기(?hl=mine) */}
      <HighlightCTA available={weekly.available} href={recentHref} date={weekly.date} />

      {openAt != null && clips.length > 0 && (
        <HighlightsClipModal
          clips={clips}
          startIdx={openAt}
          title={`${playerName} 베스트샷`}
          icon={<Pin size={16} aria-hidden />}
          onClose={() => setOpenAt(null)}
          ariaLabel={`${playerName} 베스트샷 재생`}
        />
      )}
    </SectionCard>
  )
}

// onDismiss 없이 쓰면(예: /me 전용 진입점, Task 4-A) 닫기 버튼 없이 항상 노출된다 —
// 홈 위젯의 30일 억제 로직과 분리된, 이 페이지 자체가 목적지인 경우용.
export function LoginTeaser({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <SectionCard variant="standalone" emphasized pad="none">
      <div className="relative flex items-center gap-4 px-4 md:px-5 py-4 md:py-5">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg md:text-xl" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>내 기록, 여기 다 있어요</div>
          {/* 폰에서 「출석/률」처럼 단어 중간에서 꺾였고, 두 문장이 「확인하세요.아직」으로 붙었다(2026-11-08) */}
          <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--mm-muted)', wordBreak: 'keep-all' }}>
            우리 팀 선수라면 로그인하고 <b style={{ color: 'var(--mm-ink-soft)' }}>내 선수 카드</b>과 <b style={{ color: 'var(--mm-ink-soft)' }}>베스트샷</b>을 확인하세요.
            {' '}<br className="hidden sm:block" />아직 회원이 아니면 가입 신청부터 해주세요.
          </p>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('mm-open-login'))}
            className="mm-press mt-3 inline-flex items-center gap-1.5 px-4 py-2 font-bold text-sm cursor-pointer hover:brightness-95 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
            style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: 'var(--mm-radius-ctl)' }}
          >
            로그인 · 가입 신청 <ChevronRight size={16} />
          </button>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="닫기"
            className="mm-press absolute top-2 right-2 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
            style={{ color: 'var(--mm-muted)', borderRadius: 'var(--mm-radius-ctl)' }}
          >
            <X size={16} />
          </button>
        )}
      </div>
    </SectionCard>
  )
}

function HighlightCTA({ available, href, date }: { available: boolean; href: string | null; date?: string }) {
  const content = (
    <div
      className="flex items-center justify-between gap-3 px-4 md:px-5 py-3.5 md:py-4"
      style={{
        borderTop: '1px solid var(--mm-rule)',
        background: available ? 'var(--mm-panel)' : 'var(--mm-panel-alt)',
        color: available ? 'var(--mm-ink)' : 'var(--mm-muted)',
      }}
    >
      <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
        <Film size={20} className="shrink-0" aria-hidden style={{ color: available ? 'var(--mm-yellow-strong)' : undefined }} />
        <div className="min-w-0">
          <div className="font-black text-base md:text-lg" style={{ letterSpacing: '-0.005em' }}>
            나의 최근 하이라이트
          </div>
          <div className="text-xs md:text-sm font-medium mt-0.5" style={{ color: available ? 'var(--mm-muted)' : undefined, wordBreak: 'keep-all' }}>
            {available ? `${formatDate(date)} 경기 기록 · 내 하이라이트 바로 보기` : '아직 참여 기록이 없어요'}
          </div>
        </div>
      </div>
      {available && <ChevronRight size={20} aria-hidden style={{ color: 'var(--mm-ink-soft)' }} />}
    </div>
  )
  if (!available || !href) return content
  return <Link href={href} className="mm-press block cursor-pointer transition-colors [&>div]:transition-colors hover:[&>div]:!bg-[color:var(--mm-panel-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--mm-yellow-strong)]">{content}</Link>
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}.${d.getDate()} (${days[d.getDay()]})`
}
