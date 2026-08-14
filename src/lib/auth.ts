import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { touchLastLogin, verifyAdminLogin, verifyBootstrapLogin } from '@/lib/auth/platformAdmin'

// 운영 콘솔(/admin) 로그인.
//
// 계정 출처가 둘이다.
//   1) platform_admins 표 (공동관리자 · 초대로 생성 · 비밀번호는 pbkdf2 해시)
//   2) 환경변수 ADMIN_EMAIL/ADMIN_PASSWORD (부트스트랩 · 소유자 전용)
// DB 를 먼저 보고, 없으면 부트스트랩을 본다. 부트스트랩을 남겨두는 이유는 DB 가 비거나
// 조회가 실패해도 소유자는 항상 들어올 수 있어야 하기 때문 — 공동관리자 체계를 얹다가
// 스스로 잠기는 사고를 막는다.
//
// ⚠ 로그인 성공은 "이 순간 자격이 맞다" 는 뜻일 뿐이다. 권한이 살아있는지는 세션을 쓸 때마다
//   src/lib/auth/ceo.ts 가 DB 로 다시 확인한다. JWT 는 최대 30일 살아 있는데 권한 회수는
//   즉시 먹어야 하기 때문 (마이그레이션 072 가 리그 회원 role 을 쿠키에 안 넣은 것과 같은 이유).

// '로그인 유지' 를 켰을 때와 껐을 때의 세션 수명.
export const REMEMBER_MS = 30 * 24 * 3600_000 // 30일
export const SHORT_SESSION_MS = 12 * 3600_000 // 12시간

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        remember: { label: '로그인 유지', type: 'text' },
      },
      async authorize(credentials) {
        const email = credentials?.email
        const password = credentials?.password
        if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
          return null
        }

        // 1) 공동관리자 (DB). 조회가 통째로 실패해도 부트스트랩 경로는 살려둔다.
        try {
          const admin = await verifyAdminLogin(email, password)
          if (admin) {
            // 마지막 로그인 시각 갱신. 실패해도 로그인은 통과시킨다 — 표시용 값 하나 때문에
            // 로그인이 막히면 안 된다. (touchLastLogin 내부에서 오류를 삼킨다)
            await touchLastLogin(admin.id)
            return {
              id: admin.id,
              name: admin.name ?? admin.email,
              email: admin.email,
              remember: credentials?.remember === 'true',
            }
          }
        } catch (e) {
          console.error('[auth] platform_admins 조회 실패 — 부트스트랩 경로로 계속', e)
        }

        // 2) 부트스트랩 (환경변수). env 가 비면 verifyBootstrapLogin 이 null 을 준다.
        const bootstrap = verifyBootstrapLogin(email, password)
        if (bootstrap) {
          return {
            id: 'bootstrap',
            name: '소유자',
            email: bootstrap.email,
            remember: credentials?.remember === 'true',
          }
        }

        return null
      },
    }),
  ],
  pages: { signIn: '/admin/login' },
  // 쿠키 수명은 정적이라 최대치로 두고, 실제 만료는 아래 session 콜백이 계산한다.
  session: { strategy: 'jwt', maxAge: REMEMBER_MS / 1000 },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.remember = (user as { remember?: boolean }).remember === true
        token.loginAt = Date.now()
        token.adminId = user.id
      }
      return token
    },
    async session({ session, token }) {
      // '로그인 유지' 를 안 켰으면 12시간으로 앞당긴다. 쿠키 자체는 30일짜리지만
      // 이 만료 시각을 requireCeoSession() 이 검사하므로 실제 접근은 막힌다.
      const ttl = token.remember === true ? REMEMBER_MS : SHORT_SESSION_MS
      const loginAt = typeof token.loginAt === 'number' ? token.loginAt : 0
      const hardExpiry = new Date(loginAt + ttl)
      if (hardExpiry.getTime() < new Date(session.expires).getTime()) {
        session.expires = hardExpiry.toISOString() as typeof session.expires
      }
      if (typeof token.adminId === 'string' && session.user) {
        session.user.id = token.adminId
      }
      return session
    },
  },
})
