'use client'
// 리그 화면 미니 차트 — 레이더 · 막대 · 선 · 도넛 (리뉴얼 5단계 「속도」, 2026-10-12).
//
// 배경: 선수 카드·비교 모달이 recharts(~90KB gz)를 물고 있었다. 그리는 것은 점 수십 개짜리
//   차트 네 종류뿐이라 인라인 SVG 로 충분하다. 리그 화면은 이제 recharts 를 import 하지 않는다
//   (파란날개 PlayerDetailModal 은 아직 쓰므로 패키지는 남아 있다).
// 규칙 (viz.tsx 와 같다)
//   · 색은 --mm-* 토큰 · 호출부가 넘긴 색만. 글자는 잉크 토큰(계열 색으로 칠하지 않는다).
//   · 폭은 ResizeObserver 로 재서 실제 픽셀로 그린다 — viewBox 를 늘이면 글자·점이 찌그러진다.
//   · role="img" + aria-label 요약 + 스크린리더용 표(sr-only). 호버/탭 → 값 툴팁.
import { useEffect, useRef, useState, useId } from 'react'

/** 컨테이너 폭(px) — 첫 측정 전엔 0 */
function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** 보기 좋은 눈금 상한 + 간격 (0 부터) */
function niceScale(max: number, ticks = 4): { top: number; step: number } {
  if (!(max > 0)) return { top: 1, step: 1 }
  const raw = max / ticks
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  return { top: Math.ceil(max / step) * step, step }
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 4,
  color: 'var(--mm-ink)', boxShadow: '0 10px 24px -8px rgba(0,0,0,0.25)',
}

function Tooltip({ x, width, children }: { x: number; width: number; children: React.ReactNode }) {
  const w = 140
  return (
    <div
      className="absolute top-0 pointer-events-none px-2.5 py-1.5 text-xs tabular-nums whitespace-nowrap z-10"
      style={{ ...TOOLTIP_STYLE, left: Math.min(Math.max(x - w / 2, 0), Math.max(0, width - w)), minWidth: 0 }}
    >
      {children}
    </div>
  )
}

// ─── 레이더 ─────────────────────────────────────────────────────
export interface RadarSeries {
  name: string
  /** axes 와 같은 순서 */
  values: number[]
  stroke: string
  /** 단색 채움 — gradient 가 있으면 무시 */
  fill?: string
  fillOpacity?: number
  /** 가운데→바깥 방사형 채움 (선수 카드) */
  gradient?: { inner: string; innerOpacity: number; outer: string; outerOpacity: number }
  strokeWidth?: number
}

/**
 * 다각형 레이더. 첫 축이 12시, 시계 방향. 값 범위 0~max(기본 100).
 * 계열이 2개 이상이면 아래에 범례를 그린다(색만으로 구분하지 않게 이름을 함께).
 */
