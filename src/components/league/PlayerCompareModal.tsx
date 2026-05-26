'use client'
import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Legend } from 'recharts'

type Detail = {
  player_stats: {
    gp: number; ppg: number; rpg: number; apg: number; spg: number; bpg: number; topg: number
    fg_pct: number; fg3_pct: number; ft_pct: number
  } | null
}

interface Props {
  leagueId: string
  player1Id: string
  player2Id: string
  player1Name: string
  player2Name: string
  onClose: () => void
}

const COLOR1 = '#3b82f6'
const COLOR2 = '#ef4444'

export default function PlayerCompareModal({ leagueId, player1Id, player2Id, player1Name, player2Name, onClose }: Props) {
  const [d1, setD1] = useState<Detail | null>(null)
  const [d2, setD2] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetch(`/api/leagues/${leagueId}/players/${player1Id}/detail`).then(r => r.ok ? r.json() : null),
      fetch(`/api/leagues/${leagueId}/players/${player2Id}/detail`).then(r => r.ok ? r.json() : null),
    ]).then(([a, b]) => {
      if (cancelled) return
      setD1(a); setD2(b)
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [leagueId, player1Id, player2Id])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const ps1 = d1?.player_stats ?? null
  const ps2 = d2?.player_stats ?? null

  const radarData = [
    { stat: '득점',     [player1Name]: Math.min((ps1?.ppg ?? 0) * 10, 100), [player2Name]: Math.min((ps2?.ppg ?? 0) * 10, 100) },
    { stat: '리바운드', [player1Name]: Math.min((ps1?.rpg ?? 0) * 15, 100), [player2Name]: Math.min((ps2?.rpg ?? 0) * 15, 100) },
    { stat: '어시스트', [player1Name]: Math.min((ps1?.apg ?? 0) * 20, 100), [player2Name]: Math.min((ps2?.apg ?? 0) * 20, 100) },
    { stat: '스틸',     [player1Name]: Math.min((ps1?.spg ?? 0) * 40, 100), [player2Name]: Math.min((ps2?.spg ?? 0) * 40, 100) },
    { stat: '블록',     [player1Name]: Math.min((ps1?.bpg ?? 0) * 50, 100), [player2Name]: Math.min((ps2?.bpg ?? 0) * 50, 100) },
  ]

  type StatKey = 'gp' | 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'fg_pct' | 'fg3_pct'
  const ROWS: { key: StatKey; label: string; isPct?: boolean; higherIsBetter?: boolean }[] = [
    { key: 'gp',      label: 'R'   },
    { key: 'ppg',     label: 'PPG' },
    { key: 'rpg',     label: 'RPG' },
    { key: 'apg',     label: 'APG' },
    { key: 'spg',     label: 'SPG' },
    { key: 'bpg',     label: 'BPG' },
    { key: 'fg_pct',  label: 'FG%', isPct: true },
    { key: 'fg3_pct', label: '3P%', isPct: true },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-gray-900 border-0 sm:border border-gray-700 rounded-none sm:rounded-2xl w-full max-w-xl h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto z-10 shadow-2xl">
        <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">선수 비교</p>
            <h2 className="text-white font-black text-base mt-0.5">
              <span style={{ color: COLOR1 }}>{player1Name}</span>
              <span className="text-gray-600 mx-2">VS</span>
              <span style={{ color: COLOR2 }}>{player2Name}</span>
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white cursor-pointer transition-colors inline-flex items-center justify-center min-h-11 min-w-11">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-600" /></div>
        ) : (
          <div className="p-5 space-y-5">
            {/* 레이더 차트 */}
            <div className="bg-gray-800/40 rounded-2xl p-3 border border-gray-700/40">
              <ResponsiveContainer width="100%" height={240}>
                <RadarChart data={radarData} margin={{top:8,right:24,bottom:8,left:24}}>
                  <PolarGrid stroke="#374151" />
                  <PolarAngleAxis dataKey="stat" tick={{fill:'#d1d5db',fontSize:11,fontWeight:600}} />
                  <Radar name={player1Name} dataKey={player1Name} stroke={COLOR1} fill={COLOR1} fillOpacity={0.25} strokeWidth={2} />
                  <Radar name={player2Name} dataKey={player2Name} stroke={COLOR2} fill={COLOR2} fillOpacity={0.25} strokeWidth={2} />
                  <Legend wrapperStyle={{fontSize:11,color:'#9ca3af'}} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* 스탯 비교 테이블 */}
            <div className="bg-gray-800/30 rounded-2xl border border-gray-700/40 overflow-hidden">
              {ROWS.map(({ key, label, isPct }) => {
                const v1 = (ps1?.[key] ?? 0) as number
                const v2 = (ps2?.[key] ?? 0) as number
                const v1Better = v1 > v2
                const v2Better = v2 > v1
                const fmt = (v: number) => isPct ? `${v.toFixed(1)}%` : (key === 'gp' ? String(v) : v.toFixed(1))
                return (
                  <div key={key} className="grid grid-cols-3 items-center px-4 py-2.5 border-b border-gray-700/40 last:border-0">
                    <p className={`text-base font-black text-right ${v1Better ? '' : 'text-gray-500'}`} style={v1Better ? { color: COLOR1 } : undefined}>{fmt(v1)}</p>
                    <p className="text-[11px] text-gray-500 font-bold uppercase text-center tracking-widest">{label}</p>
                    <p className={`text-base font-black text-left ${v2Better ? '' : 'text-gray-500'}`} style={v2Better ? { color: COLOR2 } : undefined}>{fmt(v2)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
