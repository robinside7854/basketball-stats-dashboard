'use server'
import { headers } from 'next/headers'
import { signIn } from '@/lib/auth'
import { AuthError } from 'next-auth'
import { normalizeEmail } from '@/lib/auth/platformAdmin'
import { checkAttemptLock, clientIp, lockMessage } from '@/lib/auth/attemptThrottle'

// '로그인 유지' 는 자격증명의 하나로 authorize() 까지 전달된다 (src/lib/auth.ts).
// 그 값이 JWT 의 remember 플래그가 되고, 세션 만료를 30일/12시간으로 가른다.
// 체크박스를 안 켰으면 formData 에 키 자체가 없으므로 문자열 'true' 인지로만 판정한다.
//
// 로그인 시도 제한 (2026-08-15, 감사 02 항목)
//   실제 잠금 판정과 실패 기록은 authorize() 안에 있다 — 이 화면을 우회해
//   /api/auth/callback/credentials 로 직접 POST 해도 막혀야 하기 때문이다.
//   여기서 한 번 더 보는 이유는 오직 **사용자에게 남은 시간을 알려주기 위해서**다.
//   authorize() 는 null 만 돌려줄 수 있어(자격증명 provider 의 계약) 잠금과 오답을 구분해
//   화면까지 전달할 방법이 없다.
export async function loginAction(prevState: string | undefined, formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const ip = clientIp(await headers())
  const subject = normalizeEmail(email)

  // 이미 잠겨 있으면 시도조차 하지 않는다 — 잠금 중 시도로 카운터가 더 늘어나지 않게.
  if (subject) {
    const lock = await checkAttemptLock('admin_login', subject, ip)
    if (lock.locked) return lockMessage(lock.retryAfterSec)
  }

  try {
    await signIn('credentials', {
      email,
      password,
      remember: formData.get('remember') === 'true' ? 'true' : 'false',
      redirectTo: '/admin',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      // 방금 이 실패로 임계값을 넘었을 수 있다. 그러면 "비밀번호가 틀렸다"가 아니라
      // 잠금 안내를 보여줘야 사용자가 계속 두드리지 않는다.
      if (subject) {
        const lock = await checkAttemptLock('admin_login', subject, ip)
        if (lock.locked) return lockMessage(lock.retryAfterSec)
      }
      return '이메일 또는 비밀번호가 올바르지 않습니다'
    }
    throw error // redirect는 throw로 전파
  }
}
