'use client'
// 리그 섹션에서 선택된 분기를 페이지 간에 공유하는 컨텍스트
//
// 배경:
//   stats · teams · schedule · awards 등에서 각자 분기 state 관리 → 페이지 이동 시 리셋
//   → 사용자 요청: '3분기 stats 봤으면 3분기 teams 로 이동' 자연스러워야 함
//
// 저장 전략:
//   - React state (in-memory) + localStorage 백업 (같은 리그로 재방문 시 복원)
//   - URL 은 각 페이지가 개별 관리 (파라미터 공유 X · 컨텍스트로만 sync)
//
// 사용:
//   const { selectedQuarterId, setSelectedQuarterId } = useLeagueQuarter()

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

interface LeagueQuarterContextValue {
  /** 'all' 또는 특정 분기 id · 기본 'all' */
  selectedQuarterId: string
  setSelectedQuarterId: (v: string) => void
}

const Ctx = createContext<LeagueQuarterContextValue | null>(null)

export function LeagueQuarterProvider({ leagueId, children }: { leagueId: string; children: React.ReactNode }) {
  const storageKey = `league:${leagueId}:selectedQuarterId`

  // 초기 로드 시 localStorage 에서 복원 (SSR-safe)
  const [selectedQuarterId, setSelectedQuarterIdInner] = useState<string>('all')

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) setSelectedQuarterIdInner(saved)
    } catch { /* SSR / private mode 등 무시 */ }
  }, [storageKey])

  const setSelectedQuarterId = useCallback((v: string) => {
    setSelectedQuarterIdInner(v)
    try { localStorage.setItem(storageKey, v) } catch { /* ignore */ }
  }, [storageKey])

  return (
    <Ctx.Provider value={{ selectedQuarterId, setSelectedQuarterId }}>
      {children}
    </Ctx.Provider>
  )
}

/**
 * @returns 컨텍스트가 없으면 { selectedQuarterId: 'all', setSelectedQuarterId: noop } 반환.
 *          Provider 없는 곳에서 optional 하게 사용 가능.
 */
export function useLeagueQuarter(): LeagueQuarterContextValue {
  const v = useContext(Ctx)
  if (!v) {
    return {
      selectedQuarterId: 'all',
      setSelectedQuarterId: () => {},
    }
  }
  return v
}
