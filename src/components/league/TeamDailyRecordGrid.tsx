'use client'
// 팀 탭 「일별 성적」 (2026-10-25 운영진) — 고른 기간의 경기일 × 팀 표. 칸 = 그날 승-패(+득실).
//   그날 승패는 정본 lib/stats/dayRecord.ts 의 tallyDayRecord 한 벌로 센다(친선 제외 · 정체성 키로 묶음).
//   ⚠ 화면에서 승패를 다시 세지 말 것 — 홈·일정·박스스코어와 숫자가 갈린다.
import { useMemo } from 'react'
import { tallyDayRecord, type DayRecordGame, type DayRecordSide } from '@/lib/stats/dayRecord'

export type GridGame = {
  date?: string | null
  quarter_id?: string | null
  home_team_id: string | null
  away_team_id: string | null
  home_score: number | null
  away_score: number | null
  is_complete?: boolean | null
  is_exhibition?: boolean | null
}
export type GridTeam = { key: string; team_id: string; name: string; color: string; quarter_ids: string[] }

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function TeamDailyRecordGrid({ games, teams }: { games: GridGame[]; teams: GridTeam[] }) {
  const { rows, totals } = useMemo(() => {
    // 경기의 팀 → 정체성: 같은 team_id 중 그 경기 분기를 가진 정체성(없으면 team_id 가 같은 첫 정체성)
    const sideOf = (tid: string | null, qid: string | null | undefined): DayRecordSide | null => {
      if (!tid) return null
      const t = teams.find(x => x.team_id === tid && (!qid || x.quarter_ids.includes(qid))) ?? teams.find(x => x.team_id === tid)
      return t ? { key: t.key, name: t.name, color: t.color } : null
    }
    const byDate = new Map<string, DayRecordGame[]>()
    for (const g of games) {
      if (!g.date) continue
      const list = byDate.get(g.date) ?? []
      list.push({
        home: sideOf(g.home_team_id, g.quarter_id), away: sideOf(g.away_team_id, g.quarter_id),
        home_score: g.home_score, away_score: g.away_score, is_complete: g.is_complete, is_exhibition: g.is_exhibition,
      })
      byDate.set(g.date, list)
    }
    const totals = new Map<string, { w: number; l: number; d: number; best: number }>()
    const rows = [...byDate.entries()]
      .map(([date, list]) => ({ date, rec: tallyDayRecord(list) }))
      .filter(r => r.rec.regularGames > 0)   // 친선전만 있던 날은 이 표(정규 성적)에서 뺀다
      .sort((a, b) => b.date.localeCompare(a.date))
    for (const r of rows) {
      const top = r.rec.teams[0]
      for (const t of r.rec.teams) {
        const acc = totals.get(t.key) ?? { w: 0, l: 0, d: 0, best: 0 }
        acc.w += t.wins; acc.l += t.losses; acc.d += t.draws
        if (top && t.key === top.key && top.wins > top.losses) acc.best += 1
        totals.set(t.key, acc)
      }
    }
    return { rows, totals }
  }, [games, teams])

  const cols = teams.filter(t => totals.has(t.key))
  if (rows.length === 0 || cols.length === 0) {
    return <p className="text-sm py-6 text-center" style={{ color: 'var(--mm-muted)' }}>이 기간에 마감된 정규전이 아직 없어요.</p>
  }

  const fmtDate = (d: string) => {
    const dt = new Date(d + 'T00:00:00')
    return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}${Number.isNaN(dt.getTime()) ? '' : `(${DAYS[dt.getDay()]})`}`
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
        <thead>
          <tr>
            <th scope="col" className="t-th text-left sticky left-0 z-10 pr-2" style={{ background: 'var(--mm-panel)', color: 'var(--mm-muted)' }}>날짜</th>
            {cols.map(t => (
              <th key={t.key} scope="col" className="t-th text-center px-1 whitespace-nowrap" style={{ color: 'var(--mm-ink)' }}>
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: t.color, boxShadow: 'inset 0 0 0 1px var(--mm-rule)' }} />
                  {t.name}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ date, rec }) => (
            <tr key={date}>
              <th scope="row" className="t-td text-left sticky left-0 z-10 pr-2 whitespace-nowrap font-medium" style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', borderTop: '1px solid var(--mm-rule)' }}>
                {fmtDate(date)}
              </th>
              {cols.map(t => {
                const r = rec.teams.find(x => x.key === t.key)
                if (!r) return <td key={t.key} className="t-td text-center" style={{ color: 'var(--mm-muted)', borderTop: '1px solid var(--mm-rule)' }}>–</td>
                const diff = r.ptsFor - r.ptsAgainst
                const top = rec.teams[0]?.key === t.key && r.wins > r.losses
                const win = r.wins > r.losses, lose = r.wins < r.losses
                return (
                  <td key={t.key} className="t-td text-center px-1 tabular-nums"
                    style={{ borderTop: '1px solid var(--mm-rule)', background: top ? 'var(--mm-yellow-soft)' : undefined }}
                    aria-label={`${fmtDate(date)} ${t.name} ${r.wins}승 ${r.losses}패${r.draws ? ` ${r.draws}무` : ''}, 득실 ${diff > 0 ? '+' : ''}${diff}${top ? ', 그날 1위' : ''}`}>
                    <span className={win ? 'font-black' : 'font-semibold'} style={{ color: lose ? 'var(--mm-muted)' : 'var(--mm-ink)' }}>
                      {r.wins}-{r.losses}{r.draws ? `-${r.draws}` : ''}
                    </span>
                    <span className="block text-xs" style={{ color: diff > 0 ? 'var(--mm-ink-soft)' : 'var(--mm-muted)' }}>{diff > 0 ? '+' : ''}{diff}</span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="t-td text-left sticky left-0 z-10 pr-2 font-black" style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink)', borderTop: '2px solid var(--mm-ink)' }}>합계</th>
            {cols.map(t => {
              const a = totals.get(t.key)!
              return (
                <td key={t.key} className="t-td text-center px-1 tabular-nums font-black" style={{ color: 'var(--mm-ink)', borderTop: '2px solid var(--mm-ink)' }}>
                  {a.w}-{a.l}{a.d ? `-${a.d}` : ''}
                  <span className="block text-xs font-medium" style={{ color: 'var(--mm-muted)' }}>그날 1위 {a.best}번</span>
                </td>
              )
            })}
          </tr>
        </tfoot>
      </table>
      <p className="text-xs mt-2" style={{ color: 'var(--mm-muted)' }}>칸 = 그날 승-패 · 아래 숫자는 득실 · 노란 칸 = 그날 1위 · 친선전 제외</p>
    </div>
  )
}
