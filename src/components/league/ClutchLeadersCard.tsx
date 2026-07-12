'use client'
import { useEffect, useState } from 'react'
import { Flame, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import PlayerQuickViewModal from './PlayerQuickViewModal'

interface StatBlock {
  pts: number; reb: number; ast: number; stl: number; blk: number; tov: number
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
  gp: number
}
interface Split {
  player_id: string
  name: string
  number: number | null
  regular: StatBlock
  clutch: StatBlock
  qualified: boolean
}
interface Config {
  timeWindowSeconds: number
  marginMax: number
  minGames: number
}

interface Props {
  leagueId: string
  maxEntries?: number
}

function ppg(b: StatBlock): number { return b.gp > 0 ? +(b.pts / b.gp).toFixed(1) : 0 }
function fgPct(b: StatBlock): number { return b.fga > 0 ? +(b.fgm / b.fga * 100).toFixed(1) : 0 }

export default function ClutchLeadersCard({ leagueId, maxEntries = 6 }: Props) {
  const [splits, setSplits] = useState<Split[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [quickPlayer, setQuickPlayer] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/leagues/${leagueId}/clutch`)
      .then(r => r.json())
      .then(d => {
        setSplits(d.splits ?? [])
        setConfig(d.config ?? null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [leagueId])

  if (loading) {
    return <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center text-xs text-gray-600">클러치 스탯 계산 중...</div>
  }

  const qualified = splits.filter(s => s.qualified)
  if (qualified.length === 0) return null

  // Clutch PPG 순위 Top N
  const topClutch = [...qualified].sort((a, b) => ppg(b.clutch) - ppg(a.clutch)).slice(0, maxEntries)

  return (
    <>
      <div className="bg-gradient-to-br from-red-950/30 via-gray-900 to-amber-950/20 border border-red-800/40 rounded-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="px-4 py-3 lg:px-5 lg:py-4 border-b border-gray-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame size={16} className="text-red-400 lg:w-5 lg:h-5" />
            <h3 className="font-jersey text-sm lg:text-base font-bold text-red-300 uppercase tracking-widest">Clutch Time</h3>
          </div>
          <span className="text-xs text-gray-500 font-mono">
            마지막 {config ? Math.round(config.timeWindowSeconds / 60) : 2}분 · {config?.marginMax ?? 3}점 이내
          </span>
        </div>

        {/* 클러치 리더 리스트 */}
        <div className="divide-y divide-gray-800/40">
          {topClutch.map((s, i) => {
            const clutchPpg = ppg(s.clutch)
            const regPpg = ppg(s.regular)
            const clutchFg = fgPct(s.clutch)
            const delta = +(clutchPpg - regPpg).toFixed(1)
            const isUp = delta > 0.5
            const isDown = delta < -0.5
            return (
              <button
                key={s.player_id}
                onClick={() => setQuickPlayer({ id: s.player_id, name: s.name })}
                className="w-full flex items-center gap-3 lg:gap-4 px-4 lg:px-5 py-2.5 lg:py-3 hover:bg-red-950/20 transition-colors cursor-pointer group text-left"
              >
                {/* Rank */}
                <span className={`text-sm lg:text-base font-black font-mono w-5 shrink-0 text-right ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-500' : 'text-gray-600'}`}>
                  {i + 1}
                </span>

                {/* Player */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm lg:text-base font-bold text-white group-hover:text-red-200 transition-colors break-keep" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>
                    {s.name}
                    {s.number != null && <span className="ml-1.5 text-xs text-gray-500 font-mono">#{s.number}</span>}
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500">{s.clutch.gp}게임</span>
                    <span className="text-gray-700">·</span>
                    <span className="text-gray-500">평상시 <span className="text-gray-300 font-bold">{regPpg}</span> PPG</span>
                    <span className="text-gray-700">·</span>
                    <span className="text-gray-500">클러치 FG <span className="text-gray-300 font-bold">{clutchFg}%</span></span>
                  </div>
                </div>

                {/* Delta arrow + Clutch PPG */}
                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    <p className="text-xl lg:text-2xl font-black tabular-nums text-red-300 leading-none">{clutchPpg}</p>
                    <p className="text-xs text-gray-500 mt-0.5">클러치 PPG</p>
                  </div>
                  <div className="w-8 flex flex-col items-center">
                    {isUp ? (
                      <>
                        <TrendingUp size={16} className="text-emerald-400" />
                        <span className="text-xs font-bold text-emerald-400 tabular-nums">+{delta}</span>
                      </>
                    ) : isDown ? (
                      <>
                        <TrendingDown size={16} className="text-red-500" />
                        <span className="text-xs font-bold text-red-500 tabular-nums">{delta}</span>
                      </>
                    ) : (
                      <>
                        <Minus size={16} className="text-gray-500" />
                        <span className="text-xs text-gray-500">—</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {quickPlayer && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={quickPlayer.id}
          playerName={quickPlayer.name}
          onClose={() => setQuickPlayer(null)}
        />
      )}
    </>
  )
}
