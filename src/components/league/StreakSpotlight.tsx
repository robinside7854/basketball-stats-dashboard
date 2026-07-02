'use client'
import { useEffect, useState } from 'react'
import { Flame, Zap, Crosshair, Trophy, Shield, Layers } from 'lucide-react'
import PlayerQuickViewModal from './PlayerQuickViewModal'

type StreakCategory = 'pts10' | 'pts20' | 'tp1' | 'dd' | 'wins' | 'stlblk3'

interface StreakEntry {
  player_id: string
  name: string
  number: number | null
  category: StreakCategory
  count: number
}

interface Props {
  leagueId: string
  maxEntries?: number
}

const CATEGORY_DEFS: Record<StreakCategory, {
  label: string
  Icon: typeof Flame
  color: string
  bg: string
  border: string
  suffix: string
}> = {
  pts10:   { label: '두 자릿수 득점',  Icon: Trophy,    color: 'text-amber-300',   bg: 'bg-amber-950/40',    border: 'border-amber-500/40',  suffix: '경기' },
  pts20:   { label: '20+ 득점',        Icon: Flame,     color: 'text-orange-300',  bg: 'bg-orange-950/40',   border: 'border-orange-500/40', suffix: '경기' },
  tp1:     { label: '3점 성공',         Icon: Crosshair, color: 'text-pink-300',    bg: 'bg-pink-950/40',     border: 'border-pink-500/40',   suffix: '경기' },
  dd:      { label: '더블더블',         Icon: Layers,    color: 'text-purple-300',  bg: 'bg-purple-950/40',   border: 'border-purple-500/40', suffix: '경기' },
  wins:    { label: '승리 연속',        Icon: Shield,    color: 'text-emerald-300', bg: 'bg-emerald-950/40',  border: 'border-emerald-500/40',suffix: '경기' },
  stlblk3: { label: 'STL+BLK 3+',      Icon: Zap,       color: 'text-cyan-300',    bg: 'bg-cyan-950/40',     border: 'border-cyan-500/40',   suffix: '경기' },
}

function heat(count: number): { emoji: string; intensity: string } {
  if (count >= 7) return { emoji: '🔥🔥🔥', intensity: '초열' }
  if (count >= 5) return { emoji: '🔥🔥',   intensity: '핫' }
  if (count >= 3) return { emoji: '🔥',     intensity: '진행' }
  return { emoji: '',       intensity: '시작' }
}

export default function StreakSpotlight({ leagueId, maxEntries = 8 }: Props) {
  const [streaks, setStreaks] = useState<StreakEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [quickPlayer, setQuickPlayer] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/leagues/${leagueId}/streaks?minStreak=2`)
      .then(r => r.json())
      .then(d => { setStreaks(d.streaks ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [leagueId])

  if (loading) {
    return <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center text-xs text-gray-600">연속 기록 계산 중...</div>
  }

  const displayed = streaks.slice(0, maxEntries)
  if (displayed.length === 0) return null

  return (
    <>
      <div className="bg-gradient-to-br from-orange-950/30 via-gray-900 to-red-950/20 border border-orange-800/40 rounded-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="px-4 py-3 lg:px-5 lg:py-4 border-b border-gray-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame size={16} className="text-orange-400 lg:w-5 lg:h-5" />
            <h3 className="font-jersey text-sm lg:text-base font-bold text-orange-300 uppercase tracking-widest">진행 중 연속</h3>
          </div>
          <span className="text-xs lg:text-xs text-gray-500 font-mono">{streaks.length}개 · Top {displayed.length}</span>
        </div>

        {/* 스트릭 리스트 */}
        <div className="divide-y divide-gray-800/40">
          {displayed.map((s, i) => {
            const def = CATEGORY_DEFS[s.category]
            const h = heat(s.count)
            return (
              <button
                key={`${s.player_id}-${s.category}`}
                onClick={() => setQuickPlayer({ id: s.player_id, name: s.name })}
                className="w-full flex items-center gap-3 lg:gap-4 px-4 lg:px-5 py-2.5 lg:py-3 hover:bg-orange-950/20 transition-colors cursor-pointer group text-left"
              >
                {/* Rank */}
                <span className={`text-xs lg:text-sm font-black font-mono w-5 shrink-0 text-right ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-500' : 'text-gray-600'}`}>
                  {i + 1}
                </span>

                {/* Icon */}
                <div className={`w-9 h-9 lg:w-10 lg:h-10 rounded-full ${def.bg} border ${def.border} flex items-center justify-center shrink-0`}>
                  <def.Icon size={16} className={def.color} />
                </div>

                {/* Player + Category */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm lg:text-base font-bold text-white group-hover:text-orange-200 transition-colors truncate">
                    {s.name}
                    {s.number != null && <span className="ml-1.5 text-xs lg:text-xs text-gray-500 font-mono">#{s.number}</span>}
                  </p>
                  <p className={`text-xs lg:text-xs ${def.color} truncate`}>
                    {def.label}
                  </p>
                </div>

                {/* Count */}
                <div className="text-right shrink-0">
                  <p className={`text-lg lg:text-2xl font-black tabular-nums ${def.color} leading-none`}>
                    {s.count}{def.suffix}
                  </p>
                  {h.emoji && <p className="text-xs lg:text-xs mt-0.5">{h.emoji}</p>}
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
