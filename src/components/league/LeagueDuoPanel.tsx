'use client'
import { useEffect, useState } from 'react'

type PlayerRef = { id: string; name: string; number: string | null }

type AssistPair = {
  assister: PlayerRef
  scorer: PlayerRef
  count: number
}

type StlTovPair = {
  stealer: PlayerRef
  tovPlayer: PlayerRef
  count: number
}

interface Props {
  leagueId: string
  quarterId: string  // 'all' or specific quarter ID
  refreshKey?: number
}

export default function LeagueDuoPanel({ leagueId, quarterId, refreshKey }: Props) {
  const [assistPairs, setAssistPairs] = useState<AssistPair[]>([])
  const [stlTovPairs, setStlTovPairs] = useState<StlTovPair[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const qp = quarterId !== 'all' ? `?quarterId=${quarterId}` : ''
    fetch(`/api/leagues/${leagueId}/relationships${qp}`)
      .then(r => r.json())
      .then(d => {
        setAssistPairs(d.assistPairs ?? [])
        setStlTovPairs(d.stlTovPairs ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [leagueId, quarterId, refreshKey])

  if (loading) return null
  if (assistPairs.length === 0 && stlTovPairs.length === 0) return null

  function Badge({ n, color }: { n: number; color: string }) {
    return (
      <span className={`shrink-0 min-w-[22px] px-1.5 py-0.5 rounded-full text-[11px] font-black text-center ${color}`}>
        {n}
      </span>
    )
  }

  function PlayerChip({ p, side }: { p: PlayerRef; side: 'left' | 'right' }) {
    const align = side === 'left' ? 'text-right' : 'text-left'
    return (
      <div className={`flex-1 ${align}`}>
        {p.number && (
          <span className="text-gray-600 font-mono text-[10px] mr-0.5">#{p.number}</span>
        )}
        <span className="font-bold text-white text-xs">{p.name}</span>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

      {/* 어시스트 듀오 */}
      {assistPairs.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
            <span className="text-sm font-bold text-white">최고 어시스트 듀오</span>
            <span className="text-[10px] text-gray-500 font-medium">어시스터 → 득점자</span>
          </div>
          <div className="divide-y divide-gray-800/60">
            {assistPairs.slice(0, 7).map((pair, i) => (
              <div key={`${pair.assister.id}-${pair.scorer.id}`} className="flex items-center gap-2 px-4 py-2.5">
                <span className={`w-5 text-right text-xs font-black shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-500' : 'text-gray-600'}`}>
                  {i + 1}
                </span>
                <PlayerChip p={pair.assister} side="left" />
                <span className="text-gray-600 text-[11px] font-bold shrink-0">→</span>
                <PlayerChip p={pair.scorer} side="right" />
                <Badge n={pair.count} color={i === 0 ? 'bg-yellow-500/20 text-yellow-300' : 'bg-blue-500/20 text-blue-300'} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 스틸-턴오버 관계 */}
      {stlTovPairs.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
            <span className="text-sm font-bold text-white">스틸 관계</span>
            <span className="text-[10px] text-gray-500 font-medium">탈취자 → 뺏긴 선수</span>
          </div>
          <div className="divide-y divide-gray-800/60">
            {stlTovPairs.slice(0, 7).map((pair, i) => (
              <div key={`${pair.stealer.id}-${pair.tovPlayer.id}`} className="flex items-center gap-2 px-4 py-2.5">
                <span className={`w-5 text-right text-xs font-black shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-500' : 'text-gray-600'}`}>
                  {i + 1}
                </span>
                <PlayerChip p={pair.stealer} side="left" />
                <span className="text-gray-600 text-[11px] font-bold shrink-0">⚡</span>
                <PlayerChip p={pair.tovPlayer} side="right" />
                <Badge n={pair.count} color={i === 0 ? 'bg-yellow-500/20 text-yellow-300' : 'bg-purple-500/20 text-purple-300'} />
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
