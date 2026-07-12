// 미라클모닝 브랜드 — 팀 승률 요약 (현재 분기 기준)
// 홈 랜딩에서 최근 라운드 카드 위에 배치.
// 팀 컬러 좌측 4px 바 · 이름 · W-L(-D) · 승률 · 득실차. 1위 팀 노랑 배경.
// 서버 컴포넌트 — 계산은 홈 페이지에서 넘겨받음.

export type StandingRow = {
  key: string
  name: string
  color: string
  wins: number
  losses: number
  draws: number
  ptsFor: number
  ptsAgainst: number
  winRate: number  // 0~100 소수 첫째자리
}

type Props = {
  standings: StandingRow[]
  quarterLabel: string  // "26.1Q" 또는 "시즌 전체"
  gamesCount: number
}

export default function NbaTeamStandings({ standings, quarterLabel, gamesCount }: Props) {
  if (standings.length === 0) return null

  return (
    <section
      className="mm-brand"
      style={{
        background: 'var(--mm-panel)',
        border: '1px solid var(--mm-rule)',
        borderTop: 0,
      }}
    >
      <header
        className="flex items-baseline justify-between px-8 md:px-10 py-5"
        style={{ borderBottom: '1px solid var(--mm-rule)' }}
      >
        <h3
          className="font-jersey font-black uppercase"
          style={{ color: 'var(--mm-ink)', fontSize: '28px', letterSpacing: '-0.005em' }}
        >
          팀 승률
        </h3>
        <span className="text-[12px] tracking-[0.18em] uppercase font-bold" style={{ color: 'var(--mm-muted)' }}>
          {quarterLabel} · {gamesCount}경기
        </span>
      </header>

      <div
        className="grid gap-0"
        style={{ padding: 0 }}
      >
        {standings.map((t, idx) => {
          const isTop = idx === 0
          const diff = t.ptsFor - t.ptsAgainst
          const record = t.draws > 0 ? `${t.wins}-${t.losses}-${t.draws}` : `${t.wins}-${t.losses}`
          const rateColor = t.winRate >= 60 ? '#059669' : t.winRate >= 40 ? 'var(--mm-yellow-strong)' : '#DC2626'
          const diffColor = isTop
            ? (diff > 0 ? 'rgba(0,0,0,0.85)' : diff < 0 ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.55)')
            : (diff > 0 ? '#059669' : diff < 0 ? '#DC2626' : 'var(--mm-muted)')
          return (
            <div
              key={t.key}
              className="px-4 sm:px-6 md:px-8 py-[14px]"
              style={{
                background: isTop ? 'var(--mm-yellow)' : 'transparent',
                borderBottom: idx < standings.length - 1 ? '1px solid var(--mm-rule)' : 'none',
                color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)',
              }}
            >
              <div className="grid items-center gap-2 sm:gap-3 grid-cols-[24px_4px_minmax(0,1fr)_auto] sm:grid-cols-[32px_6px_minmax(0,1fr)_auto_auto_auto]">
                {/* 순위 */}
                <span
                  className="font-jersey font-black tabular-nums text-right leading-none"
                  style={{
                    fontSize: isTop ? 'clamp(20px, 5.5vw, 26px)' : 'clamp(18px, 5vw, 22px)',
                    color: isTop ? 'var(--mm-black)' : 'var(--mm-muted)',
                  }}
                >
                  {idx + 1}
                </span>

                {/* 팀 컬러 좌측 바 */}
                <span
                  aria-hidden
                  className="block h-6 rounded-sm"
                  style={{ background: t.color, opacity: isTop ? 0.85 : 1 }}
                />

                {/* 팀 이름 */}
                <span
                  className="font-jersey uppercase truncate min-w-0"
                  style={{
                    fontSize: isTop ? 'clamp(17px, 4.8vw, 22px)' : 'clamp(15px, 4vw, 18px)',
                    fontWeight: 900,
                    letterSpacing: '-0.005em',
                    color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)',
                    lineHeight: 1,
                  }}
                >
                  {t.name}
                </span>

                {/* 전적 — sm 이상에서만 인라인 노출 */}
                <span
                  className="hidden sm:inline-block font-jersey font-black tabular-nums leading-none"
                  style={{
                    fontSize: isTop ? '20px' : '17px',
                    color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)',
                    minWidth: '68px',
                    textAlign: 'right',
                  }}
                >
                  {record}
                </span>

                {/* 승률 — 항상 노출 (모바일에서 가장 강조되는 값) */}
                <span
                  className="font-jersey font-black tabular-nums leading-none"
                  style={{
                    fontSize: isTop ? 'clamp(18px, 5.2vw, 24px)' : 'clamp(16px, 4.6vw, 20px)',
                    color: isTop ? 'var(--mm-black)' : rateColor,
                    minWidth: '64px',
                    textAlign: 'right',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {t.winRate.toFixed(1)}
                  <span
                    className="text-[13px] font-bold ml-0.5 align-baseline"
                    style={{ color: isTop ? 'rgba(0,0,0,0.6)' : 'var(--mm-muted)' }}
                  >
                    %
                  </span>
                </span>

                {/* 득실차 — sm 이상에서만 인라인 노출 */}
                <span
                  className="hidden sm:inline-block font-black tabular-nums text-right"
                  style={{
                    fontSize: '13px',
                    color: diffColor,
                    minWidth: '52px',
                  }}
                >
                  {diff > 0 ? `+${diff}` : diff}
                </span>
              </div>

              {/* 모바일 전용 서브라인: 전적 · 득실차 (팀 이름 아래 들여쓰기) */}
              <div
                className="sm:hidden flex items-center gap-2 mt-1.5"
                style={{ paddingLeft: '32px', fontSize: '13px' }}
              >
                <span
                  className="font-jersey font-black tabular-nums"
                  style={{ color: isTop ? 'var(--mm-black)' : 'var(--mm-ink-soft)' }}
                >
                  {record}
                </span>
                <span aria-hidden style={{ opacity: 0.4 }}>·</span>
                <span
                  className="font-black tabular-nums"
                  style={{ color: diffColor }}
                >
                  {diff > 0 ? `+${diff}` : diff}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
