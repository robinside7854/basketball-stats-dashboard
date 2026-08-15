// next-auth v5 Session 타입 확장.
//
// 왜 필요한가: 비밀번호를 재설정하면 그 전에 발급된 세션은 끊겨야 한다(마이그레이션 105).
// 판정하려면 "이 세션이 언제 발급됐는지" 를 알아야 하는데, 그 값은 JWT 안(token.loginAt)에만
// 있고 기본 Session 타입에는 없다. src/lib/auth.ts 의 session 콜백이 여기 정의한 필드로
// 옮겨 담고, src/lib/auth/ceo.ts 가 그것을 읽는다.
//
// session.expires 에서 역산하는 방법도 있었지만 수명이 두 가지(12시간/30일)라 발급 시각이
// 하나로 정해지지 않는다 — 잘못 역산하면 방금 로그인한 사람을 튕기거나, 끊어야 할 세션을 살린다.
import 'next-auth'

declare module 'next-auth' {
  interface Session {
    /** 로그인 시각(ms). 옛 JWT 에는 없을 수 있어 optional 이다. */
    loginAt?: number
  }
}
