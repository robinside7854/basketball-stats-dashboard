'use client'
import { useState, useEffect } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { DraftStatRow } from './DraftPlayerStatsModal'
import { overallScorePerGame } from '@/lib/leagueStats'

interface PlayerLite { id: string; name: string; number: number | null }
interface Props {
  leagueId: string
  availablePlayers: PlayerLite[]   // 아직 안 픽된 풀 선수 (드래프트되면 자동 제거)
  prevStats: Record<string, DraftStatRow>
  prevQuarterId: string | null
  prevQuarterLabel: string | null
}

type ColKey = 'gp' | 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'topg' | 'fg_pct' | 'fg3_pct' | 'ft_pct' | 'overall'
const COLS: { key: ColKey; label: string; pct?: boolean }[] = [
  { key: 'gp', label: '일' },
  { key: 'ppg', label: '득점' },
  { key: 'rpg', label: '리바' },
  { key: 'apg', label: '어시' },
  { key: 'spg', label: '스틸' },
  { key: 'bpg', label: '블록' },
  { key: 'topg', label: '턴오버' },
  { key: 'fg_pct', label: '야투%', pct: true },
  { key: 'fg3_pct', label: '3점%', pct: true },
  { key: 'ft_pct', label: '자유투%', pct: true },
  { key: 'overall', label: '종합' },
]

function overallOf(s?: DraftStatRow): number {
  if (!s || s.gp <= 0) return 0
  return overallScorePerGame({ ppg: s.ppg, rpg: s.rpg, apg: s.apg, spg: s.spg, bpg: s.bpg, topg: s.topg })
}

export default function DraftStatTable({ leagueId, availablePlayers, prevStats, prevQuarterId, prevQuarterLabel }: Props) {
  const [scope, setScope] = useState<'prev' | 'all'>('prev')
  const [allStats, setAllStats] = useState<Record<string, DraftStatRow>>({})
  const [sortKey, setSortKey] = useState<ColKey>('overall')
  const [dir, setDir] = useState<'desc' | 'asc'>('desc')

  // 전체 누적 (모든 분기, 날짜 평균) 1회 로드
  useEffect(() => {
    fetch(`/api/leagues/${leagueId}/stats?unit=round`)
      .then(r => r.json())
      .then((d: { players?: DraftStatRow[] }) => {
        const m: Record<string, DraftStatRow> = {}
        for (const p of d.players ?? []) m[p.player_id] = p
        setAllStats(m)
      })
      .catch(() => null)
  }, [leagueId])

  const data = scope === 'prev' ? prevStats : allStats

  function valOf(p: PlayerLite, key: ColKey): number {
    const s = data[p.id]
    if (key === 'overall') return overallOf(s)
    return s ? Number(s[key] ?? 0) : 0
  }

  function clickHeader(key: ColKey) {
    if (sortKey === key) setDir(d => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setDir('desc') }
  }

  const rows = [...availablePlayers].sort((a, b) => {
    const av = valOf(a, sortKey), bv = valOf(b, sortKey)
    return dir === 'desc' ? bv - av : av - bv
  })

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-2 flex-wrap">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">남은 선수 성적표</p>
        <span className="text-[10px] text-gray-500">{availablePlayers.length}명 · 픽되면 자동 제거 · 지표 클릭 정렬</span>
        <div className="ml-auto flex bg-gray-800 rounded-lg p-0.5">
          {(['prev', 'all'] as const).map(s => (
            <button key={s} onClick={() => setScope(s)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${scope === s ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              {s === 'prev' ? (prevQuarterLabel ?? '지난 분기') : '전체 누적'}
            </button>
          ))}
        </div>
      </div>
      {scope === 'prev' && !prevQuarterId ? (
        <div className="p-6 text-center text-xs text-gray-500">지난 분기가 없습니다. ‘전체 누적’을 선택하세요.</div>
      ) : (
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-900 z-10">
              <tr className="border-b border-gray-800 text-gray-500">
                <th className="text-left p-2 font-bold sticky left-0 bg-gray-900">선수</th>
                {COLS.map(c => (
                  <th key={c.key} onClick={() => clickHeader(c.key)}
                    className="text-center p-2 font-bold min-w-[52px] cursor-pointer hover:text-white select-none">
                    <span className="inline-flex items-center gap-0.5">
                      {c.label}
                      {sortKey === c.key && (dir === 'desc' ? <ArrowDown size={10} /> : <ArrowUp size={10} />)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(p => {
                const s = data[p.id]
                return (
                  <tr key={p.id} className="border-b border-gray-800/30 hover:bg-gray-800/30">
                    <td className="p-2 text-left sticky left-0 bg-gray-900">
                      <span className="text-white font-bold">{p.name}</span>
                      {p.number != null && <span className="text-gray-600 text-[10px] ml-1">#{p.number}</span>}
                    </td>
                    {COLS.map(c => {
                      const v = valOf(p, c.key)
                      const display = !s || s.gp <= 0 ? '—'
                        : c.key === 'gp' ? String(s.gp)
                        : c.key === 'overall' ? v.toFixed(1)
                        : c.pct ? `${v.toFixed(1)}%`
                        : v.toFixed(1)
                      const isSort = sortKey === c.key
                      return (
                        <td key={c.key} className={`p-2 text-center font-display tabular-nums ${isSort ? 'text-amber-300 font-bold' : 'text-gray-200'}`}>
                          {display}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={COLS.length + 1} className="p-6 text-center text-gray-500">남은 선수가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
