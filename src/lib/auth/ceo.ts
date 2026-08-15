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
import { checkSessionAdmin, isBootstrapEmail } from './platformAdmin'

function missingEnvKeys(): string[] {
  const missing: string[] = []
  if (!process.env.AUTH_SECRET && !process.env.NEXTAUTH_SECRET) missing.push('AUTH_SECRET(or NEXTAUTH_SECRET)')
  if (!process.env.ADMIN_EMAIL) missing.push('ADMIN_EMAIL')
  if (!process.env.ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD')
  return missing
}

/**
 * 세션 구조만 확인한다 (DB 조회 없음).
 *
 * ⚠ 이것만으로는 "권한이 지금도 살아있는지" 를 보증하지 못한다. 미들웨어처럼
 *   요청마다 도는 UX 계층에서 DB 왕복을 피하려는 용도로만 쓴다.
 *   실제 보안 경계는 requireCeoSession() 이다.
 */
export async function requireCeoSessionShallow(): Promise<Session | null> {
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

  // '로그인 유지' 를 안 켠 세션은 12시간으로 앞당겨진다 (src/lib/auth.ts session 콜백).
  // 쿠키 수명은 정적이라 만료 판정을 여기서 한다.
  const expires = result.expires ? new Date(result.expires).getTime() : 0
  if (!expires || expires <= Date.now()) return null

  return result
}

/**
 * CEO/공동관리자 세션을 반환한다. 아래 중 하나라도 해당하면 무조건 null (fail closed):
 *   - 필수 env 미설정
 *   - auth() 가 예외를 던짐
 *   - auth() 반환값이 세션 구조가 아님 (session.user.email 부재)
 *   - 세션 만료 시각이 지남
 *   - **그 이메일이 지금 이 순간 유효한 관리자가 아님**
 *
 * 마지막 조건이 핵심이다. JWT 는 최대 30일 살아 있으므로 세션 안의 정보만 믿으면
 * 공동관리자를 내보내도 한 달간 계속 들어온다. 그래서 매 요청 DB 로 확인한다.
 * (마이그레이션 072 가 리그 회원 role 을 쿠키에 넣지 않기로 한 것과 같은 판단)
 *
 * 부트스트랩 계정(ADMIN_EMAIL)은 DB 에 행이 없으므로 예외로 통과시킨다 —
 * 소유자가 자기 콘솔에서 잠기는 일은 없어야 한다.
 */
export async function requireCeoSession(): Promise<Session | null> {
  const session = await requireCeoSessionShallow()
  if (!session) return null

  const email = session.user?.email
  if (typeof email !== 'string' || !email) return null

  if (isBootstrapEmail(email)) return session

  try {
    // 비밀번호 재설정 이후에 발급된 세션인지도 함께 본다(마이그레이션 105). 비밀번호 분실은
    // "누가 내 계정에 들어와 있다" 와 겹칠 수 있는데, 비밀번호만 바꾸면 침입자의 JWT 는
    // 최대 30일 그대로 살아 있기 때문이다. loginAt 이 없는 옛 세션은 판정 근거가 없어 통과한다.
    const verdict = await checkSessionAdmin(email, session.loginAt ?? 0)
    if (verdict === 'ok') return session
    if (verdict === 'password_changed') {
      console.warn('[auth/ceo] 비밀번호 재설정 이전에 발급된 세션 — 거부')
    }
  } catch (e) {
    // 조회 실패를 통과로 처리하면 DB 장애가 곧 인증 우회가 된다.
    console.error('[auth/ceo] 관리자 상태 확인 실패 — fail closed', e)
    return null
  }
  return null
}
