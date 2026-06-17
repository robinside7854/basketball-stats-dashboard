'use client'
import type { DraftStatRow } from './DraftPlayerStatsModal'

interface Team { id: string; name: string; color: string }
interface Pick { team_id: string; player_id: string }
interface Leader { team_id: string; leader_player_id: string | null }

interface Props {
  teams: Team[]
  picks: Pick[]
  leaders: Leader[]
  stats: Record<string, DraftStatRow>  // 지난 분기 (날짜 평균)
}

type Col = { key: keyof DraftStatRow; label: string; lowerBetter?: boolean }
const COLS: Col[] = [
  { key: 'ppg', label: '득점' },
  { key: 'rpg', label: '리바' },
  { key: 'apg', label: '어시' },
  { key: 'spg', label: '스틸' },
  { key: 'bpg', label: '블록' },
  { key: 'topg', label: '턴오버', lowerBetter: true },
]

export default function DraftTeamStats({ teams, picks, leaders, stats }: Props) {
  // 팀별 멤버 = 팀장 + 픽된 선수
  const rows = teams.map(t => {
    const ids = new Set<string>()
    const lid = leaders.find(l => l.team_id === t.id)?.leader_player_id
    if (lid) ids.add(lid)
    for (const p of picks) if (p.team_id === t.id) ids.add(p.player_id)
    const members = [...ids].map(id => stats[id]).filter((s): s is DraftStatRow => !!s && s.gp > 0)
    const count = ids.size
    const avg: Record<string, number> = {}
    for (const c of COLS) {
      avg[c.key] = members.length ? members.reduce((sum, m) => sum + Number(m[c.key] ?? 0), 0) / members.length : 0
    }
    return { team: t, count, ranked: members.length, avg }
  })

  // 컬럼별 최고/최저 (강점/약점 강조) — 멤버 있는 팀만 대상
  const bestWorst: Record<string, { best: number; worst: number }> = {}
  for (const c of COLS) {
    const vals = rows.filter(r => r.ranked > 0).map(r => r.avg[c.key])
    if (vals.length >= 2) {
      const max = Math.max(...vals), min = Math.min(...vals)
      bestWorst[c.key] = c.lowerBetter ? { best: min, worst: max } : { best: max, worst: min }
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-800">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">팀 구성 성적 (지난 분기 평균)</p>
        <p className="text-[10px] text-gray-500 mt-0.5">드래프트된 선수 + 팀장의 평균. 초록=강점 · 빨강=약점 (다음 픽 참고)</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-800/50 text-gray-500">
              <th className="text-left p-2 font-bold">팀</th>
              <th className="text-center p-2 font-bold">인원</th>
              {COLS.map(c => <th key={String(c.key)} className="text-center p-2 font-bold min-w-[52px]">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.team.id} className="border-b border-gray-800/30">
                <td className="p-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.team.color }} />
                    <span className="text-gray-200 font-bold">{r.team.name}</span>
                  </div>
                </td>
                <td className="p-2 text-center text-gray-400">{r.count}</td>
                {COLS.map(c => {
                  const v = r.avg[c.key]
                  const bw = bestWorst[c.key]
                  const isBest = bw && r.ranked > 0 && v === bw.best
                  const isWorst = bw && r.ranked > 0 && v === bw.worst && bw.best !== bw.worst
                  return (
                    <td key={String(c.key)} className={`p-2 text-center font-display tabular-nums ${
                      isBest ? 'text-emerald-300 font-bold' : isWorst ? 'text-red-400' : 'text-white'
                    }`}>
                      {r.ranked > 0 ? v.toFixed(1) : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
