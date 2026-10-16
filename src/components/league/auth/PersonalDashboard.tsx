'use client'
import { useOpenPlayerCard } from '@/contexts/PlayerCardContext'
import PlayerName from '@/components/league/ui/PlayerName'
// 「나」(/me) 개인 화면 — **나에게만 있는 것만** (2026-10-15 정리)
//
// 숫자(하루 평균·순위·야투율·트렌드·진행 중 연속 기록)는 선수 카드가 정본이다. 종전엔 여기서도 같은 숫자를
//   다른 자격 규칙으로 따로 보여 줘 카드와 갈렸다(「선수 숫자는 한 벌」) → 그 블록들을 걷어내고
//   맨 위에 「내 선수 카드 열기」 하나를 크게 둔다(지금 분기로 열린다).
// 배치 (모바일 한 줄 · PC ≥lg 두 칸)
//   왼쪽: 프로필 머리 · 마지막 출전(친선일 포함) · 「내 선수 카드 열기」 · 계정(비밀번호 변경)
//   오른쪽: 출석률(이번 분기 + 전체 · 분모는 내 첫 기록일부터) · 내 베스트샷(+ 최근 하이라이트) · 마일스톤 체이서
//   숫자는 전부 auth/dashboard 하나가 준다(친선 제외 — 화면에서 다시 계산하지 않는다).
//   ⚠ 평균·연속 단위는 「하루」다 — 「경기당」·「라운드」라 쓰지 말 것.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  Trophy, Film, User as UserIcon, ChevronRight, IdCard, Flame, X, KeyRound,
  CalendarCheck, Pin, Play,
} from 'lucide-react'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'
import { useLeagueQuarter } from '@/contexts/LeagueQuarterContext'
import SectionCard from '@/components/league/ui/SectionCard'
import CountUp from '@/components/league/ui/CountUp'
import GrowBar from '@/components/league/ui/GrowBar'
import Avatar from '@/components/league/ui/Avatar'
import Chip from '@/components/league/ui/Chip'
import EmptyState from '@/components/league/ui/EmptyState'
import LastPlayedLine from '@/components/league/ui/LastPlayedLine'
import { shouldShowLastPlayed, type LastPlayedData } from '@/lib/format/lastPlayed'
import { Ring } from '@/components/league/ui/viz'
import { SHOT_TYPE_LABEL } from '@/lib/highlights/clip'
import type { HighlightClip } from '@/lib/highlights/types'
// 폭죽은 canvas + rAF 라 첫 화면 번들에 들어갈 이유가 없다. 실제로 터질 때만 받아온다.
const Confetti = dynamic(() => import('@/components/league/Confetti'), { ssr: false })

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
}

const METRIC_COLOR: Record<Chaser['metric'], string> = {
  pts: '#F59E0B', reb: '#F97316', ast: '#06B6D4', stl: '#10B981', blk: '#EF4444',
}
const METRIC_KOREAN: Record<Chaser['metric'], string> = { pts: '득점', reb: '리바운드', ast: '어시스트', stl: '스틸', blk: '블락' }

// 근접도 3티어 · 프로그레스 바·remaining 뱃지 색 결정 (배경/전경 쌍 · 캐주얼 전환 2026-08-06)
function proximityStyle(progressPct: number): { bg: string; fg: string } {
  if (progressPct >= 80) return { bg: 'var(--milestone-near-bg)', fg: 'var(--milestone-near-fg)' }
  if (progressPct >= 60) return { bg: 'var(--milestone-mid-bg)', fg: 'var(--milestone-mid-fg)' }
  return { bg: 'var(--milestone-far-bg)', fg: 'var(--milestone-far-fg)' }
}

