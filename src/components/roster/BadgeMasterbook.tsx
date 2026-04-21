'use client'
import { X } from 'lucide-react'
import { BADGE_DEFINITIONS, CATEGORY_LABELS } from '@/lib/stats/badges'
import type { BadgeCategory, EvaluatedBadge, BadgeTier } from '@/lib/stats/badges'
import BadgeIcon, { TIER_STYLES } from '@/components/badges/BadgeIcon'

interface Props {
  evaluatedBadges?: EvaluatedBadge[]
  onClose: () => void
}

const CATEGORIES: BadgeCategory[] = ['attack', 'shooting', 'defense', 'playmaking']

const CAT_COLORS: Record<BadgeCategory, { header: string }> = {
  attack:     { header: 'text-orange-400' },
  shooting:   { header: 'text-blue-400'   },
  defense:    { header: 'text-green-400'  },
  playmaking: { header: 'text-purple-400' },
}

const TIER_LABELS: Record<NonNullable<BadgeTier>, string> = { gold: '골드', silver: '실버', bronze: '브론즈' }

export default function BadgeMasterbook({ evaluatedBadges, onClose }: Props) {
  const evalMap = new Map(evaluatedBadges?.map(b => [b.code, b]))

  const goldCount   = evaluatedBadges?.filter(b => b.tier === 'gold').length ?? 0
  const silverCount = evaluatedBadges?.filter(b => b.tier === 'silver').length ?? 0
  const bronzeCount = evaluatedBadges?.filter(b => b.tier === 'bronze').length ?? 0
  const totalEarned = goldCount + silverCount + bronzeCount

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[88vh] bg-gray-950 border-0 sm:border border-gray-800 rounded-none sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">뱃지 도감</h2>
            <p className="text-xs md:text-sm text-gray-500 mt-0.5">총 {BADGE_DEFINITIONS.length}종 · 4카테고리 · 3티어</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* 티어 요약 */}
        {evaluatedBadges && (
          <div className="px-5 py-3.5 border-b border-gray-800 shrink-0">
            <div className="flex items-center gap-4 mb-2.5">
              {(['gold', 'silver', 'bronze'] as NonNullable<BadgeTier>[]).map(tier => {
                const count = tier === 'gold' ? goldCount : tier === 'silver' ? silverCount : bronzeCount
                return (
                  <div key={tier} className="flex items-center gap-1.5">
                    <BadgeIcon code="SCORING_MACHINE" tier={tier} size="sm" />
                    <span className={`text-sm font-black ${TIER_STYLES[tier].labelColor}`}>{count}</span>
                    <span className="text-xs text-gray-600">{TIER_LABELS[tier]}</span>
                  </div>
                )
              })}
              <span className="ml-auto text-xs text-gray-600">{totalEarned}/{BADGE_DEFINITIONS.length} 획득</span>
            </div>
            {/* 전체 진행 바 */}
            <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-800 gap-px">
              {goldCount   > 0 && <div className="bg-gradient-to-r from-amber-400 to-yellow-600 transition-all" style={{ width: `${goldCount/BADGE_DEFINITIONS.length*100}%` }} />}
              {silverCount > 0 && <div className="bg-gradient-to-r from-slate-300 to-slate-500 transition-all"  style={{ width: `${silverCount/BADGE_DEFINITIONS.length*100}%` }} />}
              {bronzeCount > 0 && <div className="bg-gradient-to-r from-orange-500 to-orange-700 transition-all" style={{ width: `${bronzeCount/BADGE_DEFINITIONS.length*100}%` }} />}
            </div>
          </div>
        )}

        {/* 뱃지 목록 */}
        <div className="overflow-y-auto flex-1">
          {CATEGORIES.map(cat => {
            const badges = BADGE_DEFINITIONS.filter(b => b.category === cat)
            const colors = CAT_COLORS[cat]
            const catGold   = badges.filter(b => evalMap.get(b.code)?.tier === 'gold').length
            const catSilver = badges.filter(b => evalMap.get(b.code)?.tier === 'silver').length
            const catBronze = badges.filter(b => evalMap.get(b.code)?.tier === 'bronze').length
            return (
              <div key={cat} className="border-b border-gray-800/60 last:border-0">
                {/* 카테고리 헤더 */}
                <div className="px-5 py-3 bg-gray-900/50 flex items-center gap-2">
                  <span className={`text-xs md:text-sm font-bold uppercase tracking-wider ${colors.header}`}>
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <span className="text-xs md:text-sm text-gray-600">{badges.length}종</span>
                  {evaluatedBadges && (
                    <div className="ml-auto flex items-center gap-2 text-[11px]">
                      {catGold   > 0 && <span className="text-amber-400 font-bold">🥇{catGold}</span>}
                      {catSilver > 0 && <span className="text-slate-400 font-bold">🥈{catSilver}</span>}
                      {catBronze > 0 && <span className="text-orange-400 font-bold">🥉{catBronze}</span>}
                    </div>
                  )}
                </div>

                {/* 뱃지 카드 그리드 */}
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {badges.map(badge => {
                    const ev = evalMap.get(badge.code)
                    const tier = ev?.tier ?? null
                    const earned = tier !== null
                    const ts = tier ? TIER_STYLES[tier] : null

                    return (
                      <div
                        key={badge.code}
                        className={`rounded-xl border p-3.5 transition-all ${
                          tier === 'gold'   ? `bg-amber-950/50 border-amber-600/50 ${TIER_STYLES.gold.glow}` :
                          tier === 'silver' ? `bg-slate-800/50 border-slate-500/50 ${TIER_STYLES.silver.glow}` :
                          tier === 'bronze' ? `bg-orange-950/50 border-orange-700/50 ${TIER_STYLES.bronze.glow}` :
                          'bg-gray-900/60 border-gray-700/60'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <BadgeIcon code={badge.code} tier={tier} size="md" showLabel={earned} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <p className={`text-sm md:text-base font-bold ${earned ? 'text-white' : 'text-gray-400'}`}>{badge.name}</p>
                              {tier && ts && (
                                <span className={`text-[10px] md:text-xs font-bold tracking-widest ${ts.labelColor} shrink-0`}>{ts.label}</span>
                              )}
                            </div>
                            <p className={`text-xs md:text-sm leading-relaxed ${earned ? 'text-gray-400' : 'text-gray-500'}`}>{badge.description}</p>
                          </div>
                        </div>

                        {/* 티어별 달성 기준 */}
                        <div className="mt-2.5 space-y-1">
                          {(['bronze', 'silver', 'gold'] as NonNullable<BadgeTier>[]).map(t => {
                            const isCurrent = tier === t
                            const tierIdx = { bronze: 0, silver: 1, gold: 2 }
                            const isSurpassed = tier !== null && tierIdx[tier] > tierIdx[t]
                            return (
                              <div key={t} className={`flex items-center gap-2 text-xs md:text-sm rounded-lg px-2 py-1 transition-colors ${
                                isCurrent
                                  ? t === 'gold'   ? 'bg-amber-950/70 text-amber-200'
                                  : t === 'silver' ? 'bg-slate-800/70 text-slate-200'
                                  :                  'bg-orange-950/70 text-orange-200'
                                : isSurpassed
                                  ? 'text-gray-500'
                                : t === 'gold'   ? 'text-amber-600/80'
                                : t === 'silver' ? 'text-slate-400/80'
                                :                  'text-orange-500/70'
                              }`}>
                                <span className="shrink-0 text-sm">{t === 'gold' ? '🥇' : t === 'silver' ? '🥈' : '🥉'}</span>
                                <span className={isCurrent ? 'font-semibold' : ''}>{badge.tierCriteria[t]}</span>
                                {isCurrent && <span className="ml-auto shrink-0 text-[10px] md:text-xs opacity-70 font-bold">← 달성</span>}
                                {isSurpassed && <span className="ml-auto shrink-0 text-[10px] opacity-50">✓</span>}
                              </div>
                            )
                          })}
                        </div>

                        {/* 선수 달성 수치 */}
                        {ev && (
                          <div className={`text-xs md:text-sm px-2 py-1 rounded-md mt-1.5 ${
                            earned ? 'bg-black/30 text-gray-300' : 'bg-gray-800/60 text-gray-400'
                          }`}>
                            {ev.achievedLabel}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

