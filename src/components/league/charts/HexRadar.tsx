'use client'
// 6축 레이더 (공격 · 수비 · 리바운드 · 슈팅 · 리딩 · 효율) — 선수 카드 · 선수 비교 공용 (2026-10-14).
// 계산은 서버(`detail` 라우트 → lib/stats/hexRadar.ts, 축 정의의 정본) — 여기서는 그리기만.
//   · 축을 누르면(그림의 꼭짓점 또는 아래 축 버튼) 그 축의 구성 요소 값·백분위가 아래에 펼쳐진다.
//   · 등급(S~F)·종합 점수는 없다(배지·등급 제도 폐지). 숫자는 리그 백분위(100 = 1위)뿐.
import { useState } from 'react'
import { RadarChart, type RadarSeries } from '@/components/league/ui/charts'
import type { HexRadarResult } from '@/lib/stats/hexRadar'

export interface HexRadarEntry {
  name: string
  color: string
  data: HexRadarResult
  /** 한 명일 때 방사형 채움(선수 카드) */
  gradient?: RadarSeries['gradient']
}

export default function HexRadar({
  entries, height = 200, title = '능력치',
}: {
  entries: HexRadarEntry[]
  height?: number
  title?: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const first = entries[0]?.data
  if (!first || first.axes.length < 3) return null
  const axes = first.axes.map(a => a.label)
  const multi = entries.length > 1
  const sample = Math.max(...entries.map(e => e.data.sample))
  const anyUnqualified = entries.some(e => !e.data.qualified)
  const allEmpty = entries.every(e => e.data.axes.every(a => a.value === null))

  const series: RadarSeries[] = entries.map(e => ({
    name: e.name,
    values: e.data.axes.map(a => a.value ?? 0),
    stroke: e.color,
    strokeWidth: multi ? 2 : 2.25,
    ...(e.gradient ? { gradient: e.gradient } : { fill: e.color, fillOpacity: multi ? 0.22 : 0.25 }),
  }))
  const formatValue = (_v: number, si: number, ai: number) => {
    const v = entries[si]?.data.axes[ai]?.value
    return v === null || v === undefined ? '–' : String(v)
  }
  const sel = active

  return (
    <section aria-label={`${title} 6축 레이더`}>
      <RadarChart
        axes={axes}
        series={series}
        max={100}
        height={height}
        label={`${title} · 리그 백분위`}
        activeAxis={sel}
        onActiveAxisChange={i => { if (i !== null) setActive(i) }}
        tooltip={false}
        formatValue={formatValue}
      />
      <p className="text-xs text-center mt-0.5 font-bold tabular-nums" style={{ color: 'var(--mm-muted)' }}>
        리그 백분위 · 하루 평균 · 비교 {sample}명
      </p>
      {allEmpty && (
        <p className="mt-1 text-xs text-center" style={{ color: 'var(--mm-muted)' }}>
          {anyUnqualified ? '출전일이 순위 기준(열린 날의 30%)에 못 미쳐 백분위를 비워 둡니다.' : '비교할 선수가 아직 적어 백분위를 매기지 않습니다.'}
        </p>
      )}

      {/* 축 고르기 — 그림을 누르기 어려운 경우·키보드 사용자를 위한 같은 동작 */}
      <div role="group" aria-label="축 고르기" className="mt-2 grid grid-cols-3 gap-1 sm:grid-cols-6">
        {first.axes.map((a, i) => {
          const on = sel === i
          return (
            <button
              key={a.key}
              type="button"
              aria-pressed={on}
              onClick={() => setActive(on ? null : i)}
              className="min-h-10 px-1 text-xs font-bold rounded-sm border cursor-pointer tabular-nums transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
              style={on
                ? { background: 'var(--mm-yellow)', borderColor: 'var(--mm-black)', color: 'var(--mm-black)' }
                : { background: 'var(--mm-panel-alt)', borderColor: 'var(--mm-rule)', color: 'var(--mm-ink-soft)' }}
            >
              {a.label}
              <span className="ml-1 font-black" style={{ color: on ? 'var(--mm-black)' : 'var(--mm-ink)' }}>
                {entries.map(e => e.data.axes[i]?.value ?? '–').join(' · ')}
              </span>
            </button>
          )
        })}
      </div>

      {sel !== null && (
        <div className="mt-2 rounded-sm px-3 py-2.5" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}>
          <p className="text-sm font-black" style={{ color: 'var(--mm-ink)' }}>
            {axes[sel]} <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>구성 요소 · 값 (백분위)</span>
          </p>
          {multi && (
            <div className="mt-1 grid grid-cols-[minmax(0,1fr)_minmax(0,6rem)_minmax(0,6rem)] gap-x-2 text-xs font-bold">
              <span />
              {entries.map(e => (
                <span key={e.name} className="inline-flex items-center justify-end gap-1 min-w-0" style={{ color: 'var(--mm-ink-soft)' }}>
                  <span aria-hidden className="inline-block w-2 h-2 shrink-0 rounded-full" style={{ background: e.color }} />
                  <span className="truncate">{e.name}</span>
                </span>
              ))}
            </div>
          )}
          <ul className="mt-1 space-y-1 tabular-nums">
            {first.axes[sel].components.map((c, ci) => (
              <li
                key={c.label}
                className={multi
                  ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,6rem)_minmax(0,6rem)] gap-x-2 text-xs'
                  : 'grid grid-cols-[minmax(0,1fr)_auto_2rem] gap-x-2 text-xs'}
              >
                <span className="font-bold" style={{ color: 'var(--mm-ink-soft)' }}>
                  {c.label}{c.lowerIsBetter && <span style={{ color: 'var(--mm-muted)' }}> (낮을수록 좋음)</span>}
                </span>
                {multi
                  ? entries.map(e => {
                      const row = e.data.axes[sel]?.components[ci]
                      return (
                        <span key={e.name} className="text-right" style={{ color: 'var(--mm-ink)' }}>
                          {row?.valueText ?? '–'} <b>({row?.pct ?? '–'})</b>
                        </span>
                      )
                    })
                  : (
                    <>
                      <span className="text-right" style={{ color: 'var(--mm-ink)' }}>{c.valueText}</span>
                      <span className="text-right font-black" style={{ color: 'var(--mm-ink)' }}>{c.pct ?? '–'}</span>
                    </>
                  )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-2 text-xs" style={{ color: 'var(--mm-muted)' }}>
        축 값 = 구성 요소 백분위의 평균을 다시 리그 안에서 백분위로 매긴 것(100 = 1위). 성공률은 시도가 적으면 빠집니다.
        TS%는 +1 보너스·자유투 2점 규칙 때문에 득점이 부풀어 쓰지 않고, 효율은 eFG%로 봅니다.
      </p>
    </section>
  )
}
