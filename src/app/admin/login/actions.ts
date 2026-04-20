'use server'
import { signIn } from '@/lib/auth'
import { AuthError } from 'next-auth'

export async function loginAction(prevState: string | undefined, formData: FormData) {
  try {
    await signIn('credentials', {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      redirectTo: '/admin',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return '이메일 또는 비밀번호가 올바르지 않습니다'
    }
    throw error // redirect는 throw로 전파
  }
}
