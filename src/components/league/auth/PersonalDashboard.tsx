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
      <section
        className="mm-brand"
        style={{
          background: 'linear-gradient(135deg, var(--mm-panel) 0%, var(--mm-yellow-soft) 130%)',
          border: '1px solid var(--mm-yellow)',
          borderRadius: '6px',
          boxShadow: '0 12px 32px -12px rgba(202,138,4,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* 헤더 · 유저 프로필 + 프로필카드 열기 CTA */}
        <header className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
          <div
            className="relative w-11 h-11 shrink-0 rounded-full overflow-hidden flex items-center justify-center"
            style={{ background: 'var(--mm-panel-alt)', border: '2px solid var(--mm-yellow)' }}
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
              <span className="font-jersey font-black text-lg" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>
                {user.name ?? user.login_id}
              </span>
              <Sparkles size={14} style={{ color: 'var(--mm-yellow-strong)' }} />
            </div>
            <div className="text-[11px] font-bold uppercase mt-0.5" style={{ color: 'var(--mm-muted)', letterSpacing: '0.14em' }}>
              나의 이번 시즌 대시보드
            </div>
          </div>
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-black uppercase min-h-[36px] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)]"
            style={{ background: 'var(--mm-black)', color: 'var(--mm-yellow)', border: '1px solid var(--mm-black)', borderRadius: '3px', letterSpacing: '0.12em' }}
            aria-label="선수카드 열기"
          >
            <IdCard size={13} />
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
      </section>

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
    <div className="px-5 py-4">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="font-jersey font-black uppercase text-sm" style={{ color: 'var(--mm-ink)' }}>이번 시즌</span>
        <span
          className="inline-flex items-center text-[11px] font-black px-1.5 py-0.5"
          style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '3px' }}
        >
          {season.attended_rounds}R 참석
        </span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {cells.map(({ key, value }) => {
          const rank = season.ranks[key]
          const rs = rank ? rankStyle(rank.rank, rank.total) : null
          return (
            <div key={key} className="text-center">
              <div
                className="text-[10px] font-black uppercase tracking-[0.14em]"
                style={{ color: METRIC_COLOR[key] }}
              >
                {METRIC_LABEL[key]}
              </div>
              <div
                className="font-jersey font-black tabular-nums leading-none mt-1"
                style={{ color: 'var(--mm-ink)', fontSize: 'clamp(20px, 5vw, 26px)', letterSpacing: '-0.01em' }}
              >
                {value}
              </div>
              {rank && rank.total > 0 && rs ? (
                <div
                  className="inline-flex items-center gap-0.5 text-[11px] font-black mt-1"
                  style={{ color: rs.color, letterSpacing: '-0.005em' }}
                  title={`${rank.rank}위 / ${rank.total}명`}
                >
                  {rs.badge && <span aria-hidden>{rs.badge}</span>}
                  <span className="tabular-nums">{rank.rank}위</span>
                </div>
              ) : (
                <div className="text-[10px] font-bold mt-1" style={{ color: 'var(--mm-muted)' }}>—</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HighlightCTA({ available, href, date }: { available: boolean; href: string | null; date?: string }) {
  const content = (
    <div
      className="flex items-center justify-between gap-3 px-5 py-3.5"
      style={{
        borderTop: '1px solid var(--mm-rule)',
        background: available ? 'var(--mm-yellow)' : 'var(--mm-panel-alt)',
        color: available ? 'var(--mm-black)' : 'var(--mm-muted)',
        opacity: available ? 1 : 0.65,
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Film size={18} className="shrink-0" />
        <div className="min-w-0">
          <div className="font-jersey font-black uppercase text-sm" style={{ letterSpacing: '-0.005em' }}>
            나의 이번 주 하이라이트
          </div>
          <div className="text-[11px] font-bold uppercase mt-0.5" style={{ letterSpacing: '0.10em' }}>
            {available ? `${formatDate(date)} 참여 · 클립 자동재생` : '아직 참여 기록이 없어요'}
          </div>
        </div>
      </div>
      {available && <ChevronRight size={18} />}
    </div>
  )
  if (!available || !href) return content
  return <Link href={href} className="block cursor-pointer transition-all hover:brightness-95">{content}</Link>
}

function MilestoneChaser({ chasers }: { chasers: Chaser[] }) {
  const shown = chasers.slice(0, 5)
  return (
    <div className="p-5" style={{ borderTop: '1px solid var(--mm-rule)' }}>
      <div className="flex items-center gap-1.5 mb-3">
        <Trophy size={14} style={{ color: 'var(--mm-yellow-strong)' }} />
        <span className="font-jersey font-black uppercase text-sm" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>
          마일스톤 체이서
        </span>
        <span className="text-[10px] font-bold uppercase ml-1" style={{ color: 'var(--mm-muted)', letterSpacing: '0.14em' }}>
          가까운 것부터
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="text-[12px]" style={{ color: 'var(--mm-muted)' }}>아직 통계 데이터가 부족해요</p>
      ) : (
        <div className="space-y-3">
          {shown.map(c => (
            <div key={c.metric}>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-bold" style={{ color: METRIC_COLOR[c.metric] }}>
                  <b style={{ letterSpacing: '0.10em' }}>{c.metricLabel}</b>
                  <span className="ml-1.5" style={{ color: 'var(--mm-ink-soft)' }}>{METRIC_KOREAN[c.metric]}</span>
                </span>
                <span className="tabular-nums" style={{ color: 'var(--mm-ink)' }}>
                  <b>{c.current}</b> / {c.nextThreshold}
                  <span className="ml-1.5 text-[10px] font-black px-1 py-0.5" style={{ background: METRIC_COLOR[c.metric], color: '#fff', borderRadius: '2px' }}>
                    -{c.remaining}
                  </span>
                </span>
              </div>
              <div
                className="relative overflow-hidden"
                style={{ height: 6, background: 'var(--mm-panel-alt)', borderRadius: '3px', border: '1px solid var(--mm-rule)' }}
              >
                <div
                  style={{ width: `${Math.min(100, c.progressPct)}%`, height: '100%', background: METRIC_COLOR[c.metric] }}
                />
              </div>
            </div>
          ))}
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
