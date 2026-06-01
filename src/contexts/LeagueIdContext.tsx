'use client'
import { createContext, useContext } from 'react'

// URL 의 [leagueId] 가 슬러그일 때, 클라이언트 페이지가 API 호출에
// 사용할 진짜 UUID 와 Link href 에 쓸 슬러그를 동시에 제공한다.
//
// 서버 레이아웃이 한 번 resolveLeague 로 UUID 와 슬러그를 모두 얻고,
// 이 컨텍스트로 자식 페이지에 내려준다.

export interface LeagueIdContextValue {
  leagueId: string      // 실제 UUID — API 호출용
  leagueSlug: string    // URL 슬러그 — Link href / 네비게이션용
  orgSlug: string
  leagueName: string
}

const LeagueIdContext = createContext<LeagueIdContextValue | null>(null)

export function LeagueIdProvider({
  value,
  children,
}: {
  value: LeagueIdContextValue
  children: React.ReactNode
}) {
  return <LeagueIdContext.Provider value={value}>{children}</LeagueIdContext.Provider>
}

export function useLeagueId(): LeagueIdContextValue {
  const ctx = useContext(LeagueIdContext)
  if (!ctx) {
    throw new Error('useLeagueId 는 <LeagueIdProvider> 안에서만 사용 가능합니다')
  }
  return ctx
}

// 옵셔널 — 컨텍스트 밖에서 호출 가능 (있으면 사용, 없으면 null)
export function useLeagueIdOptional(): LeagueIdContextValue | null {
  return useContext(LeagueIdContext)
}
