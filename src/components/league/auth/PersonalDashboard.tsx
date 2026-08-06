'use client'
// 로그인 유저 전용 · 개인화 대시보드 (홈 상단)
//   a. 이번 시즌 참석 라운드 + 누적 PTS/REB/AST/STL/BLK + 각 항목 랭킹 (1-3위 메달 · 3-10위 초록 강조)
//   b. "이번 주 나의 하이라이트" CTA — 최근 참여한 라운드의 하이라이트로 연결
//   c. 마일스톤 체이서 (가장 도달 가능한 것부터)
//   d. 프로필카드 열기 CTA
import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Trophy, Film, User as UserIcon, ChevronRight, Sparkles, IdCard, Flame, X, KeyRound, LogOut } from 'lucide-react'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'
import SectionCard from '@/components/league/ui/SectionCard'

// 선수카드 모달 · 클릭 후에만 로드 (recharts 포함)
const PlayerQuickViewModal = dynamic(() => import('../PlayerQuickViewModal'), { ssr: false })
// 비밀번호 변경 모달 · 클릭 시에만 로드
const PasswordChangeModal = dynamic(() => import('./PasswordChangeModal'), { ssr: false })

interface RankInfo { rank: number; total: number }
interface Season {
  attended_rounds: number
  pts: number; reb: number; ast: number; stl: number; blk: number
  ranks: {
    pts?: RankInfo; reb?: RankInfo; ast?: RankInfo; stl?: RankInfo; blk?: RankInfo
  }
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
const METRIC_LABEL: Record<Chaser['metric'], string> = { pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK' }
const METRIC_KOREAN: Record<Chaser['metric'], string> = { pts: '득점', reb: '리바운드', ast: '어시스트', stl: '스틸', blk: '블락' }

// 근접도 3티어 · 프로그레스 바·remaining 뱃지 색 결정 (배경/전경 쌍 · 캐주얼 전환 2026-08-06)
function proximityStyle(progressPct: number): { bg: string; fg: string } {
  if (progressPct >= 80) return { bg: 'var(--milestone-near-bg)', fg: 'var(--milestone-near-fg)' }
  if (progressPct >= 60) return { bg: 'var(--milestone-mid-bg)', fg: 'var(--milestone-mid-fg)' }
  return { bg: 'var(--milestone-far-bg)', fg: 'var(--milestone-far-fg)' }
}

// 순위 뱃지 스타일 · 1-3위 골드/실버/브론즈 배경 · 4-10위 rank-top · 11위+ 뉴트럴
// (2026-07-22 · rank 티어링 · '—' 제거 · 2026-08-06 배경/전경 쌍으로 전환
//  · 2026-08-06 이모지 메달 제거 — 숫자 배지(N위)로 통일, DynamicDuoPanel 과 동일한 rank-*-bg/fg 톤)
function rankStyle(rank: number, total: number): { color: string; bg?: string } {
  if (total <= 0) return { color: 'var(--mm-muted)' }
  if (rank === 1) return { color: 'var(--rank-1-fg)', bg: 'var(--rank-1-bg)' }  // gold
  if (rank === 2) return { color: 'var(--rank-2-fg)', bg: 'var(--rank-2-bg)' }  // silver
  if (rank === 3) return { color: 'var(--rank-3-fg)', bg: 'var(--rank-3-bg)' }  // bronze
  if (rank <= 10) return { color: 'var(--rank-top-fg)', bg: 'var(--rank-top-bg)' }
  return { color: 'var(--mm-muted)', bg: 'transparent' }
}

export default function PersonalDashboard({ leagueId, orgSlug }: Props) {
  const { user, loading: authLoading, refresh, logout } = useCurrentUser()
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
      <SectionCard variant="standalone" emphasized>
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
              <UserIcon size={22} style={{ color: 'var(--mm-muted)' }} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="font-jersey font-black text-xl md:text-2xl" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.01em' }}>
                {user.name ?? user.login_id}
              </span>
              <Sparkles size={16} style={{ color: 'var(--mm-ink-soft)' }} />
            </div>
            <div className="text-[12px] md:text-[13px] font-bold uppercase mt-0.5" style={{ color: 'var(--mm-muted)', letterSpacing: '0.14em' }}>
              나의 이번 시즌 대시보드
            </div>
          </div>
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 md:px-4 py-2 text-xs md:text-sm font-black uppercase min-h-[40px] md:min-h-[44px] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)]"
            style={{ background: 'var(--mm-black)', color: '#ffffff', border: '1px solid var(--mm-black)', borderRadius: '4px', letterSpacing: '0.12em' }}
            aria-label="선수카드 열기"
          >
            <IdCard size={14} />
            선수카드
          </button>
        </header>

