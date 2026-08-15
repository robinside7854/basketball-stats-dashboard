import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { normalizeEmail, touchLastLogin, verifyAdminLogin, verifyBootstrapLogin } from '@/lib/auth/platformAdmin'
import {
  checkAttemptLock,
  clearFailedAttempts,
  clientIp,
  recordFailedAttempt,
} from '@/lib/auth/attemptThrottle'

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
      // ⚠ 두 번째 인자 request 는 실제 수신 요청이다. 서버 액션(loginAction)으로 들어와도
      //   next-auth 가 `new Headers(await nextHeaders())` 로 원 헤더를 그대로 실어 보내므로
      //   x-forwarded-for 에 진짜 클라이언트 IP 가 들어 있다. 자격증명 필드로 IP 를 받으면
      //   /api/auth/callback/credentials 로 직접 POST 하는 쪽이 마음대로 위조할 수 있어 안 된다.
      async authorize(credentials, request) {
        const email = credentials?.email
        const password = credentials?.password
        if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
          return null
        }

        // 로그인 시도 제한 (2026-08-15). (이메일, IP) 조합으로 센다.
        //   이메일만 기준이면 공격자가 남의 계정을 잠글 수 있고(서비스 거부),
        //   IP 만 기준이면 같은 사무실의 다른 관리자가 나 때문에 잠긴다.
        // 이 검사는 서버 액션(loginAction)에도 한 번 더 있다. 여기 것은 화면을 우회해
        //   /api/auth/callback/credentials 로 직접 POST 하는 경로를 막기 위한 것이다.
        const ip = clientIp(request?.headers)
        const subject = normalizeEmail(email)
        const lock = await checkAttemptLock('admin_login', subject, ip)
        // 잠금 중엔 비밀번호가 맞아도 통과시키지 않는다 — 정답만 통과시키면 응답이 갈려
        // "이 비밀번호가 맞다"는 사실이 새고 잠금이 대입을 못 막는다.
        if (lock.locked) return null

        // 1) 공동관리자 (DB). 조회가 통째로 실패해도 부트스트랩 경로는 살려둔다.
        try {
          const admin = await verifyAdminLogin(email, password)
          if (admin) {
            // 마지막 로그인 시각 갱신. 실패해도 로그인은 통과시킨다 — 표시용 값 하나 때문에
            // 로그인이 막히면 안 된다. (touchLastLogin 내부에서 오류를 삼킨다)
            await touchLastLogin(admin.id)
            if (lock.failures > 0) await clearFailedAttempts('admin_login', subject, ip)
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
          if (lock.failures > 0) await clearFailedAttempts('admin_login', subject, ip)
          return {
            id: 'bootstrap',
            name: '소유자',
            email: bootstrap.email,
            remember: credentials?.remember === 'true',
          }
        }

        // 실패 기록. 입력한 비밀번호는 어디에도 남기지 않는다.
        await recordFailedAttempt('admin_login', subject, ip)
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
      // 발급 시각을 세션으로 옮겨 담는다 — 비밀번호 재설정 이후에 발급된 세션인지
      // requireCeoSession() 이 이 값으로 판정한다(src/types/next-auth.d.ts).
      if (loginAt) session.loginAt = loginAt
      return session
    },
  },
})
