// 두 팀 비교 막대 — 날짜별 박스스코어 「팀별 비교」와 팀 탭 「누적 맞대결」이 같은 그림을 쓴다.
//   한쪽만 고치면 두 화면의 항목·색 규칙이 갈라지므로 여기 하나로 둔다 (2026-10-10 분리).
import { accentOrInk } from '@/lib/util/contrastColor'

export interface H2HTotals {
  pts: number; reb: number; oreb: number; dreb: number; ast: number; stl: number; blk: number
  tov: number; pf: number; fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
}
export interface H2HSide {
  name: string
  /** hex — accentOrInk 가 hex 만 파싱한다 */
  color: string
  /** 팀명 아래 작은 글씨 (HOME · 3승 등) */
  sub: string
  totals: H2HTotals
}

export default function HeadToHeadBars({ a, b, centerSub }: { a: H2HSide; b: H2HSide; centerSub: string }) {
  const colorA = a.color
  const colorB = b.color
  const A = a.totals
  const B = b.totals
  const pct = (m: number, t: number) => t > 0 ? Math.round(m / t * 1000) / 10 : 0
  const items: { label: string; a: number; b: number; suffix?: string; fraction?: [number, number, number, number] }[] = [
    { label: '득점', a: A.pts, b: B.pts },
    { label: '리바운드', a: A.reb, b: B.reb },
    { label: '오펜스\n리바운드', a: A.oreb, b: B.oreb },
    { label: '디펜스\n리바운드', a: A.dreb, b: B.dreb },
    { label: '어시스트', a: A.ast, b: B.ast },
    { label: '스틸', a: A.stl, b: B.stl },
    { label: '블록', a: A.blk, b: B.blk },
    { label: '턴오버', a: A.tov, b: B.tov },
    { label: '파울', a: A.pf, b: B.pf },
    { label: 'FG%', a: pct(A.fgm, A.fga), b: pct(B.fgm, B.fga), suffix: '%', fraction: [A.fgm, A.fga, B.fgm, B.fga] },
    { label: '3P%', a: pct(A.fg3m, A.fg3a), b: pct(B.fg3m, B.fg3a), suffix: '%', fraction: [A.fg3m, A.fg3a, B.fg3m, B.fg3a] },
    { label: 'FT%', a: pct(A.ftm, A.fta), b: pct(B.ftm, B.fta), suffix: '%', fraction: [A.ftm, A.fta, B.ftm, B.fta] },
  ]

  return (
    <>
    {/* 팀명 헤더 + 맞대결 경기 수 */}
    <div
      className="flex items-center justify-center gap-4 sm:gap-6 py-2"
      style={{ borderBottom: '1px solid var(--mm-rule)' }}
    >
      <div className="text-right min-w-0">
        <div className="text-base sm:text-lg font-bold truncate" style={{ color: accentOrInk(colorA), letterSpacing: '-0.005em' }}>{a.name}</div>
        <div className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--mm-muted)' }}>{a.sub}</div>
      </div>
      <div className="flex flex-col items-center shrink-0">
        <span className="font-jersey font-black text-sm" style={{ color: 'var(--mm-muted)' }}>VS</span>
        <span className="text-xs mt-0.5 whitespace-nowrap" style={{ color: 'var(--mm-muted)' }}>{centerSub}</span>
      </div>
      <div className="text-left min-w-0">
        <div className="text-base sm:text-lg font-bold truncate" style={{ color: accentOrInk(colorB), letterSpacing: '-0.005em' }}>{b.name}</div>
        <div className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--mm-muted)' }}>{b.sub}</div>
      </div>
    </div>

    {/* 비교 막대 */}
    <div className="space-y-1.5">
      {items.map(item => {
        const max = Math.max(item.a, item.b, 1)
        const aWin = item.a > item.b
        const bWin = item.b > item.a
        const labelA = item.fraction
          ? `${item.a}% (${item.fraction[0]}/${item.fraction[1]})`
          : `${item.a}${item.suffix ?? ''}`
        const labelB = item.fraction
          ? `${item.b}% (${item.fraction[2]}/${item.fraction[3]})`
          : `${item.b}${item.suffix ?? ''}`
        return (
          <div key={item.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            {/* 좌측 (홈) — 막대 오른쪽 정렬, 라벨은 막대 왼쪽 */}
            <div className="flex items-center justify-end gap-2 min-h-[28px]">
              <span
                className={`text-sm tabular-nums font-jersey font-black whitespace-nowrap ${aWin ? '' : 'opacity-60'}`}
                style={aWin ? { color: accentOrInk(colorA) } : { color: 'var(--mm-muted)' }}
              >
                {labelA}
              </span>
              <div className="h-5" style={{
                width: `${(item.a / max) * 100}%`,
                backgroundColor: colorA,
                opacity: aWin ? 1 : 0.55,
                minWidth: item.a > 0 ? 2 : 0,
              }} />
            </div>

            {/* 중앙 라벨 */}
            <div className="text-center px-2">
              <span
                className="text-xs font-black uppercase tracking-widest whitespace-pre-line leading-tight block"
                style={{ color: 'var(--mm-muted)' }}
              >
                {item.label}
              </span>
            </div>

            {/* 우측 (어웨이) */}
            <div className="flex items-center justify-start gap-2 min-h-[28px]">
              <div className="h-5" style={{
                width: `${(item.b / max) * 100}%`,
                backgroundColor: colorB,
                opacity: bWin ? 1 : 0.55,
                minWidth: item.b > 0 ? 2 : 0,
              }} />
              <span
                className={`text-sm tabular-nums font-jersey font-black whitespace-nowrap ${bWin ? '' : 'opacity-60'}`}
                style={bWin ? { color: accentOrInk(colorB) } : { color: 'var(--mm-muted)' }}
              >
                {labelB}
              </span>
            </div>
          </div>
        )
      })}
    </div>
    </>
  )
}
