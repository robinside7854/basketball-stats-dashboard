'use client'
// 선수 카드 「분기별 기록」 표 (2026-10-14).
// 출처: kbl-stats `app/components/CareerTable` — 시즌별 줄 + 그 시즌 리그 1위 굵게.
// 계산은 서버(`detail?quarterRows=1` → lib/stats/quarterTable.ts). 분기 경기는 날짜 범위로 골랐다.
import { PCT_MIN_ATTEMPTS } from '@/lib/stats/percentileBars'
import type { QuarterTableKey, QuarterTableRow } from '@/lib/stats/quarterTable'

const COLS: { key: QuarterTableKey; label: string; pct?: boolean; int?: boolean }[] = [
  { key: 'gp',      label: '출전일', int: true },
  { key: 'ppg',     label: '득점' },
  { key: 'rpg',     label: '리바' },
  { key: 'apg',     label: '어시' },
  { key: 'spg',     label: '스틸' },
  { key: 'bpg',     label: '블락' },
  { key: 'fg_pct',  label: '야투율', pct: true },
  { key: 'fg3_pct', label: '3점률', pct: true },
]

export default function QuarterTable({ rows }: { rows: QuarterTableRow[] }) {
  if (rows.length === 0) return null
  return (
    <div className="px-5 py-4">
      <p className="t-label font-black mb-1" style={{ color: 'var(--mm-yellow-strong)' }}>분기별 기록</p>
      <p className="text-xs mb-3" style={{ color: 'var(--mm-muted)' }}>
        하루 평균 · <b style={{ color: 'var(--mm-ink)' }}>굵은 글씨</b> = 그 분기 리그 최고(출전일이 열린 날의 30% 이상인 선수 중)
      </p>
      <div className="overflow-x-auto">
        <table className="w-full">
          <caption className="sr-only">분기별 하루 평균 기록. 굵은 글씨는 그 분기 리그 최고.</caption>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--mm-rule)' }}>
              <th scope="col" className="t-th text-left sticky left-0" style={{ color: 'var(--mm-muted)', background: 'var(--mm-panel)' }}>분기</th>
              {COLS.map(c => (
                <th key={c.key} scope="col" className="t-th text-right whitespace-nowrap" style={{ color: 'var(--mm-muted)' }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.quarter_id} style={{ borderBottom: '1px solid var(--mm-rule)' }} className="last:border-0">
                <th scope="row" className="t-td text-left pr-2 sticky left-0 font-bold whitespace-nowrap" style={{ color: 'var(--mm-ink-soft)', background: 'var(--mm-panel)' }}>
                  {r.label}
                </th>
                {COLS.map(c => {
                  const v = r.values[c.key]
                  const best = r.best.includes(c.key)
                  const text = v === null ? '–' : c.pct ? `${v.toFixed(1)}%` : c.int ? String(v) : v.toFixed(1)
                  const title = c.key === 'fg_pct' ? `${r.fgm}/${r.fga}` : c.key === 'fg3_pct' ? `${r.fg3m}/${r.fg3a}` : c.key === 'gp' ? `열린 날 ${r.total_rounds}일` : undefined
                  return (
                    <td
                      key={c.key}
                      className={`t-td text-right tabular-nums whitespace-nowrap ${best ? 'font-black' : ''}`}
                      style={{ color: best ? 'var(--mm-ink)' : 'var(--mm-ink-soft)' }}
                      title={title}
                    >
                      {text}
                      {best && <span className="sr-only"> (리그 최고)</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs mt-2" style={{ color: 'var(--mm-muted)' }}>
        「–」 = 시도가 적어 성공률을 매기지 않음(야투 {PCT_MIN_ATTEMPTS.fg} · 3점 {PCT_MIN_ATTEMPTS.fg3}회 미만)
      </p>
    </div>
  )
}
