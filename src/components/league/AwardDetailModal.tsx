'use client'
import { useEffect, useMemo } from 'react'
import { X, Crown, ChevronRight } from 'lucide-react'
import { useOpenPlayerCard, usePlayerCardOpen } from '@/contexts/PlayerCardContext'
import { useFocusTrap } from '@/hooks/useFocusTrap'
// 순위 지표(award.metric)가 용어집에 등록된 약어(예: 3P%, eFG%)면 설명 툴팁 표시.
// 매치 안 되는 한국어 설명형 metric(예: "누적 PTS")은 null 반환 → 렌더 안 됨(안전).
import StatHelpTooltip from '@/components/stats/StatHelpTooltip'

export interface AwardCandidate {
  player_id: string
  name: string
  number: number | null
  position: string | null
  value: number
  displayValue: string
  gp: number
  supportingStats?: Record<string, string>
  // BEST_DUO 전용 — 파트너 선수 (있으면 A × B 형식으로 표시)
  partner?: {
    player_id: string
    name: string
    number: number | null
  }
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

export default function AwardDetailModal({ award, style, onClose }: Props) {
  // 후보를 누르면 레이아웃의 전역 선수 카드가 이 모달 위에 뜬다(2026-10-14, contexts/PlayerCardContext)
  const openPlayerCard = useOpenPlayerCard()
  const cardOpen = usePlayerCardOpen()
  const setQuickPlayer = (p: { id: string; name: string }) => openPlayerCard?.({ playerId: p.id, playerName: p.name })
  // Focus trap — 선수 카드가 열리면 그쪽으로 focus 위임, 그 외에는 이 모달 내부 순환
  const trapRef = useFocusTrap(!cardOpen)

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
    // 선수 카드가 위에 떠 있으면 Esc 는 카드만 닫는다
    if (cardOpen) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, cardOpen])

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
          className="relative bg-[color:var(--mm-panel)] border-0 sm:border border-[color:var(--mm-rule)] rounded-none sm:rounded-2xl w-full max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col z-10 shadow-2xl mm-modal-in"
        >
          {/* 상단 리본 */}
          <div aria-hidden="true" className={`h-1 bg-gradient-to-r ${style.ribbon}`} />

          {/* 헤더 */}
          <div className="sticky top-0 z-10 bg-[color:var(--mm-panel)] backdrop-blur-sm border-b border-[color:var(--mm-rule)] px-5 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div aria-hidden="true" className={`w-11 h-11 rounded-full ${style.chipBg} border ${style.border} flex items-center justify-center shrink-0`}>
                <style.Icon size={20} className={style.text} />
              </div>
              <div className="min-w-0">
                <h2 id="award-detail-title" className={`font-jersey text-xl lg:text-2xl font-black ${style.text}`}>{award.label}</h2>
                <p className="text-xs text-[color:var(--mm-muted)] truncate">{award.description}</p>
              </div>
            </div>
            <button onClick={onClose}
              aria-label="닫기"
              className="rounded-lg hover:bg-[color:var(--mm-panel-alt)] text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)] cursor-pointer transition-colors duration-200 inline-flex items-center justify-center w-11 h-11 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1">
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          {/* 메타 정보 */}
          <div className="px-5 py-3 border-b border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)] flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-[color:var(--mm-muted)]">순위 지표:</span>
              <span className={`font-bold inline-flex items-center ${style.text}`}>
                {award.metric}
                <StatHelpTooltip statKey={award.metric} />
              </span>
            </div>
            <span className="text-xs text-[color:var(--mm-muted)] tabular-nums">
              총 {award.allCandidates.length}명 후보
            </span>
          </div>

          {/* 스크롤 가능한 랭킹 리스트 */}
          <div className="flex-1 overflow-y-auto">
            {award.allCandidates.length === 0 ? (
              <div className="py-16 text-center text-sm text-[color:var(--mm-muted)]">
                자격 요건 충족자 없음
                {award.minRequirement && <div className="text-xs text-[color:var(--mm-muted)] mt-1.5">{award.minRequirement}</div>}
              </div>
            ) : (
              <ul className="divide-y divide-[color:var(--mm-rule)]" aria-label={`${award.label} 후보 랭킹`}>
                {award.allCandidates.map((c, idx) => {
                  const rank = idx + 1
                  const isWinner = rank === 1
                  const rankColor = rank === 1 ? 'text-[color:var(--mm-yellow-strong)]' : rank === 2 ? 'text-[color:var(--mm-muted)]' : rank === 3 ? 'text-[color:var(--rank-3-fg)]' : 'text-[color:var(--mm-muted)]'
                  return (
                    <li key={`${c.player_id}-${c.partner?.player_id ?? ''}-${idx}`}>
                    <button
                      onClick={() => setQuickPlayer({ id: c.player_id, name: c.name })}
                      className={`w-full text-left px-4 lg:px-5 py-3 lg:py-3.5 hover:bg-[color:var(--mm-panel-alt)] transition-colors duration-200 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-inset ${isWinner ? 'bg-[color:var(--mm-panel)]' : ''}`}
                    >
                      <div className="flex items-center gap-3 lg:gap-4">
                        {/* Rank */}
                        <div className="flex items-center gap-1 w-9 shrink-0">
                          {isWinner && <Crown size={14} className="text-[color:var(--mm-yellow-strong)]" aria-hidden="true" />}
                          <span className={`text-base lg:text-lg font-black font-mono tabular-nums ${rankColor}`}>{rank}</span>
                        </div>

                        {/* Player (또는 듀오) */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm lg:text-base font-bold text-[color:var(--mm-ink)] group-hover:underline underline-offset-2 truncate">
                            {c.partner ? (
                              <>
                                {c.name}
                                <span className="mx-1.5 text-[color:var(--mm-muted)] font-normal">×</span>
                                {c.partner.name}
                              </>
                            ) : (
                              <>
                                {c.name}
                                {c.number != null && <span className="ml-1.5 text-xs text-[color:var(--mm-muted)] font-mono">#{c.number}</span>}
                                {c.position && <span className="ml-1.5 text-xs text-[color:var(--mm-muted)]">{c.position}</span>}
                              </>
                            )}
                          </p>
                          <p className="text-xs text-[color:var(--mm-muted)]">{c.partner ? '합작 듀오' : `${c.gp}R 참여`}</p>
                        </div>

                        {/* Value */}
                        <div className="text-right shrink-0">
                          <p className={`text-base lg:text-lg font-black tabular-nums ${style.text} leading-none`}>{c.displayValue}</p>
                        </div>

                        <ChevronRight size={14} className="text-[color:var(--mm-muted)] group-hover:text-[color:var(--mm-muted)] shrink-0" aria-hidden="true" />
                      </div>

                      {/* Supporting stats — 컬럼별 일관 표시 */}
                      {columns.length > 0 && c.supportingStats && (
                        <div className="mt-2 pl-12 lg:pl-13 flex flex-wrap gap-x-3 gap-y-1">
                          {columns.map(col => {
                            const v = c.supportingStats![col]
                            if (v === undefined) return null
                            return (
                              <div key={col} className="text-xs">
                                <span className="text-[color:var(--mm-muted)]">{col}: </span>
                                <span className="font-bold text-[color:var(--mm-ink-soft)] tabular-nums">{v}</span>
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
            <div className="px-5 py-2.5 bg-[color:var(--mm-panel)] border-t border-[color:var(--mm-rule)]">
              <p className="text-xs text-[color:var(--mm-muted)]">📋 {award.minRequirement}</p>
            </div>
          )}
        </div>
      </div>

    </>
  )
}
