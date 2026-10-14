'use client'
// 선수 카드(PlayerQuickViewModal) 차트 4종 — 월별 막대 · 경기별 추이 · 능력치 6축 레이더 · 슛 비중 도넛.
// 2026-10-12 리뉴얼 5단계: recharts(~90KB gz) → 자체 인라인 SVG(`components/league/ui/charts.tsx`).
//   그림의 뜻(축·기준선·색·툴팁 내용)은 그대로다. 리그 화면은 recharts 를 import 하지 않는다.
import { useState } from 'react'
import { MiniBarChart, MiniLineChart, DonutChart } from '@/components/league/ui/charts'
import HexRadar from '@/components/league/charts/HexRadar'
import type { HexRadarResult } from '@/lib/stats/hexRadar'

// ---------------------------------------------------------------------------
// Monthly Stats Bar Chart
// ---------------------------------------------------------------------------
const MONTH_STATS = [
  { key: 'ppg', label: '득점' }, { key: 'rpg', label: '리바' },
  { key: 'apg', label: '어시' }, { key: 'spg', label: '스틸' },
  { key: 'bpg', label: '블록' }, { key: 'fg_pct', label: 'FG%' },
] as const
type MonthStatKey = typeof MONTH_STATS[number]['key']

export type MonthPoint = {
  month: string; label: string; gp: number
  ppg: number; rpg: number; apg: number; spg: number; bpg: number; fg_pct: number
}

export function MonthlyStatsChart({ data }: { data: MonthPoint[] }) {
  const [monthStat, setMonthStat] = useState<MonthStatKey>('ppg')
  return (
    <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
        <p className="t-label whitespace-nowrap" style={{ color: 'var(--mm-yellow-strong)' }}>월별 성장지표</p>
        <div className="flex flex-wrap gap-1">
          {MONTH_STATS.map(s => (
            <button key={s.key} onClick={() => setMonthStat(s.key)}
              className="px-2.5 min-h-11 whitespace-nowrap text-sm font-semibold rounded-sm border cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2"
              style={monthStat === s.key
                ? { background: 'var(--mm-yellow)', borderColor: 'var(--mm-black)', color: 'var(--mm-black)' }
                : { background: 'var(--mm-panel-alt)', borderColor: 'var(--mm-rule)', color: 'var(--mm-muted)' }
              }
            >{s.label}</button>
          ))}
        </div>
      </div>
      <MiniBarChart
        data={data.map(d => ({ label: d.label, value: d[monthStat] }))}
        valueLabel={MONTH_STATS.find(x => x.key === monthStat)?.label ?? ''}
        height={100}
        color="var(--mm-yellow)"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Game Trend Line Chart (per-game + 3-game rolling avg)
// ---------------------------------------------------------------------------
// mm brand: 노랑 accent 하나 + 뮤트 톤. 원색 남발 금지.
// 색은 CSS 변수로 — 하드코딩 hex 는 다크 모드에서 반전되지 않아 리바/어시 선이 안 보였음.
// mm brand: 노랑 accent 하나 + 뮤트 톤. 한 번에 한 지표만 그려지므로 색 중복은 무관.
const TREND_STATS = [
  { key: 'pts' as const, label: '득점', color: 'var(--mm-yellow-strong)' },
  { key: 'reb' as const, label: '리바', color: 'var(--mm-ink-soft)' },
  { key: 'ast' as const, label: '어시', color: 'var(--mm-neutral-strong)' },
  { key: 'stl' as const, label: '스틸', color: 'var(--mm-muted)' },
]
type TrendStatKey = typeof TREND_STATS[number]['key']

export type GameLogPoint = {
  date: string
  pts: number; reb: number; ast: number; stl: number; blk: number
  fgm: number; fga: number; fg3m: number; fg3a: number
}

export function GameTrendChart({ log }: { log: GameLogPoint[] }) {
  const [trendStat, setTrendStat] = useState<TrendStatKey>('pts')

  const chartData = log.map((g, i) => ({
    idx: i + 1,
    date: g.date?.slice(5).replace('-', '/') ?? String(i + 1),
    value: g[trendStat],
  }))
  const seasonAvg = log.length > 0
    ? +(log.reduce((s, r) => s + r[trendStat], 0) / log.length).toFixed(1)
    : 0
  const activeMeta = TREND_STATS.find(s => s.key === trendStat)!

  return (
    <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
        <div className="flex items-center gap-2">
          <p className="t-label whitespace-nowrap" style={{ color: 'var(--mm-yellow-strong)' }}>게임별 트렌드</p>
          <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>{log.length}경기</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {TREND_STATS.map(s => (
            <button key={s.key} onClick={() => setTrendStat(s.key)}
              className="px-2.5 min-h-11 whitespace-nowrap text-sm font-semibold rounded-sm border cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2"
              style={trendStat === s.key
                ? { background: 'var(--mm-yellow)', borderColor: 'var(--mm-black)', color: 'var(--mm-black)' }
                : { background: 'var(--mm-panel-alt)', borderColor: 'var(--mm-rule)', color: 'var(--mm-muted)' }
              }
            >{s.label}</button>
          ))}
        </div>
      </div>
      <MiniLineChart
        points={chartData.map(p => ({ tick: String(p.idx), value: p.value, title: `#${p.idx}${p.date ? ` (${p.date})` : ''}` }))}
        valueLabel={activeMeta.label}
        color={activeMeta.color}
        reference={seasonAvg}
        referenceLabel="평균"
        height={140}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Player Hex Radar — 6축(공격·수비·리바운드·슈팅·리딩·효율, 2026-10-14). 정의는 lib/stats/hexRadar.ts.
// ---------------------------------------------------------------------------
export type RadarAccent = { stroke: string; fillA: string; fillB: string }

export function PlayerHexRadar({ data, accent }: { data: HexRadarResult; accent: RadarAccent }) {
  return (
    <HexRadar
      entries={[{
        name: '리그 백분위',
        color: accent.stroke,
        data,
        gradient: { inner: accent.fillB, innerOpacity: 0.55, outer: accent.fillA, outerOpacity: 0.15 },
      }]}
      height={210}
    />
  )
}

// ---------------------------------------------------------------------------
// Shot Breakdown Donut (PieChart)
// ---------------------------------------------------------------------------
export type DonutEntry = {
  name: string
  value: number
  fg_pct: number
  m: number
  a: number
  color: string
}

export function PlayerShotDonut({ data }: { data: DonutEntry[] }) {
  return (
    <DonutChart
      label="슛 종류별 시도 비중"
      height={180}
      segments={data.map(d => ({
        name: d.name,
        value: d.value,
        color: d.color,
        detail: (
          <>
            <p className="mt-0.5" style={{ color: 'var(--mm-ink-soft)' }}>{d.m}/{d.a} · FG {d.fg_pct}%</p>
            <p style={{ color: 'var(--mm-muted)' }}>비중 {d.value}%</p>
          </>
        ),
      }))}
    />
  )
}
