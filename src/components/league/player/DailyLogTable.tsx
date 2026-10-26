'use client'
// 선수 카드 「기록 → 일별」 표 — 하루(라운드) 한 줄, 최근 → 과거. 같은 날 여러 경기는 합산.
//   2026-10-24 운영진: 최근 5일만 보이던 것을 5일씩 쪽을 넘겨 과거까지 본다.
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export type DailyLogRow = {
  date?: string; pts: number; reb: number; ast: number; stl?: number; blk?: number
  fgm: number; fga: number; fg3m?: number; fg3a?: number
}

const PAGE = 5

export default function DailyLogTable({ rows }: { rows: DailyLogRow[] }) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const cur = Math.min(page, pages - 1)
  const shown = rows.slice(cur * PAGE, cur * PAGE + PAGE)
  const navBtn = 'inline-flex items-center justify-center min-h-11 min-w-11 cursor-pointer disabled:opacity-30 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]'

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-2">
        <p className="t-label font-black" style={{ color: 'var(--mm-yellow-strong)' }}>일별 기록</p>
        {pages > 1 && (
          <div className="flex items-center gap-1" role="group" aria-label="일별 기록 쪽 넘기기">
            <button type="button" className={navBtn} onClick={() => setPage(cur - 1)} disabled={cur === 0} aria-label="더 최근 기록">
              <ChevronLeft size={18} aria-hidden />
            </button>
            <span className="text-xs tabular-nums" style={{ color: 'var(--mm-muted)' }} aria-live="polite">{cur + 1} / {pages}</span>
            <button type="button" className={navBtn} onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1} aria-label="더 지난 기록">
              <ChevronRight size={18} aria-hidden />
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        {/* 셀 크기는 globals.css 의 t-th / t-td 가 정본. 모달이 좁아 첫 열은 sticky — 가로로 밀어도 날짜가 남는다. */}
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--mm-rule)' }}>
              {['날짜', '득점', '리바', '어시', '스틸', '블록', '야투', '야투율', '3점률'].map(h => (
                <th key={h} scope="col" className={`t-th whitespace-nowrap ${h === '날짜' ? 'text-left sticky left-0' : 'text-right'}`} style={h === '날짜' ? { color: 'var(--mm-muted)', background: 'var(--mm-panel)' } : { color: 'var(--mm-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((g, i) => {
              const fgPct = g.fga > 0 ? Math.round(g.fgm / g.fga * 100) : null
              const fg3Pct = (g.fg3a ?? 0) > 0 ? Math.round((g.fg3m ?? 0) / (g.fg3a ?? 1) * 100) : null
              return (
                <tr key={`${g.date ?? ''}-${i}`} style={{ borderBottom: '1px solid var(--mm-rule)' }} className="last:border-0">
                  <td className="t-td text-left pr-2 sticky left-0" style={{ color: 'var(--mm-ink-soft)', background: 'var(--mm-panel)' }}>{g.date?.slice(5) ?? '—'}</td>
                  <td className="t-td-key text-right">{g.pts}</td>
                  <td className="t-td text-right" style={{ color: 'var(--mm-ink-soft)' }}>{g.reb}</td>
                  <td className="t-td text-right" style={{ color: 'var(--mm-ink-soft)' }}>{g.ast}</td>
                  <td className="t-td text-right" style={{ color: 'var(--mm-yellow-strong)' }}>{g.stl ?? 0}</td>
                  <td className="t-td text-right" style={{ color: 'var(--mm-yellow-strong)' }}>{g.blk ?? 0}</td>
                  <td className="t-td text-right" style={{ color: 'var(--mm-muted)' }}>{g.fgm}/{g.fga}</td>
                  <td className="t-td text-right" style={{ color: 'var(--mm-ink-soft)' }}>{fgPct != null ? `${fgPct}%` : '—'}</td>
                  <td className="t-td text-right" style={{ color: 'var(--mm-yellow-strong)' }}>{fg3Pct != null ? `${fg3Pct}%` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