        {loading || !data ? (
          <div className="py-8 text-center text-xs font-bold uppercase" style={{ color: 'var(--mm-muted)', letterSpacing: '0.14em' }}>
            로딩중…
          </div>
        ) : (
          <>
            {/* a. 시즌 통계 + 랭킹 (메달 · 초록 강조) */}
            <SeasonSummary season={data.season} />

            {/* a-2. 진행 중 스트릭 (연속 기록) — 있을 때만 */}
            <StreakBoard streaks={data.streaks ?? []} />

            {/* b. 이번 주 하이라이트 CTA · 최근 참여 라운드 */}
            <HighlightCTA available={data.weekly.available} href={highlightsHref} date={data.weekly.date} />

            {/* c. 마일스톤 체이서 (트렌드 삭제) */}
            <MilestoneChaser chasers={data.milestoneChasers} />
          </>
        )}

        {/* d. 계정 · 비밀번호 변경 / 로그아웃 */}
        <div
          className="flex items-center justify-between gap-2 flex-wrap px-4 md:px-5 py-3"
          style={{ borderTop: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}
        >
          <div className="flex items-center gap-2 min-w-0 text-[12px]" style={{ color: 'var(--mm-muted)' }}>
            <UserIcon size={13} aria-hidden />
            <span className="truncate">아이디 <b style={{ color: 'var(--mm-ink-soft)' }}>{user.login_id}</b></span>
            {user.is_default_password && (
              <span className="inline-flex items-center text-[10px] font-black uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-sm"
                style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)' }}>
                초기 비번
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPwOpen(true)}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.10em] rounded-sm cursor-pointer transition-colors"
              style={{
                background: user.is_default_password ? 'var(--mm-yellow)' : 'var(--mm-panel)',
                color: user.is_default_password ? 'var(--mm-black)' : 'var(--mm-ink)',
                border: `1px solid ${user.is_default_password ? 'var(--mm-black)' : 'var(--mm-rule)'}`,
              }}
            >
              <KeyRound size={12} aria-hidden />
              비밀번호 변경
            </button>
            <button
              type="button"
              onClick={() => logout()}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.10em] rounded-sm cursor-pointer transition-colors"
              style={{ background: 'var(--mm-panel)', color: 'var(--mm-muted)', border: '1px solid var(--mm-rule)' }}
              aria-label="로그아웃"
            >
              <LogOut size={12} aria-hidden />
              로그아웃
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

