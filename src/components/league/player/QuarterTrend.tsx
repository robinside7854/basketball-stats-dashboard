'use client'
// 선수 카드 「기록 → 분기별」 흐름 그림 (2026-11-23 운영진 — 표·막대만으로는 오르내림이 안 보였다).
//   꺾은선 하나 + 점마다 값 + 앞 분기보다 오른/내린 만큼(▲▼). 세로축은 0 부터가 아니라 그 선수 값 범위로 좁혀
//   작은 변화도 보인다. 아래는 한 줄 요약(최고 분기 · 지난 분기 대비). 표는 「표로 보기」 안에 남긴다.
import { useState } from 'react'
import type { QuarterTableKey, QuarterTableRow } from '@/lib/stats/quarterTable'

const METRICS: { key: QuarterTableKey; label: string; pct?: boolean }[] = [
  { key: 'ppg', label: '득점' }, { key: 'rpg', label: '리바' }, { key: 'apg', label: '어시' },
  { key: 'spg', label: '스틸' }, { key: 'bpg', label: '블록' },
  { key: 'fg_pct', label: '야투율', pct: true }, { key: 'fg3_pct', label: '3점률', pct: true },
]
const fmt = (v: number, pct?: boolean) => pct ? `${v.toFixed(1)}%` : v.toFixed(1)

export default function QuarterTrend({ rows }: { rows: QuarterTableRow[] }) {
  const [key, setKey] = useState<QuarterTableKey>('ppg')
  const m = METRICS.find(x => x.key === key)!
  const pts = rows.map(r => ({ label: r.label, gp: r.values.gp ?? 0, v: r.values[key] }))
  const vals = pts.map(p => p.v).filter((v): v is number => v != null)

  const W = 320, H = 150, PL = 26, PR = 26, PT = 30, PB = 34
  let lo = vals.length ? Math.min(...vals) : 0, hi = vals.length ? Math.max(...vals) : 1
  const pad = Math.max((hi - lo) * 0.25, m.pct ? 3 : 0.5); lo = Math.max(0, lo - pad); hi = hi + pad
  const x = (i: number) => PL + (pts.length === 1 ? (W - PL - PR) / 2 : (i * (W - PL - PR)) / (pts.length - 1))
  const y = (v: number) => PT + (1 - (v - lo) / (hi - lo || 1)) * (H - PT - PB)
  const line = pts.map((p, i) => p.v == null ? null : `${x(i)},${y(p.v)}`).filter(Boolean).join(' ')

  const withV = pts.map((p, i) => ({ ...p, i })).filter(p => p.v != null) as { label: string; gp: number; v: number; i: number }[]
  const best = withV.reduce<typeof withV[number] | null>((b, p) => (!b || p.v > b.v ? p : b), null)
  const last = withV[withV.length - 1], prev = withV[withV.length - 2]
  const diff = last && prev ? last.v - prev.v : null

  return (
    <div className="px-5 py-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="t-label font-black mr-1" style={{ color: 'var(--mm-yellow-strong)' }}>분기별 흐름</p>
        {METRICS.map(c => (
          <button key={c.key} type="button" onClick={() => setKey(c.key)}
            className="text-xs font-bold px-2.5 py-1 cursor-pointer"
            style={{ borderRadius: 'var(--mm-radius-chip)', background: key === c.key ? 'var(--mm-yellow)' : 'var(--mm-panel-alt)', color: key === c.key ? '#1C1A17' : 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}>
            {c.label}
          </button>
        ))}
      </div>

      {/* 한 줄 요약 — 숫자 셋 이내 */}
      {last && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="지금 분기" value={fmt(last.v, m.pct)} sub={last.label} />
          <Stat label="지난 분기보다" value={diff == null ? '—' : `${diff >= 0 ? '▲' : '▼'} ${fmt(Math.abs(diff), m.pct)}`}
            tone={diff == null || Math.abs(diff) < 0.05 ? undefined : diff > 0 ? 'up' : 'down'} sub={prev ? `${prev.label} ${fmt(prev.v, m.pct)}` : ''} />
          <Stat label="가장 좋았던 분기" value={best ? fmt(best.v, m.pct) : '—'} sub={best?.label ?? ''} />
        </div>
      )}

      {withV.length >= 2 ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${m.label} 분기별 흐름`}>
          <polyline points={line} fill="none" stroke="var(--mm-yellow-strong)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {pts.map((p, i) => {
            const pv = i > 0 ? pts[i - 1].v : null
            const d = p.v != null && pv != null ? p.v - pv : null
            return (
              <g key={p.label}>
                {p.v != null && <>
                  <circle cx={x(i)} cy={y(p.v)} r={best?.i === i ? 6 : 4.5} fill={best?.i === i ? 'var(--mm-yellow)' : 'var(--mm-panel)'} stroke="var(--mm-yellow-strong)" strokeWidth={2} />
                  <text x={x(i)} y={y(p.v) - 11} textAnchor="middle" fontSize={12} fontWeight={800} fill="var(--mm-ink)">{fmt(p.v, m.pct)}</text>
                </>}
                <text x={x(i)} y={H - 18} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--mm-ink-soft)">{p.label}</text>
                <text x={x(i)} y={H - 5} textAnchor="middle" fontSize={10} fontWeight={700}
                  fill={d == null || Math.abs(d) < 0.05 ? 'var(--mm-muted)' : d > 0 ? 'var(--mm-positive)' : 'var(--mm-negative)'}>
                  {d == null ? `${p.gp}일` : Math.abs(d) < 0.05 ? '–' : `${d > 0 ? '▲' : '▼'}${fmt(Math.abs(d), m.pct)}`}
                </text>
              </g>
            )
          })}
        </svg>
      ) : (
        <p className="text-sm py-4 text-center break-keep" style={{ color: 'var(--mm-muted)' }}>
          {m.pct ? '시도가 적은 분기는 성공률을 매기지 않아요.' : '분기가 둘 이상이면 흐름이 보여요.'}
        </p>
      )}
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'up' | 'down' }) {
  return (
    <div className="text-center py-2 px-1" style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-ctl)' }}>
      <div className="text-[12px] font-semibold break-keep" style={{ color: 'var(--mm-muted)' }}>{label}</div>
      <div className="t-num text-lg font-black leading-tight" style={{ color: tone === 'up' ? 'var(--mm-positive)' : tone === 'down' ? 'var(--mm-negative)' : 'var(--mm-ink)' }}>{value}</div>
      <div className="text-[12px] font-semibold" style={{ color: 'var(--mm-muted)' }}>{sub}</div>
    </div>
  )
}
