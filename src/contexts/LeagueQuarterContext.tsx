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
import { pickCurrentQuarter } from '@/lib/league/currentQuarter'

interface LeagueQuarterContextValue {
  /** 'all' 또는 특정 분기 id · 기본 'all' */
  selectedQuarterId: string
  setSelectedQuarterId: (v: string) => void
}

const Ctx = createContext<LeagueQuarterContextValue | null>(null)

/** localStorage 키 — 페이지가 마운트 직후(컨텍스트 복원 전) 저장값을 봐야 할 때 이걸로 읽는다 */
export const quarterStorageKey = (leagueId: string) => `league:${leagueId}:selectedQuarterId`

export function LeagueQuarterProvider({ leagueId, children }: { leagueId: string; children: React.ReactNode }) {
  const storageKey = quarterStorageKey(leagueId)

  // 초기 로드 시 localStorage 에서 복원 (SSR-safe)
  const [selectedQuarterId, setSelectedQuarterIdInner] = useState<string>('all')

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) setSelectedQuarterIdInner(saved)
    } catch { /* SSR / private mode 등 무시 */ }
  }, [storageKey])

  // 분기가 넘어가면 기억해 둔 분기를 **한 번** 새 분기로 옮긴다 (2026-10-10).
  //   기억값이 있으면 화면들이 「현재 분기」 기본값을 안 쓰므로, 3분기를 보던 기기는 4분기가 돼도
  //   계속 3분기 순위·스탯을 보여 줬다. 「지난번에 본 현재 분기」를 따로 적어 두고, 그게 바뀐 날
  //   한 번만 덮는다 — 그 뒤 사용자가 3분기를 다시 고르면 그대로 둔다. 「전체」를 고른 사람은 건드리지 않는다.
  useEffect(() => {
    let cancelled = false
    const seenKey = `league:${leagueId}:lastCurrentQuarterId`
    fetch(`/api/leagues/${leagueId}/quarters`)
      .then(r => (r.ok ? r.json() : null))
      .then((qs: Parameters<typeof pickCurrentQuarter>[0] & { id: string }[] | null) => {
        if (cancelled || !Array.isArray(qs)) return
        const cur = pickCurrentQuarter(qs as { id: string; year: number; quarter: number }[])
        if (!cur) return
        try {
          const seen = localStorage.getItem(seenKey)
          const saved = localStorage.getItem(storageKey)
          if (seen && seen !== cur.id && saved && saved !== 'all') {
            setSelectedQuarterIdInner(cur.id)
            localStorage.setItem(storageKey, cur.id)
          }
          localStorage.setItem(seenKey, cur.id)
        } catch { /* private mode */ }
      })
      .catch(() => null)
    return () => { cancelled = true }
  }, [leagueId, storageKey])

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
