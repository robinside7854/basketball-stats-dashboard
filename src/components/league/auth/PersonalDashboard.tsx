'use client'
// 로그인 유저 전용 · 개인화 대시보드 (홈 상단)
//   a. 이번 시즌 참석 라운드 + 누적 PTS/REB/AST/STL/BLK + 각 항목 랭킹 (1-3위 메달 · 3-10위 초록 강조)
//   b. "이번 주 나의 하이라이트" CTA — 최근 참여한 라운드의 하이라이트로 연결
//   c. 마일스톤 체이서 (가장 도달 가능한 것부터)
//   d. 프로필카드 열기 CTA
import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Trophy, Film, User as UserIcon, ChevronRight, Sparkles, IdCard } from 'lucide-react'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'
import SectionCard from '@/components/league/ui/SectionCard'

// 선수카드 모달 · 클릭 후에만 로드 (recharts 포함)
const PlayerQuickViewModal = dynamic(() => import('../PlayerQuickViewModal'), { ssr: false })

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
interface DashboardData {
  season: Season
  weekly: Weekly
  milestoneChasers: Chaser[]
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

// 근접도 3티어 · 프로그레스 바·remaining 뱃지 색 결정 (2026-07-22)
function proximityColor(progressPct: number): string {
  if (progressPct >= 80) return 'var(--milestone-near)'
  if (progressPct >= 60) return 'var(--milestone-mid)'
  return 'var(--milestone-far)'
}

// 랭킹 스타일 · 1위=🥇 · 2위=🥈 · 3위=🥉 · 3-10위 초록 강조 (3위는 메달 + 초록)
function rankStyle(rank: number, total: number): { badge?: string; color: string } {
  if (total <= 0) return { color: 'var(--mm-muted)' }
  if (rank === 1) return { badge: '🥇', color: '#059669' }
  if (rank === 2) return { badge: '🥈', color: '#059669' }
  if (rank === 3) return { badge: '🥉', color: '#059669' }
  if (rank <= 10) return { color: '#059669' }
  return { color: 'var(--mm-muted)' }
}

export default function PersonalDashboard({ leagueId, orgSlug }: Props) {
  const { user, loading: authLoading } = useCurrentUser()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/auth/dashboard`, { cache: 'no-store' })
      if (r.ok) setData(await r.json())
    } finally { setLoading(false) }
  }, [leagueId, user])

  useEffect(() => { load() }, [load])

  if (authLoading || !user) return null

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
            style={{ background: 'var(--mm-black)', color: 'var(--mm-panel)', border: '1px solid var(--mm-black)', borderRadius: '4px', letterSpacing: '0.12em' }}
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

            {/* b. 이번 주 하이라이트 CTA · 최근 참여 라운드 */}
            <HighlightCTA available={data.weekly.available} href={highlightsHref} date={data.weekly.date} />

            {/* c. 마일스톤 체이서 (트렌드 삭제) */}
            <MilestoneChaser chasers={data.milestoneChasers} />
          </>
        )}
      </SectionCard>

      {profileOpen && user && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={user.player_id}
          playerName={user.name ?? user.login_id}
          onClose={() => setProfileOpen(false)}
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
        <span className="font-jersey font-black uppercase text-base md:text-lg" style={{ color: 'var(--mm-ink)' }}>이번 시즌</span>
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
  const color = METRIC_COLOR[metricKey]
  const rs = rank ? rankStyle(rank.rank, rank.total) : null
  const isTop3 = rank && rank.rank <= 3 && rank.total > 0
  return (
    <div
      className="relative flex flex-col items-center justify-between overflow-hidden"
      style={{
        background: `${color}12`,          // 12 = ~7% opacity
        border: `1.5px solid ${color}55`,  // 55 = ~33% opacity
        borderRadius: '6px',
        padding: '10px 4px 8px',
        minHeight: 96,
      }}
    >
      {/* 상단 색 라인 (metric 컬러 강조) */}
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0"
        style={{ height: 3, background: color }}
      />
      {/* 지표 라벨 */}
      <div
        className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.14em] mt-0.5"
        style={{ color }}
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
      {/* 랭킹 뱃지 · 메달 or 초록 or 회색 */}
      {rank && rank.total > 0 && rs ? (
        <div
          className="inline-flex items-center gap-0.5 text-[11px] md:text-[12px] font-black tabular-nums px-1.5 py-0.5"
          style={{
            color: isTop3 ? '#fff' : rs.color,
            background: isTop3 ? rs.color : 'transparent',
            borderRadius: '3px',
            letterSpacing: '-0.005em',
          }}
          title={`${rank.rank}위 / ${rank.total}명`}
        >
          {rs.badge && <span aria-hidden style={{ fontSize: '13px' }}>{rs.badge}</span>}
          <span>{rank.rank}위</span>
        </div>
      ) : (
        <div className="text-[10px] font-bold" style={{ color: 'var(--mm-muted)' }}>—</div>
      )}
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
          <div className="font-jersey font-black uppercase text-base md:text-lg" style={{ letterSpacing: '-0.005em' }}>
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
        <span className="font-jersey font-black uppercase text-base md:text-lg" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>
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
            const proxColor = proximityColor(c.progressPct)
            return (
              <div key={c.metric}>
                <div className="flex items-center justify-between text-[12px] md:text-[13px] mb-1">
                  <span className="font-bold" style={{ color: METRIC_COLOR[c.metric] }}>
                    <b style={{ letterSpacing: '0.10em' }}>{c.metricLabel}</b>
                    <span className="ml-1.5" style={{ color: 'var(--mm-ink-soft)' }}>{METRIC_KOREAN[c.metric]}</span>
                  </span>
                  <span className="tabular-nums" style={{ color: 'var(--mm-ink)' }}>
                    <b>{c.current}</b> / {c.nextThreshold}
                    <span className="ml-1.5 text-[11px] font-black px-1.5 py-0.5" style={{ background: proxColor, color: '#fff', borderRadius: '2px' }}>
                      -{c.remaining}
                    </span>
                  </span>
                </div>
                <div
                  className="relative overflow-hidden"
                  style={{ height: 8, background: 'var(--mm-panel-alt)', borderRadius: '4px', border: '1px solid var(--mm-rule)' }}
                >
                  <div
                    style={{ width: `${Math.min(100, c.progressPct)}%`, height: '100%', background: proxColor }}
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
