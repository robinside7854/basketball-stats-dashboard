'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, X } from 'lucide-react'

// Recharts (~90KB gz) 는 모달 열림 시점에만 로드 — 초기 번들 감량
const PlayerCompareRadarChart = dynamic(() => import('@/components/league/charts/PlayerCompareCharts'), {
  ssr: false,
  loading: () => <div style={{ height: 240 }} />,
})

type Detail = {
  player_stats: {
    gp: number; ppg: number; rpg: number; apg: number; spg: number; bpg: number; topg: number
    fg_pct: number; fg3_pct: number; ft_pct: number
  } | null
  rankings?: {
    ppg?: number; rpg?: number; apg?: number; spg?: number; bpg?: number
    total?: number
  }
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

  // 레이더 축 = 리그 백분위 (100 = 1위). 2026-08-15 수정.
  //   전에는 축마다 임의 배율(PPG×10 · RPG×15 · APG×20 · SPG×40 · BPG×50)을 곱해 100 에서
  //   잘랐다. 근거가 없는 배율이라 블록 0.8개와 득점 4점이 같은 반경으로 찍혔고, 레이더는
  //   "어느 축이 더 튀어나왔나"로 읽히므로 그 자체가 잘못된 비교를 만들었다.
  //   같은 리그 안의 '몇 등인가' 로 바꾸면 다섯 축이 전부 같은 뜻의 값이 된다 —
  //   선수 퀵뷰 모달의 레이더가 원래 쓰던 방식과 동일하게 맞춘 것이다.
  //   rank 0(최소 경기 수 미달로 순위 없음)은 퀵뷰와 같이 50 으로 둔다.
  const pctile = (rank: number | undefined, total: number | undefined) => {
    const t = total ?? 0
    const r = rank ?? 0
    return r > 0 && t > 0 ? Math.round((t - r + 1) / t * 100) : 50
  }
  const rk1 = d1?.rankings
  const rk2 = d2?.rankings
  const axis = (label: string, key: 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg') => ({
    stat: label,
    [player1Name]: pctile(rk1?.[key], rk1?.total),
    [player2Name]: pctile(rk2?.[key], rk2?.total),
  })
  const radarData = [
    axis('득점', 'ppg'),
    axis('리바운드', 'rpg'),
    axis('어시스트', 'apg'),
    axis('스틸', 'spg'),
    axis('블록', 'bpg'),
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

      <div className="relative bg-gray-900 border-0 sm:border border-gray-700 rounded-none sm:rounded-2xl w-full max-w-xl h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto z-10 shadow-2xl mm-modal-in">
        <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">선수 비교</p>
            <h2 className="text-white font-black text-base mt-0.5">
              <span style={{ color: COLOR1 }}>{player1Name}</span>
              <span className="text-gray-600 mx-2">VS</span>
              <span style={{ color: COLOR2 }}>{player2Name}</span>
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white cursor-pointer transition-colors inline-flex items-center justify-center min-h-11 min-w-11">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-600" /></div>
        ) : (
          <div className="p-5 space-y-5">
            {/* 레이더 차트 */}
            <div className="bg-gray-800/40 rounded-2xl p-3 border border-gray-700/40">
              <PlayerCompareRadarChart
                data={radarData}
                player1Name={player1Name}
                player2Name={player2Name}
                color1={COLOR1}
                color2={COLOR2}
              />
              {/* 축이 무슨 값인지 밝힌다 — 안 밝히면 '득점 80' 을 80점으로 읽는다. */}
              <p className="text-[11px] text-center mt-0.5 uppercase tracking-[0.16em] font-bold text-gray-500">
                리그 백분위 (100 = 1위)
              </p>
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
                    <p className="text-xs text-gray-500 font-bold uppercase text-center tracking-widest">{label}</p>
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
