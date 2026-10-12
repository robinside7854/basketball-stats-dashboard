'use client'
// 「나」(/me) 개인 대시보드 — 홈 「내 카드」의 확장판 (리뉴얼 2단계, 2026-10-12)
//
// 배치 (모바일 한 줄 · PC ≥lg 두 칸)
//   왼쪽(요약 · PC 에서 sticky)
//     · 프로필 머리 + 선수카드
//     · 상단 3칸 「출전 N일 · 하루 평균(득점) · 다음 목표까지」 — 숫자 셋만 크게
//     · 이번 분기 · 하루 평균 5지표 + 순위(홈 「리그 리더」와 같은 기준 · 같은 최소 출전) · 시즌 누적 보조 줄
//     · 계정(비밀번호 변경)
//   오른쪽(자세히)
//     · 출석률 — 내가 뛴 날 / 리그가 열린 날 (이번 분기 + 시즌) · 경기일마다 점
//     · 내 트렌드 — 하루별 득점(리바·어시) 선 + 점선 = 내 하루 평균 (인라인 SVG, recharts 안 씀)
//     · 내 베스트샷 — 핀 고정한 클립(최대 3) + 최근 하이라이트 바로가기
//     · 진행 중 스트릭 · 마일스톤 체이서 (종전 그대로)
//   숫자는 전부 auth/dashboard 하나가 준다(친선 제외 · scorePoints 판정 — 화면에서 다시 계산하지 않는다).
//   ⚠ 평균 단위는 「하루」다 — 「경기당」이라 쓰지 말 것.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  Trophy, Film, User as UserIcon, ChevronRight, Sparkles, IdCard, Flame, X, KeyRound,
  CalendarCheck, TrendingUp, Pin, Play,
} from 'lucide-react'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'
import SectionCard from '@/components/league/ui/SectionCard'
import CountUp from '@/components/league/ui/CountUp'
import GrowBar from '@/components/league/ui/GrowBar'
import Avatar from '@/components/league/ui/Avatar'
import Chip from '@/components/league/ui/Chip'
import EmptyState from '@/components/league/ui/EmptyState'
import SegmentedTabs from '@/components/league/ui/SegmentedTabs'
import { Ring } from '@/components/league/ui/viz'
import { SHOT_TYPE_LABEL } from '@/lib/highlights/clip'
import type { HighlightClip } from '@/lib/highlights/types'
import MeTrendChart from './MeTrendChart'
// 폭죽은 canvas + rAF 라 첫 화면 번들에 들어갈 이유가 없다. 실제로 터질 때만 받아온다.
const Confetti = dynamic(() => import('@/components/league/Confetti'), { ssr: false })

// 선수카드 모달 · 클릭 후에만 로드 (recharts 포함)
const PlayerQuickViewModal = dynamic(() => import('../PlayerQuickViewModal'), { ssr: false })
// 비밀번호 변경 모달 · 클릭 시에만 로드
const PasswordChangeModal = dynamic(() => import('./PasswordChangeModal'), { ssr: false })
// 베스트샷 재생기 · 클릭 시에만 로드
const HighlightsClipModal = dynamic(() => import('@/components/highlights/HighlightsClipModal'), { ssr: false })

