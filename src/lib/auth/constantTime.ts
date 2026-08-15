// 비밀값 비교 — 타이밍 누출 없이 (2026-08-15)
//
// 왜 필요한가
//   PIN 검증이 `.eq('edit_pin', pin)` 처럼 DB 쪽 `=` 로 이뤄지면 비교가 조기 종료(early exit)된다.
//   앞자리부터 맞아 들어갈수록 응답이 미세하게 느려지므로, 충분히 반복하면 "몇 자리까지 맞았나"가
//   응답 시간으로 새어나온다. 시도 제한을 붙여도 이 단서가 남으면 필요한 시도 횟수 자체가 줄어든다.
//   platform_admins 의 부트스트랩 비밀번호 비교가 이미 timingSafeEqual 로 옮겨져 있다
//   (src/lib/auth/platformAdmin.ts 의 verifyBootstrapLogin) — PIN 경로만 옛 방식으로 남아 있었다.
//
// ⚠ 길이가 다르면 즉시 false 다. timingSafeEqual 이 같은 길이를 요구하기 때문인데, 이건
//   "길이가 다르다"는 사실만 새고 내용은 새지 않는다. 편집 PIN 은 서버 검증이 4자리 고정
//   (api/leagues/[leagueId]/edit-pin PATCH) 이라 실질적으로 새는 정보가 없다.
import { timingSafeEqual } from 'node:crypto'

export function secretsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
