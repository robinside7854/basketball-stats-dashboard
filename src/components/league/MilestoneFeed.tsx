'use client'
import { useEffect, useState } from 'react'
import { Target, Sparkles } from 'lucide-react'
import PlayerQuickViewModal from './PlayerQuickViewModal'

type MilestoneCategory = 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK' | '3PM' | 'GP'

interface UpcomingEntry {
  player_id: string
  name: string
  number: number | null
  category: MilestoneCategory
  current: number
  target: number
  distance: number
  percent: number
}

interface RecentEntry {
  player_id: string
  name: string
  number: number | null
  category: MilestoneCategory
  target: number
  achieved_at: string
}

interface Props {
  leagueId: string
}

const CATEGORY_LABEL: Record<MilestoneCategory, string> = {
  PTS: '득점',
  REB: '리바',
  AST: '도움',
  STL: '스틸',
  BLK: '블락',
  '3PM': '3점',
  GP:  '참석',
}

const CATEGORY_COLOR: Record<MilestoneCategory, { text: string; bg: string; border: string }> = {
  PTS: { text: 'text-amber-300',   bg: 'bg-amber-950/40',   border: 'border-amber-500/40' },
  REB: { text: 'text-orange-300',  bg: 'bg-orange-950/40',  border: 'border-orange-500/40' },
  AST: { text: 'text-cyan-300',    bg: 'bg-cyan-950/40',    border: 'border-cyan-500/40' },
  STL: { text: 'text-emerald-300', bg: 'bg-emerald-950/40', border: 'border-emerald-500/40' },
  BLK: { text: 'text-purple-300',  bg: 'bg-purple-950/40',  border: 'border-purple-500/40' },
  '3PM': { text: 'text-pink-300',  bg: 'bg-pink-950/40',    border: 'border-pink-500/40' },
  GP:  { text: 'text-blue-300',    bg: 'bg-blue-950/40',    border: 'border-blue-500/40' },
}

function formatKoreanDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`
}

export default function MilestoneFeed({ leagueId }: Props) {
  const [upcoming, setUpcoming] = useState<UpcomingEntry[]>([])
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [quickPlayer, setQuickPlayer] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/leagues/${leagueId}/milestones?maxUpcoming=6&maxRecent=6&horizonDays=30`)
      .then(r => r.json())
      .then(d => {
        setUpcoming(d.upcoming ?? [])
        setRecent(d.recent ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [leagueId])

  if (loading) {
    return <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center text-xs text-gray-600">마일스톤 스캔 중...</div>
  }

  if (upcoming.length === 0 && recent.length === 0) return null

  return (
    <>
      <div className="bg-gradient-to-br from-blue-950/30 via-gray-900 to-cyan-950/20 border border-blue-800/40 rounded-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="px-4 py-3 lg:px-5 lg:py-4 border-b border-gray-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target size={16} className="text-blue-400 lg:w-5 lg:h-5" />
            <h3 className="font-jersey text-sm lg:text-base font-bold text-blue-300 uppercase tracking-widest">커리어 마일스톤</h3>
          </div>
          <span className="text-[10px] lg:text-xs text-gray-500 font-mono">임박 {upcoming.length} · 최근 {recent.length}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-800/50">
          {/* 좌측: 임박 마일스톤 */}
          <div className="p-3 lg:p-4">
            <div className="flex items-center gap-1.5 mb-2 lg:mb-3">
              <Target size={12} className="text-blue-400" />
              <p className="text-[10px] lg:text-xs font-jersey font-bold text-blue-300 uppercase tracking-widest">임박 (진행률 순)</p>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-xs text-gray-600 py-4 text-center">임박한 마일스톤 없음</p>
            ) : (
              <div className="space-y-1.5">
                {upcoming.map(u => {
                  const c = CATEGORY_COLOR[u.category]
                  return (
                    <button
                      key={`${u.player_id}-${u.category}-${u.target}`}
                      onClick={() => setQuickPlayer({ id: u.player_id, name: u.name })}
                      className="w-full text-left group px-2 py-2 rounded-lg hover:bg-blue-950/20 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${c.bg} ${c.text} border ${c.border} shrink-0`}>
                            {u.category}
                          </span>
                          <span className="text-sm lg:text-base font-bold text-white group-hover:text-blue-200 transition-colors truncate">
                            {u.name}
                            {u.number != null && <span className="ml-1 text-[10px] lg:text-xs text-gray-500 font-mono">#{u.number}</span>}
                          </span>
                        </div>
                        <span className={`text-xs lg:text-sm font-black ${c.text} tabular-nums shrink-0`}>
                          {u.target}까지 <span className="text-white">{u.distance}</span>
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-800/70 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, u.percent)}%`,
                              background: `linear-gradient(90deg, transparent, ${
                                u.category === 'PTS' ? '#fbbf24' :
                                u.category === 'REB' ? '#fb923c' :
                                u.category === 'AST' ? '#22d3ee' :
                                u.category === 'STL' ? '#34d399' :
                                u.category === 'BLK' ? '#c084fc' :
                                u.category === '3PM' ? '#f472b6' : '#60a5fa'
                              })`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-gray-500 tabular-nums shrink-0 w-10 text-right">
                          {u.percent.toFixed(0)}%
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 우측: 최근 달성 */}
          <div className="p-3 lg:p-4">
            <div className="flex items-center gap-1.5 mb-2 lg:mb-3">
              <Sparkles size={12} className="text-amber-400" />
              <p className="text-[10px] lg:text-xs font-jersey font-bold text-amber-300 uppercase tracking-widest">최근 달성 (30일)</p>
            </div>
            {recent.length === 0 ? (
              <p className="text-xs text-gray-600 py-4 text-center">최근 달성 없음</p>
            ) : (
              <div className="space-y-1.5">
                {recent.map(r => {
                  const c = CATEGORY_COLOR[r.category]
                  return (
                    <button
                      key={`${r.player_id}-${r.category}-${r.target}-${r.achieved_at}`}
                      onClick={() => setQuickPlayer({ id: r.player_id, name: r.name })}
                      className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-amber-950/20 transition-colors cursor-pointer group"
                    >
                      <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${c.bg} ${c.text} border ${c.border} shrink-0`}>
                        {r.category}
                      </span>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm lg:text-base font-bold text-white group-hover:text-amber-200 transition-colors truncate">
                          {r.name}
                          {r.number != null && <span className="ml-1 text-[10px] lg:text-xs text-gray-500 font-mono">#{r.number}</span>}
                        </p>
                        <p className="text-[10px] lg:text-xs text-gray-500">{formatKoreanDate(r.achieved_at)} · {CATEGORY_LABEL[r.category]}</p>
                      </div>
                      <span className="text-base lg:text-lg font-black text-amber-300 tabular-nums shrink-0">
                        {r.target}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
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
