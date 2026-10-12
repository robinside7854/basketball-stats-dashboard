'use client'
// 로그인 유저 전용 · 개인화 대시보드 (홈 상단)
//   a. **이번 분기 · 하루 평균** 득점/리바/어시/스틸/블락 + 각 항목 순위 (2026-10-12)
//      — 홈 「리그 리더」와 같은 기준(지금 분기 · 하루 평균 · 같은 최소 출전). 종전엔 시즌 누적 합계라
//        홈에서 본 순위와 여기 순위가 달랐다. 시즌 누적 합계는 아래 보조 줄로 남긴다.
//   b. "이번 주 나의 하이라이트" CTA — 최근 참여한 라운드의 하이라이트로 연결
//   c. 마일스톤 체이서 (가장 도달 가능한 것부터)
//   d. 프로필카드 열기 CTA
import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Trophy, Film, User as UserIcon, ChevronRight, Sparkles, IdCard, Flame, X, KeyRound } from 'lucide-react'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'
import SectionCard from '@/components/league/ui/SectionCard'
import CountUp from '@/components/league/ui/CountUp'
import GrowBar from '@/components/league/ui/GrowBar'
// 폭죽은 canvas + rAF 라 첫 화면 번들에 들어갈 이유가 없다. 실제로 터질 때만 받아온다.
const Confetti = dynamic(() => import('@/components/league/Confetti'), { ssr: false })

// 선수카드 모달 · 클릭 후에만 로드 (recharts 포함)
const PlayerQuickViewModal = dynamic(() => import('../PlayerQuickViewModal'), { ssr: false })
// 비밀번호 변경 모달 · 클릭 시에만 로드
const PasswordChangeModal = dynamic(() => import('./PasswordChangeModal'), { ssr: false })

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
interface DashboardData {
  quarter?: QuarterSummaryData
  season: Season
  weekly: Weekly
  milestoneChasers: Chaser[]
  streaks: StreakItem[]
}

