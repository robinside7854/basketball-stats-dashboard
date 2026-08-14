// 명경기 — 월별로 가장 볼 만했던 경기 하나씩.
//
// 기준과 가중치는 `@/lib/stats/classicGames` 가 정본이다(실측 근거도 그 파일 주석에 있다).
// 이 화면은 그 결과를 읽어 보여주기만 한다 — 판정을 두 곳에서 하면 언젠가 어긋난다.
//
// 서버 컴포넌트. 스탯 게이팅을 거치므로 비회원에게는 StatGate 가 대신 뜬다.
import { unstable_cache } from 'next/cache'
import { Trophy } from 'lucide-react'
import LeagueGroupTabs from '@/components/league/LeagueGroupTabs'
import SectionCard from '@/components/league/ui/SectionCard'
import EmptyState from '@/components/league/EmptyState'
import StatGate from '@/components/league/auth/StatGate'
import { computeClassicGames, type ClassicGame } from '@/lib/stats/classicGames'
import ClassicGameClips from '@/components/league/ClassicGameClips'
import { getApprovedSession, isLeaguePrivateGated } from '@/lib/auth/guard'

const getCached = (leagueId: string) =>
  unstable_cache(
    async () => computeClassicGames(null, leagueId),
    ['league-classics-page', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`], revalidate: 300 },
  )()

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y.slice(2)}년 ${Number(m)}월`
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}.${d.getDate()} (${days[d.getDay()]})`
}

export default async function ClassicGamesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
}) {
  const { orgSlug, leagueId } = await params

  // 비공개 리그 raw HTML 누출 방지 — layout 만 막으면 page 가 병렬 렌더돼 RSC 청크로 샌다.
  if (await isLeaguePrivateGated(leagueId)) return null

  const base = `/league/${orgSlug}/${leagueId}`
  const groupTabs = [
    { href: `${base}/highlights`,             label: '경기별 하이라이트', active: false },
    { href: `${base}/highlights/classics`,    label: '명경기',           active: true },
    { href: `${base}/highlights/milestones`,  label: '커리어 마일스톤',  active: false },
    { href: `${base}/highlights/best-shots`,  label: '베스트샷',         active: false },
  ]

  // 명경기는 경기 기록에서 파생된 스탯이라 스탯과 같은 문을 쓴다.
  // 서버 컴포넌트라 Request 가 없다 -> 쿠키 세션만 보는 getApprovedSession 을 쓴다
  // (milestones/홈이 쓰는 것과 같은 관례. canViewStats 는 PIN 헤더가 필요해 여기선 못 쓴다).
  if (!(await getApprovedSession(leagueId))) {
    return (
      <div className="space-y-4 mm-brand">
        <LeagueGroupTabs tabs={groupTabs} />
        <StatGate fullPage title="명경기는 회원 전용" description="월별 명경기와 선정 이유는 가입 승인된 회원만 볼 수 있어요." />
      </div>
    )
  }

  const games = await getCached(leagueId)

  return (
    <div className="space-y-4 mm-brand">
      <LeagueGroupTabs tabs={groupTabs} />

      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2
          className="font-bold break-keep"
          style={{ color: 'var(--mm-ink)', fontSize: 'clamp(24px, 6vw, 32px)', letterSpacing: '-0.005em', lineHeight: 1.1 }}
        >
          명경기
        </h2>
        <p className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>
          월별 1경기 · {games.length}개월
        </p>
      </div>

      {/* 기준을 화면에 적어 둔다. 왜 이 경기가 뽑혔는지 설명할 수 없으면 목록을 신뢰하지 않는다 —
          환호 기반 하이라이트를 보류한 이유와 같다. */}
      <SectionCard variant="standalone">
        <div className="px-4 py-3 text-[13px] leading-relaxed" style={{ color: 'var(--mm-ink-soft)' }}>
          <span className="font-bold" style={{ color: 'var(--mm-ink)' }}>뽑는 방법 · </span>
          위닝샷 · 역전 3회 이상 · 2점 차 이내 · 총 38점 이상 — 이 넷 중{' '}
          <b style={{ color: 'var(--mm-ink)' }}>3개 이상</b>을 채운 경기를 그 달의 명경기로 고릅니다.
          3개를 채운 경기가 없는 달은 2개로 완화합니다. 같은 조건이면{' '}
          <b style={{ color: 'var(--mm-ink)' }}>위닝샷 → 역전 → 점수차 → 총득점</b> 순으로 앞섭니다.
        </div>
      </SectionCard>

      {games.length === 0 ? (
        <EmptyState
          Icon={Trophy}
          title="아직 명경기가 없습니다"
          description="경기가 쌓이면 월별로 한 경기씩 자동으로 선정됩니다."
        />
      ) : (
        <div className="space-y-3">
          {games.map(g => <ClassicCard key={g.gameId} g={g} leagueId={leagueId} />)}
        </div>
      )}
    </div>
  )
}

function ClassicCard({ g, leagueId }: { g: ClassicGame; leagueId: string }) {
  const homeWin = g.homeScore > g.awayScore
  const awayWin = g.awayScore > g.homeScore

  return (
    <SectionCard variant="standalone">
      {/* 월 + 날짜 */}
      <div
        className="px-4 py-2.5 flex items-center gap-2 flex-wrap"
        style={{ borderBottom: '1px solid var(--mm-rule)' }}
      >
        <span
          className="font-jersey font-black"
          style={{ color: 'var(--mm-ink)', fontSize: '18px', letterSpacing: '-0.01em' }}
        >
          {formatMonth(g.month)}
        </span>
        <span className="text-[12px] font-bold" style={{ color: 'var(--mm-muted)' }}>
          {formatDate(g.date)}
        </span>
        {g.relaxed && (
          <span
            className="text-[10px] font-black uppercase px-2 py-0.5"
            style={{
              background: 'var(--mm-neutral-bg)', color: 'var(--mm-neutral-fg)',
              borderRadius: 'var(--mm-radius-chip)', letterSpacing: '0.1em',
            }}
            title="이 달은 3개 조건을 채운 경기가 없어 2개 기준으로 골랐습니다"
          >
            완화 기준
          </span>
        )}
      </div>

      {/* 스코어 — 이긴 팀만 진하게. 팀 컬러는 텍스트에 쓰지 않는다(밝은 팀 컬러가 라이트 모드에서 사라진다) */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0 text-right">
          <span
            className="font-bold text-[15px] break-keep"
            style={{ color: homeWin ? 'var(--mm-ink)' : 'var(--mm-muted)' }}
          >
            {g.homeName}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="font-jersey font-black tabular-nums"
            style={{ fontSize: '26px', color: homeWin ? 'var(--mm-ink)' : 'var(--mm-muted)', letterSpacing: '-0.01em' }}
          >
            {g.homeScore}
          </span>
          <span className="text-[13px] font-bold" style={{ color: 'var(--mm-muted)' }}>:</span>
          <span
            className="font-jersey font-black tabular-nums"
            style={{ fontSize: '26px', color: awayWin ? 'var(--mm-ink)' : 'var(--mm-muted)', letterSpacing: '-0.01em' }}
          >
            {g.awayScore}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <span
            className="font-bold text-[15px] break-keep"
            style={{ color: awayWin ? 'var(--mm-ink)' : 'var(--mm-muted)' }}
          >
            {g.awayName}
          </span>
        </div>
      </div>

      {/* 선정 기준 태그 */}
      <div className="px-4 pb-2.5 flex flex-wrap gap-1.5">
        {g.reasons.map(r => (
          <span
            key={r}
            className="inline-flex items-center text-[11px] font-black px-2.5 py-1"
            style={{
              background: 'var(--mm-yellow-soft)', color: 'var(--mm-yellow-strong)',
              borderRadius: 'var(--mm-radius-chip)',
            }}
          >
            {r}
          </span>
        ))}
      </div>

      {/* 칼럼 3줄 — 무슨 경기였나 / 결정적 장면 / 왜 뽑혔나.
          마지막 줄(선정 근거)만 색을 달리해, 목록을 훑을 때 기준이 눈에 남게 한다. */}
      <div
        className="px-4 py-3 space-y-1"
        style={{ borderTop: '1px solid var(--mm-rule)' }}
      >
        {g.columnLines.map((line, i) => (
          <p
            key={i}
            className="text-[13px] leading-relaxed break-keep"
            style={{
              color: i === 2 ? 'var(--mm-muted)' : 'var(--mm-ink-soft)',
              fontWeight: i === 0 ? 700 : 400,
            }}
          >
            {line}
          </p>
        ))}
      </div>

      {/* 모음집 — 경기 영상 + 그 경기 득점 클립 */}
      <ClassicGameClips leagueId={leagueId} game={g} />

    </SectionCard>
  )
}