export default function PersonalDashboard({ leagueId, orgSlug, base }: Props) {
  const { user, loading: authLoading, refresh } = useCurrentUser()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  // 내 선수 카드 — 레이아웃의 전역 카드 하나로 연다(2026-10-14, contexts/PlayerCardContext). 지금 분기로 연다.
  const openPlayerCard = useOpenPlayerCard()
  const { currentQuarter } = useLeagueQuarter()
  const [pwOpen, setPwOpen] = useState(false)
  // #1 비로그인 로그인 티저 — 30일 억제. 초기 true(플래시 방지) → 마운트 후 판정.
  const [teaserDismissed, setTeaserDismissed] = useState(true)
  useEffect(() => {
    try {
      const ts = localStorage.getItem('mm_login_teaser_dismissed')
      setTeaserDismissed(ts ? Date.now() - Number(ts) < 30 * 24 * 3600 * 1000 : false)
    } catch { /* 무시 */ }
  }, [])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/auth/dashboard`, { cache: 'no-store' })
      if (r.ok) setData(await r.json())
    } finally { setLoading(false) }
  }, [leagueId, user])

  useEffect(() => { load() }, [load])

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
  const myHighlightsHref = `${leagueBase}/highlights/player/${user.player_id}`
  // 최근 하이라이트 = 내가 마지막으로 뛴 날의 박스스코어 — `?hl=mine` 이면 그 화면이 「내 기록」 하이라이트 재생기를 바로 연다
  const highlightsHref = data?.weekly.available && data.weekly.date
    ? `${leagueBase}/boxscore/${data.weekly.date}?hl=mine`
    : null
  const ready = !loading && !!data
  const myName = user.name ?? user.login_id
  const openMyCard = () => openPlayerCard?.({ playerId: user.player_id, playerName: myName, quarterId: currentQuarter?.id ?? null })

  return (
    <>
      <div className="grid gap-4 lg:gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
        {/* ── 왼쪽: 나 (PC 에서 스크롤해도 따라온다) ── */}
        <div className="min-w-0 lg:sticky lg:top-[64px]">
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
                <div className="text-xs md:text-sm font-bold mt-0.5" style={{ color: 'var(--mm-muted)' }}>
                  {user.number != null ? `#${user.number} · ` : ''}나의 기록
                </div>
              </div>
            </header>

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
              <p className="text-xs font-bold mt-2 text-center break-keep" style={{ color: 'var(--mm-muted)' }}>
                하루 평균 · 순위 · 슛 · 연속 기록 — {currentQuarter ? `${String(currentQuarter.year).slice(2)}.${currentQuarter.quarter}Q 기준으로 열려요` : '전체 기간으로 열려요'}
              </p>
            </div>

            {/* 계정 · 비밀번호 변경 (로그아웃은 /me MePageClient 의 계정 섹션 하나로 통합 — 중복 제거) */}
            <div
              className="flex items-center justify-between gap-2 flex-wrap px-4 md:px-5 py-3"
              style={{ borderTop: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}
            >
              <div className="flex items-center gap-2 min-w-0 text-xs" style={{ color: 'var(--mm-muted)' }}>
                <UserIcon size={14} aria-hidden />
                <span className="truncate">아이디 <b style={{ color: 'var(--mm-ink-soft)' }}>{user.login_id}</b></span>
                {user.is_default_password && (
                  <span className="inline-flex items-center text-xs font-black px-1.5 py-0.5 rounded-sm"
                    style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)' }}>
                    초기 비번
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPwOpen(true)}
                className="inline-flex items-center gap-1.5 min-h-[36px] max-sm:min-h-11 px-3 py-1.5 text-xs font-black rounded-sm cursor-pointer transition-colors"
                style={{
                  background: user.is_default_password ? 'var(--mm-yellow)' : 'var(--mm-panel)',
                  color: user.is_default_password ? 'var(--mm-black)' : 'var(--mm-ink)',
                  border: `1px solid ${user.is_default_password ? 'var(--mm-black)' : 'var(--mm-rule)'}`,
                }}
              >
                <KeyRound size={14} aria-hidden />
                비밀번호 변경
              </button>
            </div>
          </SectionCard>
        </div>

        {/* ── 오른쪽: 나에게만 있는 것 ── */}
        {!ready ? (
          <div className="py-8 text-center text-xs font-bold" style={{ color: 'var(--mm-muted)' }} role="status">
            로딩중…
          </div>
        ) : (
          <div className="min-w-0 space-y-4 lg:space-y-5">
            <AttendanceCard attendance={data.attendance} quarterLabel={data.quarter_label ?? null} />
            <BestShotsCard
              clips={data.pinned_clips ?? []}
              playerName={myName}
              allHref={myHighlightsHref}
              weekly={data.weekly}
              recentHref={highlightsHref}
            />
            <SectionCard variant="standalone" pad="none">
              <MilestoneChaser chasers={data.milestoneChasers} playerId={user?.player_id ?? null} />
            </SectionCard>
          </div>
        )}
      </div>


      {pwOpen && (
        <PasswordChangeModal
          leagueId={leagueId}
          isDefaultPassword={user.is_default_password}
          onClose={() => setPwOpen(false)}
          onDone={() => { refresh() }}
        />
      )}
    </>
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
      {sub && <span className="text-xs font-bold ml-1 break-keep" style={{ color: 'var(--mm-muted)' }}>{sub}</span>}
      {right && <span className="ml-auto">{right}</span>}
    </div>
  )
}

