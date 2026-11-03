'use client'
import { useEffect, useState } from 'react'
import { accentOrInk } from '@/lib/util/contrastColor'
import type { RosterPlayer } from '../_lib/types'

// 입력 패드 아래 실시간 요약(2026-11-03, 운영진 「기록이 쌓이는 게 보이게」).
//   재료는 「실시간 박스스코어」 모달과 같은 `GET /stats/[gameId]`(점수는 서버가 scorePoints+isPlusOneFor 로 계산) —
//   기록이 저장될 때마다(statsRefresh) 다시 받는다. 코트 위 선수만, 숫자 6개. 자세한 표는 모달.
type Line = { player_id: string; pts: number; reb: number; ast: number; stl: number; blk: number; tov: number }
type Side = { team?: { id: string; name: string; color: string }; players: RosterPlayer[] }
const COLS: { key: keyof Omit<Line, 'player_id'>; label: string }[] = [
  { key: 'pts', label: '득점' }, { key: 'reb', label: '리바' }, { key: 'ast', label: '어시' },
  { key: 'stl', label: '스틸' }, { key: 'blk', label: '블록' }, { key: 'tov', label: '턴오버' },
]

export default function LiveStatStrip({ leagueId, gameId, refreshKey, left, right }: {
  leagueId: string; gameId: string; refreshKey: number; left: Side; right: Side
}) {
  const [lines, setLines] = useState<Record<string, Line>>({})
  useEffect(() => {
    if (!gameId) return
    let alive = true
    fetch(`/api/leagues/${leagueId}/stats/${gameId}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive || !d?.boxScores) return
        const m: Record<string, Line> = {}
        for (const b of d.boxScores as Line[]) m[b.player_id] = b
        setLines(m)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [leagueId, gameId, refreshKey])

  function block(side: Side) {
    const rows = side.players.map(p => ({ p, l: lines[p.id] }))
    const tot = COLS.map(c => rows.reduce((n, r) => n + (r.l?.[c.key] ?? 0), 0))
    return (
      <div className="min-w-0">
        <div className="grid items-center text-[11px] leading-none mb-1 px-1" style={{ gridTemplateColumns: 'minmax(0,1.6fr) repeat(6, minmax(0,1fr))' }}>
          <span className="font-bold truncate" style={{ color: accentOrInk(side.team?.color) }}>{side.team?.name ?? '팀'}</span>
          {COLS.map(c => <span key={c.key} className="text-center text-[color:var(--mm-muted)]">{c.label}</span>)}
        </div>
        <ul className="space-y-0.5">
          {rows.map(({ p, l }) => (
            <li key={p.id} className="grid items-center px-1 py-1 rounded-md text-xs tabular-nums"
              style={{ gridTemplateColumns: 'minmax(0,1.6fr) repeat(6, minmax(0,1fr))', background: 'var(--mm-panel-alt)' }}>
              <span className="truncate font-semibold text-[color:var(--mm-ink)]">{p.name}</span>
              {COLS.map(c => {
                const v = l?.[c.key] ?? 0
                return <span key={c.key} className={`text-center ${v === 0 ? 'text-[color:var(--mm-muted)]' : c.key === 'pts' ? 'font-black text-[color:var(--mm-ink)]' : 'text-[color:var(--mm-ink)]'}`}>{v}</span>
              })}
            </li>
          ))}
          <li className="grid items-center px-1 py-1 text-xs tabular-nums font-bold" style={{ gridTemplateColumns: 'minmax(0,1.6fr) repeat(6, minmax(0,1fr))' }}>
            <span className="text-[color:var(--mm-ink-soft)]">합계</span>
            {tot.map((v, i) => <span key={i} className="text-center text-[color:var(--mm-ink)]">{v}</span>)}
          </li>
        </ul>
      </div>
    )
  }

  return (
    <section aria-label="실시간 요약" className="p-2 rounded-lg" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {block(left)}
        {block(right)}
      </div>
    </section>
  )
}
