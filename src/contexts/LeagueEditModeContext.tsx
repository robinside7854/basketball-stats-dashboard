'use client'
// 리그 편집 모드 (2026-10-11 편집 PIN 폐지 이후)
//
//   편집 모드 = **어드민 회원 로그인** ∥ **CEO(온볼 운영자) 로그인**. 그 외 수단은 없다.
//   종전의 4자리 편집 PIN 은 단톡방을 떠도는 공유 비밀이라 누가 무엇을 바꿨는지 남지 않았고,
//   회수할 방법도 없었다. 어드민 지정은 리그 /settings 또는 CEO 콘솔 /admin 에서 한다.
//
//   isEditMode 는 UI 노출 판단일 뿐이다. 실제 인가는 서버의 canEditLeague 가 매 요청
//   DB 를 재조회해 판정한다(src/lib/auth/leagueAdmin.ts).
import { createContext, useCallback, useContext, useMemo } from 'react'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'

interface LeagueEditModeCtx {
  isEditMode: boolean
  /** 로그인 상태·CEO 확인이 모두 끝났는가. "확인 후 미인증" 판정은 반드시 이게 true 일 때만 한다. */
  isInitialized: boolean
  /** 리그 어드민 회원 세션인가 */
  isAdminSession: boolean
  /** CEO(온볼 운영자) 세션인가 */
  isCeo: boolean
  /** 쿠키 인증이라 헤더는 Content-Type 뿐이다. 소비처 시그니처 유지를 위해 남겨 둔다. */
  leagueHeaders: Record<string, string>
  /** 로그인 창 열기 — 편집이 필요한 화면의 "어드민 로그인" 버튼이 부른다 */
  openLogin: () => void
}

const HEADERS = { 'Content-Type': 'application/json' }

const LeagueEditModeContext = createContext<LeagueEditModeCtx>({
  isEditMode: false,
  isInitialized: false,
  isAdminSession: false,
  isCeo: false,
  leagueHeaders: HEADERS,
  openLogin: () => {},
})

export function useLeagueEditMode() { return useContext(LeagueEditModeContext) }

export function LeagueEditModeProvider({ children }: { children: React.ReactNode; leagueId?: string }) {
  // CEO 여부는 `/auth/me` 응답에 함께 실려 온다(2026-10-12) — 종전의 `/api/auth/ceo-session` 별도 요청을 없앴다.
  //   그래서 「로그인 확인이 끝남」과 「CEO 확인이 끝남」이 같은 시점이다.
  const { user, ceo: isCeo, loading: authLoading } = useCurrentUser()
  const isAdminSession = user?.role === 'admin'

  // 레이아웃(LeagueLayoutClient)이 이 이벤트로 로그인 모달을 연다
  const openLogin = useCallback(() => { window.dispatchEvent(new Event('mm-open-login')) }, [])

  // 값 객체를 고정한다 — 레이아웃이 다시 그려질 때마다 새 객체가 나가면 이 컨텍스트를 읽는 화면 전체가 다시 그려진다.
  const value = useMemo<LeagueEditModeCtx>(() => ({
    isEditMode: isAdminSession || isCeo,
    isInitialized: !authLoading,
    isAdminSession,
    isCeo,
    leagueHeaders: HEADERS,
    openLogin,
  }), [isAdminSession, isCeo, authLoading, openLogin])

  return (
    <LeagueEditModeContext.Provider value={value}>
      {children}
    </LeagueEditModeContext.Provider>
  )
}
