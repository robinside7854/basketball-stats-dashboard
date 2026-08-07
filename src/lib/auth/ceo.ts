// CEO NextAuth 세션 가드 (온볼 운영 콘솔 · /admin) — fail-closed 전용.
//
// 배경(실측, 2026-08-07): next-auth v5 의 auth() 는 AUTH_SECRET 이 설정되지
// 않으면 예외를 던지지 않고 `{ message: "There was a problem with the server
// configuration..." }` 같은 **truthy 이지만 세션이 아닌 객체**를 반환한다.
// 이 저장소의 기존 가드는 전부 `if (!session)` 형태였기 때문에, env 하나가
// 비면 CEO 콘솔·어드민 API 전체가 인증 없이 열리는 fail-open 이 성립했다.
//
// 이 파일은 이 문제를 다음 두 겹으로 막는다.
//   1) 필수 env(AUTH_SECRET/NEXTAUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD) 중
//      하나라도 비어 있으면 auth() 호출 자체를 하지 않고 무조건 null.
//   2) auth() 결과의 truthy 여부가 아니라 session.user.email(실제 로그인
//      identity)이 존재하는지 **구조로** 검증한다. 예외도 잡아서 null 로 떨어뜨린다.
//
// 주의: 이 파일은 CEO(NextAuth) 인증 전용이다. 팀 회원 인증(mm_auth 쿠키,
// canEditLeague, getApprovedSession 등 `src/lib/auth/guard.ts`)은 완전히
// 별개 체계이며 이 파일과 무관하다 — 이름이 비슷한 `guard.ts` 에 합치지 않고
// 별도 파일(`ceo.ts`)로 둔 이유이기도 하다.
import { auth } from '@/lib/auth'
import type { Session } from 'next-auth'

function missingEnvKeys(): string[] {
  const missing: string[] = []
  if (!process.env.AUTH_SECRET && !process.env.NEXTAUTH_SECRET) missing.push('AUTH_SECRET(or NEXTAUTH_SECRET)')
  if (!process.env.ADMIN_EMAIL) missing.push('ADMIN_EMAIL')
  if (!process.env.ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD')
  return missing
}

/**
 * CEO 세션을 반환한다. 아래 중 하나라도 해당하면 무조건 null (fail closed):
 *   - 필수 env 미설정
 *   - auth() 가 예외를 던짐
 *   - auth() 반환값이 세션 구조가 아님 (session.user.email 부재)
 */
export async function requireCeoSession(): Promise<Session | null> {
  const missing = missingEnvKeys()
  if (missing.length > 0) {
    console.error(`[auth/ceo] CEO 인증 설정 누락(${missing.join(', ')}) — 요청을 거부합니다.`)
    return null
  }

  let result: Session | null
  try {
    result = await auth()
  } catch (e) {
    console.error('[auth/ceo] auth() 예외 발생 — fail closed', e)
    return null
  }

  const email = result?.user?.email
  if (!result || typeof email !== 'string' || !email) {
    return null
  }
  return result
}