function SeasonSummary({ season }: { season: Season }) {
  const cells: Array<{ key: Chaser['metric']; value: number }> = [
    { key: 'pts', value: season.pts },
    { key: 'reb', value: season.reb },
    { key: 'ast', value: season.ast },
    { key: 'stl', value: season.stl },
    { key: 'blk', value: season.blk },
  ]
  return (
    <div className="px-4 sm:px-5 py-3 sm:py-4">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="font-bold text-base md:text-lg" style={{ color: 'var(--mm-ink)' }}>이번 시즌</span>
        <span
          className="inline-flex items-center text-[12px] md:text-[13px] font-black px-2 py-0.5"
          style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: '3px' }}
        >
          {season.attended_rounds}R 참석
        </span>
      </div>
      {/* 5개 지표 카드 · 각 지표 컬러 tint · 여백 최소화 */}
      <div className="grid grid-cols-5 gap-1.5 md:gap-2">
        {cells.map(({ key, value }) => (
          <StatCard
            key={key}
            metricKey={key}
            value={value}
            rank={season.ranks[key]}
          />
        ))}
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
        className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.14em] mt-0.5"
        style={{ color: 'var(--mm-muted)' }}
      >
        {METRIC_LABEL[metricKey]}
      </div>
      {/* 큰 숫자 */}
      <div
        className="font-jersey font-black tabular-nums leading-none my-1"
        style={{
          color: 'var(--mm-ink)',
          fontSize: 'clamp(24px, 5.5vw, 40px)',
          letterSpacing: '-0.015em',
        }}
      >
        {value}
      </div>
      {/* 랭킹 뱃지 · 통일 규칙 (2026-07-22 · 2026-08-06 이모지 메달 제거)
          1-3위: N위 · 골드/실버/브론즈 배경
          4-10위: N위 · rank-top 배경
          11위+: N위 · 뉴트럴 텍스트 · 배경 없음
          랭킹 정보 없음: 렌더 안 함 (— 제거) */}
      {rank && rank.total > 0 && rs && (
        <div
          className="inline-flex items-center gap-0.5 text-[11px] md:text-[12px] font-black tabular-nums px-1.5 py-0.5"
          style={{
            color: rs.color,
            background: rs.bg ?? 'transparent',
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

function LoginTeaser({ onDismiss }: { onDismiss: () => void }) {
  return (
    <SectionCard variant="standalone" emphasized>
      <div className="relative flex items-center gap-4 px-4 md:px-5 py-4 md:py-5">
        {/* 블러 처리된 가짜 스탯 실루엣 (장식) */}
        <div aria-hidden className="hidden sm:grid grid-cols-5 gap-1.5 w-[220px] shrink-0" style={{ filter: 'blur(3px)', opacity: 0.5 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-md border" style={{ background: 'var(--mm-panel-alt)', borderColor: 'var(--mm-rule)', height: 72 }} />
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg md:text-xl" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>내 기록, 여기 다 있어요</div>
          <p className="text-[13px] mt-1 leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
            우리 팀 선수라면 로그인하고 <b style={{ color: 'var(--mm-ink-soft)' }}>시즌 득점·리바운드 랭킹</b>과 <b style={{ color: 'var(--mm-ink-soft)' }}>진행 중 스트릭·마일스톤</b>을 확인하세요.
          </p>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('mm-open-login'))}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-md font-bold text-sm cursor-pointer transition-all hover:brightness-95 min-h-[44px]"
            style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)' }}
          >
            내 랭킹 확인하기 <ChevronRight size={16} />
          </button>
        </div>
        <button onClick={onDismiss} aria-label="닫기" className="absolute top-2 right-2 p-1.5 rounded cursor-pointer transition-colors" style={{ color: 'var(--mm-muted)' }}>
          <X size={16} />
        </button>
      </div>
    </SectionCard>
  )
}

function StreakBoard({ streaks }: { streaks: StreakItem[] }) {
  if (!streaks || streaks.length === 0) return null  // 진행 중 스트릭 없으면 섹션 숨김
  return (
    <div className="px-4 sm:px-5 py-3 sm:py-4" style={{ borderTop: '1px solid var(--mm-rule)' }}>
      <div className="flex items-center gap-1.5 mb-2.5">
        <Flame size={16} style={{ color: 'var(--color-hoop-orange-500)' }} />
        <span className="font-bold text-base md:text-lg" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>진행 중 스트릭</span>
        <span className="text-[11px] md:text-[12px] font-bold uppercase ml-1" style={{ color: 'var(--mm-muted)', letterSpacing: '0.14em' }}>다음 경기에 이어가요</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {streaks.map(s => (
          <span
            key={s.key}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md"
            style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
          >
            <Flame size={13} style={{ color: 'var(--color-hoop-orange-500)' }} />
            <span className="font-jersey font-black tabular-nums text-lg md:text-xl leading-none" style={{ color: 'var(--mm-ink)' }}>
              {s.count}{s.unit}
            </span>
            <span className="text-[12px] md:text-[13px] font-bold" style={{ color: 'var(--mm-muted)' }}>{s.label}</span>
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
          <div className="text-[12px] md:text-[13px] font-bold uppercase mt-0.5" style={{ letterSpacing: '0.10em' }}>
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

function MilestoneChaser({ chasers }: { chasers: Chaser[] }) {
  const shown = chasers.slice(0, 5)
  return (
    <div className="p-4 md:p-5" style={{ borderTop: '1px solid var(--mm-rule)' }}>
      <div className="flex items-center gap-1.5 mb-3">
        <Trophy size={16} style={{ color: 'var(--mm-ink-soft)' }} />
        <span className="font-bold text-base md:text-lg" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>
          마일스톤 체이서
        </span>
        <span className="text-[11px] md:text-[12px] font-bold uppercase ml-1" style={{ color: 'var(--mm-muted)', letterSpacing: '0.14em' }}>
          가까운 것부터
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="text-[13px]" style={{ color: 'var(--mm-muted)' }}>아직 통계 데이터가 부족해요</p>
      ) : (
        <div className="space-y-2.5 md:space-y-3">
          {shown.map(c => {
            const prox = proximityStyle(c.progressPct)
            return (
              <div key={c.metric}>
                <div className="flex items-center justify-between text-[12px] md:text-[13px] mb-1">
                  <span className="font-bold" style={{ color: METRIC_COLOR[c.metric] }}>
                    <b style={{ letterSpacing: '0.10em' }}>{c.metricLabel}</b>
                    <span className="ml-1.5" style={{ color: 'var(--mm-ink-soft)' }}>{METRIC_KOREAN[c.metric]}</span>
                  </span>
                  <span className="tabular-nums" style={{ color: 'var(--mm-ink)' }}>
                    <b>{c.current}</b> / {c.nextThreshold}
                    <span className="ml-1.5 text-[11px] font-black px-1.5 py-0.5" style={{ background: prox.bg, color: prox.fg, borderRadius: 'var(--mm-radius-chip)' }}>
                      -{c.remaining}
                    </span>
                  </span>
                </div>
                <div
                  className="relative overflow-hidden"
                  style={{ height: 8, background: 'var(--mm-panel-alt)', borderRadius: '4px', border: '1px solid var(--mm-rule)' }}
                >
                  <div
                    style={{ width: `${Math.min(100, c.progressPct)}%`, height: '100%', background: prox.fg }}
                  />
                </div>
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
