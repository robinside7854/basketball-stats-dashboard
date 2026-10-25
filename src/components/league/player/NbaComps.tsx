'use client'
// 선수 카드 「닮은 NBA 선수」 (2026-10-25) — 6축 레이더 값으로 NBA 100여 명 중 3명. 규칙·표는 lib/stats/nbaComps.ts.
//   ⚠ NBA 선수 사진은 쓰지 않는다(사용 권리) — 팀 색 이니셜 동그라미.
import { useMemo } from 'react'
import { matchNbaComps, shotMix } from '@/lib/stats/nbaComps'
import type { HexRadarResult } from '@/lib/stats/hexRadar'

const AXIS_ORDER = ['offense', 'defense', 'rebounding', 'shooting', 'leading', 'efficiency'] as const

/** shots = 우리 선수 야투 시도 수 [레이업, 포스트, 미드, 3점] — 공격 스타일 탭과 같은 shot_breakdown */
export default function NbaComps({ radar, shots }: { radar: HexRadarResult; shots?: readonly number[] | null }) {
  const matches = useMemo(() => {
    if (!radar.qualified) return []
    const byKey = new Map(radar.axes.map(a => [a.key, a.value]))
    return matchNbaComps(AXIS_ORDER.map(k => byKey.get(k) ?? null), 3, undefined, shotMix(shots))
  }, [radar, shots])
  if (matches.length === 0) return null

  return (
    <section aria-labelledby="nba-comps-title" className="mt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 id="nba-comps-title" className="text-sm font-black" style={{ color: 'var(--mm-ink)' }}>닮은 NBA 선수</h3>
        <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>닮은 순서 · 6축 + 슛 분포</span>
      </div>
      <ul className="overflow-hidden rounded-sm" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}>
        {matches.map((m, i) => (
          <li key={m.comp.name} className="flex items-center gap-3 px-3 py-2.5" style={i > 0 ? { borderTop: '1px solid var(--mm-rule)' } : undefined}
            aria-label={`${m.comp.name}, ${m.comp.team}, ${m.comp.role}`}>
            <span aria-hidden className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-xs font-black"
              style={{ background: m.comp.color, color: '#fff', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.25)' }}>
              {m.comp.name.replace(/\s/g, '').slice(0, 2)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-black" style={{ color: 'var(--mm-ink)' }}>{m.comp.name}</span>
                <span className="shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-bold whitespace-nowrap"
                  style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)' }}>
                  {m.comp.legend ? '레전드' : m.comp.team}
                </span>
              </span>
              <span className="mt-0.5 block text-xs font-bold" style={{ color: 'var(--mm-ink-soft)' }}>
                {[m.comp.role, m.strengths.length > 0 ? `둘 다 ${m.strengths.join('·')} 강점` : null, m.shotStyle ? `둘 다 ${m.shotStyle}` : null].filter(Boolean).join(' · ')}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
