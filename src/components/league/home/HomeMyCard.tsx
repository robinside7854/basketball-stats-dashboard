'use client'
// 홈 맨 위 「내 카드」 (리뉴얼 2단계, 2026-10-12) — "토요일 아침 농구 한 번 = 하루 1라운드".
//   ① 지난 경기일 내 하루(득점·리바·어시… + 그날 내 경기 승패)
//   ② 이번 분기 하루 평균 + 순위(가장 높은 항목의 「상위 N%」 막대)
//   ③ 다음 마일스톤(시즌 누적)
// 숫자는 전부 기존 응답 그대로다 — 새 지표를 만들지 않는다(②③ = /auth/dashboard, ① = daily-boxscore).
// 비로그인: 얇은 로그인 안내 한 줄. 로그인했지만 미승인: 아무것도 그리지 않는다.
import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight, LogIn } from 'lucide-react'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import SectionCard from '@/components/league/ui/SectionCard'
import Avatar from '@/components/league/ui/Avatar'
import Chip from '@/components/league/ui/Chip'
import { ProgressBar, ResultDots } from '@/components/league/ui/viz'
import { accentOrInk } from '@/lib/util/contrastColor'
import { useHomeMe, type HomeDashboard } from './HomeMeContext'

type Metric = 'pts' | 'reb' | 'ast' | 'stl' | 'blk'
const SHORT: Record<Metric, string> = { pts: '득점', reb: '리바', ast: '어시', stl: '스틸', blk: '블락' }
const LONG: Record<Metric, string> = { pts: '득점', reb: '리바운드', ast: '어시스트', stl: '스틸', blk: '블락' }

// 「이번 분기 · 하루 평균 기준」 안내 — 기준이 시즌 누적에서 바뀐 첫 주(~10/18)와,
//   매 분기 첫 경기일(평균이 하루치뿐이라 숫자가 낯설게 보일 때)에만 보인다.
const BASIS_NOTICE_UNTIL = '2026-10-19'

function todayKst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

function StatCell({ label, value, sub, strong = false }: { label: string; value: string | number; sub?: string; strong?: boolean }) {
  return (
    <div className="min-w-0 flex flex-col items-center text-center">
      <span className="t-label">{label}</span>
      <span
        className="font-jersey font-black tabular-nums leading-none mt-1"
        style={{ color: 'var(--mm-ink)', fontSize: strong ? 'clamp(26px, 7vw, 32px)' : 'clamp(20px, 5.5vw, 24px)' }}
      >
        {value}
      </span>
      {sub && <span className="text-[11px] font-bold tabular-nums mt-1" style={{ color: 'var(--mm-muted)' }}>{sub}</span>}
    </div>
  )
}

function Block({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <div className="px-4 lg:px-5 py-3.5" style={{ borderTop: '1px solid var(--mm-rule)' }}>
      <div className="flex items-baseline justify-between gap-2 mb-2.5">
        <h3 className="text-sm font-black break-keep" style={{ color: 'var(--mm-ink)' }}>{title}</h3>
        {meta && <span className="t-label break-keep text-right">{meta}</span>}
      </div>
      {children}
    </div>
  )
}

