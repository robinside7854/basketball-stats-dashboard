'use client'
// 리그 로그인 상태 컨텍스트 · 헤더/대시보드/설정 페이지에서 공유
//   · SWR-lite: mount 시 /me 페치 · refresh() 함수 노출 (로그인/로그아웃 후 갱신)

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
}

interface AuthState {
  user: CurrentUser | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function LeagueAuthProvider({ leagueId, children }: { leagueId: string; children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/leagues/${leagueId}/auth/me`, { cache: 'no-store' })
      if (!r.ok) { setUser(null); return }
      const d = await r.json() as { authenticated: boolean; user?: CurrentUser }
      setUser(d.authenticated && d.user ? d.user : null)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [leagueId])

  const logout = useCallback(async () => {
    await fetch(`/api/leagues/${leagueId}/auth/logout`, { method: 'POST' })
    setUser(null)
  }, [leagueId])

  useEffect(() => { refresh() }, [refresh])

  const value = useMemo<AuthState>(() => ({ user, loading, refresh, logout }), [user, loading, refresh, logout])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCurrentUser(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useCurrentUser must be used within LeagueAuthProvider')
  return v
}
