'use client'
// 홈 맨 위 「내 카드」 (리뉴얼 2단계, 2026-10-12) — "토요일 아침 농구 한 번 = 하루 1라운드".
//   ① 지난 경기일 내 하루(득점·리바·어시… + 그날 내 경기 승패)
//   ② 하루 평균 + 순위(가장 높은 항목의 「상위 N%」 막대) — 「이번 분기 | 전체」 전환(2026-10-12)
//      출전 분모는 내 첫 기록일부터(중간 합류 회원이 그 전 경기일을 결장으로 잡히지 않게)
//   ③ 다음 마일스톤(시즌 누적)
// 숫자는 전부 기존 응답 그대로다 — 새 지표를 만들지 않는다(②③ = /auth/dashboard, ① = daily-boxscore).
// 비로그인: 얇은 로그인 안내 한 줄. 로그인했지만 미승인: 아무것도 그리지 않는다.
import type { ReactNode } from 'react'
import Link from 'next/link'
import PlayerName from '@/components/league/ui/PlayerName'
import { ChevronRight, LogIn } from 'lucide-react'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import SectionCard from '@/components/league/ui/SectionCard'
import Avatar from '@/components/league/ui/Avatar'
import Chip from '@/components/league/ui/Chip'
import { ProgressBar, ResultDots } from '@/components/league/ui/viz'
import { accentOrInk } from '@/lib/util/contrastColor'
import SegmentedTabs from '@/components/league/ui/SegmentedTabs'
import { useHomeMe, useMePeriod, myTotalRounds, type MePeriod, type MePeriodBlock } from './HomeMeContext'

type Metric = 'pts' | 'reb' | 'ast' | 'stl' | 'blk'
const SHORT: Record<Metric, string> = { pts: '득점', reb: '리바', ast: '어시', stl: '스틸', blk: '블락' }
const LONG: Record<Metric, string> = { pts: '득점', reb: '리바운드', ast: '어시스트', stl: '스틸', blk: '블락' }

// 「이번 분기 · 하루 평균 기준」 안내 — 기준이 시즌 누적에서 바뀐 첫 주(~10/18)와,
//   매 분기 첫 경기일(평균이 하루치뿐이라 숫자가 낯설게 보일 때)에만 보인다.
const BASIS_NOTICE_UNTIL = '2026-10-19'

function todayKst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

// 숫자 한 칸 — 카드 바탕 위에 숫자가 그냥 떠 있지 않게 옅은 칸(panel-alt)에 담는다(2026-10-13 가독성).
//   size: lg = 득점 같은 주 지표 · md = 기본 · sm = 4칸 줄(스틸·블락·야투율 — 360px 에서 칸당 ~68px)
function StatCell({ label, value, sub, size = 'md' }: { label: string; value: string | number; sub?: string; size?: 'sm' | 'md' | 'lg' }) {
  const fontSize = size === 'lg' ? 'clamp(24px, 6.5vw, 30px)' : size === 'md' ? 'clamp(20px, 5.5vw, 24px)' : 'clamp(17px, 4.6vw, 20px)'
  return (
    <div
      className="min-w-0 flex flex-col items-center text-center px-1 py-2"
      style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}
    >
      <span className="text-[11px] sm:text-xs font-bold break-keep" style={{ color: 'var(--mm-ink-soft)' }}>{label}</span>
      <span
        className="font-jersey font-black tabular-nums leading-none mt-1 whitespace-nowrap"
        style={{ color: 'var(--mm-ink)', fontSize }}
      >
        {value}
      </span>
      <span className="text-[11px] font-bold tabular-nums mt-1 leading-none min-h-[11px] whitespace-nowrap" style={{ color: 'var(--mm-muted)' }}>
        {sub ?? ''}
      </span>
    </div>
  )
}

/** 성공률 칸 값 — 시도가 없으면 「–」(0% 로 보이면 「다 놓쳤다」로 읽힌다) */
function pctValue(made: number, att: number, pct: number): { value: string; sub: string | undefined } {
  if (att <= 0) return { value: '–', sub: '시도 없음' }
  return { value: `${pct.toFixed(1)}%`, sub: `${made}/${att}` }
}