interface Props {
  leagueId: string
  orgSlug: string
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

export default function PersonalDashboard({ leagueId, orgSlug }: Props) {
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

  const highlightsHref = data?.weekly.available && data.weekly.date
    ? `/league/${orgSlug}/${leagueId}/highlights/player/${user.player_id}?date=${data.weekly.date}`
    : null

  return (
    <>
      <SectionCard variant="standalone" emphasized pad="none">
        {/* 헤더 · 유저 프로필 + 프로필카드 CTA · PC 확대 */}
        <header className="flex items-center gap-3 md:gap-4 px-4 md:px-5 py-3 md:py-4" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
          <div
            className="relative w-12 h-12 md:w-14 md:h-14 shrink-0 rounded-full overflow-hidden flex items-center justify-center"
            style={{ background: 'var(--mm-panel-alt)', border: '2px solid var(--mm-rule)' }}
            aria-hidden
          >
            {user.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <UserIcon size={20} style={{ color: 'var(--mm-muted)' }} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="font-jersey font-black text-xl md:text-2xl" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.01em' }}>
                {user.name ?? user.login_id}
              </span>
              <Sparkles size={16} style={{ color: 'var(--mm-ink-soft)' }} />
            </div>
            <div className="text-xs md:text-sm font-bold mt-0.5" style={{ color: 'var(--mm-muted)' }}>
              나의 기록 대시보드
            </div>
          </div>
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 md:px-4 py-2 text-xs md:text-sm font-black min-h-[40px] md:min-h-[44px] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)]"
            style={{ background: 'var(--mm-black)', color: '#ffffff', border: '1px solid var(--mm-black)', borderRadius: '4px' }}
            aria-label="선수카드 열기"
          >
            <IdCard size={14} />
            선수카드
          </button>
        </header>

        {loading || !data ? (
          <div className="py-8 text-center text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>
            로딩중…
          </div>
        ) : (
          <>
            {/* a. 이번 분기 · 하루 평균 + 순위 (홈 리그 리더와 같은 기준) · 시즌 누적은 보조 줄 */}
            <QuarterSummary quarter={data.quarter} season={data.season} />

            {/* a-2. 진행 중 스트릭 (연속 기록) — 있을 때만 */}
            <StreakBoard streaks={data.streaks ?? []} />

            {/* b. 이번 주 하이라이트 CTA · 최근 참여 라운드 */}
            <HighlightCTA available={data.weekly.available} href={highlightsHref} date={data.weekly.date} />

            {/* c. 마일스톤 체이서 (트렌드 삭제) */}
            <MilestoneChaser chasers={data.milestoneChasers} playerId={user?.player_id ?? null} />
          </>
        )}

        {/* d. 계정 · 비밀번호 변경 (로그아웃은 /me MePageClient 의 계정 섹션 하나로 통합 — 중복 제거) */}
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
          <div className="flex items-center gap-1.5">
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
        </div>
      </SectionCard>

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

function QuarterSummary({ quarter, season }: { quarter?: QuarterSummaryData; season: Season }) {
  // 옛 응답(배포 직후 캐시 등)에는 quarter 가 없다 — 빈 값으로 그린다
  const q: QuarterSummaryData = quarter ?? {
    label: null, attended_rounds: 0, total_rounds: 0, min_rounds: 1, eligible: false,
    per_day: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 }, ranks: {},
  }
  const metrics: Metric[] = ['pts', 'reb', 'ast', 'stl', 'blk']
  return (
    <div className="px-4 sm:px-5 py-3 sm:py-4">
      <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1 mb-3">
        <span className="font-bold text-base md:text-lg break-keep" style={{ color: 'var(--mm-ink)' }}>
          {q.label ? `이번 분기 · 하루 평균` : '하루 평균'}
        </span>
        {q.label && (
          <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>{q.label}</span>
        )}
        <span
          className="inline-flex items-center text-xs md:text-sm font-black px-2 py-0.5 tabular-nums"
          style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)' }}
        >
          출전 {q.attended_rounds}일 / 전체 {q.total_rounds}일
        </span>
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
      className="relative flex flex-col items-center justify-between overflow-hidden"
      style={{
        background: 'var(--mm-panel-alt)',
        border: '1px solid var(--mm-rule)',
        borderRadius: '6px',
        padding: '10px 4px 8px',
        minHeight: 96,
      }}
    >
      {/* 지표 라벨 */}
      <div
        className="text-xs font-black mt-0.5"
        style={{ color: 'var(--mm-muted)' }}
      >
        {METRIC_SHORT[metricKey]}
      </div>
      {/* 큰 숫자 */}
      <div
        className="font-jersey font-black tabular-nums leading-none my-1"
        style={{
          color: 'var(--mm-ink)',
          // 하루 평균은 소수 한 자리(「12.3」)라 5칸 그리드 375px 폭에서 넘치지 않게 한 단계 줄였다
          fontSize: 'clamp(20px, 5vw, 36px)',
          letterSpacing: '-0.015em',
        }}
      >
        {value.toFixed(1)}
      </div>
      {/* 랭킹 뱃지 · 통일 규칙 (2026-07-22 · 2026-08-06 이모지 메달 제거)
          1-3위: N위 · 골드/실버/브론즈 배경
          4-10위: N위 · rank-top 배경
          11위+: N위 · 뉴트럴 텍스트 · 배경 없음
          랭킹 정보 없음: 렌더 안 함 (— 제거) */}
      {rank && rank.total > 0 && rs && (
        <div
          className="inline-flex items-center gap-0.5 text-xs font-black tabular-nums px-1.5 py-0.5"
          style={{
            color: rs.color,
            background: rs.bg ?? 'transparent',
            border: rs.border,
            borderRadius: '3px',
            letterSpacing: '-0.005em',
          }}
          title={`${rank.rank}위 / ${rank.total}명`}
        >
          <span>{rank.rank}위</span>
        </div>
      )}
    </div>
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
    <div className="px-4 sm:px-5 py-3 sm:py-4" style={{ borderTop: '1px solid var(--mm-rule)' }}>
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
    <div className="p-4 md:p-5" style={{ borderTop: '1px solid var(--mm-rule)' }}>
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
