'use client'
import { X } from 'lucide-react'
import { BADGE_DEFINITIONS, CATEGORY_LABELS, CATEGORY_COLORS } from '@/lib/stats/badges'
import type { BadgeCategory, EvaluatedBadge } from '@/lib/stats/badges'

interface Props {
  evaluatedBadges?: EvaluatedBadge[]  // 현재 선수의 평가 결과 (없으면 기준만 표시)
  onClose: () => void
}

const CATEGORIES: BadgeCategory[] = ['attack', 'shooting', 'defense', 'playmaking']

export default function BadgeMasterbook({ evaluatedBadges, onClose }: Props) {
  const evalMap = new Map(evaluatedBadges?.map(b => [b.code, b]))

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[88vh] bg-gray-950 border-0 sm:border border-gray-800 rounded-none sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">뱃지 도감</h2>
            <p className="text-xs text-gray-500 mt-0.5">총 {BADGE_DEFINITIONS.length}종 · 4카테고리</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* 획득 현황 요약 */}
        {evaluatedBadges && (
          <div className="px-5 py-3 border-b border-gray-800 shrink-0 flex items-center gap-3">
            <span className="text-xs text-gray-500">획득</span>
            <span className="text-xl font-black text-white">{evaluatedBadges.filter(b => b.earned).length}</span>
            <span className="text-xs text-gray-600">/ {BADGE_DEFINITIONS.length}</span>
            <div className="flex-1 bg-gray-800 rounded-full h-1.5 ml-2">
              <div
                className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                style={{ width: `${(evaluatedBadges.filter(b => b.earned).length / BADGE_DEFINITIONS.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* 뱃지 목록 */}
        <div className="overflow-y-auto flex-1">
          {CATEGORIES.map(cat => {
            const badges = BADGE_DEFINITIONS.filter(b => b.category === cat)
            const colors = CATEGORY_COLORS[cat]
            return (
              <div key={cat} className="border-b border-gray-800/60 last:border-0">
                {/* 카테고리 헤더 */}
                <div className="px-5 py-3 bg-gray-900/50 flex items-center gap-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${colors.header}`}>
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <span className="text-xs text-gray-600">{badges.length}종</span>
                  {evaluatedBadges && (
                    <span className="ml-auto text-xs text-gray-500">
                      {badges.filter(b => evalMap.get(b.code)?.earned).length}/{badges.length} 획득
                    </span>
                  )}
                </div>

                {/* 뱃지 카드 */}
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {badges.map(badge => {
                    const ev = evalMap.get(badge.code)
                    const earned = ev?.earned ?? false
                    return (
                      <div
                        key={badge.code}
                        className={`rounded-xl border p-3.5 transition-all ${
                          earned
                            ? `${colors.badge} border-opacity-60`
                            : 'bg-gray-900/40 border-gray-800/40 opacity-50'
                        }`}
                      >
                        {/* 뱃지 타이틀 */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{badge.icon}</span>
                            <div>
                              <p className={`text-sm font-bold ${earned ? '' : 'text-gray-400'}`}>{badge.name}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{badge.description}</p>
                            </div>
                          </div>
                          {earned
                            ? <span className="text-green-400 text-base shrink-0">✅</span>
                            : <span className="text-gray-700 text-base shrink-0">🔒</span>
                          }
                        </div>

                        {/* 달성 기준 */}
                        <p className="text-[11px] text-gray-500 leading-relaxed mb-2">{badge.criteria}</p>

                        {/* 선수 달성 수치 (evaluatedBadges 있을 때만) */}
                        {ev && (
                          <div className={`text-[11px] px-2 py-1 rounded-md ${earned ? 'bg-black/30 text-gray-300' : 'bg-gray-800/50 text-gray-500'}`}>
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