function QuarterBlock({ q }: { q: NonNullable<HomeDashboard['quarter']> }) {
  const title = `${q.label ? `${q.label} · ` : ''}하루 평균`
  if (q.attended_rounds === 0) {
    return (
      <Block title={title}>
        <p className="text-sm" style={{ color: 'var(--mm-muted)' }}>이번 분기 출전 기록이 아직 없어요.</p>
      </Block>
    )
  }
  // 가장 높은 순위의 항목 하나로 「상위 N%」 — 순위 모집단은 홈 리그 리더와 같은 최소 출전 충족자
  const best = (Object.entries(q.ranks) as Array<[Metric, { rank: number; total: number }]>)
    .filter(([, r]) => r && r.total > 0)
    .sort((a, b) => a[1].rank / a[1].total - b[1].rank / b[1].total)[0]
  const topPct = best ? Math.max(1, Math.ceil((best[1].rank / best[1].total) * 100)) : null
  return (
    <Block title={title} meta={`${q.attended_rounds}/${q.total_rounds}일 출전`}>
      <div className="grid grid-cols-3 gap-2">
        {(['pts', 'reb', 'ast'] as const).map(m => (
          <StatCell
            key={m}
            label={SHORT[m]}
            value={(q.per_day[m] ?? 0).toFixed(1)}
            sub={q.ranks[m] ? `${q.ranks[m]!.rank}위` : undefined}
          />
        ))}
      </div>
      {q.eligible && best && topPct != null ? (
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-xs font-bold break-keep" style={{ color: 'var(--mm-ink-soft)' }}>
              {LONG[best[0]]} {best[1].rank}위 / {best[1].total}명
            </span>
            <span className="text-xs font-black tabular-nums" style={{ color: 'var(--mm-yellow-strong)' }}>상위 {topPct}%</span>
          </div>
          <ProgressBar
            value={best[1].total - best[1].rank + 1}
            max={best[1].total}
            height={8}
            label={`${LONG[best[0]]} 상위 ${topPct}퍼센트`}
          />
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-xs font-bold break-keep" style={{ color: 'var(--mm-ink-soft)' }}>
              순위는 {q.min_rounds}일 출전부터
            </span>
            <span className="text-xs font-black tabular-nums" style={{ color: 'var(--mm-muted)' }}>{q.attended_rounds}/{q.min_rounds}일</span>
          </div>
          <ProgressBar value={q.attended_rounds} max={Math.max(1, q.min_rounds)} height={8} label={`순위 진입까지 ${Math.max(0, q.min_rounds - q.attended_rounds)}일`} />
        </div>
      )}
    </Block>
  )
}