// ─── 출석률 ───────────────────────────────────────────────────
// 내가 뛴 날 / 리그가 열린 날(정규 경기일 · 친선 제외). 경기일마다 칸 하나.
//   분모는 내 첫 기록일부터 센다(2026-10-12) — 중간에 들어온 회원이 들어오기 전 경기일을 결장으로 잡히지 않게.
//   날짜 칸도 첫 기록일부터만 그린다.
//   (2026-10-15) 기간 토글을 뺐다 — 이번 분기를 크게, 전체는 한 줄로 늘 같이 보인다. 분기에 아직 열린 날이 없으면 전체를 크게.
type Period = 'quarter' | 'career'
function AttendanceCard({ attendance, quarterLabel }: {
  attendance?: AttendanceData; quarterLabel: string | null
}) {
  const period: Period = attendance && attendance.quarter.total > 0 ? 'quarter' : 'career'
  const pct = (a: number, t: number) => (t > 0 ? Math.round((a / t) * 100) : 0)
  const denom = (x: AttendancePeriod) => x.since_join ?? x.total
  const periodName = (p: Period) => (p === 'quarter' ? '이번 분기' : '전체')
  const cur = attendance ? (period === 'quarter' ? attendance.quarter : attendance.season) : null
  const other = attendance ? (period === 'quarter' ? attendance.season : attendance.quarter) : null
  const otherPeriod: Period = period === 'quarter' ? 'career' : 'quarter'
  const joinedOn = attendance?.joined_on ?? null
  const joinedMid = !!cur && !!joinedOn && denom(cur) < cur.total
  const days = cur?.days ?? []
  return (
    <SectionCard variant="standalone">
      <CardTitle
        icon={CalendarCheck}
        title="출석률"
        sub="내가 뛴 날 / 리그가 열린 날"
        right={<Chip tone="neutral">{period === 'quarter' ? (quarterLabel ?? '이번 분기') : '전체'}</Chip>}
      />
      {!attendance || !cur || !other || attendance.season.total === 0 ? (
        <EmptyState variant="compact" icon={CalendarCheck} title="아직 열린 경기일이 없어요" />
      ) : (
        <>
          <div className="flex items-center gap-4">
            <Ring
              ratio={denom(cur) > 0 ? cur.attended / denom(cur) : 0}
              size={76}
              stroke={8}
              label={`${periodName(period)} 출석률 ${pct(cur.attended, denom(cur))}%`}
            >
              <span className="text-sm">{pct(cur.attended, denom(cur))}%</span>
            </Ring>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-sm md:text-base font-bold tabular-nums break-keep" style={{ color: 'var(--mm-ink)' }}>
                {periodName(period)} {denom(cur)}일 중 <b className="font-black">{cur.attended}</b>일
              </div>
              {joinedMid && joinedOn && (
                <div className="text-xs font-bold tabular-nums break-keep" style={{ color: 'var(--mm-ink-soft)' }}>
                  첫 기록 {formatDate(joinedOn)}부터 셌어요 · 그 전 {cur.total - denom(cur)}일은 빼요
                </div>
              )}
              <div className="text-xs font-bold tabular-nums break-keep" style={{ color: 'var(--mm-muted)' }}>
                {periodName(otherPeriod)} {other.attended} / {denom(other)}일 · {pct(other.attended, denom(other))}%
              </div>
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
              <ul className="flex flex-wrap gap-1.5" aria-label={`${periodName(period)} 경기일별 출전${joinedMid ? ' (내 첫 기록일부터)' : ''}`}>
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
              <div className="flex items-center gap-3 mt-2 text-[11px] font-bold" style={{ color: 'var(--mm-muted)' }}>
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
// 핀 고정한 클립(최대 3). 고르는 곳은 내 하이라이트 화면의 핀 버튼이다.
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
          sub={clips.length > 0 ? `${clips.length} / 3` : undefined}
          right={
            <Link
              href={allHref}
              className="inline-flex items-center gap-0.5 min-h-[36px] text-xs font-bold cursor-pointer hover:underline"
              style={{ color: 'var(--mm-ink-soft)' }}
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
            description="내 하이라이트에서 마음에 드는 슛을 핀으로 고정하면 여기 모여요 (최대 3개)"
          />
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:gap-3">
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
        {/* 블러 처리된 가짜 스탯 실루엣 (장식) */}
        <div aria-hidden className="hidden sm:grid grid-cols-5 gap-1.5 w-[220px] shrink-0" style={{ filter: 'blur(3px)', opacity: 0.5 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-md border" style={{ background: 'var(--mm-panel-alt)', borderColor: 'var(--mm-rule)', height: 72 }} />
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg md:text-xl" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>내 기록, 여기 다 있어요</div>
          <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
            우리 팀 선수라면 로그인하고 <b style={{ color: 'var(--mm-ink-soft)' }}>내 선수 카드·출석률</b>과 <b style={{ color: 'var(--mm-ink-soft)' }}>마일스톤·베스트샷</b>을 확인하세요.
            <br className="hidden sm:block" />아직 회원이 아니면 가입 신청부터 해주세요.
          </p>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('mm-open-login'))}
            className="mm-press mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-md font-bold text-sm cursor-pointer transition-all hover:brightness-95 min-h-[44px]"
            style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)' }}
          >
            로그인 · 가입 신청 <ChevronRight size={16} />
          </button>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="닫기"
            className="absolute top-2 right-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer transition-colors"
            style={{ color: 'var(--mm-muted)' }}
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
        background: available ? 'var(--mm-yellow)' : 'var(--mm-panel-alt)',
        color: available ? 'var(--mm-black)' : 'var(--mm-muted)',
        opacity: available ? 1 : 0.65,
      }}
    >
      <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
        <Film size={20} className="shrink-0" />
        <div className="min-w-0">
          <div className="font-black text-base md:text-lg" style={{ letterSpacing: '-0.005em' }}>
            나의 최근 하이라이트
          </div>
          <div className="text-xs md:text-sm font-bold mt-0.5">
            {available ? `${formatDate(date)} 경기 기록 · 내 하이라이트 바로 보기` : '아직 참여 기록이 없어요'}
          </div>
        </div>
      </div>
      {available && <ChevronRight size={20} />}
    </div>
  )
  if (!available || !href) return content
  return <Link href={href} className="mm-press block cursor-pointer transition-all hover:brightness-95">{content}</Link>
}

