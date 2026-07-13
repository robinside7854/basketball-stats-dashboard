'use client'
import { useEffect, useMemo } from 'react'
import { X, Crown, ChevronRight } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useState } from 'react'

// 후보 클릭 시에만 열리는 모달 — 초기 번들에서 분리
const PlayerQuickViewModal = dynamic(() => import('./PlayerQuickViewModal'), { ssr: false })
import { useFocusTrap } from '@/hooks/useFocusTrap'

export interface AwardCandidate {
  player_id: string
  name: string
  number: number | null
  position: string | null
  value: number
  displayValue: string
  gp: number
  supportingStats?: Record<string, string>
}

export interface AwardDetail {
  category: string
  label: string
  description: string
  metric: string
  minRequirement?: string
  allCandidates: AwardCandidate[]
}

interface Style {
  bg: string
  border: string
  text: string
  chipBg: string
  ribbon: string
  Icon: React.ComponentType<{ size?: number; className?: string }>
}

interface Props {
  leagueId: string
  award: AwardDetail
  style: Style
  onClose: () => void
}

export default function AwardDetailModal({ leagueId, award, style, onClose }: Props) {
  const [quickPlayer, setQuickPlayer] = useState<{ id: string; name: string } | null>(null)
  // Focus trap — quickPlayer 열리면 그쪽으로 focus 위임, 그 외에는 이 모달 내부 순환
  const trapRef = useFocusTrap(!quickPlayer)

  // supportingStats 의 모든 고유 키 (표시 순서: 첫 후보 기준)
  const columns = useMemo(() => {
    const seen = new Set<string>()
    const cols: string[] = []
    for (const c of award.allCandidates) {
      if (!c.supportingStats) continue
      for (const k of Object.keys(c.supportingStats)) {
        if (!seen.has(k)) { seen.add(k); cols.push(k) }
      }
    }
    return cols
  }, [award.allCandidates])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center sm:p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

        <div
          ref={trapRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="award-detail-title"
          className="relative bg-gray-900 border-0 sm:border border-gray-700 rounded-none sm:rounded-2xl w-full max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col z-10 shadow-2xl"
        >
          {/* 상단 리본 */}
          <div aria-hidden="true" className={`h-1 bg-gradient-to-r ${style.ribbon}`} />

          {/* 헤더 */}
          <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700 px-5 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div aria-hidden="true" className={`w-11 h-11 rounded-full ${style.chipBg} border ${style.border} flex items-center justify-center shrink-0`}>
                <style.Icon size={20} className={style.text} />
              </div>
              <div className="min-w-0">
                <h2 id="award-detail-title" className={`font-jersey text-xl lg:text-2xl font-black uppercase tracking-widest ${style.text}`}>{award.label}</h2>
                <p className="text-xs text-gray-500 truncate">{award.description}</p>
              </div>
            </div>
            <button onClick={onClose}
              aria-label="닫기"
              className="rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white cursor-pointer transition-colors duration-200 inline-flex items-center justify-center w-11 h-11 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1">
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {/* 메타 정보 */}
          <div className="px-5 py-3 border-b border-gray-800/60 bg-gray-900/70 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-gray-500">순위 지표:</span>
              <span className={`font-bold ${style.text}`}>{award.metric}</span>
            </div>
            <span className="text-xs text-gray-500 tabular-nums">
              총 {award.allCandidates.length}명 후보
            </span>
          </div>

          {/* 스크롤 가능한 랭킹 리스트 */}
          <div className="flex-1 overflow-y-auto">
            {award.allCandidates.length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-600">
                자격 요건 충족자 없음
                {award.minRequirement && <div className="text-xs text-gray-700 mt-1.5">{award.minRequirement}</div>}
              </div>
            ) : (
              <ul className="divide-y divide-gray-800/40" aria-label={`${award.label} 후보 랭킹`}>
                {award.allCandidates.map((c, idx) => {
                  const rank = idx + 1
                  const isWinner = rank === 1
                  const rankColor = rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-gray-400' : rank === 3 ? 'text-orange-500' : 'text-gray-600'
                  return (
                    <li key={c.player_id}>
                    <button
                      onClick={() => setQuickPlayer({ id: c.player_id, name: c.name })}
                      className={`w-full text-left px-4 lg:px-5 py-3 lg:py-3.5 hover:bg-gray-800/40 transition-colors duration-200 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-inset ${isWinner ? 'bg-gray-900/60' : ''}`}
                    >
                      <div className="flex items-center gap-3 lg:gap-4">
                        {/* Rank */}
                        <div className="flex items-center gap-1 w-9 shrink-0">
                          {isWinner && <Crown size={14} className="text-yellow-400" aria-hidden="true" />}
                          <span className={`text-base lg:text-lg font-black font-mono tabular-nums ${rankColor}`}>{rank}</span>
                        </div>

                        {/* Player */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm lg:text-base font-bold text-white group-hover:underline underline-offset-2 truncate">
                            {c.name}
                            {c.number != null && <span className="ml-1.5 text-xs text-gray-500 font-mono">#{c.number}</span>}
                            {c.position && <span className="ml-1.5 text-xs text-gray-600">{c.position}</span>}
                          </p>
                          <p className="text-xs text-gray-500">{c.gp}R 참여</p>
                        </div>

                        {/* Value */}
                        <div className="text-right shrink-0">
                          <p className={`text-base lg:text-lg font-black tabular-nums ${style.text} leading-none`}>{c.displayValue}</p>
                        </div>

                        <ChevronRight size={14} className="text-gray-600 group-hover:text-gray-400 shrink-0" aria-hidden="true" />
                      </div>

                      {/* Supporting stats — 컬럼별 일관 표시 */}
                      {columns.length > 0 && c.supportingStats && (
                        <div className="mt-2 pl-12 lg:pl-13 flex flex-wrap gap-x-3 gap-y-1">
                          {columns.map(col => {
                            const v = c.supportingStats![col]
                            if (v === undefined) return null
                            return (
                              <div key={col} className="text-xs">
                                <span className="text-gray-500">{col}: </span>
                                <span className="font-bold text-gray-300 tabular-nums">{v}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* 하단 요건 표시 */}
          {award.minRequirement && (
            <div className="px-5 py-2.5 bg-gray-900/60 border-t border-gray-800/60">
              <p className="text-xs text-gray-500">📋 {award.minRequirement}</p>
            </div>
          )}
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
