'use client'
import { useEffect, useState } from 'react'
import { Crown, ChevronRight } from 'lucide-react'
import RatingBadge from './RatingBadge'
import { CATEGORY_LABELS, ovrStyle, type PlayerRating, type CategoryCode } from '@/lib/rating/computeRating'

interface Props {
  leagueId: string
  quarterId: string  // 'all' 이면 quarterId 파라미터 없이 요청
  onSelectPlayer?: (id: string, name: string) => void
}

const CATS: CategoryCode[] = ['ATT', 'PTS', 'REB', 'AST', 'STB', 'EFF']

/**
 * OVR TOP 5 카드 + 카테고리 리더 (누적 스탯 기반).
 * 스탯 페이지 상단(리더보드 위)에 배치.
 */
export default function RatingTopCard({ leagueId, quarterId, onSelectPlayer }: Props) {
  const [ratings, setRatings] = useState<PlayerRating[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const url = quarterId === 'all'
      ? `/api/leagues/${leagueId}/ratings`
      : `/api/leagues/${leagueId}/ratings?quarterId=${quarterId}`
    fetch(url)
      .then(r => r.json())
      .then(d => { setRatings(d.ratings ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [leagueId, quarterId])

  const qualified = ratings.filter(r => r.qualified)
  const top5 = [...qualified].sort((a, b) => b.ovr - a.ovr).slice(0, 5)

  const catLeaders: Record<CategoryCode, PlayerRating | null> = {
    ATT: null, PTS: null, REB: null, AST: null, STB: null, EFF: null,
  }
  for (const cat of CATS) {
    catLeaders[cat] = [...qualified].sort((a, b) => b.categories[cat] - a.categories[cat])[0] ?? null
  }

  if (loading) {
    return <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center text-xs text-gray-600">레이팅 계산 중...</div>
  }

  if (qualified.length === 0) {
    return null
  }

  const leader = top5[0]
  const leaderStyle = leader ? ovrStyle(leader.ovr) : ovrStyle(0)

  return (
    <div className="bg-gradient-to-br from-purple-950/30 via-gray-900 to-amber-950/30 border border-purple-800/40 rounded-2xl overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-3 lg:px-5 lg:py-4 border-b border-gray-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown size={16} className="text-purple-400 lg:w-5 lg:h-5" />
          <h3 className="font-jersey text-sm lg:text-base font-bold text-purple-300 uppercase tracking-widest">Player Ratings</h3>
        </div>
        <span className="text-[10px] lg:text-xs text-gray-500 font-mono">누적 · {qualified.length}명 평가</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] divide-y md:divide-y-0 md:divide-x divide-gray-800/60">
        {/* 좌측: OVR TOP 5 */}
        <div className="p-4 lg:p-5">
          {/* 1위 스포트라이트 */}
          {leader && (
            <button
              onClick={() => onSelectPlayer?.(leader.player_id, leader.name)}
              className="w-full flex items-center gap-4 lg:gap-5 pb-4 mb-3 border-b border-gray-800/60 hover:bg-purple-950/10 rounded-lg px-2 py-2 transition-colors cursor-pointer group"
            >
              <RatingBadge ovr={leader.ovr} qualified size="xl" />
              <div className="flex-1 min-w-0 text-left">
                <p className={`text-[10px] lg:text-xs font-jersey font-bold uppercase tracking-widest ${leaderStyle.text}`}>
                  Rank #{leader.rank} · {leader.gp}경기
                </p>
                <p className="text-xl lg:text-2xl font-black text-white group-hover:text-purple-200 transition-colors truncate">
                  {leader.name}
                  {leader.number != null && <span className="ml-2 text-sm lg:text-base text-gray-500 font-mono">#{leader.number}</span>}
                </p>
                <div className="mt-1.5 flex items-center gap-2 lg:gap-3 flex-wrap">
                  {CATS.map(cat => (
                    <div key={cat} className="flex items-center gap-1">
                      <span className="text-[10px] lg:text-xs text-gray-500 font-bold font-mono">{cat}</span>
                      <span className="text-xs lg:text-sm text-gray-300 font-bold tabular-nums">{Math.round(leader.categories[cat])}</span>
                    </div>
                  ))}
                </div>
              </div>
            </button>
          )}

          {/* 2~5위 리스트 */}
          <div className="space-y-1.5">
            {top5.slice(1).map((r) => {
              const s = ovrStyle(r.ovr)
              return (
                <button
                  key={r.player_id}
                  onClick={() => onSelectPlayer?.(r.player_id, r.name)}
                  className="w-full flex items-center gap-3 lg:gap-4 px-2 py-2 rounded-lg hover:bg-gray-800/50 transition-colors cursor-pointer group"
                >
                  <span className={`text-sm lg:text-base font-black font-mono w-5 shrink-0 text-right ${r.rank === 2 ? 'text-gray-400' : r.rank === 3 ? 'text-orange-500' : 'text-gray-600'}`}>
                    {r.rank}
                  </span>
                  <RatingBadge ovr={r.ovr} qualified size="sm" />
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm lg:text-base font-bold text-gray-200 group-hover:text-white transition-colors truncate">
                      {r.name}
                      {r.number != null && <span className="ml-1.5 text-[11px] lg:text-xs text-gray-600 font-mono">#{r.number}</span>}
                    </p>
                  </div>
                  <span className={`text-[10px] lg:text-xs font-bold tabular-nums ${s.text} shrink-0`}>
                    {r.gp}G
                  </span>
                  <ChevronRight size={12} className="text-gray-600 group-hover:text-purple-400 shrink-0" />
                </button>
              )
            })}
          </div>
        </div>

        {/* 우측: 카테고리 리더 */}
        <div className="p-4 lg:p-5 space-y-2 lg:space-y-2.5">
          <p className="text-[10px] lg:text-xs font-jersey font-bold text-gray-500 uppercase tracking-widest mb-2">카테고리 1위</p>
          {CATS.map(cat => {
            const catLeader = catLeaders[cat]
            const value = catLeader ? Math.round(catLeader.categories[cat]) : 0
            const s = ovrStyle(value, !!catLeader)
            return (
              <button
                key={cat}
                onClick={() => catLeader && onSelectPlayer?.(catLeader.player_id, catLeader.name)}
                disabled={!catLeader}
                className="w-full flex items-center gap-2 lg:gap-3 px-2 py-1.5 lg:py-2 rounded-lg hover:bg-gray-800/50 transition-colors cursor-pointer disabled:cursor-default disabled:opacity-40"
              >
                <span className="w-9 lg:w-10 text-[11px] lg:text-xs font-black font-mono text-purple-400 shrink-0 text-left">{cat}</span>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs lg:text-sm text-gray-500">{CATEGORY_LABELS[cat].long}</p>
                  <p className="text-sm lg:text-base font-bold text-white truncate">{catLeader?.name ?? '—'}</p>
                </div>
                <div className={`px-2 py-0.5 lg:px-2.5 lg:py-1 rounded-md text-sm lg:text-base font-black tabular-nums ${s.bg} ${s.text} border ${s.border} shrink-0`}>
                  {value}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
