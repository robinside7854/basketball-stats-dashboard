'use client'
import { useState } from 'react'
import { X, BarChart3 } from 'lucide-react'
import { useEscapeKey } from '@/hooks/useEscapeKey'

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

type StatDef = { key: keyof DraftStatRow; label: string; lowerBetter?: boolean; pct?: boolean; madeKey?: keyof DraftStatRow; attKey?: keyof DraftStatRow }

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
  { key: 'fg_pct', label: '야투%', pct: true, madeKey: 'fgm', attKey: 'fga' },
  { key: 'fg3_pct', label: '3점%', pct: true, madeKey: 'fg3m', attKey: 'fg3a' },
  { key: 'ft_pct', label: '자유투%', pct: true, madeKey: 'ftm', attKey: 'fta' },
]

export default function DraftPlayerStatsModal({ player, stats, poolIds, prevQuarterLabel, onClose }: Props) {
  const [tab, setTab] = useState<'avg' | 'cum'>('avg')
  const row = stats[player.id]

  const ranked = poolIds.map(id => stats[id]).filter((r): r is DraftStatRow => !!r && r.gp > 0)

  function rankOf(def: StatDef): { rank: number; total: number } | null {
    if (!row || row.gp <= 0) return null
    const val = Number(row[def.key] ?? 0)
    const sorted = [...ranked].sort((a, b) => {
      const av = Number(a[def.key] ?? 0), bv = Number(b[def.key] ?? 0)
      return def.lowerBetter ? av - bv : bv - av
    })
    if (!sorted.some(r => r.player_id === player.id)) return null
    let rank = 1
    for (const r of sorted) {
      if (r.player_id === player.id) break
      if (Number(r[def.key] ?? 0) !== val) rank++
    }
    return { rank, total: sorted.length }
  }

  const list = tab === 'avg' ? AVERAGE : CUMULATIVE

  useEscapeKey(onClose)
  return (
    <div className="fixed inset-0 z-[58] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="지난 분기 기록" className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-[color:var(--mm-rule)] flex items-center gap-2">
          <BarChart3 size={16} className="text-blue-400" />
          <div className="flex-1 min-w-0">
            <p className="text-[color:var(--mm-ink)] font-black text-lg truncate">
              {player.name}{player.number != null && <span className="text-[color:var(--mm-muted)] text-sm ml-1.5">#{player.number}</span>}
            </p>
            <p className="text-xs text-[color:var(--mm-muted)]">{prevQuarterLabel ? `${prevQuarterLabel} 기록` : '지난 분기 기록'} · 드래프트 풀 내 랭킹</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="inline-flex items-center justify-center min-h-11 min-w-11 text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)] cursor-pointer"><X size={20} aria-hidden /></button>
        </div>

        {!row || row.gp <= 0 ? (
          <div className="p-8 text-center text-[color:var(--mm-muted)] text-sm">지난 분기 출전 기록이 없습니다.</div>
        ) : (
          <>
            <div className="px-5 pt-3 flex items-center gap-2">
              <div className="flex bg-[color:var(--mm-panel-alt)] rounded-lg p-0.5">
                {(['avg', 'cum'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${tab === t ? 'bg-blue-600 text-[#fff]' : 'text-[color:var(--mm-ink-soft)] hover:text-[color:var(--mm-ink)]'}`}>
                    {t === 'avg' ? '평균' : '누적'}
                  </button>
                ))}
              </div>
              <span className="text-xs text-[color:var(--mm-muted)] ml-auto">{row.gp}일 출전 · 날짜 평균</span>
            </div>

            <div className="p-4 overflow-y-auto space-y-1.5">
              {list.map(def => {
                const raw = Number(row[def.key] ?? 0)
                const display = def.pct ? `${raw.toFixed(1)}%` : (tab === 'avg' ? raw.toFixed(1) : String(raw))
                const r = rankOf(def)
                const top5 = !!r && r.rank <= 5
                const top1 = !!r && r.rank === 1
                const madeAtt = def.pct && def.madeKey && def.attKey ? `${Number(row[def.madeKey] ?? 0)}/${Number(row[def.attKey] ?? 0)}` : null
                return (
                  <div key={String(def.key)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${top5 ? 'bg-amber-500/15 border-amber-500/50' : 'bg-[color:var(--mm-panel-alt)]/50 border-transparent'}`}>
                    <span className="text-sm text-[color:var(--mm-ink)] font-bold w-20">{def.label}</span>
                    <span className={`font-display text-xl tabular-nums ${top5 ? 'text-amber-300' : 'text-[color:var(--mm-ink)]'}`}>{display}</span>
                    {madeAtt && <span className="text-xs text-[color:var(--mm-muted)]">({madeAtt})</span>}
                    <span className="flex-1" />
                    {r ? (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${top1 ? 'bg-amber-500 text-black' : top5 ? 'bg-amber-500/30 text-amber-200' : 'bg-[color:var(--mm-rule)]/60 text-[color:var(--mm-ink)]'}`}>
                        {r.rank}위 / {r.total}
                      </span>
                    ) : (
                      <span className="text-xs text-[color:var(--mm-muted)]">—</span>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
