'use client'
// Recharts 를 초기 번들에서 분리하기 위한 별도 모듈 (dynamic import 대상)
// PlayerQuickViewModal 이 모달 진입 시점에만 로드 — 초기 번들 감량
import { useState } from 'react'
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, XAxis, YAxis, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell as PieCell,
  LineChart, Line, ReferenceLine, CartesianGrid,
} from 'recharts'

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
      <div className="flex items-center justify-between mb-2">
        <p className="font-jersey text-xs uppercase tracking-[0.20em] font-black" style={{ color: 'var(--mm-yellow-strong)' }}>월별 성장지표</p>
        <div className="flex gap-1">
          {MONTH_STATS.map(s => (
            <button key={s.key} onClick={() => setMonthStat(s.key)}
              className="px-2 py-0.5 text-xs font-bold rounded-sm border cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2"
              style={monthStat === s.key
                ? { background: 'var(--mm-yellow)', borderColor: 'var(--mm-black)', color: 'var(--mm-black)' }
                : { background: 'var(--mm-panel-alt)', borderColor: 'var(--mm-rule)', color: 'var(--mm-muted)' }
              }
            >{s.label}</button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <XAxis dataKey="label" tick={{ fill: 'var(--mm-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: 'var(--mm-muted)', fontSize: 9 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 4, fontSize: 11, color: 'var(--mm-ink)' }}
            formatter={(v) => [String(v), MONTH_STATS.find(s => s.key === monthStat)?.label ?? '']}
          />
          <Bar dataKey={monthStat} fill="var(--mm-yellow)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
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
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <p className="font-jersey text-xs uppercase tracking-[0.20em] font-black" style={{ color: 'var(--mm-yellow-strong)' }}>게임별 트렌드</p>
          <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>{log.length}경기</span>
        </div>
        <div className="flex gap-1">
          {TREND_STATS.map(s => (
            <button key={s.key} onClick={() => setTrendStat(s.key)}
              className="px-2 py-0.5 text-xs font-bold rounded-sm border cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2"
              style={trendStat === s.key
                ? { background: 'var(--mm-yellow)', borderColor: 'var(--mm-black)', color: 'var(--mm-black)' }
                : { background: 'var(--mm-panel-alt)', borderColor: 'var(--mm-rule)', color: 'var(--mm-muted)' }
              }
            >{s.label}</button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: -22 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--mm-rule)" vertical={false} />
          <XAxis
            dataKey="idx"
            tick={{ fill: 'var(--mm-muted)', fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            interval={Math.max(0, Math.floor(chartData.length / 6) - 1)}
          />
          <YAxis tick={{ fill: 'var(--mm-muted)', fontSize: 9 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 4, fontSize: 11, color: 'var(--mm-ink)' }}
            labelFormatter={(v, payload) => {
              const p = payload?.[0]?.payload as { date?: string } | undefined
              return `#${v}${p?.date ? ` (${p.date})` : ''}`
            }}
            formatter={(val) => [val as (string | number), activeMeta.label]}
          />
          <ReferenceLine y={seasonAvg} stroke="var(--mm-muted)" strokeDasharray="3 3" label={{ value: `평균 ${seasonAvg}`, position: 'insideTopRight', fill: 'var(--mm-muted)', fontSize: 9 }} />
          <Line type="monotone" dataKey="value" stroke={activeMeta.color} strokeWidth={2.5} dot={{ r: 2, fill: activeMeta.color }} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Player Radar Chart (accent-colored, league percentile)
// ---------------------------------------------------------------------------
export type RadarStat = { stat: string; value: number }
export type RadarAccent = { stroke: string; fillA: string; fillB: string }

export function PlayerRadarChart({ data, accent }: { data: RadarStat[]; accent: RadarAccent }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <RadarChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
        <defs>
          <radialGradient id="playerRadarFill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={accent.fillB} stopOpacity={0.55} />
            <stop offset="100%" stopColor={accent.fillA} stopOpacity={0.15} />
          </radialGradient>
        </defs>
        <PolarGrid stroke="var(--mm-rule)" />
        <PolarAngleAxis dataKey="stat" tick={{ fill: 'var(--mm-ink-soft)', fontSize: 10, fontWeight: 700 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar dataKey="value" stroke={accent.stroke} fill="url(#playerRadarFill)" strokeWidth={2.25} />
      </RadarChart>
    </ResponsiveContainer>
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
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="58%"
          outerRadius="86%"
          paddingAngle={2}
          stroke="none"
          isAnimationActive
          animationDuration={600}
        >
          {data.map((d, i) => <PieCell key={i} fill={d.color} />)}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as DonutEntry
            return (
              <div
                className="rounded-sm px-2.5 py-1.5 text-xs backdrop-blur-sm"
                style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', boxShadow: '0 10px 24px -8px rgba(0,0,0,0.25)' }}
              >
                <p className="font-black" style={{ color: p.color }}>{p.name}</p>
                <p className="mt-0.5" style={{ color: 'var(--mm-ink-soft)' }}>{p.m}/{p.a} · FG {p.fg_pct}%</p>
                <p style={{ color: 'var(--mm-muted)' }}>비중 {p.value}%</p>
              </div>
            )
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
