'use client'
// 리그 운영 방식(league/tournament)을 화면 트리 하위로 내려보내는 컨텍스트
//
// 배경:
//   leagues.mode 는 layout.tsx(서버 컴포넌트)에서 한 번 조회한다. 이걸 쓰는 컴포넌트는
//   TabNav/BottomNav 등 레이아웃에서 여러 겹 아래에 있어, prop 으로 내리면 중간 컴포넌트가
//   전부 자기와 상관없는 값을 들고 다니게 되고 언젠가 한 곳을 빠뜨린다 → 컨텍스트로 공급.
//
// LeagueQuarterContext 와 달리 값이 요청 중 바뀌지 않는다(서버에서 결정돼 내려오는 값이라
// setter 도, localStorage 백업도 필요 없다) — 그래서 Provider 는 mode 하나만 받는다.
//
// 사용:
//   const mode = useLeagueMode()

import { createContext, useContext } from 'react'
import type { LeagueMode } from '@/lib/league/mode'

const Ctx = createContext<LeagueMode | null>(null)

export function LeagueModeProvider({ mode, children }: { mode: LeagueMode; children: React.ReactNode }) {
  return <Ctx.Provider value={mode}>{children}</Ctx.Provider>
}

/**
 * @returns Provider 없이 호출되면 'league' 로 떨어진다 — 기존 동작(리그형)을 그대로 유지하는
 *          안전한 기본값이다.
 */
export function useLeagueMode(): LeagueMode {
  const v = useContext(Ctx)
  return v ?? 'league'
}
