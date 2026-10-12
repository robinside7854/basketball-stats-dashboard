// 명경기 카드 — 하이라이트 피드의 「명경기」 칩이 그린다 (옛 /highlights/classics 페이지에서 옮김, 2026-10-12).
// 기준과 가중치는 `@/lib/stats/classicGames` 가 정본이다 — 이 카드는 결과를 읽어 보여주기만 한다.
// 서버 컴포넌트(클라이언트 경계는 안쪽 ClassicGameClips 하나).
import SectionCard from '@/components/league/ui/SectionCard'
import ClassicGameClips from '@/components/league/ClassicGameClips'
import type { ClassicGame } from '@/lib/stats/classicGames'

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y.slice(2)}년 ${Number(m)}월`
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}.${d.getDate()} (${days[d.getDay()]})`
}

export default function ClassicGameCard({ g, leagueId }: { g: ClassicGame; leagueId: string }) {
  const homeWin = g.homeScore > g.awayScore
  const awayWin = g.awayScore > g.homeScore

  return (
    <SectionCard variant="standalone" pad="none">
      {/* 월 + 날짜 */}
      <div
        className="px-4 py-2.5 flex items-center gap-2 flex-wrap"
        style={{ borderBottom: '1px solid var(--mm-rule)' }}
      >
        <span
          className="font-bold"
          style={{ color: 'var(--mm-ink)', fontSize: '18px', letterSpacing: '-0.01em' }}
        >
          {formatMonth(g.month)}
        </span>
        <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>
          {formatDate(g.date)}
        </span>
        {g.relaxed && (
          <span
            className="text-xs font-semibold px-2 py-0.5"
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
            className="font-bold text-base break-keep"
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
          <span className="text-sm font-bold" style={{ color: 'var(--mm-muted)' }}>:</span>
          <span
            className="font-jersey font-black tabular-nums"
            style={{ fontSize: '26px', color: awayWin ? 'var(--mm-ink)' : 'var(--mm-muted)', letterSpacing: '-0.01em' }}
          >
            {g.awayScore}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <span
            className="font-bold text-base break-keep"
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
            className="inline-flex items-center text-xs font-semibold px-2.5 py-1"
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
            className="text-sm leading-relaxed break-keep"
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
