'use client'
// 선수 카드 「월별 성적」 표 (2026-10-17).
// 계산은 서버(`detail` 라우트 monthly_stats) — 같은 경기 집합(친선 제외 · 고른 기간 · 외부 팀 이벤트 제외),
//   득점은 scorePoints/isPlusOneFor. 값은 하루 평균, 성공률은 최소 시도(하루 평균 × 그 달 출전일) 미달이면 null.
// 「최고의 달」 = 하루 평균 득점이 가장 높은 달(서버가 정한다 — 두 달 이상일 때만).
import { Crown } from 'lucide-react'
import { MIN_ATTEMPTS_PER_DAY } from '@/lib/stats/eligibility'

export type MonthRow = {
  month: string; label: string; gp: number
  ppg: number; rpg: number; apg: number; spg: number; bpg: number
  fgm?: number; fga?: number; fg3m?: number; fg3a?: number
  fg_pct: number | null
  fg3_pct?: number | null
  best?: boolean
}

const COLS: { key: 'gp' | 'ppg' | 'rpg' | 'apg' | 'fg_pct' | 'fg3_pct'; label: string; pct?: boolean; int?: boolean }[] = [
  { key: 'gp',      label: '출전일', int: true },
  { key: 'ppg',     label: '득점' },
  { key: 'rpg',     label: '리바' },
  { key: 'apg',     label: '어시' },
  { key: 'fg_pct',  label: '야투율', pct: true },
  { key: 'fg3_pct', label: '3점률', pct: true },
]

export default function MonthTable({ rows, periodLabel }: { rows: MonthRow[]; periodLabel: string }) {
  if (rows.length === 0) return null
  const best = rows.find(r => r.best)
  // 다른 해 같은 달이 섞이면 「25.10월」처럼 해를 붙인다
  const multiYear = new Set(rows.map(x => x.month.slice(0, 4))).size > 1
  return (
    <div className="px-5 py-4">
      <p className="t-label font-black mb-1" style={{ color: 'var(--mm-yellow-strong)' }}>월별 성적</p>
      <p className="text-xs mb-3" style={{ color: 'var(--mm-muted)' }}>
        {periodLabel} · 하루 평균
        {best && <> · <b style={{ color: 'var(--mm-ink)' }}>최고의 달</b> = 하루 평균 득점이 가장 높은 달</>}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full">
          <caption className="sr-only">월별 하루 평균 기록{best ? `. 최고의 달은 ${best.label}` : ''}</caption>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--mm-rule)' }}>
              <th scope="col" className="t-th text-left sticky left-0" style={{ color: 'var(--mm-muted)', background: 'var(--mm-panel)' }}>월</th>
              {COLS.map(c => (
                <th key={c.key} scope="col" className="t-th text-right whitespace-nowrap" style={{ color: 'var(--mm-muted)' }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const label = multiYear ? `${r.month.slice(2, 4)}.${r.label}` : r.label
              return (
                <tr
                  key={r.month}
                  style={{ borderBottom: '1px solid var(--mm-rule)', background: r.best ? 'var(--mm-yellow-soft)' : undefined }}
                  className="last:border-0"
                >
                  <th
                    scope="row"
                    className="t-td text-left pr-2 sticky left-0 font-bold whitespace-nowrap"
                    style={{ color: r.best ? 'var(--mm-ink)' : 'var(--mm-ink-soft)', background: r.best ? 'var(--mm-yellow-soft)' : 'var(--mm-panel)' }}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      {r.best && (
                        <span className="inline-flex items-center gap-0.5 text-xs font-black" style={{ color: 'var(--mm-yellow-strong)' }}>
                          <Crown size={12} aria-hidden strokeWidth={2.5} />최고의 달
                        </span>
                      )}
                    </span>
                  </th>
                  {COLS.map(c => {
                    const v = r[c.key] ?? null
                    const text = v === null ? '–' : c.pct ? `${v.toFixed(1)}%` : c.int ? String(v) : v.toFixed(1)
                    const title = c.key === 'fg_pct' && r.fga != null ? `${r.fgm}/${r.fga}`
                      : c.key === 'fg3_pct' && r.fg3a != null ? `${r.fg3m}/${r.fg3a}` : undefined
                    return (
                      <td
                        key={c.key}
                        className={`t-td text-right tabular-nums whitespace-nowrap ${r.best && c.key === 'ppg' ? 'font-black' : ''}`}
                        style={{ color: r.best ? 'var(--mm-ink)' : 'var(--mm-ink-soft)' }}
                        title={title}
                      >
                        {text}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs mt-2" style={{ color: 'var(--mm-muted)' }}>
        「–」 = 시도가 적어 성공률을 매기지 않음(하루 평균 야투 {MIN_ATTEMPTS_PER_DAY.fg} · 3점 {MIN_ATTEMPTS_PER_DAY.fg3}개 미만)
      </p>
    </div>
  )
}
