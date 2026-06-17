'use client'
import { useState } from 'react'
import { X, BarChart3 } from 'lucide-react'

export interface DraftStatRow {
  player_id: string
  name?: string
  number?: number | null
  gp: number
  pts: number; reb: number; oreb: number; dreb: number; ast: number; stl: number; blk: number; tov: number
  ppg: number; rpg: number; apg: number; spg: number; bpg: number; topg: number
  fg_pct: number; fg3_pct: number; ft_pct: number
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
}

interface Props {
  player: { id: string; name: string; number: number | null }
  stats: Record<string, DraftStatRow>
  poolIds: string[]
  prevQuarterLabel?: string | null
  onClose: () => void
}

type StatDef = { key: keyof DraftStatRow; label: string; lowerBetter?: boolean; pct?: boolean }

const CUMULATIVE: StatDef[] = [
  { key: 'pts', label: '득점' },
  { key: 'reb', label: '리바운드' },
  { key: 'ast', label: '어시스트' },
  { key: 'stl', label: '스틸' },
  { key: 'blk', label: '블록' },
  { key: 'tov', label: '턴오버', lowerBetter: true },
]
const AVERAGE: StatDef[] = [
  { key: 'ppg', label: '득점' },
  { key: 'rpg', label: '리바운드' },
  { key: 'apg', label: '어시스트' },
  { key: 'spg', label: '스틸' },
  { key: 'bpg', label: '블록' },
  { key: 'topg', label: '턴오버', lowerBetter: true },
  { key: 'fg_pct', label: '야투%', pct: true },
  { key: 'fg3_pct', label: '3점%', pct: true },
  { key: 'ft_pct', label: '자유투%', pct: true },
]

export default function DraftPlayerStatsModal({ player, stats, poolIds, prevQuarterLabel, onClose }: Props) {
  const [tab, setTab] = useState<'avg' | 'cum'>('avg')
  const row = stats[player.id]

  // 풀 내 랭킹 — gp>0 인 풀 선수만 대상
  const ranked = poolIds.map(id => stats[id]).filter((r): r is DraftStatRow => !!r && r.gp > 0)

  function rankOf(def: StatDef): { rank: number; total: number } | null {
    if (!row || row.gp <= 0) return null
    const val = Number(row[def.key] ?? 0)
    const sorted = [...ranked].sort((a, b) => {
      const av = Number(a[def.key] ?? 0), bv = Number(b[def.key] ?? 0)
      return def.lowerBetter ? av - bv : bv - av
    })
    const idx = sorted.findIndex(r => r.player_id === player.id)
    if (idx < 0) return null
    // 동점 처리: 같은 값이면 같은 순위
    let rank = 1
    for (const r of sorted) {
      if (r.player_id === player.id) break
      if (Number(r[def.key] ?? 0) !== val) rank++
    }
    return { rank, total: sorted.length }
  }

  const list = tab === 'avg' ? AVERAGE : CUMULATIVE

  return (
    <div className="fixed inset-0 z-[58] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2">
          <BarChart3 size={16} className="text-blue-400" />
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-lg truncate">
              {player.name}{player.number != null && <span className="text-gray-500 text-sm ml-1.5">#{player.number}</span>}
            </p>
            <p className="text-[10px] text-gray-500">{prevQuarterLabel ? `${prevQuarterLabel} 기록` : '지난 분기 기록'} · 드래프트 풀 내 랭킹</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white cursor-pointer"><X size={18} /></button>
        </div>

        {!row || row.gp <= 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">지난 분기 출전 기록이 없습니다.</div>
        ) : (
          <>
            <div className="px-5 pt-3 flex items-center gap-2">
              <div className="flex bg-gray-800 rounded-lg p-0.5">
                {(['avg', 'cum'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${tab === t ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                    {t === 'avg' ? '평균' : '누적'}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-gray-500 ml-auto">{row.gp}경기 출전</span>
            </div>

            <div className="p-4 overflow-y-auto space-y-1.5">
              {list.map(def => {
                const raw = Number(row[def.key] ?? 0)
                const display = def.pct ? `${raw.toFixed(1)}%` : (tab === 'avg' ? raw.toFixed(1) : String(raw))
                const r = rankOf(def)
                const top = r && r.rank === 1
                return (
                  <div key={String(def.key)} className="flex items-center gap-3 bg-gray-800/50 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-300 font-bold w-20">{def.label}</span>
                    <span className="font-display text-xl text-white tabular-nums flex-1">{display}</span>
                    {r ? (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${top ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-700/60 text-gray-300'}`}>
                        풀 {r.rank}위 / {r.total}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-600">—</span>
                    )}
                  </div>
                )
              })}
              {tab === 'cum' && (
                <div className="flex items-center gap-3 bg-gray-800/30 rounded-lg px-3 py-2 mt-1">
                  <span className="text-xs text-gray-500 w-20">슈팅</span>
                  <span className="text-xs text-gray-400">FG {row.fgm}/{row.fga} · 3P {row.fg3m}/{row.fg3a} · FT {row.ftm}/{row.fta}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
