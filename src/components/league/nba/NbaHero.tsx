// 미라클모닝 브랜드 히어로 — Player of the Week
// 팔레트: 노랑/검정/화이트 (mm-* CSS 변수).
// 좌: 카피 + 이니셜/사진 아바타
// 우: 라운드 총 득점 (큰 숫자) + 라운드당 평균 + 최근 라운드 sparkline
// 미라클모닝은 하루 = 1라운드 (여러 경기), 임팩트는 "그 날 총 몇 점" 이 자연스러움.
// 서버 컴포넌트 — 계산은 홈 페이지에서 넘겨받음.

export type NbaHeroData = {
  name: string
  number: number | null
  pts: number                                          // 최근 기간 누적 득점
  gp: number                                           // 참여 게임 수 (참고용)
  rd: number                                           // 참여 라운드(=날짜) 수
  ppr: number                                          // 라운드당 평균 득점
  photoUrl?: string | null
  roundSeries?: Array<{ date: string; pts: number }>   // 라운드별 흐름 (오래→최신)
  teamName?: string | null
} | null

type Props = {
  data: NbaHeroData
  rangeLabel: string
}

function initials(name: string): string {
  return name.slice(0, 2)
}

// 최근 라운드 흐름 sparkline (검정 라인 + 노랑 fill area)
// SVG 인라인. viewBox 100 × 32.
function Sparkline({ series }: { series: Array<{ date: string; pts: number }> }) {
  if (series.length < 2) return null
  const w = 100
  const h = 32
  const max = Math.max(...series.map(s => s.pts), 1)
  const min = 0
  const pts = series.map((s, i) => {
    const x = (i / (series.length - 1)) * w
    const y = h - ((s.pts - min) / (max - min || 1)) * (h - 4) - 2
    return { x, y, v: s.pts }
  })
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaD = `${pathD} L${w},${h} L0,${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="32" preserveAspectRatio="none" aria-hidden>
      <path d={areaD} fill="var(--mm-yellow)" opacity="0.28" />
      <path d={pathD} fill="none" stroke="var(--mm-ink)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {/* 마지막 포인트 강조 */}
      {pts.length > 0 && (
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="2.5" fill="var(--mm-yellow-strong)" />
      )}
    </svg>
  )
}

export default function NbaHero({ data, rangeLabel }: Props) {
  if (!data) return null
  const showTrend = (data.roundSeries?.length ?? 0) >= 2
  const trendDelta = data.roundSeries && data.roundSeries.length >= 2
    ? data.roundSeries[data.roundSeries.length - 1].pts - data.roundSeries[0].pts
    : 0

  return (
    <article
      className="mm-brand grid md:grid-cols-[1.4fr_1fr]"
      style={{
        background: 'var(--mm-panel)',
        color: 'var(--mm-ink)',
        border: '1px solid var(--mm-rule)',
      }}
    >
      {/* 좌: 카피 + 아바타 */}
      <div className="p-6 md:p-8" style={{ borderRight: '1px solid var(--mm-rule)' }}>
        <p className="text-[11px] font-black tracking-[0.22em] uppercase mb-2"
           style={{ color: 'var(--mm-yellow-strong)' }}>
          Player of the Week
        </p>
        <h1
          className="font-jersey font-black leading-[0.95] uppercase mb-3"
          style={{
            fontSize: 'clamp(36px, 6vw, 60px)',
            letterSpacing: '-0.01em',
            color: 'var(--mm-ink)',
            textWrap: 'balance',
          }}
        >
          {data.name}의{' '}
          <span style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', padding: '0 8px', display: 'inline-block' }}>
            골든 위크
          </span>
        </h1>
        <p className="text-sm leading-relaxed max-w-md mb-6" style={{ color: 'var(--mm-ink-soft)' }}>
          최근 {data.rd}라운드 총 <strong style={{ color: 'var(--mm-ink)' }}>{data.pts}점</strong> ·
          라운드당 평균 <strong style={{ color: 'var(--mm-ink)' }}>{data.ppr.toFixed(1)}점</strong>
          {showTrend && trendDelta > 0 && ` · 상승 흐름 (+${trendDelta}점)`}
          {showTrend && trendDelta < 0 && ` · 조정 국면 (${trendDelta}점)`}
        </p>

        <div className="flex items-center gap-3.5 pt-4" style={{ borderTop: '1px solid var(--mm-rule)' }}>
          {/* 아바타 — photo_url 있으면 사진, 없으면 이니셜 */}
          <div
            className="shrink-0 w-14 h-14 rounded-full overflow-hidden flex items-center justify-center font-jersey font-black text-xl"
            style={{
              background: 'var(--mm-panel-alt)',
              border: '2px solid var(--mm-yellow)',
              color: 'var(--mm-ink)',
            }}
          >
            {data.photoUrl ? (
              <img src={data.photoUrl} alt={data.name} className="w-full h-full object-cover object-top" />
            ) : (
              <span>{initials(data.name)}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-jersey text-[22px] font-black uppercase tracking-wide truncate" style={{ color: 'var(--mm-ink)' }}>
              {data.name}
              {data.number != null && (
                <span className="text-[15px] font-sans font-medium ml-1.5" style={{ color: 'var(--mm-muted)' }}>#{data.number}</span>
              )}
            </div>
            <div className="text-[11px] tracking-[0.14em] uppercase font-bold mt-0.5" style={{ color: 'var(--mm-muted)' }}>
              {data.teamName ? `${data.teamName} · ` : ''}{rangeLabel}
            </div>
          </div>
        </div>
      </div>

      {/* 우: 스탯 패널 — 노랑 배경 검정 잉크 */}
      <aside
        className="p-6 md:p-8"
        style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)' }}
      >
        <div className="text-[11px] font-black tracking-[0.22em] uppercase" style={{ color: 'var(--mm-yellow-strong)' }}>
          총 득점 · 최근 {data.rd}라운드
        </div>
        <div
          className="font-jersey leading-[0.85] tabular-nums mt-1.5"
          style={{
            fontSize: 'clamp(80px, 14vw, 128px)',
            letterSpacing: '-0.02em',
            fontWeight: 900,
            color: 'var(--mm-black)',
          }}
        >
          {data.pts}
          <span className="text-[22px] tracking-[0.16em] ml-1.5 font-sans font-bold align-baseline">
            PTS
          </span>
        </div>

        {showTrend && (
          <div className="mt-4">
            <div className="text-[10px] font-black tracking-[0.16em] uppercase mb-1"
                 style={{ color: 'rgba(0,0,0,0.55)' }}>
              라운드 흐름
            </div>
            <Sparkline series={data.roundSeries!} />
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 mt-4 pt-4" style={{ borderTop: '1px solid rgba(0,0,0,0.15)' }}>
          <div className="text-[11px] tracking-widest uppercase font-black" style={{ color: 'rgba(0,0,0,0.55)' }}>
            RD
            <strong className="block font-jersey text-[22px] mt-0.5 tabular-nums font-black" style={{ color: 'var(--mm-black)' }}>
              {data.rd}
            </strong>
          </div>
          <div className="text-[11px] tracking-widest uppercase font-black" style={{ color: 'rgba(0,0,0,0.55)' }}>
            평균
            <strong className="block font-jersey text-[22px] mt-0.5 tabular-nums font-black" style={{ color: 'var(--mm-black)' }}>
              {data.ppr.toFixed(1)}
            </strong>
          </div>
          <div className="text-[11px] tracking-widest uppercase font-black" style={{ color: 'rgba(0,0,0,0.55)' }}>
            GP
            <strong className="block font-jersey text-[22px] mt-0.5 tabular-nums font-black" style={{ color: 'var(--mm-black)' }}>
              {data.gp}
            </strong>
          </div>
        </div>
      </aside>
    </article>
  )
}
