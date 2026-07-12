'use client'
// Recharts 를 초기 번들에서 분리하기 위한 별도 모듈 (dynamic import 대상)
// LeagueStatsPage 진입 시점에만 로드 — 초기 번들 감량
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'
import type { PlayerStat } from '@/types/league'

// stats/page.tsx 의 CHART_STATS 와 동일 정의
type ChartStatKey = 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'fg_pct' | 'fg3_pct'

// ---------------------------------------------------------------------------
// TOP 5 세로형 리더보드 바 — 원본 TopScorersChart 컴포넌트 그대로 이관
// ---------------------------------------------------------------------------
export function TopScorersChart({ players, statKey, statLabel, statUnit, color }: {
  players: PlayerStat[]
  statKey: ChartStatKey
  statLabel: string
  statUnit: string
  color?: string
}) {
  const top5 = [...players]
    .filter(p => p.gp >= 1)
    .sort((a, b) => (b[statKey] as number) - (a[statKey] as number))
    .slice(0, 5)
  const barColor = color ?? '#EAB308'
  const isPct = statUnit === '%'
  // 이름 길이에 따라 YAxis 폭 조정 (이름 잘림 방지)
  const maxNameLen = top5.reduce((m, p) => Math.max(m, p.name.length), 0)
  const yAxisWidth = Math.max(56, Math.min(120, maxNameLen * 14 + 8))
  return (
    <div className="p-4" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}>
      <p className="text-[12px] font-black uppercase mb-3" style={{ color: 'var(--mm-muted)', letterSpacing: '0.20em' }}>{statLabel} TOP 5</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={top5} layout="vertical" margin={{ left: 0, right: 48, top: 4, bottom: 0 }}>
          <XAxis type="number" domain={[0, 'auto']} tick={{ fill: 'var(--mm-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fill: 'var(--mm-ink)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} width={yAxisWidth} interval={0} />
          <Tooltip
            cursor={{ fill: 'rgba(234,179,8,0.10)' }}
            contentStyle={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 0, fontSize: 12, color: 'var(--mm-ink)' }}
            formatter={(v) => [`${Number(v).toFixed(1)}${isPct ? '%' : ''} ${statUnit}`]}
            labelStyle={{ color: 'var(--mm-ink)', fontWeight: 700 }}
            itemStyle={{ color: 'var(--mm-ink)' }}
          />
          <Bar dataKey={statKey} radius={[0, 0, 0, 0]}>
            {top5.map((_, i) => <Cell key={i} fill={i === 0 ? '#EAB308' : i === 1 ? '#6B7280' : i === 2 ? '#A16207' : barColor} fillOpacity={i < 3 ? 1 : 0.55} />)}
            <LabelList
              dataKey={statKey}
              position="right"
              formatter={(v: unknown) => `${Number(v).toFixed(1)}${isPct ? '%' : ''}`}
              style={{ fill: 'var(--mm-ink)', fontSize: 12, fontWeight: 800 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FG% TOP 8 (분기별 리더) 세로형 바 차트
// ---------------------------------------------------------------------------
export type FGPctPoint = { name: string; fg_pct: number }

export function FGPctTop8Chart({ data }: { data: FGPctPoint[] }) {
  // 가장 긴 이름 길이에 비례한 YAxis 폭 (한글 1자 ≈ 12-14px @ 11px bold)
  const maxNameLen = data.reduce((m, d) => Math.max(m, d.name.length), 0)
  const yAxisWidth = Math.max(72, Math.min(140, maxNameLen * 14 + 12))
  return (
    <div className="p-4" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}>
      <p className="text-[12px] font-black uppercase mb-3" style={{ color: 'var(--mm-muted)', letterSpacing: '0.20em' }}>FG% Top 8</p>
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 22)}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 32, top: 0, bottom: 0 }}>
          <XAxis type="number" domain={[0, 'auto']} tick={{ fill: 'var(--mm-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: 'var(--mm-ink)', fontSize: 11, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
            width={yAxisWidth}
            interval={0}
          />
          <Tooltip
            contentStyle={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 0, fontSize: 12, color: 'var(--mm-ink)' }}
            formatter={(v) => [`${Number(v).toFixed(1)}%`]}
            labelStyle={{ color: 'var(--mm-ink)', fontWeight: 700 }}
          />
          <Bar dataKey="fg_pct" fill="#EAB308" radius={[0, 0, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
