'use client'
import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'

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

  function Badge({ n, isTop }: { n: number; isTop: boolean }) {
    return (
      <span
        className={`shrink-0 min-w-[22px] px-1.5 py-0.5 rounded-full text-xs font-black text-center ${
          isTop
            ? 'bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)]'
            : 'bg-[color:var(--mm-panel-alt)] text-[color:var(--mm-ink)] border border-[color:var(--mm-rule)]'
        }`}
      >
        {n}
      </span>
    )
  }

  function PlayerChip({ p, side }: { p: PlayerRef; side: 'left' | 'right' }) {
    const align = side === 'left' ? 'text-right' : 'text-left'
    return (
      <div className={`flex-1 ${align}`}>
        {p.number && (
          <span className="text-[color:var(--mm-muted)] font-mono text-xs mr-0.5">#{p.number}</span>
        )}
        <span className="font-bold text-[color:var(--mm-ink)] text-xs">{p.name}</span>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

      {/* 어시스트 듀오 */}
      {assistPairs.length > 0 && (
        <div className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[color:var(--mm-rule)] flex items-center gap-2">
            <span className="text-sm font-bold text-[color:var(--mm-ink)]">최고 어시스트 듀오</span>
            <span className="text-xs text-[color:var(--mm-muted)] font-medium">어시스터 → 득점자</span>
          </div>
          <div className="divide-y divide-[color:var(--mm-rule)]">
            {assistPairs.slice(0, 7).map((pair, i) => (
              <div key={`${pair.assister.id}-${pair.scorer.id}`} className="flex items-center gap-2 px-4 py-2.5">
                <span className={`w-5 text-right text-xs font-black shrink-0 tabular-nums ${i === 0 ? 'text-[color:var(--mm-yellow-strong)]' : 'text-[color:var(--mm-muted)]'}`}>
                  {i + 1}
                </span>
                <PlayerChip p={pair.assister} side="left" />
                <span className="text-[color:var(--mm-muted)] text-xs font-bold shrink-0">→</span>
                <PlayerChip p={pair.scorer} side="right" />
                <Badge n={pair.count} isTop={i === 0} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 스틸-턴오버 관계 */}
      {stlTovPairs.length > 0 && (
        <div className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[color:var(--mm-rule)] flex items-center gap-2">
            <span className="text-sm font-bold text-[color:var(--mm-ink)]">스틸 관계</span>
            <span className="text-xs text-[color:var(--mm-muted)] font-medium">탈취자 → 뺏긴 선수</span>
          </div>
          <div className="divide-y divide-[color:var(--mm-rule)]">
            {stlTovPairs.slice(0, 7).map((pair, i) => (
              <div key={`${pair.stealer.id}-${pair.tovPlayer.id}`} className="flex items-center gap-2 px-4 py-2.5">
                <span className={`w-5 text-right text-xs font-black shrink-0 tabular-nums ${i === 0 ? 'text-[color:var(--mm-yellow-strong)]' : 'text-[color:var(--mm-muted)]'}`}>
                  {i + 1}
                </span>
                <PlayerChip p={pair.stealer} side="left" />
                <span className="text-[color:var(--mm-muted)] shrink-0 inline-flex items-center" aria-hidden><Zap size={14} strokeWidth={2} /></span>
                <PlayerChip p={pair.tovPlayer} side="right" />
                <Badge n={pair.count} isTop={i === 0} />
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
