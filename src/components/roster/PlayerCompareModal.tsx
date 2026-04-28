'use client'
import { useEffect, useMemo, useState } from 'react'
import { X, ArrowLeftRight } from 'lucide-react'
import type { Player } from '@/types/database'

interface PlayerStatPayload {
  player: Player
  tournamentStats: Array<{ games_played: number; stats: { pts_avg: number; reb_avg: number; ast_avg: number; stl_avg: number; blk_avg: number; tov_avg: number; fg_pct: number; fg3_pct: number; ft_pct: number; pts: number; reb: number; ast: number; stl: number; blk: number; tov: number } | null }>
}

interface Aggregated {
  gp: number
  ppg: number; rpg: number; apg: number; spg: number; bpg: number; topg: number
  fg_pct: number; fg3_pct: number; ft_pct: number
  pts: number; reb: number; ast: number; stl: number; blk: number; tov: number
}

function aggregate(p: PlayerStatPayload | null): Aggregated | null {
  if (!p) return null
  let gp = 0, pts = 0, reb = 0, ast = 0, stl = 0, blk = 0, tov = 0
  for (const t of p.tournamentStats) {
    if (!t.stats || t.games_played === 0) continue
    gp += t.games_played
    pts += t.stats.pts; reb += t.stats.reb; ast += t.stats.ast
    stl += t.stats.stl; blk += t.stats.blk; tov += t.stats.tov
  }
  if (gp === 0) return null
  return {
    gp,
    ppg: Math.round((pts / gp) * 10) / 10,
    rpg: Math.round((reb / gp) * 10) / 10,
    apg: Math.round((ast / gp) * 10) / 10,
    spg: Math.round((stl / gp) * 10) / 10,
    bpg: Math.round((blk / gp) * 10) / 10,
    topg: Math.round((tov / gp) * 10) / 10,
    fg_pct: 0, fg3_pct: 0, ft_pct: 0,
    pts, reb, ast, stl, blk, tov,
  }
}

interface Props {
  candidates: Player[]
  initialIds?: [string | null, string | null]
  onClose: () => void
}

const STAT_ROWS: { key: keyof Aggregated; label: string; suffix?: string; better: 'high' | 'low' }[] = [
  { key: 'gp',    label: 'GP',  better: 'high' },
  { key: 'ppg',   label: 'PPG', better: 'high' },
  { key: 'rpg',   label: 'RPG', better: 'high' },
  { key: 'apg',   label: 'APG', better: 'high' },
  { key: 'spg',   label: 'SPG', better: 'high' },
  { key: 'bpg',   label: 'BPG', better: 'high' },
  { key: 'topg',  label: 'TOPG', better: 'low'  },
]

