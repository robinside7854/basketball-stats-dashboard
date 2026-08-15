// 리그 편집 PIN 검증 (X-League-Pin 헤더 · /api/auth/league-pin)
//
// 2026-08-15 보안 수정 — 감사 02 항목:
//   1) 시도 제한. (리그, IP) 조합으로 실패를 세고 임계값을 넘으면 잠근다.
//      전용 엔드포인트뿐 아니라 **이 함수를 타는 모든 경로**(canEditLeague → 약 30개 mutation
//      라우트)에 붙어야 한다. 한쪽만 막으면 헤더로 대입하는 경로가 그대로 열려 있다.
//   2) 타이밍 안전 비교. 기존에는 `.eq('edit_pin', pin)` 으로 DB 가 비교해 조기 종료 타이밍이
//      샜다. 이제 저장된 PIN 을 읽어 와 secretsMatch 로 비교한다.
//      (leagues.edit_pin 은 마이그레이션 089 로 anon SELECT 가 회수돼 있고, 여기는
//       service_role 클라이언트라 그대로 읽힌다.)
import { createClient } from '@/lib/supabase/admin'
import {
  checkAttemptLock,
  clearFailedAttempts,
  clientIp,
  recordFailedAttempt,
} from '@/lib/auth/attemptThrottle'
import { secretsMatch } from '@/lib/auth/constantTime'

export type PinVerifyResult =
  | { status: 'ok' }
  | { status: 'invalid' }
  | { status: 'locked'; retryAfterSec: number }

/**
 * 리그 편집 PIN 검증 (값 기준).
 *
 * 잠금 중이면 **정답이라도 통과시키지 않는다.** 여기서 정답만 통과시키면 응답이 갈려
 * "이 PIN 은 맞는데 지금 잠겨 있다"는 사실이 새고, 잠금이 대입을 못 막는다.
 */
export async function verifyLeaguePinValue(
  leagueId: string,
  pin: string,
  ip: string
): Promise<PinVerifyResult> {
  if (!leagueId || !pin) return { status: 'invalid' }

  const lock = await checkAttemptLock('league_pin', leagueId, ip)
  if (lock.locked) return { status: 'locked', retryAfterSec: lock.retryAfterSec }

  // 조회 실패(네트워크·권한)는 거부 방향으로 떨어뜨린다 — fail-closed.
  const { data, error } = await createClient()
    .from('leagues')
    .select('edit_pin')
    .eq('id', leagueId)
    .maybeSingle()

  if (error || !data || !secretsMatch(pin, data.edit_pin as string | null)) {
    await recordFailedAttempt('league_pin', leagueId, ip)
    return { status: 'invalid' }
  }

  // 지울 게 있을 때만 지운다 — 헤더 경로는 요청마다 여기를 타므로 빈 DELETE 왕복을 아낀다.
  if (lock.failures > 0) await clearFailedAttempts('league_pin', leagueId, ip)
  return { status: 'ok' }
}

/**
 * 기존 호출부용 래퍼 — 시그니처를 그대로 유지한다(canEditLeague 등 약 30개 경로).
 *
 * 잠금(429)과 오답(401)을 불리언 하나로 합쳐 false 로 내려보낸다. 이 자리에서 상태 코드를
 * 갈라 보내려면 호출부 30곳을 전부 고쳐야 하는데, 잠금의 목적(대입 차단)은 false 만으로
 * 이미 달성된다. 사용자에게 남은 시간을 알려주는 건 PIN 을 실제로 입력받는 화면이 부르는
 * /api/auth/league-pin 이 담당한다.
 */
export async function verifyLeaguePin(req: Request, leagueId: string): Promise<boolean> {
  const pin = req.headers.get('X-League-Pin')
  // PIN 헤더가 없으면 애초에 이 경로로 인증을 시도한 게 아니다 — 카운터를 건드리지 않는다.
  // (canEditLeague 는 세션 경로가 실패하면 항상 여기까지 내려온다. 여기서 세면 로그인만 한
  //  일반 회원의 정상 요청이 리그를 잠가버린다.)
  if (!pin) return false
  const result = await verifyLeaguePinValue(leagueId, pin, clientIp(req.headers))
  return result.status === 'ok'
}