function Block({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <div className="px-4 lg:px-5 py-3.5" style={{ borderTop: '1px solid var(--mm-rule)' }}>
      <div className="flex items-baseline justify-between gap-2 mb-2.5">
        <h3 className="text-base font-black break-keep" style={{ color: 'var(--mm-ink)' }}>{title}</h3>
        {meta && <span className="t-label break-keep text-right">{meta}</span>}
      </div>
      {children}
    </div>
  )
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}.${Number(d)}`
}

/** 「첫 기록 5.16부터 · 12일 중 10일 출전」 — 첫 기록일이 이 기간 중간일 때만 첫 기록일을 밝힌다 */
function attendanceCopy(b: MePeriodBlock): string {
  const mine = myTotalRounds(b)
  const joinedMid = !!b.joined_on && mine < b.total_rounds
  return `${joinedMid ? `첫 기록 ${shortDate(b.joined_on!)}부터 · ` : ''}${mine}일 중 ${b.attended_rounds}일 출전`
}

function PeriodBlock({ b, period, onPeriod }: {
  b: MePeriodBlock | undefined
  period: MePeriod
  onPeriod: (p: MePeriod) => void
}) {
  const toggle = (
    <SegmentedTabs
      size="sm"
      ariaLabel="내 기록 기간"
      value={period}
      onChange={onPeriod}
      items={[{ key: 'quarter', label: '이번 분기' }, { key: 'career', label: '전체' }]}
    />
  )
  const head = (
    <div className="flex items-center justify-between gap-2 mb-2.5">
      <h3 className="text-base font-black break-keep min-w-0" style={{ color: 'var(--mm-ink)' }}>
        하루 평균{period === 'quarter' && b?.label ? <span className="t-label ml-1.5">{b.label}</span> : null}
      </h3>
      {toggle}
    </div>
  )
  const wrap = (children: ReactNode) => (
    <div className="px-4 lg:px-5 py-3.5" style={{ borderTop: '1px solid var(--mm-rule)' }}>
      {head}
      {children}
    </div>
  )
  // 옛 응답(배포 직후)에는 career 가 없다
  if (!b) return wrap(<p className="text-sm" style={{ color: 'var(--mm-muted)' }}>잠시 후 다시 열면 보여요.</p>)
  if (b.attended_rounds === 0) {
    return wrap(
      <p className="text-sm" style={{ color: 'var(--mm-muted)' }}>
        {period === 'quarter' ? '이번 분기 출전 기록이 아직 없어요.' : '아직 출전 기록이 없어요.'}
      </p>,
    )
  }
  // 가장 높은 순위의 항목 하나로 「상위 N%」 — 순위 모집단은 홈 리그 리더와 같은 최소 출전 충족자
  const best = (Object.entries(b.ranks) as Array<[Metric, { rank: number; total: number }]>)
    .filter(([, r]) => r && r.total > 0)
    .sort((x, y) => x[1].rank / x[1].total - y[1].rank / y[1].total)[0]
  const topPct = best ? Math.max(1, Math.ceil((best[1].rank / best[1].total) * 100)) : null
  return wrap(
    <>
      <p className="t-label break-keep -mt-1 mb-2.5 tabular-nums">{attendanceCopy(b)}</p>
      {/* 1줄: 득점·리바·어시(크게) / 2줄: 스틸·블락·야투율·3점 야투율 (2026-10-13 사용자 요청).
          성공률은 순위가 없다 — 홈 리그 리더에 야투율 자격(최소 시도) 규칙이 없어서 등수를 매기면 기준이 갈라진다. */}
      <div className="grid grid-cols-3 gap-1.5">
        {(['pts', 'reb', 'ast'] as const).map(m => (
          <StatCell
            key={m}
            label={SHORT[m]}
            value={(b.per_day[m] ?? 0).toFixed(1)}
            sub={b.ranks[m] ? `${b.ranks[m]!.rank}위` : undefined}
            size={m === 'pts' ? 'lg' : 'md'}
          />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1.5 mt-1.5">
        {(['stl', 'blk'] as const).map(m => (
          <StatCell
            key={m}
            label={SHORT[m]}
            value={(b.per_day[m] ?? 0).toFixed(1)}
            sub={b.ranks[m] ? `${b.ranks[m]!.rank}위` : undefined}
            size="sm"
          />
        ))}
        {b.shooting ? (
          <>
            <StatCell label="야투율" size="sm" {...pctValue(b.shooting.fgm, b.shooting.fga, b.shooting.fg_pct)} />
            <StatCell label="3점 야투율" size="sm" {...pctValue(b.shooting.fg3m, b.shooting.fg3a, b.shooting.fg3_pct)} />
          </>
        ) : (
          // 옛 응답(배포 직후)에는 shooting 이 없다 — 칸만 비워 둔다
          <>
            <StatCell label="야투율" size="sm" value="–" />
            <StatCell label="3점 야투율" size="sm" value="–" />
          </>
        )}
      </div>
      {b.eligible && best && topPct != null ? (
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
              순위는 {b.min_rounds}일 출전부터
            </span>
            <span className="text-xs font-black tabular-nums" style={{ color: 'var(--mm-muted)' }}>{b.attended_rounds}/{b.min_rounds}일</span>
          </div>
          <ProgressBar value={b.attended_rounds} max={Math.max(1, b.min_rounds)} height={8} label={`순위 진입까지 ${Math.max(0, b.min_rounds - b.attended_rounds)}일`} />
        </div>
      )}
    </>,
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
  const [period, setPeriod] = useMePeriod(leagueId)
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
  const block = period === 'quarter' ? q : dashboard?.career
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
            <PlayerName
              id={user.player_id}
              name={user.name ?? user.login_id}
              hitArea={false}
              className="block max-w-full font-black truncate"
              style={{ color: 'var(--mm-ink)', fontSize: 18, lineHeight: 1.2 }}
            />
            {showNotice && (
              <p className="text-[11px] font-medium break-keep mt-0.5" style={{ color: 'var(--mm-muted)' }}>
                {period === 'quarter' ? '이번 분기' : '전체 기간'} · 하루 평균 기준으로 보여줘요
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
                  <div className="grid grid-cols-5 gap-1.5">
                    <StatCell label="득점" value={day.line.pts} size="lg" />
                    <StatCell label="리바" value={day.line.reb} size="sm" />
                    <StatCell label="어시" value={day.line.ast} size="sm" />
                    <StatCell label="스틸" value={day.line.stl} size="sm" />
                    <StatCell label="블락" value={day.line.blk} size="sm" />
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

          {/* ② 하루 평균 · 순위 — 「이번 분기 | 전체」 (고른 값은 보는 사람별로 기억) */}
          {q && <PeriodBlock b={block} period={period} onPeriod={setPeriod} />}

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
