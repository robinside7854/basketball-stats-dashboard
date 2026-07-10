// 미라클모닝 브랜드 히어로 — Player of the Week (v2)
// 팔레트: 노랑/검정/화이트 (mm-* 변수).
//
// 색 대비 절대 규칙:
//   · 노랑 배경 위 텍스트 = 검정(rgba(0,0,0,0.6~1))
//   · 검정/흰 배경 위 accent 라벨 = --mm-yellow-strong
//   · 노랑 배경 위에는 절대 --mm-yellow-* 색상 금지
//
// 좌: 큰 아바타(96px) + 큰 이름(40px) + 헤드라인 강조
// 우: 큰 숫자(총 득점) + 라운드별 세로 막대 차트(임팩트) + 3열 지표
// 서버 컴포넌트 — 계산은 홈 페이지에서 넘겨받음.

export type NbaHeroData = {
  name: string
  number: number | null
  pts: number
  gp: number
  rd: number
  ppr: number
  photoUrl?: string | null
  roundSeries?: Array<{ date: string; pts: number }>
  teamName?: string | null
} | null

type Props = {
  data: NbaHeroData
  rangeLabel: string
}

function initials(name: string): string {
  return name.slice(0, 2)
}
function shortDate(iso: string): string {
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
}

// 라운드별 세로 막대 차트 — sparkline 대체
// 각 막대 위에 숫자, 아래 날짜. 최고 라운드는 검정 solid, 나머지는 검정 70% alpha.
function RoundBars({ series }: { series: Array<{ date: string; pts: number }> }) {
  if (series.length === 0) return null
  // 최근 최대 6라운드만 표시 (너무 많으면 좁아짐)
  const shown = series.slice(-6)
  const max = Math.max(...shown.map(s => s.pts), 1)
  return (
    <div
      className="grid gap-2 items-end"
      style={{ gridTemplateColumns: `repeat(${shown.length}, 1fr)`, minHeight: '120px' }}
    >
      {shown.map(s => {
        const heightPct = Math.max(6, (s.pts / max) * 100)
        const isMax = s.pts === max && shown.filter(x => x.pts === max).length === 1
        return (
          <div key={s.date} className="flex flex-col items-center gap-1.5">
            <span
              className="font-jersey text-[22px] font-black tabular-nums leading-none"
              style={{ color: 'var(--mm-black)' }}
            >
              {s.pts}
            </span>
            <div className="w-full flex items-end" style={{ height: '68px' }}>
              <div
                className="w-full"
                style={{
                  height: `${heightPct}%`,
                  background: isMax ? 'var(--mm-black)' : 'rgba(0,0,0,0.70)',
                  minHeight: '4px',
                }}
                aria-hidden
              />
            </div>
            <span
              className="text-[10px] font-bold tabular-nums leading-none"
              style={{ color: 'rgba(0,0,0,0.60)' }}
            >
              {shortDate(s.date)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function NbaHero({ data, rangeLabel }: Props) {
  if (!data) return null
  const showTrend = (data.roundSeries?.length ?? 0) >= 2

  return (
    <article
      className="mm-brand grid md:grid-cols-[1.4fr_1fr]"
      style={{
        background: 'var(--mm-panel)',
        color: 'var(--mm-ink)',
        border: '1px solid var(--mm-rule)',
      }}
    >
      {/* ===== 좌: 카피 + 아바타 (여백 크게) ===== */}
      <div className="p-8 md:p-10" style={{ borderRight: '1px solid var(--mm-rule)' }}>
        <p
          className="text-[12px] font-black tracking-[0.22em] uppercase mb-3"
          style={{ color: 'var(--mm-yellow-strong)' }}
        >
          Player of the Week
        </p>
        <h1
          className="font-jersey font-black leading-[0.95] uppercase mb-4"
          style={{
            fontSize: 'clamp(40px, 6.5vw, 68px)',
            letterSpacing: '-0.015em',
            color: 'var(--mm-ink)',
            textWrap: 'balance',
          }}
        >
          {data.name}의{' '}
          <span
            style={{
              background: 'var(--mm-yellow)',
              color: 'var(--mm-black)',
              padding: '0 10px',
              display: 'inline-block',
            }}
          >
            골든 위크
          </span>
        </h1>
        <p className="text-base leading-relaxed max-w-lg mb-8" style={{ color: 'var(--mm-ink-soft)' }}>
          최근 {data.rd}라운드 총{' '}
          <strong style={{ color: 'var(--mm-ink)', fontSize: '1.1em' }}>{data.pts}점</strong> · 라운드당 평균{' '}
          <strong style={{ color: 'var(--mm-ink)', fontSize: '1.1em' }}>{data.ppr.toFixed(1)}점</strong>
        </p>

        {/* 아바타 + 이름 (크게) */}
        <div
          className="flex items-center gap-5 pt-6"
          style={{ borderTop: '2px solid var(--mm-rule)' }}
        >
          <div
            className="shrink-0 rounded-full overflow-hidden flex items-center justify-center font-jersey font-black"
            style={{
              width: '96px',
              height: '96px',
              background: 'var(--mm-panel-alt)',
              border: '3px solid var(--mm-yellow)',
              color: 'var(--mm-ink)',
              fontSize: '32px',
            }}
          >
            {data.photoUrl ? (
              <img src={data.photoUrl} alt={data.name} className="w-full h-full object-cover object-top" />
            ) : (
              <span>{initials(data.name)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="font-jersey font-black uppercase truncate leading-[0.95]"
              style={{
                color: 'var(--mm-ink)',
                fontSize: 'clamp(32px, 4.5vw, 44px)',
                letterSpacing: '-0.01em',
              }}
            >
              {data.name}
              {data.number != null && (
                <span
                  className="font-sans font-bold ml-2 align-baseline"
                  style={{ color: 'var(--mm-muted)', fontSize: '0.6em' }}
                >
                  #{data.number}
                </span>
              )}
            </div>
            <div
              className="text-[13px] tracking-[0.14em] uppercase font-bold mt-1.5"
              style={{ color: 'var(--mm-muted)' }}
            >
              {data.teamName ? `${data.teamName} · ` : ''}{rangeLabel}
            </div>
          </div>
        </div>
      </div>

      {/* ===== 우: 노랑 패널 - 큰 숫자 + 막대 차트 ===== */}
      <aside
        className="p-8 md:p-10"
        style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)' }}
      >
        {/* 라벨 — 노랑 배경 위 검정 텍스트 (대비 규칙) */}
        <div
          className="text-[12px] font-black tracking-[0.22em] uppercase"
          style={{ color: 'rgba(0,0,0,0.75)' }}
        >
          총 득점 · 최근 {data.rd}라운드
        </div>

        {/* 큰 숫자 */}
        <div
          className="font-jersey leading-[0.85] tabular-nums mt-2"
          style={{
            fontSize: 'clamp(88px, 15vw, 140px)',
            letterSpacing: '-0.025em',
            fontWeight: 900,
            color: 'var(--mm-black)',
          }}
        >
          {data.pts}
          <span
            className="text-[26px] tracking-[0.16em] ml-2 font-sans font-black align-baseline"
            style={{ color: 'rgba(0,0,0,0.75)' }}
          >
            PTS
          </span>
        </div>

        {/* 라운드 흐름 — 세로 막대 차트로 임팩트 */}
        {showTrend && (
          <div className="mt-6 pt-5" style={{ borderTop: '2px solid rgba(0,0,0,0.15)' }}>
            <div
              className="text-[12px] font-black tracking-[0.22em] uppercase mb-3"
              style={{ color: 'rgba(0,0,0,0.75)' }}
            >
              라운드별 득점
            </div>
            <RoundBars series={data.roundSeries!} />
          </div>
        )}

        {/* 하단 지표 3열 */}
        <div
          className="grid grid-cols-3 gap-4 mt-6 pt-5"
          style={{ borderTop: '2px solid rgba(0,0,0,0.15)' }}
        >
          <div className="text-[11px] tracking-[0.16em] uppercase font-black" style={{ color: 'rgba(0,0,0,0.65)' }}>
            RD
            <strong
              className="block font-jersey text-[28px] mt-1 tabular-nums font-black leading-none"
              style={{ color: 'var(--mm-black)' }}
            >
              {data.rd}
            </strong>
          </div>
          <div className="text-[11px] tracking-[0.16em] uppercase font-black" style={{ color: 'rgba(0,0,0,0.65)' }}>
            라운드 평균
            <strong
              className="block font-jersey text-[28px] mt-1 tabular-nums font-black leading-none"
              style={{ color: 'var(--mm-black)' }}
            >
              {data.ppr.toFixed(1)}
            </strong>
          </div>
          <div className="text-[11px] tracking-[0.16em] uppercase font-black" style={{ color: 'rgba(0,0,0,0.65)' }}>
            GP
            <strong
              className="block font-jersey text-[28px] mt-1 tabular-nums font-black leading-none"
              style={{ color: 'var(--mm-black)' }}
            >
              {data.gp}
            </strong>
          </div>
        </div>
      </aside>
    </article>
  )
}