export function RadarChart({
  axes, series, max = 100, height = 160, label, rings = 4, legend,
}: {
  axes: string[]
  series: RadarSeries[]
  max?: number
  height?: number
  /** 접근성 요약 앞머리 — 「리그 백분위」 등 */
  label?: string
  rings?: number
  /** 기본: 계열 2개 이상이면 표시 */
  legend?: boolean
}) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>()
  const gid = useId().replace(/:/g, '')
  const [active, setActive] = useState<number | null>(null)
  const showLegend = legend ?? series.length > 1
  const legendH = showLegend ? 26 : 0
  const plotH = height - legendH
  const n = axes.length
  const cx = width / 2
  const cy = plotH / 2
  // 축 이름 자리를 남긴다(좌우 글자 폭 · 위아래 줄 높이)
  const r = Math.max(10, Math.min(cx - 44, cy - 18))
  const ang = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2
  const pt = (i: number, v: number) => {
    const rr = (Math.max(0, Math.min(max, v)) / max) * r
    return [cx + Math.cos(ang(i)) * rr, cy + Math.sin(ang(i)) * rr] as const
  }
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).map(c => c.toFixed(1)).join(',')).join(' ')

  const summary = `${label ? `${label} · ` : ''}` + series
    .map(s => `${s.name}: ${axes.map((a, i) => `${a} ${fmt(s.values[i] ?? 0)}`).join(', ')}`)
    .join(' / ')

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && n >= 3 && (
        <svg width={width} height={plotH} role="img" aria-label={summary} className="block"
          onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null) }}>
          <defs>
            {series.map((s, si) => s.gradient && (
              <radialGradient key={si} id={`${gid}-g${si}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={s.gradient.inner} stopOpacity={s.gradient.innerOpacity} />
                <stop offset="100%" stopColor={s.gradient.outer} stopOpacity={s.gradient.outerOpacity} />
              </radialGradient>
            ))}
          </defs>
          {/* 격자 — 동심 다각형 + 축선 */}
          {Array.from({ length: rings }, (_, k) => (
            <polygon key={k} points={poly(axes.map(() => ((k + 1) / rings) * max))} fill="none" stroke="var(--mm-rule)" strokeWidth={1} />
          ))}
          {axes.map((_, i) => {
            const [x2, y2] = pt(i, max)
            return <line key={i} x1={cx} y1={cy} x2={x2} y2={y2} stroke="var(--mm-rule)" strokeWidth={1} />
          })}
          {/* 계열 */}
          {series.map((s, si) => (
            <polygon
              key={si}
              points={poly(s.values)}
              fill={s.gradient ? `url(#${gid}-g${si})` : (s.fill ?? s.stroke)}
              fillOpacity={s.gradient ? 1 : (s.fillOpacity ?? 0.25)}
              stroke={s.stroke}
              strokeWidth={s.strokeWidth ?? 2}
              strokeLinejoin="round"
            />
          ))}
          {/* 축 이름 + 넓은 히트 영역(탭하면 그 축 값) */}
          {axes.map((a, i) => {
            const lx = cx + Math.cos(ang(i)) * (r + 12)
            const ly = cy + Math.sin(ang(i)) * (r + 12)
            const c = Math.cos(ang(i))
            const anchor = Math.abs(c) < 0.2 ? 'middle' : c > 0 ? 'start' : 'end'
            return (
              <g key={a} onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)} style={{ cursor: 'default' }}>
                <circle cx={pt(i, max)[0]} cy={pt(i, max)[1]} r={18} fill="transparent" />
                <text x={lx} y={ly} dy="0.35em" textAnchor={anchor} fontSize={13} fontWeight={600}
                  fill={active === i ? 'var(--mm-ink)' : 'var(--mm-ink-soft)'}>
                  {a}
                </text>
              </g>
            )
          })}
          {active != null && series.map((s, si) => {
            const [x, y] = pt(active, s.values[active] ?? 0)
            return <circle key={si} cx={x} cy={y} r={4} fill={s.stroke} stroke="var(--mm-panel)" strokeWidth={2} />
          })}
        </svg>
      )}
      {active != null && width > 0 && (
        <Tooltip x={cx} width={width}>
          <p className="font-black" style={{ color: 'var(--mm-ink)' }}>{axes[active]}</p>
          {series.map(s => (
            <p key={s.name} className="flex items-center gap-1.5" style={{ color: 'var(--mm-ink-soft)' }}>
              <span aria-hidden className="inline-block w-2 h-2 rounded-full" style={{ background: s.stroke }} />
              {series.length > 1 ? `${s.name} ` : ''}<b>{fmt(s.values[active] ?? 0)}</b>
            </p>
          ))}
        </Tooltip>
      )}
      {showLegend && (
        <div className="flex items-center justify-center gap-4 text-sm" style={{ height: legendH, color: 'var(--mm-muted)' }}>
          {series.map(s => (
            <span key={s.name} className="inline-flex items-center gap-1.5 min-w-0">
              <span aria-hidden className="inline-block w-3 h-3 shrink-0" style={{ background: s.stroke, borderRadius: 2 }} />
              <span className="truncate">{s.name}</span>
            </span>
          ))}
        </div>
      )}
      <table className="sr-only">
        <caption>{label ?? '레이더'}</caption>
        <thead><tr><th scope="col">항목</th>{series.map(s => <th key={s.name} scope="col">{s.name}</th>)}</tr></thead>
        <tbody>
          {axes.map((a, i) => (
            <tr key={a}><th scope="row">{a}</th>{series.map(s => <td key={s.name}>{fmt(s.values[i] ?? 0)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── 세로 막대 ──────────────────────────────────────────────────
export interface BarDatum { label: string; value: number }

export function MiniBarChart({
  data, height = 100, color = 'var(--mm-yellow)', valueLabel,
}: { data: BarDatum[]; height?: number; color?: string; valueLabel: string }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const PAD = { top: 6, right: 4, bottom: 20, left: 30 }
  const { top, step } = niceScale(Math.max(0, ...data.map(d => d.value)))
  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = height - PAD.top - PAD.bottom
  const n = data.length
  const band = n > 0 ? innerW / n : 0
  const barW = Math.max(2, Math.min(48, band * 0.72))
  const y = (v: number) => PAD.top + innerH - (Math.max(0, v) / top) * innerH
  const ticks: number[] = []
  for (let t = 0; t <= top + 1e-9; t += step) ticks.push(+t.toFixed(4))

  const summary = `${valueLabel} — ` + data.map(d => `${d.label} ${fmt(d.value)}`).join(', ')

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && n > 0 && (
        <svg width={width} height={height} role="img" aria-label={summary} className="block"
          onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null) }}>
          {ticks.map(t => (
            <text key={t} x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={13} fill="var(--mm-muted)" className="tabular-nums">
              {fmt(t)}
            </text>
          ))}
          {data.map((d, i) => {
            const cx = PAD.left + band * i + band / 2
            const h = Math.max(0, PAD.top + innerH - y(d.value))
            const rad = Math.min(2, h / 2, barW / 2)
            const x0 = cx - barW / 2
            const y0 = PAD.top + innerH - h
            return (
              <g key={i} onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)}>
                {/* 히트 영역 = 띠 전체 */}
                <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill={active === i ? 'var(--mm-panel-alt)' : 'transparent'} />
                {h > 0 && (
                  <path
                    d={`M${x0},${y0 + h} V${y0 + rad} Q${x0},${y0} ${x0 + rad},${y0} H${x0 + barW - rad} Q${x0 + barW},${y0} ${x0 + barW},${y0 + rad} V${y0 + h} Z`}
                    fill={color}
                  />
                )}
                <text x={cx} y={height - 4} textAnchor="middle" fontSize={13} fill="var(--mm-muted)">{d.label}</text>
              </g>
            )
          })}
        </svg>
      )}
      {active != null && data[active] && (
        <Tooltip x={PAD.left + band * active + band / 2} width={width}>
          <p style={{ color: 'var(--mm-muted)' }}>{data[active].label}</p>
          <p style={{ color: 'var(--mm-ink)' }}>{valueLabel} <b>{fmt(data[active].value)}</b></p>
        </Tooltip>
      )}
      <table className="sr-only">
        <caption>{valueLabel}</caption>
        <tbody>{data.map((d, i) => <tr key={i}><th scope="row">{d.label}</th><td>{fmt(d.value)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

// ─── 선 + 기준선 ────────────────────────────────────────────────
export interface LinePoint {
  /** x 축 눈금 글자 */
  tick: string
  value: number
  /** 툴팁 머리줄 */
  title: string
}

export function MiniLineChart({
  points, height = 140, color = 'var(--mm-yellow-strong)', valueLabel, reference, referenceLabel,
}: {
  points: LinePoint[]; height?: number; color?: string; valueLabel: string
  reference?: number | null; referenceLabel?: string
}) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const PAD = { top: 10, right: 6, bottom: 20, left: 30 }
  const n = points.length
  const { top, step } = niceScale(Math.max(0, reference ?? 0, ...points.map(p => p.value)))
  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = height - PAD.top - PAD.bottom
  // 점들을 양 끝에서 반 칸 띄운다(첫·끝 점이 축에 붙지 않게)
  const band = n > 0 ? innerW / n : 0
  const x = (i: number) => PAD.left + band * i + band / 2
  const y = (v: number) => PAD.top + innerH - (Math.max(0, v) / top) * innerH
  const ticks: number[] = []
  for (let t = 0; t <= top + 1e-9; t += step) ticks.push(+t.toFixed(4))
  const every = Math.max(1, Math.floor(n / 6))
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')

  const pickNearest = (clientX: number) => {
    const el = ref.current
    if (!el || n === 0) return
    const rx = clientX - el.getBoundingClientRect().left
    setActive(Math.max(0, Math.min(n - 1, Math.floor((rx - PAD.left) / (band || 1)))))
  }

  const summary = n > 0
    ? `${valueLabel} 추이 ${n}경기 · 최고 ${fmt(Math.max(...points.map(p => p.value)))} · 최근 ${fmt(points[n - 1].value)}` +
      (reference != null ? ` · ${referenceLabel ?? '평균'} ${fmt(reference)}` : '')
    : `${valueLabel} 기록 없음`

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && n > 0 && (
        <svg width={width} height={height} role="img" aria-label={summary} className="block touch-pan-y"
          onPointerMove={e => pickNearest(e.clientX)}
          onPointerDown={e => pickNearest(e.clientX)}
          onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null) }}>
          {ticks.map(t => (
            <g key={t}>
              {t > 0 && <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--mm-rule)" strokeDasharray="2 4" />}
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={13} fill="var(--mm-muted)" className="tabular-nums">{fmt(t)}</text>
            </g>
          ))}
          {reference != null && (
            <g>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(reference)} y2={y(reference)} stroke="var(--mm-muted)" strokeDasharray="3 3" />
              <text x={width - PAD.right - 2} y={y(reference) + 14} textAnchor="end" fontSize={13} fill="var(--mm-muted)" className="tabular-nums">
                {referenceLabel ?? '평균'} {fmt(reference)}
              </text>
            </g>
          )}
          {active != null && (
            <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--mm-muted)" strokeWidth={1} />
          )}
          {n > 1 && <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
          {points.map((p, i) => (
            <circle key={i} cx={x(i)} cy={y(p.value)} r={active === i ? 4 : 2} fill={color} stroke={active === i ? 'var(--mm-panel)' : 'none'} strokeWidth={2} />
          ))}
          {points.map((p, i) => (i % every === 0 ? (
            <text key={`t${i}`} x={x(i)} y={height - 4} textAnchor="middle" fontSize={13} fill="var(--mm-muted)" className="tabular-nums">{p.tick}</text>
          ) : null))}
        </svg>
      )}
      {active != null && points[active] && (
        <Tooltip x={x(active)} width={width}>
          <p style={{ color: 'var(--mm-muted)' }}>{points[active].title}</p>
          <p style={{ color: 'var(--mm-ink)' }}>{valueLabel} <b>{fmt(points[active].value)}</b></p>
        </Tooltip>
      )}
      <table className="sr-only">
        <caption>{valueLabel} 추이</caption>
        <tbody>{points.map((p, i) => <tr key={i}><th scope="row">{p.title}</th><td>{fmt(p.value)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

// ─── 도넛 ───────────────────────────────────────────────────────
export interface DonutSegment {
  name: string
  value: number
  color: string
  /** 툴팁 본문(이름 아래 줄들) */
  detail?: React.ReactNode
}

/**
 * 비중 도넛. 가운데는 비워 둔다 — 호출부가 위에 겹쳐 글자를 얹는다.
 * innerRatio/outerRatio 는 (높이·폭 중 짧은 쪽)/2 에 대한 비율.
 */
export function DonutChart({
  segments, height = 180, innerRatio = 0.58, outerRatio = 0.86, padAngleDeg = 2, label,
}: { segments: DonutSegment[]; height?: number; innerRatio?: number; outerRatio?: number; padAngleDeg?: number; label: string }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0)
  const cx = width / 2
  const cy = height / 2
  const base = Math.min(width, height) / 2
  const ro = base * outerRatio
  const ri = base * innerRatio
  const pad = segments.length > 1 ? (padAngleDeg * Math.PI) / 180 : 0

  const arc = (a0: number, a1: number, rOut: number) => {
    // 12시에서 시계 방향
    const p = (a: number, r: number) => [cx + Math.cos(a - Math.PI / 2) * r, cy + Math.sin(a - Math.PI / 2) * r]
    const large = a1 - a0 > Math.PI ? 1 : 0
    if (a1 - a0 >= Math.PI * 2 - 1e-6) {
      // 한 조각뿐 — 원 두 개(바깥·안쪽)로
      return `M${cx - rOut},${cy} a${rOut},${rOut} 0 1,0 ${rOut * 2},0 a${rOut},${rOut} 0 1,0 ${-rOut * 2},0 Z ` +
        `M${cx - ri},${cy} a${ri},${ri} 0 1,1 ${ri * 2},0 a${ri},${ri} 0 1,1 ${-ri * 2},0 Z`
    }
    const [x0, y0] = p(a0, rOut), [x1, y1] = p(a1, rOut), [x2, y2] = p(a1, ri), [x3, y3] = p(a0, ri)
    return `M${x0},${y0} A${rOut},${rOut} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${ri},${ri} 0 ${large} 0 ${x3},${y3} Z`
  }

  // 각 조각의 시작 각 = 앞 조각들 몫의 누적(누적 변수 재할당 대신 reduce — 렌더 중 변수 재할당 금지 규칙)
  const spans = segments.map(s => (total > 0 ? (Math.max(0, s.value) / total) * Math.PI * 2 : 0))
  const starts = spans.reduce<number[]>((out, _, i) => { out.push(i === 0 ? 0 : out[i - 1] + spans[i - 1]); return out }, [])
  const arcs = spans.map((span, i) => {
    const inset = span > pad ? pad / 2 : 0
    const a0 = starts[i] + inset
    const a1 = starts[i] + span - inset
    return { a0, a1, mid: (a0 + a1) / 2 }
  })

  const summary = `${label} — ` + segments.map(s => `${s.name} ${fmt(s.value)}%`).join(', ')
  const act = active != null ? arcs[active] : null

  return (
    <div ref={ref} className="relative w-full h-full select-none" style={{ height }}>
      {width > 0 && total > 0 && (
        <svg width={width} height={height} role="img" aria-label={summary} className="block"
          onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null) }}>
          {segments.map((s, i) => arcs[i].a1 > arcs[i].a0 && (
            <path
              key={i}
              d={arc(arcs[i].a0, arcs[i].a1, active === i ? ro + 3 : ro)}
              fill={s.color}
              fillRule="evenodd"
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive(i)}
              style={{ transition: 'd var(--mm-motion-base, 200ms)' }}
            />
          ))}
        </svg>
      )}
      {act && active != null && segments[active] && (
        <div
          className="absolute pointer-events-none rounded-sm px-2.5 py-1.5 text-xs whitespace-nowrap z-10"
          style={{
            ...TOOLTIP_STYLE,
            left: Math.min(Math.max(cx + Math.cos(act.mid - Math.PI / 2) * ro - 60, 0), Math.max(0, width - 120)),
            top: Math.min(Math.max(cy + Math.sin(act.mid - Math.PI / 2) * ro - 30, 0), Math.max(0, height - 60)),
          }}
        >
          <p className="font-black" style={{ color: 'var(--mm-ink)' }}>
            <span aria-hidden className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: segments[active].color }} />
            {segments[active].name}
          </p>
          {segments[active].detail}
        </div>
      )}
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>{segments.map(s => <tr key={s.name}><th scope="row">{s.name}</th><td>{fmt(s.value)}%</td></tr>)}</tbody>
      </table>
    </div>
  )
}
