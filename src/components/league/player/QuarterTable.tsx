'use client'
// 선수 카드 「분기별 기록」 표 (2026-10-14).
// 출처: kbl-stats `app/components/CareerTable` — 시즌별 줄 + 그 시즌 리그 1위 굵게.
// 계산은 서버(`detail?quarterRows=1` → lib/stats/quarterTable.ts). 분기 경기는 날짜 범위로 골랐다.
import { MIN_ATTEMPTS_PER_DAY } from '@/lib/stats/eligibility'
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

/**
 * 표 아래 「전체」·「합계」 줄 (2026-10-17) — 이 묶음 전체 기간의 정본 한 줄(스탯 탭 전체 기간 행과 같다).
 *   분기 줄을 더한 값이 아니다(분기 밖 날짜 경기도 들어가고, 대회는 섞이지 않는다). 서버 `loadQuarterTotal`.
 */
export type QuarterTotal = {
  avg: QuarterTableRow
  sums: { gp: number; pts: number; reb: number; ast: number; stl: number; blk: number; fgm: number; fga: number; fg3m: number; fg3a: number }
}

const cellText = (c: typeof COLS[number], v: number | null) =>
  v === null ? '–' : c.pct ? `${v.toFixed(1)}%` : c.int ? String(v) : v.toFixed(1)

export default function QuarterTable({ rows, total }: { rows: QuarterTableRow[]; total?: QuarterTotal | null }) {
  if (rows.length === 0) return null
  // 합계 줄 — 누적 개수. 성공률 칸은 전체 기간 값(전체 줄과 같다)이라 성공/시도로 보인다.
  const sumCells: Record<QuarterTableKey, string> | null = total ? {
    gp: String(total.sums.gp),
    ppg: String(total.sums.pts), rpg: String(total.sums.reb), apg: String(total.sums.ast),
    spg: String(total.sums.stl), bpg: String(total.sums.blk),
    fg_pct: `${total.sums.fgm}/${total.sums.fga}`, fg3_pct: `${total.sums.fg3m}/${total.sums.fg3a}`,
  } : null
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
                  const text = cellText(c, v)
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
          {total && sumCells && (
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--mm-ink)' }}>
                <th scope="row" className="t-td text-left pr-2 sticky left-0 font-black whitespace-nowrap" style={{ color: 'var(--mm-ink)', background: 'var(--mm-panel)' }}>
                  전체<span className="sr-only"> 기간 하루 평균</span>
                </th>
                {COLS.map(c => {
                  const best = total.avg.best.includes(c.key)
                  return (
                    <td key={c.key} className={`t-td text-right tabular-nums whitespace-nowrap ${best ? 'font-black' : 'font-bold'}`} style={{ color: 'var(--mm-ink)' }}>
                      {cellText(c, total.avg.values[c.key])}
                      {best && <span className="sr-only"> (리그 최고)</span>}
                    </td>
                  )
                })}
              </tr>
              <tr>
                <th scope="row" className="t-td text-left pr-2 sticky left-0 font-black whitespace-nowrap" style={{ color: 'var(--mm-ink-soft)', background: 'var(--mm-panel)' }}>
                  합계<span className="sr-only"> (누적)</span>
                </th>
                {COLS.map(c => (
                  <td key={c.key} className="t-td text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--mm-ink-soft)' }}>
                    {sumCells[c.key]}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs mt-2" style={{ color: 'var(--mm-muted)' }}>
        {total && <>「전체」 = 전체 기간 하루 평균, 「합계」 = 전체 기간 누적(분기 밖 날짜 경기 포함 · 대회 미포함). </>}
        「–」 = 시도가 적어 성공률을 매기지 않음(하루 평균 야투 {MIN_ATTEMPTS_PER_DAY.fg} · 3점 {MIN_ATTEMPTS_PER_DAY.fg3}개 미만)
      </p>
    </div>
  )
}