export default function HomeMyCard({ orgSlug, leagueId, latestLabel }: {
  orgSlug: string
  leagueId: string
  /** 최근 경기일 표시(`10/11 (토)`) — 서버가 「최근 라운드」와 같은 함수로 만든 값 */
  latestLabel: string | null
}) {
  const { user, loading: authLoading } = useCurrentUser()
  const { openLogin } = useLeagueEditMode()
  const { isMember, serverMember, status, dashboard, day } = useHomeMe()
  const meHref = `/league/${orgSlug}/${leagueId}/me`

  // 비로그인 — 얇은 안내 한 줄(페이지를 밀어내지 않게)
  if (!user) {
    // 로그인 확인 중 — 승인 회원이면 카드 자리를 미리 잡아 화면이 아래로 튀지 않게 한다
    if (authLoading) {
      return serverMember ? (
        <div
          className="h-48 animate-pulse"
          style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' }}
          aria-busy="true"
          aria-label="내 카드 불러오는 중"
        />
      ) : null
    }
    return (
      <div
        className="flex items-center justify-between gap-3 px-4 py-2"
        style={{ background: 'var(--mm-panel)', border: '1px dashed var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' }}
      >
        <p className="text-sm font-medium break-keep min-w-0" style={{ color: 'var(--mm-ink-soft)' }}>
          로그인하면 지난 경기 내 기록과 분기 순위가 여기 보여요
        </p>
        <button
          type="button"
          onClick={openLogin}
          className="inline-flex items-center gap-1 min-h-[44px] px-3 text-sm font-black whitespace-nowrap cursor-pointer shrink-0 hover:brightness-95"
          style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: 'var(--mm-radius-ctl)' }}
        >
          <LogIn size={14} aria-hidden />
          로그인
        </button>
      </div>
    )
  }
  // 로그인했지만 승인 대기 — 홈을 깨지 않게 조용히 비운다
  if (!isMember) return null

  const loading = status === 'idle' || status === 'loading'
  const q = dashboard?.quarter
  const chaser = dashboard?.milestoneChasers?.[0]
  const today = todayKst()
  const showNotice = today < BASIS_NOTICE_UNTIL || (q != null && q.total_rounds <= 1)
  const wins = day?.results.filter(r => r === 'W').length ?? 0
  const losses = day?.results.filter(r => r === 'L').length ?? 0
  const draws = day?.results.filter(r => r === 'D').length ?? 0

  return (
    <SectionCard variant="stack" pad="none" emphasized ariaLabel="내 카드">
      <header className="flex items-center justify-between gap-3 px-4 lg:px-5 pt-3.5 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar src={user.photo_url} name={user.name ?? user.login_id} size={40} decorative />
          <div className="min-w-0">
            <p className="font-black truncate" style={{ color: 'var(--mm-ink)', fontSize: 18, lineHeight: 1.2 }}>
              {user.name ?? user.login_id}
            </p>
            {showNotice && (
              <p className="text-[11px] font-medium break-keep mt-0.5" style={{ color: 'var(--mm-muted)' }}>
                이번 분기 · 하루 평균 기준으로 보여줘요
              </p>
            )}
          </div>
        </div>
        <Link
          href={meHref}
          className="inline-flex items-center gap-0.5 min-h-[44px] px-2 -mr-2 text-sm font-bold whitespace-nowrap shrink-0 hover:brightness-90"
          style={{ color: 'var(--mm-ink-soft)' }}
        >
          내 기록 자세히
          <ChevronRight size={16} aria-hidden />
        </Link>
      </header>

      {loading ? (
        <div className="px-4 lg:px-5 py-4 space-y-3" style={{ borderTop: '1px solid var(--mm-rule)' }} aria-busy="true" aria-label="내 기록 불러오는 중">
          {[0, 1].map(i => (
            <div key={i} className="h-16 animate-pulse" style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-ctl)' }} />
          ))}
        </div>
      ) : status === 'error' ? (
        <div className="px-4 lg:px-5 py-4 text-sm" style={{ borderTop: '1px solid var(--mm-rule)', color: 'var(--mm-muted)' }}>
          내 기록을 불러오지 못했어요. <Link href={meHref} className="underline font-bold" style={{ color: 'var(--mm-ink)' }}>내 기록</Link>에서 다시 볼 수 있어요.
        </div>
      ) : (
        <>
          {/* ① 지난 경기일 내 하루 */}
          {latestLabel && (
            <Block
              title={`${latestLabel} 내 하루`}
              meta={day?.line?.team_name ? (
                <span className="font-black" style={{ color: accentOrInk(day.line.team_color) }}>{day.line.team_name}</span>
              ) : undefined}
            >
              {day?.line ? (
                <>
                  <div className="grid grid-cols-5 gap-1">
                    <StatCell label="득점" value={day.line.pts} strong />
                    <StatCell label="리바" value={day.line.reb} />
                    <StatCell label="어시" value={day.line.ast} />
                    <StatCell label="스틸" value={day.line.stl} />
                    <StatCell label="블락" value={day.line.blk} />
                  </div>
                  {day.results.length > 0 && (
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <ResultDots results={day.results} size={12} />
                      <Chip tone={wins > losses ? 'positive' : wins < losses ? 'negative' : 'neutral'} size="sm">
                        {day.results.length}경기 {wins}승 {losses}패{draws > 0 ? ` ${draws}무` : ''}
                      </Chip>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm" style={{ color: 'var(--mm-muted)' }}>이날은 출전 기록이 없어요.</p>
              )}
            </Block>
          )}

          {/* ② 이번 분기 하루 평균 · 순위 */}
          {q && <QuarterBlock q={q} />}

          {/* ③ 다음 마일스톤 (시즌 누적) */}
          {chaser && (
            <Block title="다음 마일스톤" meta="시즌 누적">
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <span className="text-sm font-bold break-keep" style={{ color: 'var(--mm-ink)' }}>
                  {LONG[chaser.metric]} {chaser.nextThreshold.toLocaleString()}
                </span>
                <span className="text-xs font-black tabular-nums" style={{ color: 'var(--mm-yellow-strong)' }}>
                  {chaser.remaining.toLocaleString()} 남음
                </span>
              </div>
              {/* 막대 = 직전 단계 → 다음 단계 사이 진행률(/me 마일스톤과 같은 값) */}
              <ProgressBar
                value={chaser.progressPct}
                max={100}
                height={8}
                label={`${LONG[chaser.metric]} ${chaser.current} / ${chaser.nextThreshold}`}
              />
            </Block>
          )}
        </>
      )}
    </SectionCard>
  )
}