export default function PlayerCompareModal({ candidates, initialIds, onClose }: Props) {
  const [id1, setId1] = useState<string | null>(initialIds?.[0] ?? null)
  const [id2, setId2] = useState<string | null>(initialIds?.[1] ?? null)
  const [data1, setData1] = useState<PlayerStatPayload | null>(null)
  const [data2, setData2] = useState<PlayerStatPayload | null>(null)
  const [loading1, setLoading1] = useState(false)
  const [loading2, setLoading2] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    if (!id1) { setData1(null); return }
    setLoading1(true)
    fetch(`/api/players/${id1}/stats`)
      .then(r => r.json())
      .then(d => { setData1(d); setLoading1(false) })
      .catch(() => setLoading1(false))
  }, [id1])

  useEffect(() => {
    if (!id2) { setData2(null); return }
    setLoading2(true)
    fetch(`/api/players/${id2}/stats`)
      .then(r => r.json())
      .then(d => { setData2(d); setLoading2(false) })
      .catch(() => setLoading2(false))
  }, [id2])

  const agg1 = useMemo(() => aggregate(data1), [data1])
  const agg2 = useMemo(() => aggregate(data2), [data2])

  function pctRow(label: string, val1: number | null, val2: number | null) {
    return { label, val1, val2 }
  }

  const pctRows = useMemo(() => {
    function lastFG(p: PlayerStatPayload | null): { fg: number; fg3: number; ft: number } {
      if (!p) return { fg: 0, fg3: 0, ft: 0 }
      // 가장 최근(완료된) 토너먼트의 % 사용 — stats 가장 최근 first
      for (const t of p.tournamentStats) {
        if (t.stats && t.games_played > 0) {
          return { fg: t.stats.fg_pct, fg3: t.stats.fg3_pct, ft: t.stats.ft_pct }
        }
      }
      return { fg: 0, fg3: 0, ft: 0 }
    }
    const a = lastFG(data1)
    const b = lastFG(data2)
    return [
      pctRow('FG%',  a.fg,  b.fg),
      pctRow('3P%',  a.fg3, b.fg3),
      pctRow('FT%',  a.ft,  b.ft),
    ]
  }, [data1, data2])

  function colorOf(v1: number | null | undefined, v2: number | null | undefined, better: 'high' | 'low'): [string, string] {
    if (v1 == null || v2 == null) return ['text-white', 'text-white']
    if (v1 === v2) return ['text-white', 'text-white']
    const p1Better = better === 'high' ? v1 > v2 : v1 < v2
    return p1Better
      ? ['text-green-400 font-bold', 'text-gray-500']
      : ['text-gray-500', 'text-green-400 font-bold']
  }

  function PlayerPicker({ value, onChange, otherId, label }: { value: string | null; onChange: (id: string | null) => void; otherId: string | null; label: string }) {
    return (
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-bold">{label}</p>
        <select
          value={value ?? ''}
          onChange={e => onChange(e.target.value || null)}
          className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm cursor-pointer"
        >
          <option value="">선수 선택…</option>
          {candidates.filter(p => p.id !== otherId).map(p => (
            <option key={p.id} value={p.id}>#{p.number} {p.name}</option>
          ))}
        </select>
      </div>
    )
  }

  function HeaderCard({ p, agg }: { p: Player | null; agg: Aggregated | null }) {
    if (!p) return (
      <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-3 py-4 text-center text-gray-600 text-xs">
        선수를 선택하세요
      </div>
    )
    return (
      <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
          {p.photo_url ? (
            <img src={p.photo_url} alt={p.name} className="w-10 h-10 rounded-lg object-cover object-top shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-gray-500 font-bold text-sm shrink-0">#{p.number}</div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-gray-500">#{p.number}{p.position ? ` · ${p.position}` : ''}</p>
            <p className="font-bold text-white text-sm truncate">{p.name}</p>
          </div>
        </div>
        <div className="p-3 grid grid-cols-3 gap-1 text-center">
          <div><p className="text-[10px] text-gray-500">PPG</p><p className="text-lg font-bold text-white">{agg?.ppg.toFixed(1) ?? '-'}</p></div>
          <div><p className="text-[10px] text-gray-500">RPG</p><p className="text-lg font-bold text-white">{agg?.rpg.toFixed(1) ?? '-'}</p></div>
          <div><p className="text-[10px] text-gray-500">APG</p><p className="text-lg font-bold text-blue-400">{agg?.apg.toFixed(1) ?? '-'}</p></div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[90vh] bg-gray-950 border-0 sm:border border-gray-800 rounded-none sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 pt-safe-or-3 pb-3 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <ArrowLeftRight size={16} className="text-blue-400" />
            <span className="font-semibold text-white">선수 비교</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors inline-flex items-center justify-center min-h-11 min-w-11">
            <X size={18} />
          </button>
        </div>

        {/* 본문 */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* 선수 선택기 */}
          <div className="flex items-end gap-2">
            <PlayerPicker label="선수 1" value={id1} onChange={setId1} otherId={id2} />
            <span className="text-gray-600 pb-2 text-xs">vs</span>
            <PlayerPicker label="선수 2" value={id2} onChange={setId2} otherId={id1} />
          </div>

          {/* 헤더 카드 */}
          <div className="flex items-stretch gap-2">
            <HeaderCard p={data1?.player ?? null} agg={agg1} />
            <HeaderCard p={data2?.player ?? null} agg={agg2} />
          </div>

          {/* 비교 테이블 */}
          {(loading1 || loading2) ? (
            <div className="text-center py-10 text-gray-500 text-sm">로딩 중…</div>
          ) : (id1 && id2 && agg1 && agg2) ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800/60 text-xs text-gray-500">
                    <th className="px-4 py-2 text-right w-20">{data1?.player.name}</th>
                    <th className="px-4 py-2 text-center w-16 uppercase tracking-wider">지표</th>
                    <th className="px-4 py-2 text-left w-20">{data2?.player.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {STAT_ROWS.map(({ key, label, better }) => {
                    const v1 = agg1?.[key]
                    const v2 = agg2?.[key]
                    const [c1, c2] = colorOf(v1 as number, v2 as number, better)
                    const fmt = (v: unknown) => typeof v === 'number' ? (v % 1 === 0 ? String(v) : v.toFixed(1)) : '-'
                    return (
                      <tr key={key as string} className="border-t border-gray-800/60">
                        <td className={`px-4 py-2 text-right font-mono ${c1}`}>{fmt(v1)}</td>
                        <td className="px-4 py-2 text-center text-xs text-gray-500 font-bold">{label}</td>
                        <td className={`px-4 py-2 text-left font-mono ${c2}`}>{fmt(v2)}</td>
                      </tr>
                    )
                  })}
                  {pctRows.map(({ label, val1, val2 }) => {
                    const [c1, c2] = colorOf(val1, val2, 'high')
                    return (
                      <tr key={label} className="border-t border-gray-800/60">
                        <td className={`px-4 py-2 text-right font-mono ${c1}`}>{val1 != null && val1 > 0 ? `${val1.toFixed(1)}%` : '-'}</td>
                        <td className="px-4 py-2 text-center text-xs text-gray-500 font-bold">{label}</td>
                        <td className={`px-4 py-2 text-left font-mono ${c2}`}>{val2 != null && val2 > 0 ? `${val2.toFixed(1)}%` : '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="text-[11px] text-gray-700 px-4 py-2 border-t border-gray-800/60">% 지표는 가장 최근 대회 기준</p>
            </div>
          ) : (
            <div className="text-center py-10 text-gray-600 text-sm">
              {!id1 || !id2 ? '두 선수를 선택해주세요' : '비교할 데이터가 없습니다'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
