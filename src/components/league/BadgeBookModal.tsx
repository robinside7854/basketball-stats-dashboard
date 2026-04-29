'use client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2, X } from 'lucide-react'
import { ALL_BADGE_DEFS, type BadgeResult } from '@/lib/league/badges'

interface Props {
  playerId: string
  playerName: string
  leagueId: string
  onClose: () => void
}

const CATEGORIES = [
  { key: 'offensive'   as const, label: '오펜시브',     color: 'text-orange-400',  bg: 'bg-orange-400/10 border-orange-400/30' },
  { key: 'defensive'   as const, label: '디펜시브',     color: 'text-blue-400',    bg: 'bg-blue-400/10 border-blue-400/30'   },
  { key: 'playmaking'  as const, label: '플레이메이킹', color: 'text-purple-400',  bg: 'bg-purple-400/10 border-purple-400/30' },
]

const TIER_STYLE = {
  gold:   { ring: 'border-yellow-400/70 shadow-[0_0_12px_rgba(250,204,21,0.25)]', icon: 'bg-yellow-400/15', text: 'text-yellow-300', label: '🥇 GOLD' },
  silver: { ring: 'border-gray-300/60',  icon: 'bg-gray-300/15',  text: 'text-gray-300',   label: '🥈 SILVER' },
  bronze: { ring: 'border-orange-500/60', icon: 'bg-orange-500/15', text: 'text-orange-400', label: '🥉 BRONZE' },
}

export default function BadgeBookModal({ playerId, playerName, leagueId, onClose }: Props) {
  const [badges, setBadges] = useState<BadgeResult[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'offensive' | 'defensive' | 'playmaking'>('offensive')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/players/${playerId}/detail`)
      if (r.ok) {
        const d = await r.json()
        setBadges(d.badges ?? [])
      }
    } finally { setLoading(false) }
  }, [leagueId, playerId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const earnedMap = Object.fromEntries(badges.map(b => [b.id, b.tier])) as Record<string, BadgeResult['tier']>
  const goldCount   = badges.filter(b => b.tier === 'gold').length
  const silverCount = badges.filter(b => b.tier === 'silver').length
  const bronzeCount = badges.filter(b => b.tier === 'bronze').length

  const activeDefs = ALL_BADGE_DEFS.filter(b => b.category === activeTab)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border-0 sm:border border-gray-700 rounded-none sm:rounded-2xl w-full max-w-lg h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col z-10 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-safe-or-4 pb-4 border-b border-gray-800 shrink-0">
          <div>
            <h2 className="text-white font-black text-base">배지 도감</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">{playerName}</p>
          </div>
          <div className="flex items-center gap-3">
            {!loading && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-600">{badges.length}개 보유</span>
                {goldCount   > 0 && <span className="font-bold text-yellow-300">🥇{goldCount}</span>}
                {silverCount > 0 && <span className="font-bold text-gray-300">🥈{silverCount}</span>}
                {bronzeCount > 0 && <span className="font-bold text-orange-400">🥉{bronzeCount}</span>}
              </div>
            )}
            <button onClick={onClose} className="rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white cursor-pointer transition-colors inline-flex items-center justify-center min-h-11 min-w-11">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex border-b border-gray-800 shrink-0">
          {CATEGORIES.map(cat => {
            const catEarned = badges.filter(b => b.category === cat.key).length
            const catTotal  = ALL_BADGE_DEFS.filter(b => b.category === cat.key).length
            return (
              <button key={cat.key} onClick={() => setActiveTab(cat.key)}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors cursor-pointer border-b-2 ${
                  activeTab === cat.key
                    ? `${cat.color} border-current`
                    : 'text-gray-600 border-transparent hover:text-gray-400'
                }`}>
                {cat.label}
                <span className="ml-1.5 text-[10px] opacity-70">({catEarned}/{catTotal})</span>
              </button>
            )
          })}
        </div>

        {/* Badge list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={22} className="animate-spin text-gray-600" />
            </div>
          ) : activeDefs.map(b => {
            const earnedTier = earnedMap[b.id]
            const ts = earnedTier ? TIER_STYLE[earnedTier] : null
            return (
              <div key={b.id}
                className={`flex items-start gap-3.5 p-3.5 rounded-xl border-2 transition-all ${
                  ts ? `${ts.ring} bg-gray-900/60` : 'border-gray-800/50 bg-gray-900/30 opacity-50'
                }`}>
                {/* Icon */}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${ts ? ts.icon : 'bg-gray-800/40'}`}>
                  {b.icon}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-black ${ts ? ts.text : 'text-gray-700'}`}>{b.name}</span>
                    <span className="text-[10px] text-gray-600">{b.nameEn}</span>
                    {ts && (
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${ts.icon} ${ts.text}`}>
                        {ts.label}
                      </span>
                    )}
                  </div>
                  <p className={`text-[11px] ${ts ? 'text-gray-400' : 'text-gray-700'}`}>{b.description}</p>
                  {/* Tier conditions */}
                  <div className="space-y-0.5 pt-0.5">
                    {([
                      { tier: 'gold'   as const, label: '🥇', style: 'text-yellow-400' },
                      { tier: 'silver' as const, label: '🥈', style: 'text-gray-400'   },
                      { tier: 'bronze' as const, label: '🥉', style: 'text-orange-500' },
                    ]).map(({ tier: t, label, style }) => (
                      <p key={t} className={`text-[10px] flex items-start gap-1 ${
                        earnedTier === t ? style + ' font-bold' : 'text-gray-700'
                      }`}>
                        <span className="shrink-0">{label}</span>
                        <span>{b.tierDesc[t]}</span>
                        {earnedTier === t && <span className="ml-1 text-[9px] opacity-70">← 보유</span>}
                      </p>
                    ))}
                    <p className="text-[9px] text-gray-700 mt-0.5">최소 {b.minGP}경기 출전 + 기록 시작 필요</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
