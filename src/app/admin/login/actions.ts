'use server'
import { signIn } from '@/lib/auth'
import { AuthError } from 'next-auth'

// '로그인 유지' 는 자격증명의 하나로 authorize() 까지 전달된다 (src/lib/auth.ts).
// 그 값이 JWT 의 remember 플래그가 되고, 세션 만료를 30일/12시간으로 가른다.
// 체크박스를 안 켰으면 formData 에 키 자체가 없으므로 문자열 'true' 인지로만 판정한다.
export async function loginAction(prevState: string | undefined, formData: FormData) {
  try {
    await signIn('credentials', {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      remember: formData.get('remember') === 'true' ? 'true' : 'false',
      redirectTo: '/admin',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return '이메일 또는 비밀번호가 올바르지 않습니다'
    }
    throw error // redirect는 throw로 전파
  }
}
