'use client'
// 「내 트렌드」 미니 선 그래프 — /me 전용 (리뉴얼 2단계, 2026-10-12).
//
// 하루(경기일) 하나 = 점 하나. 가는 선 + 점선 기준선(내 하루 평균) 한 줄.
//   · recharts 를 쓰지 않는다 — 점 30개 남짓에 번들 100KB 를 얹을 이유가 없다. 인라인 SVG.
//   · 폭은 ResizeObserver 로 재서 실제 픽셀로 그린다(viewBox 늘이기를 하면 글자·점이 찌그러진다).
//   · 호버/탭 → 가장 가까운 날의 세로선 + 값 표시. 색만으로 뜻을 전하지 않도록 값은 글자로도 보인다.
//   · 색은 --mm-* 토큰만(라이트/다크 공용).
import { useEffect, useRef, useState } from 'react'

export interface TrendPoint { date: string; value: number }

interface Props {
  points: TrendPoint[]
  /** 기준선 값(내 하루 평균) — null 이면 그리지 않는다 */
  average: number | null
  /** 「득점」 등 — 툴팁·접근성 이름 */
  metricLabel: string
  height?: number
}

const PAD = { top: 18, right: 14, bottom: 22, left: 30 }

function md(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}.${Number(d)}`
}

export default function MeTrendChart({ points, average, metricLabel, height = 168 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 기간·지표가 바뀌면 고른 점을 푼다(인덱스가 다른 날을 가리키게 된다)
  const sig = points.map(p => p.date).join(',') + metricLabel
  const [prevSig, setPrevSig] = useState(sig)
  if (sig !== prevSig) { setPrevSig(sig); setActive(null) }

  const n = points.length
  const max = Math.max(1, average ?? 0, ...points.map(p => p.value))
  // 눈금 상한을 보기 좋은 수로 — 5 단위(작으면 2 단위)
  const step = max > 20 ? 10 : max > 8 ? 5 : 2
  const yMax = Math.ceil(max / step) * step
  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = height - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const lastIdx = n - 1
  const shown = active ?? null

  const pickNearest = (clientX: number) => {
    const el = wrapRef.current
    if (!el || n === 0) return
    const rx = clientX - el.getBoundingClientRect().left
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - rx)
      if (d < bestD) { bestD = d; best = i }
    }
    setActive(best)
  }

  const summary = n > 0
    ? `${metricLabel} 하루별 추이 ${n}일 · 최근 ${md(points[lastIdx].date)} ${points[lastIdx].value}` +
      (average != null ? ` · 하루 평균 ${average.toFixed(1)}` : '')
    : `${metricLabel} 기록 없음`

  return (
    <div ref={wrapRef} className="relative w-full select-none" style={{ height }}>
      {width > 0 && n > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={summary}
          className="block touch-pan-y"
          onPointerMove={e => pickNearest(e.clientX)}
          onPointerDown={e => pickNearest(e.clientX)}
          onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null) }}
        >
          {/* 눈금 — 0 · 중간 · 상한, 옅게 */}
          {[0, yMax / 2, yMax].map(t => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--mm-rule)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--mm-muted)" className="tabular-nums">
                {Number.isInteger(t) ? t : t.toFixed(1)}
              </text>
            </g>
          ))}

          {/* 기준선 — 내 하루 평균 */}
          {average != null && (
            <g>
              <line
                x1={PAD.left} x2={width - PAD.right} y1={y(average)} y2={y(average)}
                stroke="var(--mm-ink-soft)" strokeWidth={1.5} strokeDasharray="4 4"
              />
              <text
                x={width - PAD.right} y={y(average) - 5} textAnchor="end" fontSize={11} fontWeight={700}
                fill="var(--mm-ink-soft)" className="tabular-nums"
              >
                평균 {average.toFixed(1)}
              </text>
            </g>
          )}

          {/* 선 */}
          {n > 1 && (
            <path d={path} fill="none" stroke="var(--mm-yellow-strong)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          )}

          {/* 고른 날 세로선 */}
          {shown != null && (
            <line x1={x(shown)} x2={x(shown)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--mm-muted)" strokeWidth={1} />
          )}

          {/* 점 — 패널색 고리로 선 위에서 떼어 낸다 */}
          {points.map((p, i) => (
            <circle
              key={p.date}
              cx={x(i)} cy={y(p.value)}
              r={shown === i ? 5.5 : n > 24 ? 3 : 4}
              fill={p.value >= (average ?? Infinity) ? 'var(--mm-yellow-strong)' : 'var(--mm-panel)'}
              stroke="var(--mm-yellow-strong)" strokeWidth={2}
            />
          ))}

          {/* 직접 표기 — 가장 최근 날 값 하나만(고른 점이 없을 때) */}
          {shown == null && (
            <text
              x={x(lastIdx)} y={y(points[lastIdx].value) - 9}
              textAnchor={n > 1 ? 'end' : 'middle'} fontSize={12} fontWeight={900}
              fill="var(--mm-ink)" className="tabular-nums"
            >
              {points[lastIdx].value}
            </text>
          )}

          {/* x축 — 처음 · 끝 날짜만 */}
          <text x={x(0)} y={height - 6} textAnchor={n > 1 ? 'start' : 'middle'} fontSize={11} fill="var(--mm-muted)" className="tabular-nums">
            {md(points[0].date)}
          </text>
          {n > 1 && (
            <text x={x(lastIdx)} y={height - 6} textAnchor="end" fontSize={11} fill="var(--mm-muted)" className="tabular-nums">
              {md(points[lastIdx].date)}
            </text>
          )}
        </svg>
      )}

      {/* 툴팁 — 고른 날의 날짜·값 */}
      {shown != null && points[shown] && (
        <div
          className="absolute top-0 pointer-events-none px-2 py-1 text-xs font-bold tabular-nums whitespace-nowrap"
          style={{
            left: Math.min(Math.max(x(shown) - 48, 0), Math.max(0, width - 96)),
            background: 'var(--mm-ink)', color: 'var(--mm-panel)', borderRadius: 'var(--mm-radius-chip)',
          }}
        >
          {md(points[shown].date)} · {metricLabel} <b>{points[shown].value}</b>
        </div>
      )}

      {/* 스크린리더용 표 */}
      <table className="sr-only">
        <caption>{metricLabel} 하루별 기록</caption>
        <tbody>
          {points.map(p => (
            <tr key={p.date}><th scope="row">{p.date}</th><td>{p.value}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