interface RankInfo { rank: number; total: number }
type Metric = 'pts' | 'reb' | 'ast' | 'stl' | 'blk'
interface QuarterSummaryData {
  /** `26.4Q` — 분기가 하나도 없으면 null(시즌 전체) */
  label: string | null
  attended_rounds: number
  /** 이 분기에 실제로 열린 경기일 수 */
  total_rounds: number
  /** 순위에 오르는 최소 출전 일수 (홈 리그 리더와 같은 식) */
  min_rounds: number
  eligible: boolean
  per_day: Record<Metric, number>
  ranks: Partial<Record<Metric, RankInfo>>
}
interface Season {
  attended_rounds: number
  pts: number; reb: number; ast: number; stl: number; blk: number
}
interface Weekly { available: boolean; date?: string }
interface Chaser {
  metric: 'pts' | 'reb' | 'ast' | 'stl' | 'blk'
  metricLabel: string
  current: number
  nextThreshold: number
  remaining: number
  progressPct: number
}
interface StreakItem { key: string; label: string; count: number; unit: string }
interface AttendanceData {
  quarter: { attended: number; total: number; days: Array<{ date: string; played: boolean }> }
  season: { attended: number; total: number }
  current_streak: number
  longest_streak: number
}
interface TrendRow { date: string; pts: number; reb: number; ast: number }
interface DashboardData {
  quarter?: QuarterSummaryData
  season: Season
  weekly: Weekly
  milestoneChasers: Chaser[]
  streaks: StreakItem[]
  // 2026-10-12 추가 필드 — 옛 응답(배포 직후 캐시)에는 없을 수 있다
  attendance?: AttendanceData
  trend?: { quarter: TrendRow[]; season: TrendRow[] }
  pinned_clips?: HighlightClip[]
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
// 하루 평균 카드 라벨 — 홈 리그 리더의 칩 표기(득점·리바·어시·스틸·블락)와 맞춘다
const METRIC_SHORT: Record<Metric, string> = { pts: '득점', reb: '리바', ast: '어시', stl: '스틸', blk: '블락' }

// 근접도 3티어 · 프로그레스 바·remaining 뱃지 색 결정 (배경/전경 쌍 · 캐주얼 전환 2026-08-06)
function proximityStyle(progressPct: number): { bg: string; fg: string } {
  if (progressPct >= 80) return { bg: 'var(--milestone-near-bg)', fg: 'var(--milestone-near-fg)' }
  if (progressPct >= 60) return { bg: 'var(--milestone-mid-bg)', fg: 'var(--milestone-mid-fg)' }
  return { bg: 'var(--milestone-far-bg)', fg: 'var(--milestone-far-fg)' }
}

// 순위 뱃지 스타일 · 1-3위 골드/실버/브론즈 배경 · 4-10위 rank-top · 11위+ 뉴트럴
// (2026-07-22 · rank 티어링 · '—' 제거 · 2026-08-06 배경/전경 쌍으로 전환
//  · 2026-08-06 이모지 메달 제거 — 숫자 배지(N위)로 통일, DynamicDuoPanel 과 동일한 rank-*-bg/fg 톤)
// border: 라이트 모드에서 rank-*-bg 가 흰 배경 대비 1.13~1.18 로 옅어 배지 형태가 거의 안 보이는
// 문제(2026-08-07 리뷰) → -fg 색의 얇은 테두리로 형태를 살린다. 텍스트 대비엔 영향 없음(색값 무변경).
function rankStyle(rank: number, total: number): { color: string; bg?: string; border?: string } {
  if (total <= 0) return { color: 'var(--mm-muted)' }
  if (rank === 1) return { color: 'var(--rank-1-fg)', bg: 'var(--rank-1-bg)', border: '1px solid var(--rank-1-fg)' }  // gold
  if (rank === 2) return { color: 'var(--rank-2-fg)', bg: 'var(--rank-2-bg)', border: '1px solid var(--rank-2-fg)' }  // silver
  if (rank === 3) return { color: 'var(--rank-3-fg)', bg: 'var(--rank-3-bg)', border: '1px solid var(--rank-3-fg)' }  // bronze
  if (rank <= 10) return { color: 'var(--rank-top-fg)', bg: 'var(--rank-top-bg)', border: '1px solid var(--rank-top-fg)' }
  return { color: 'var(--mm-muted)', bg: 'transparent' }
}

const EMPTY_QUARTER: QuarterSummaryData = {
  label: null, attended_rounds: 0, total_rounds: 0, min_rounds: 1, eligible: false,
  per_day: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 }, ranks: {},
}

