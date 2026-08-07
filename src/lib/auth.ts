import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const adminEmail = process.env.ADMIN_EMAIL
        const adminPassword = process.env.ADMIN_PASSWORD
        // env 미설정 시 양쪽 다 undefined 가 되어 제출값이 비어 있어도
        // undefined === undefined 로 통과하는 로그인 우회가 성립한다 — fail closed.
        if (!adminEmail || !adminPassword) {
          console.error('[auth] ADMIN_EMAIL 또는 ADMIN_PASSWORD 가 설정되지 않았습니다 — 로그인을 거부합니다.')
          return null
        }
        const email = credentials?.email
        const password = credentials?.password
        if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
          return null
        }
        if (email === adminEmail && password === adminPassword) {
          return { id: '1', name: 'Admin', email }
        }
        return null
      },
    }),
  ],
  pages: { signIn: '/admin/login' },
  session: { strategy: 'jwt' },
})
