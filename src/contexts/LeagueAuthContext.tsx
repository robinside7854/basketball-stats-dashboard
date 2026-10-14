'use client'
// 리그 로그인 상태 컨텍스트 · 헤더/대시보드/설정 페이지에서 공유
//   · SWR-lite: mount 시 /me 페치 · refresh() 함수 노출 (로그인/로그아웃 후 갱신)
//   · `ceo` — 온볼 운영자(CEO) 세션 여부. 종전엔 LeagueEditModeProvider 가 `/api/auth/ceo-session` 을
//     따로 불렀다(진입마다 요청 1개 추가). 2026-10-12 부터 `/auth/me` 응답에 실려 온다 — 표시용일 뿐,
//     실제 인가는 서버(canEditLeague)가 매 요청 다시 판정한다.

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'

export interface CurrentUser {
  id: string
  login_id: string
  player_id: string
  name: string | null
  number: number | null
  position: string | null
  photo_url: string | null
  is_default_password: boolean
  // 리그 편집 권한. admin = 기존 편집 PIN 과 동일 권한.
  // 표시(UI 게이팅)용일 뿐 — 실제 인가는 서버가 매 요청 DB 에서 재확인한다.
  role: 'member' | 'admin'
}

interface AuthState {
  user: CurrentUser | null
  /** CEO(온볼 운영자) 세션인가 — 화면 표시용 */
  ceo: boolean
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function LeagueAuthProvider({ leagueId, children }: { leagueId: string; children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [ceo, setCeo] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/leagues/${leagueId}/auth/me`, { cache: 'no-store' })
      if (!r.ok) { setUser(null); setCeo(false); return }
      const d = await r.json() as { authenticated: boolean; user?: CurrentUser; ceo?: boolean }
      setUser(d.authenticated && d.user ? d.user : null)
      setCeo(!!d.ceo)
    } catch {
      setUser(null)
      setCeo(false)
    } finally {
      setLoading(false)
    }
  }, [leagueId])

  const logout = useCallback(async () => {
    await fetch(`/api/leagues/${leagueId}/auth/logout`, { method: 'POST' })
    setUser(null)
  }, [leagueId])

  useEffect(() => { refresh() }, [refresh])

  const value = useMemo<AuthState>(() => ({ user, ceo, loading, refresh, logout }), [user, ceo, loading, refresh, logout])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** 프로바이더 밖에서도 쓸 수 있는 버전 — 없으면 null.
 *  비공개 리그 게이트(PrivateLeagueGate)는 LeagueLayoutClient 바깥이라 프로바이더가 없다.
 *  LoginModal 이 useCurrentUser 를 부르면 그 화면에서 예외 → 「잠시 문제가 발생했어요」(2026-10-14 발견). */
export function useOptionalCurrentUser(): AuthState | null {
  return useContext(Ctx)
}

export function useCurrentUser(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useCurrentUser must be used within LeagueAuthProvider')
  return v
}
