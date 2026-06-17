'use client'
import { useState, useEffect } from 'react'
import { ArrowDown, ArrowUp, Shuffle, Check, BarChart3 } from 'lucide-react'
import type { DraftStatRow } from './DraftPlayerStatsModal'
import { overallScorePerGame } from '@/lib/leagueStats'

interface PlayerLite { id: string; name: string; number: number | null }
interface Props {
  leagueId: string
  availablePlayers: PlayerLite[]   // 아직 안 픽된 풀 선수 (드래프트되면 자동 제거)
  prevStats: Record<string, DraftStatRow>
  prevQuarterId: string | null
  prevQuarterLabel: string | null
  // 픽 기능 (현재 차례 단장에게만) — 선택 상태는 부모가 제어
  canPick?: boolean
  picking?: boolean
  selectedId?: string | null
  onSelectId?: (id: string | null) => void
  onPick?: (playerId: string) => void
  onShowStats?: (p: PlayerLite) => void
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

export default function DraftStatTable({ leagueId, availablePlayers, prevStats, prevQuarterId, prevQuarterLabel, canPick, picking, selectedId = null, onSelectId, onPick, onShowStats }: Props) {
  const [scope, setScope] = useState<'prev' | 'all'>('prev')
  const [allStats, setAllStats] = useState<Record<string, DraftStatRow>>({})
  const [sortKey, setSortKey] = useState<ColKey>('overall')
  const [dir, setDir] = useState<'desc' | 'asc'>('desc')

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

  // 선택한 선수가 이미 픽되어 목록에서 사라지면 자동 무효화 (파생값)
  const activeId = selectedId && availablePlayers.some(p => p.id === selectedId) ? selectedId : null
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

  function recommend() {
    if (availablePlayers.length === 0) return
    // 추천은 항상 지난 분기 기준 (자동픽과 동일)
    let best = availablePlayers[0].id, bestScore = -1
    for (const p of availablePlayers) { const sc = overallOf(prevStats[p.id]); if (sc > bestScore) { bestScore = sc; best = p.id } }
    if (bestScore <= 0) best = availablePlayers[Math.floor(Math.random() * availablePlayers.length)].id
    onSelectId?.(best)
  }

  const rows = [...availablePlayers].sort((a, b) => {
    const av = valOf(a, sortKey), bv = valOf(b, sortKey)
    return dir === 'desc' ? bv - av : av - bv
  })
  const selectedName = availablePlayers.find(p => p.id === activeId)?.name

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-2 flex-wrap">
        <p className="text-sm font-bold text-gray-200">남은 선수 성적표</p>
        <span className="text-[11px] text-gray-500">{availablePlayers.length}명 · 지표 클릭 정렬{canPick ? ' · 행 선택 후 픽' : ''}</span>
        <div className="ml-auto flex items-center gap-2">
          {canPick && (
            <button onClick={recommend} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-purple-700/70 hover:bg-purple-600 text-purple-100 cursor-pointer">
              <Shuffle size={13} /> 랜덤픽(추천)
            </button>
          )}
          <div className="flex bg-gray-800 rounded-lg p-0.5">
            {(['prev', 'all'] as const).map(s => (
              <button key={s} onClick={() => setScope(s)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-bold cursor-pointer transition-colors ${scope === s ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                {s === 'prev' ? (prevQuarterLabel ?? '지난 분기') : '전체 누적'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {scope === 'prev' && !prevQuarterId ? (
        <div className="p-6 text-center text-sm text-gray-500">지난 분기가 없습니다. ‘전체 누적’을 선택하세요.</div>
      ) : (
        <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900 z-10">
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="text-left p-2.5 font-bold sticky left-0 bg-gray-900">선수</th>
                {COLS.map(c => (
                  <th key={c.key} onClick={() => clickHeader(c.key)}
                    className="text-center p-2.5 font-bold min-w-[54px] cursor-pointer hover:text-white select-none">
                    <span className="inline-flex items-center gap-0.5">
                      {c.label}
                      {sortKey === c.key && (dir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
                    </span>
                  </th>
                ))}
                {canPick && <th className="p-2.5"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(p => {
                const s = data[p.id]
                const sel = activeId === p.id
                return (
                  <tr key={p.id}
                    onClick={canPick ? () => onSelectId?.(sel ? null : p.id) : undefined}
                    className={`border-b border-gray-800/30 ${canPick ? 'cursor-pointer' : ''} ${sel ? 'bg-emerald-700/30' : 'hover:bg-gray-800/30'}`}>
                    <td className={`p-2.5 text-left sticky left-0 ${sel ? 'bg-emerald-900/40' : 'bg-gray-900'}`}>
                      <div className="flex items-center gap-1.5">
                        {onShowStats && (
                          <button onClick={e => { e.stopPropagation(); onShowStats(p) }}
                            title="지난 분기 상세 스탯·랭킹" className="text-blue-400 hover:text-blue-300 cursor-pointer shrink-0">
                            <BarChart3 size={14} />
                          </button>
                        )}
                        <span className="text-white font-bold">{p.name}</span>
                        {p.number != null && <span className="text-gray-600 text-[11px]">#{p.number}</span>}
                      </div>
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
                        <td key={c.key} className={`p-2.5 text-center font-display tabular-nums ${isSort ? 'text-amber-300 font-bold' : 'text-gray-200'}`}>
                          {display}
                        </td>
                      )
                    })}
                    {canPick && (
                      <td className="p-2 text-center">
                        {sel ? <Check size={16} className="text-emerald-300 inline" /> : <span className="text-[10px] text-gray-600">선택</span>}
                      </td>
                    )}
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={COLS.length + (canPick ? 2 : 1)} className="p-6 text-center text-gray-500">남은 선수가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 픽 확정 바 */}
      {canPick && selectedId && (
        <div className="p-3 border-t border-emerald-800/40 bg-emerald-950/30">
          <button onClick={() => onPick?.(selectedId)} disabled={!!picking}
            className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold cursor-pointer flex items-center justify-center gap-2">
            <Check size={16} /> {picking ? '픽 처리 중...' : `${selectedName} 최종 확인 (픽)`}
          </button>
        </div>
      )}
    </div>
  )
}