function MilestoneChaser({ chasers, playerId }: { chasers: Chaser[]; playerId: number | string | null }) {
  const shown = chasers.slice(0, 5)

  // 마일스톤 달성 축하 — 폭죽 컴포넌트는 드래프트에만 갇혀 있었다. 개인 화면으로 확장한다.
  //
  // 달성을 어떻게 아는가: 서버가 '방금 넘었다'를 알려주지 않는다. 대신 지표별 다음 목표치
  //   (nextThreshold)를 저장해 뒀다가, 이번에 그 값이 **올라가 있으면** 이전 목표를 넘은 것이다.
  //   ⚠ 첫 방문(저장값 없음)에는 절대 터뜨리지 않는다 — 모두가 첫 로그인에 폭죽을 보게 된다.
  //     조용히 저장만 하고 넘어간다.
  //   ⚠ 키에 playerId 를 넣는다. 가족이 한 기기를 쓰면 남의 달성으로 내 폭죽이 터진다.
  const [celebrate, setCelebrate] = useState<number | null>(null)
  useEffect(() => {
    if (!playerId || shown.length === 0) return
    const key = `mm_milestone_seen_${playerId}`
    const snapshot: Record<string, number> = {}
    for (const c of shown) snapshot[c.metric] = c.nextThreshold

    let prev: Record<string, number> | null = null
    try {
      const raw = localStorage.getItem(key)
      if (raw) prev = JSON.parse(raw) as Record<string, number>
    } catch { /* 저장소가 막혀 있으면(시크릿 모드 등) 축하만 생략한다 */ }

    if (prev && shown.some(c => typeof prev[c.metric] === 'number' && c.nextThreshold > prev[c.metric])) {
      setCelebrate(Date.now())
    }
    try { localStorage.setItem(key, JSON.stringify(snapshot)) } catch { /* 무시 */ }
    // shown 은 매 렌더 새 배열이라 의존성에 넣으면 매번 재실행된다. 값이 바뀌는 신호는
    // playerId 와 목표치 조합뿐이므로 그것만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, shown.map(c => `${c.metric}:${c.nextThreshold}`).join(',')])
  return (
    <div className="p-4 md:p-5">
      {/* 폭죽은 화면 전체를 덮는 캔버스라 레이아웃에 영향을 주지 않는다. trigger 가 null 이면 비활성 */}
      <Confetti trigger={celebrate} />
      <div className="flex items-center gap-1.5 mb-3">
        <Trophy size={16} style={{ color: 'var(--mm-ink-soft)' }} />
        <span className="font-black text-base md:text-lg" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>
          마일스톤 체이서
        </span>
        <span className="text-xs font-bold ml-1" style={{ color: 'var(--mm-muted)' }}>
          가까운 것부터
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--mm-muted)' }}>아직 통계 데이터가 부족해요</p>
      ) : (
        // PC 두 칸 — 오른쪽 칼럼 전폭이면 지표명과 「현재 / 목표」가 양 끝으로 벌어졌다
        <div className="space-y-2.5 md:space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-3">
          {shown.map((c, idx) => {
            const prox = proximityStyle(c.progressPct)
            return (
              <div key={c.metric}>
                <div className="flex items-center justify-between text-xs md:text-sm mb-1">
                  <span className="font-bold" style={{ color: METRIC_COLOR[c.metric] }}>
                    <b>{c.metricLabel}</b>
                    <span className="ml-1.5" style={{ color: 'var(--mm-ink-soft)' }}>{METRIC_KOREAN[c.metric]}</span>
                  </span>
                  <span className="tabular-nums" style={{ color: 'var(--mm-ink)' }}>
                    {/* 누적 기록만 카운트업한다 — 목표치(nextThreshold)와 남은 수(-remaining)는
                        고정된 기준값이라 같이 움직이면 무엇이 오르는 중인지 흐려진다. */}
                    <b><CountUp value={c.current} delay={idx * 60} /></b> / {c.nextThreshold}
                    <span className="ml-1.5 text-xs font-black px-1.5 py-0.5" style={{ background: prox.bg, color: prox.fg, borderRadius: 'var(--mm-radius-chip)' }}>
                      -{c.remaining}
                    </span>
                  </span>
                </div>
                <GrowBar pct={c.progressPct} color={prox.fg} delay={idx * 60} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}.${d.getDate()} (${days[d.getDay()]})`
}