export default function PersonalDashboard({ leagueId, orgSlug, base }: Props) {
  const { user, loading: authLoading, refresh } = useCurrentUser()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  // #1 비로그인 로그인 티저 — 30일 억제. 초기 true(플래시 방지) → 마운트 후 판정.
  const [teaserDismissed, setTeaserDismissed] = useState(true)
  useEffect(() => {
    try {
      const ts = localStorage.getItem('mm_login_teaser_dismissed')
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 판정은 클라이언트 전용, 마운트 1회
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
  const highlightsHref = data?.weekly.available && data.weekly.date
    ? `${myHighlightsHref}?date=${data.weekly.date}`
    : null
  const ready = !loading && !!data

  return (
    <>
      <div className="grid gap-4 lg:gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
        {/* ── 왼쪽: 요약 (PC 에서 스크롤해도 따라온다) ── */}
        <div className="min-w-0 lg:sticky lg:top-[64px]">
          <SectionCard variant="standalone" emphasized pad="none">
            {/* 헤더 · 유저 프로필 + 프로필카드 CTA */}
            <header className="flex items-center gap-3 md:gap-4 px-4 md:px-5 py-3 md:py-4" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
              <Avatar src={user.photo_url} name={user.name ?? user.login_id} size={56} decorative priority />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="font-jersey font-black text-xl md:text-2xl truncate" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.01em' }}>
                    {user.name ?? user.login_id}
                  </span>
                  <Sparkles size={16} className="shrink-0" style={{ color: 'var(--mm-ink-soft)' }} aria-hidden />
                </div>
                <div className="text-xs md:text-sm font-bold mt-0.5" style={{ color: 'var(--mm-muted)' }}>
                  {data?.quarter?.label ? `${data.quarter.label} · 나의 기록` : '나의 기록'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 md:px-4 py-2 text-xs md:text-sm font-black min-h-[44px] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-yellow)', borderRadius: 'var(--mm-radius-chip)' }}
                aria-label="선수카드 열기"
              >
                <IdCard size={14} aria-hidden />
                선수카드
              </button>
            </header>

            {!ready ? (
              <div className="py-8 text-center text-xs font-bold" style={{ color: 'var(--mm-muted)' }} role="status">
                로딩중…
              </div>
            ) : (
              <>
                {/* 상단 3칸 — 출전 · 하루 평균 득점 · 다음 목표까지 */}
                <TopTiles quarter={data.quarter ?? EMPTY_QUARTER} chaser={data.milestoneChasers[0] ?? null} />
                {/* 이번 분기 · 하루 평균 5지표 + 순위 · 시즌 누적은 보조 줄 */}
                <QuarterSummary quarter={data.quarter} season={data.season} />
              </>
            )}

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
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-black rounded-sm cursor-pointer transition-colors"
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

        {/* ── 오른쪽: 자세히 ── */}
        {ready && (
          <div className="min-w-0 space-y-4 lg:space-y-5">
            <AttendanceCard attendance={data.attendance} quarterLabel={data.quarter?.label ?? null} />
            <TrendCard trend={data.trend} />
            <BestShotsCard
              clips={data.pinned_clips ?? []}
              playerName={user.name ?? user.login_id}
              allHref={myHighlightsHref}
              weekly={data.weekly}
              recentHref={highlightsHref}
            />
            {(data.streaks?.length ?? 0) > 0 && (
              <SectionCard variant="standalone" pad="none">
                <StreakBoard streaks={data.streaks} />
              </SectionCard>
            )}
            <SectionCard variant="standalone" pad="none">
              <MilestoneChaser chasers={data.milestoneChasers} playerId={user?.player_id ?? null} />
            </SectionCard>
          </div>
        )}
      </div>

      {profileOpen && user && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={user.player_id}
          playerName={user.name ?? user.login_id}
          onClose={() => setProfileOpen(false)}
        />
      )}

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
      <h3 className="font-bold text-base md:text-lg" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>{title}</h3>
      {sub && <span className="text-xs font-bold ml-1 break-keep" style={{ color: 'var(--mm-muted)' }}>{sub}</span>}
      {right && <span className="ml-auto">{right}</span>}
    </div>
  )
}

// ─── 상단 3칸 ─────────────────────────────────────────────────
// 숫자 셋만 크게 — 「지금 나는 어디쯤인가」를 첫눈에.
function TopTiles({ quarter, chaser }: { quarter: QuarterSummaryData; chaser: Chaser | null }) {
  const ptsRank = quarter.ranks.pts
  const rs = ptsRank ? rankStyle(ptsRank.rank, ptsRank.total) : null
  return (
    <div className="px-4 sm:px-5 pt-3 sm:pt-4">
      <dl
        className="grid grid-cols-3"
        style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' }}
      >
        <Tile label="출전" first>
          <BigNum>{quarter.attended_rounds}<Unit>일</Unit></BigNum>
          <TileSub>전체 {quarter.total_rounds}일 중</TileSub>
        </Tile>
        <Tile label="하루 평균 득점">
          <BigNum>{(quarter.per_day.pts ?? 0).toFixed(1)}</BigNum>
          {ptsRank && rs ? (
            <span
              className="inline-flex items-center text-[11px] font-black tabular-nums px-1.5 leading-[18px]"
              style={{ color: rs.color, background: rs.bg ?? 'transparent', border: rs.border, borderRadius: 3 }}
              title={`${ptsRank.rank}위 / ${ptsRank.total}명`}
            >
              {ptsRank.rank}위
            </span>
          ) : (
            <TileSub>{quarter.attended_rounds > 0 ? '순위 집계 전' : '출전 전'}</TileSub>
          )}
        </Tile>
        <Tile label="다음 목표까지">
          {chaser ? (
            <>
              <BigNum>{chaser.remaining}</BigNum>
              <TileSub>{METRIC_SHORT[chaser.metric]} {chaser.nextThreshold.toLocaleString()} 달성</TileSub>
            </>
          ) : (
            <>
              <BigNum>–</BigNum>
              <TileSub>기록이 쌓이면 보여요</TileSub>
            </>
          )}
        </Tile>
      </dl>
    </div>
  )
}

function Tile({ label, first = false, children }: { label: string; first?: boolean; children: ReactNode }) {
  return (
    <div
      className="flex flex-col items-center text-center gap-1 px-1.5 py-3 min-w-0"
      style={first ? undefined : { borderLeft: '1px solid var(--mm-rule)' }}
    >
      <dt className="text-[11px] sm:text-xs font-bold break-keep" style={{ color: 'var(--mm-muted)' }}>{label}</dt>
      <dd className="flex flex-col items-center gap-1 min-w-0">{children}</dd>
    </div>
  )
}
function BigNum({ children }: { children: ReactNode }) {
  return (
    <span className="font-jersey font-black tabular-nums leading-none text-[26px] sm:text-[30px] lg:text-[28px]" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.02em' }}>
      {children}
    </span>
  )
}
function Unit({ children }: { children: ReactNode }) {
  return <span className="text-sm font-bold ml-0.5" style={{ color: 'var(--mm-ink-soft)' }}>{children}</span>
}
function TileSub({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-bold leading-tight break-keep" style={{ color: 'var(--mm-muted)' }}>{children}</span>
}

function QuarterSummary({ quarter, season }: { quarter?: QuarterSummaryData; season: Season }) {
  // 옛 응답(배포 직후 캐시 등)에는 quarter 가 없다 — 빈 값으로 그린다
  const q: QuarterSummaryData = quarter ?? EMPTY_QUARTER
  const metrics: Metric[] = ['pts', 'reb', 'ast', 'stl', 'blk']
  return (
    <div className="px-4 sm:px-5 py-3 sm:py-4">
      <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1 mb-2.5">
        <span className="font-bold text-sm md:text-base break-keep" style={{ color: 'var(--mm-ink)' }}>
          {q.label ? `이번 분기 · 하루 평균` : '하루 평균'}
        </span>
        {q.label && (
          <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>{q.label}</span>
        )}
      </div>
      {/* 5개 지표 카드 · 하루 평균 */}
      <div className="grid grid-cols-5 gap-1.5 md:gap-2">
        {metrics.map(key => (
          <StatCard
            key={key}
            metricKey={key}
            value={q.per_day[key] ?? 0}
            rank={q.ranks[key]}
          />
        ))}
      </div>
      {/* 순위가 안 보이는 이유를 숫자로 알려준다 — 홈 리그 리더와 같은 최소 출전 */}
      {q.attended_rounds > 0 && !q.eligible && (
        <p className="text-xs font-bold mt-2" style={{ color: 'var(--mm-muted)' }}>
          순위는 이번 분기 {q.min_rounds}일 이상 출전하면 보여요
        </p>
      )}
      {q.total_rounds > 0 && q.attended_rounds === 0 && (
        <p className="text-xs font-bold mt-2" style={{ color: 'var(--mm-muted)' }}>
          이번 분기에는 아직 출전 기록이 없어요
        </p>
      )}
      {/* 시즌 누적 합계 — 보조 줄 (마일스톤 체이서가 이 값 기준) */}
      <div className="text-xs mt-2.5 tabular-nums break-keep" style={{ color: 'var(--mm-muted)' }}>
        <b style={{ color: 'var(--mm-ink-soft)' }}>시즌 누적</b>
        {' '}· {season.attended_rounds}일 출전 · 득점 {season.pts} · 리바 {season.reb} · 어시 {season.ast} · 스틸 {season.stl} · 블락 {season.blk}
      </div>
    </div>
  )
}

function StatCard({ metricKey, value, rank }: { metricKey: Chaser['metric']; value: number; rank?: RankInfo }) {
  const rs = rank ? rankStyle(rank.rank, rank.total) : null
  return (
    <div
      className="relative flex flex-col items-center justify-between overflow-hidden min-w-0"
      style={{
        background: 'var(--mm-panel-alt)',
        border: '1px solid var(--mm-rule)',
        borderRadius: '6px',
        padding: '8px 2px 6px',
        minHeight: 84,
      }}
    >
      <div className="text-xs font-black mt-0.5" style={{ color: 'var(--mm-muted)' }}>
        {METRIC_SHORT[metricKey]}
      </div>
      {/* 하루 평균은 소수 한 자리(「12.3」) — 360px 5칸·PC 왼쪽 380px 칸 모두에서 넘치지 않는 크기 */}
      <div
        className="font-jersey font-black tabular-nums leading-none my-1 text-[19px] sm:text-[24px] md:text-[28px] lg:text-[22px]"
        style={{ color: 'var(--mm-ink)', letterSpacing: '-0.015em' }}
      >
        {value.toFixed(1)}
      </div>
      {/* 랭킹 뱃지 — 1-3위 골드/실버/브론즈 · 4-10위 rank-top · 11위+ 뉴트럴 · 정보 없으면 렌더 안 함 */}
      {rank && rank.total > 0 && rs ? (
        <div
          className="inline-flex items-center text-[11px] font-black tabular-nums px-1 leading-[16px]"
          style={{ color: rs.color, background: rs.bg ?? 'transparent', border: rs.border, borderRadius: '3px' }}
          title={`${rank.rank}위 / ${rank.total}명`}
        >
          {rank.rank}위
        </div>
      ) : <div className="h-[18px]" aria-hidden />}
    </div>
  )
}

// ─── 출석률 ───────────────────────────────────────────────────
// 내가 뛴 날 / 리그가 열린 날(정규 경기일 · 친선 제외). 경기일마다 점 하나.
function AttendanceCard({ attendance, quarterLabel }: { attendance?: AttendanceData; quarterLabel: string | null }) {
  const pct = (a: number, t: number) => (t > 0 ? Math.round((a / t) * 100) : 0)
  return (
    <SectionCard variant="standalone">
      <CardTitle
        icon={CalendarCheck}
        title="출석률"
        sub="내가 뛴 날 / 리그가 열린 날"
        right={quarterLabel ? <Chip tone="neutral">{quarterLabel}</Chip> : undefined}
      />
      {!attendance || attendance.season.total === 0 ? (
        <EmptyState variant="compact" icon={CalendarCheck} title="아직 열린 경기일이 없어요" />
      ) : (
        <>
          <div className="flex items-center gap-4">
            <Ring
              ratio={attendance.quarter.total > 0 ? attendance.quarter.attended / attendance.quarter.total : 0}
              size={76}
              stroke={8}
              label={`이번 분기 출석률 ${pct(attendance.quarter.attended, attendance.quarter.total)}%`}
            >
              <span className="text-sm">{pct(attendance.quarter.attended, attendance.quarter.total)}%</span>
            </Ring>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-sm md:text-base font-bold tabular-nums" style={{ color: 'var(--mm-ink)' }}>
                이번 분기 <b className="font-black">{attendance.quarter.attended}</b>
                <span style={{ color: 'var(--mm-muted)' }}> / {attendance.quarter.total}일</span>
              </div>
              <div className="text-xs font-bold tabular-nums" style={{ color: 'var(--mm-muted)' }}>
                시즌 {attendance.season.attended} / {attendance.season.total}일 · {pct(attendance.season.attended, attendance.season.total)}%
              </div>
              {(attendance.current_streak >= 2 || attendance.longest_streak >= 2) && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {attendance.current_streak >= 2 && (
                    <Chip tone="accent" icon={Flame}>{attendance.current_streak}라운드 연속</Chip>
                  )}
                  {attendance.longest_streak >= 2 && (
                    <Chip tone="neutral">최장 {attendance.longest_streak}라운드</Chip>
                  )}
                </div>
              )}
            </div>
          </div>
          {attendance.quarter.days.length > 0 && (
            <div className="mt-4">
              <ul className="flex flex-wrap gap-1.5" aria-label="이번 분기 경기일별 출전">
                {attendance.quarter.days.map(d => (
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
                <span className="ml-auto">오래된 날 → 최근</span>
              </div>
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}

// ─── 내 트렌드 ─────────────────────────────────────────────────
type TrendPeriod = 'quarter' | 'season'
type TrendMetric = 'pts' | 'reb' | 'ast'
const TREND_METRICS: Array<{ key: TrendMetric; label: string }> = [
  { key: 'pts', label: '득점' }, { key: 'reb', label: '리바' }, { key: 'ast', label: '어시' },
]

function TrendCard({ trend }: { trend?: { quarter: TrendRow[]; season: TrendRow[] } }) {
  // 이번 분기에 뛴 날이 없으면(분기 첫 주 등) 시즌으로 시작한다
  const [period, setPeriod] = useState<TrendPeriod>(() => ((trend?.quarter.length ?? 0) > 0 ? 'quarter' : 'season'))
  const [metric, setMetric] = useState<TrendMetric>('pts')
  const rows = useMemo(() => (trend ? trend[period] : []), [trend, period])
  const points = useMemo(() => rows.map(r => ({ date: r.date, value: r[metric] })), [rows, metric])
  const avg = points.length > 0 ? points.reduce((s, p) => s + p.value, 0) / points.length : null
  const best = points.reduce<{ date: string; value: number } | null>((b, p) => (!b || p.value > b.value ? p : b), null)
  const metricLabel = TREND_METRICS.find(m => m.key === metric)!.label

  return (
    <SectionCard variant="standalone">
      <CardTitle icon={TrendingUp} title="내 트렌드" sub="하루별 기록 · 점선 = 내 하루 평균" />
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <SegmentedTabs
          size="sm"
          ariaLabel="트렌드 기간"
          value={period}
          onChange={setPeriod}
          items={[
            { key: 'quarter', label: '이번 분기' },
            { key: 'season', label: '시즌' },
          ]}
        />
        <div className="flex gap-1.5 ml-auto" role="group" aria-label="지표">
          {TREND_METRICS.map(m => (
            <Chip key={m.key} as="button" size="sm" selected={metric === m.key} onClick={() => setMetric(m.key)}>
              {m.label}
            </Chip>
          ))}
        </div>
      </div>
      {points.length === 0 ? (
        <EmptyState
          variant="compact"
          icon={TrendingUp}
          title={period === 'quarter' ? '이번 분기에는 아직 뛴 날이 없어요' : '아직 기록된 날이 없어요'}
          description="경기를 뛰면 하루에 점 하나씩 생겨요"
        />
      ) : (
        <>
          <MeTrendChart points={points} average={avg} metricLabel={metricLabel} />
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-2 text-xs font-bold tabular-nums" style={{ color: 'var(--mm-muted)' }}>
            <span>{points.length}일</span>
            {avg != null && <span>하루 평균 <b style={{ color: 'var(--mm-ink)' }}>{avg.toFixed(1)}</b></span>}
            {best && <span>최고 <b style={{ color: 'var(--mm-ink)' }}>{best.value}</b> ({formatDate(best.date)})</span>}
          </div>
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
      {/* 최근 하이라이트 — 최근 참여 라운드로 바로 */}
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
            우리 팀 선수라면 로그인하고 <b style={{ color: 'var(--mm-ink-soft)' }}>이번 분기 하루 평균·순위</b>과 <b style={{ color: 'var(--mm-ink-soft)' }}>진행 중 스트릭·마일스톤</b>을 확인하세요.
            <br className="hidden sm:block" />아직 회원이 아니면 가입 신청부터 해주세요.
          </p>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('mm-open-login'))}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-md font-bold text-sm cursor-pointer transition-all hover:brightness-95 min-h-[44px]"
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

function StreakBoard({ streaks }: { streaks: StreakItem[] }) {
  if (!streaks || streaks.length === 0) return null  // 진행 중 스트릭 없으면 섹션 숨김
  return (
    <div className="px-4 sm:px-5 py-3 sm:py-4">
      <div className="flex items-center gap-1.5 mb-2.5">
        {/* 불꽃만 깜빡인다 — "진행 중"이라는 상태 자체를 나타내므로 무한 반복이 정당하다(LIVE 배지와 같은 근거).
            투명도만 흔들어 크기는 그대로 둔다. 크기를 흔들면 옆 글자가 밀린다. */}
        <Flame size={16} className="mm-flicker" style={{ color: 'var(--mm-yellow-strong)' }} />
        <span className="font-bold text-base md:text-lg" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>진행 중 스트릭</span>
        <span className="text-xs font-bold ml-1" style={{ color: 'var(--mm-muted)' }}>다음 경기에 이어가요</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {streaks.map(s => (
          <span
            key={s.key}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md"
            style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
          >
            <Flame size={14} className="mm-flicker" style={{ color: 'var(--mm-yellow-strong)' }} />
            <span className="font-jersey font-black tabular-nums text-lg md:text-xl leading-none" style={{ color: 'var(--mm-ink)' }}>
              {s.count}{s.unit}
            </span>
            <span className="text-xs md:text-sm font-bold" style={{ color: 'var(--mm-muted)' }}>{s.label}</span>
          </span>
        ))}
      </div>
    </div>
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
          <div className="font-bold text-base md:text-lg" style={{ letterSpacing: '-0.005em' }}>
            나의 최근 하이라이트
          </div>
          <div className="text-xs md:text-sm font-bold mt-0.5">
            {available ? `${formatDate(date)} 참여 · 클립 자동재생` : '아직 참여 기록이 없어요'}
          </div>
        </div>
      </div>
      {available && <ChevronRight size={20} />}
    </div>
  )
  if (!available || !href) return content
  return <Link href={href} className="block cursor-pointer transition-all hover:brightness-95">{content}</Link>
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
        <span className="font-bold text-base md:text-lg" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>
          마일스톤 체이서
        </span>
        <span className="text-xs font-bold ml-1" style={{ color: 'var(--mm-muted)' }}>
          가까운 것부터
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--mm-muted)' }}>아직 통계 데이터가 부족해요</p>
      ) : (
        <div className="space-y-2.5 md:space-y-3">
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
