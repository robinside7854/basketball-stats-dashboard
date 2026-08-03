// 리그 편집 권한 게이트 (2026-08-04)
//   정책: 로그인 회원 중 role='admin' 인 계정 = 기존 편집 PIN 과 동일한 편집 권한.
//
//   전환기 동안 PIN(X-League-Pin)도 계속 통과시킨다 (OR 게이트).
//   어드민 지정·실사용 검증이 끝나면 canEditLeague 에서 PIN 분기만 걷어내면 된다.
//
//   ⚠ role 을 세션 토큰(mm_auth)에서 읽지 않고 매 요청 DB 를 재조회한다.
//      쿠키가 30일 만료라 토큰에 실으면 권한 회수가 최대 30일 지연되기 때문.
//      guard.ts 의 getApprovedSession 이 status 를 재확인하는 것과 같은 방식이다.
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/admin'
import { AUTH_COOKIE, verifySession, type SessionPayload } from './session'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

// 이 리그의 어드민 회원 세션. 미로그인 · 타 리그 세션 · 미승인 · 일반회원이면 null.
export async function getLeagueAdminSession(leagueId: string): Promise<SessionPayload | null> {
  const jar = await cookies()
  const session = verifySession(jar.get(AUTH_COOKIE)?.value)
  // 세션은 리그 스코프 — 다른 리그에서 받은 쿠키로는 통과 불가
  if (!session || session.lid !== leagueId) return null

  // 마이그레이션 072 실행 전이면 role 컬럼이 없어 이 쿼리가 실패한다 → acc=null →
  // 어드민 불가로 "닫히고" canEditLeague 는 PIN 폴백으로 넘어간다 (fail-closed, 안전).
  const sb = createClient()
  const { data: acc } = await sb
    .from('league_user_accounts')
    .select('id, status, role')
    .eq('id', session.uid)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!acc || acc.status !== 'approved' || acc.role !== 'admin') return null
  return session
}

export async function isLeagueAdmin(leagueId: string): Promise<boolean> {
  return (await getLeagueAdminSession(leagueId)) !== null
}

// mutation API 라우트용 편집 권한 가드 — 어드민 회원 세션 또는 (전환기) 리그 편집 PIN.
// verifyLeaguePin 과 시그니처가 같아 기존 호출부를 그대로 치환할 수 있다.
export async function canEditLeague(req: Request, leagueId: string): Promise<boolean> {
  if (await isLeagueAdmin(leagueId)) return true
  return verifyLeaguePin(req, leagueId)
}
