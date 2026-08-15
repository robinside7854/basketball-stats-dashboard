// 인증 실패 시도 제한 — PIN·로그인 무차별 대입 차단 (2026-08-15, 감사 02 항목)
//
// 왜 필요한가
//   편집 PIN 은 숫자 4자리(10,000 조합)인데 시도 횟수 제한이 0 이었다. 프로덕션 실측에서
//   연속 오답 6회가 전부 401 이고 429 는 나오지 않았다 — 병렬 없이도 한 시간이면 전수 대입이
//   끝난다. 리그 ID 는 브라우저 번들의 익명 키로 누구나 얻으므로 외부인의 공격으로 성립한다.
//
// 왜 DB 인가
//   Vercel 서버리스는 인스턴스가 요청마다 갈린다. 프로세스 메모리에 센 숫자는 다음 요청이
//   다른 인스턴스로 가는 순간 사라져서 제한이 없는 것과 같다. Redis 는 이 프로젝트에 없다.
//   그래서 접근 요청(platform_access_requests)이 이미 쓰는 "DB count" 방식을 그대로 쓴다
//   (src/app/api/admin/access-requests/route.ts). 새 방식을 만들지 않는다.
//
// 왜 (대상, IP) 조합인가
//   IP 만 기준이면 같은 체육관 와이파이를 쓰는 다른 운영진이 틀린 횟수 때문에 내가 잠긴다.
//   대상만 기준이면 공격자 한 명이 그 리그 운영진 전원을 잠글 수 있다(서비스 거부).
//   둘을 곱해야 정상 사용자를 안 건드리면서 대입만 막힌다.
//
// ⚠ 실패를 기록하되 **입력된 PIN·비밀번호는 표에도 로그에도 절대 남기지 않는다.**
//   남는 것은 "어느 표면의 어느 대상에 어느 IP 가 몇 번 실패했나" 뿐이다.
//
// ⚠ fail-open on counter / fail-closed on auth
//   카운터 조회·기록이 실패하면(표 미생성 포함) 그냥 건너뛰고 기존 인증을 정상 진행한다.
//   마이그레이션 103 적용 전에도 서비스가 멈추면 안 되기 때문이다. 반대로 인증 판정 자체는
//   실패하면 무조건 거부한다(fail-closed).
import { createClient } from '@/lib/supabase/admin'
import { hashIp } from './platformAdmin'

const TABLE = 'auth_failed_attempts'

// 잠금 임계값. 사람이 PIN 을 잘못 누르는 횟수(보통 2~3회)와는 충분히 떨어져 있고,
// 10,000 조합을 이 속도로 훑으려면 15분 × 1,000회 = 250시간이 걸린다.
// 나중에 조정할 때 여기 두 줄만 바꾸면 모든 인증 표면에 함께 반영된다.
export const ATTEMPT_MAX = 10
export const ATTEMPT_WINDOW_MS = 15 * 60_000 // 15분

/** 인증 표면. 표면마다 카운터가 따로 돈다 — 한쪽이 잠겨도 다른 쪽은 자기 예산을 쓴다. */
export type AttemptScope = 'league_pin' | 'team_pin' | 'admin_login'

export type ThrottleState = {
  locked: boolean
  /** 잠금이 풀릴 때까지 남은 초. locked 가 false 면 0. */
  retryAfterSec: number
  /**
   * 창 안에 남아 있는 실패 건수.
   * 성공했을 때 이 값이 0 이면 지울 게 없으므로 clearFailedAttempts 를 건너뛴다 —
   * PIN 헤더로 인증하는 mutation 라우트는 요청마다 이 경로를 타므로, 빈 DELETE 왕복을
   * 매번 보내면 정상 사용자의 모든 저장 요청이 그만큼 느려진다.
   */
  failures: number
}

const OPEN: ThrottleState = { locked: false, retryAfterSec: 0, failures: 0 }

// 표가 아직 없을 때(마이그레이션 103 미적용) 매 요청마다 같은 오류를 찍으면 로그가 묻힌다.
// 프로세스당 한 번만 알린다.
let missingTableWarned = false

function noteCounterFailure(where: string, error: unknown): void {
  const code = (error as { code?: string } | null)?.code
  // 42P01 = undefined_table (Postgres) · PGRST205 = PostgREST 스키마 캐시에 표 없음
  if (code === '42P01' || code === 'PGRST205') {
    if (!missingTableWarned) {
      missingTableWarned = true
      console.warn(
        `[attemptThrottle] ${TABLE} 표가 없습니다 — 마이그레이션 103 미적용. ` +
          '시도 제한 없이 기존 인증만 동작합니다(fail-open on counter).'
      )
    }
    return
  }
  console.warn(`[attemptThrottle] ${where} 실패 — 시도 제한을 건너뜁니다`, error)
}

/**
 * x-forwarded-for 는 'client, proxy1, proxy2' 형태다 — 맨 앞이 원 클라이언트.
 * (access-requests 라우트의 clientIp 과 같은 판정 — 두 곳이 갈리면 카운터가 서로 다른 키를 쓴다)
 */
export function clientIp(headers: Headers | null | undefined): string {
  if (!headers) return 'unknown'
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip')?.trim() || 'unknown'
}

/** 남은 잠금 시간을 사람이 읽는 문장으로. 비개발자가 보는 문구라 초 단위는 분으로 올린다. */
export function lockMessage(retryAfterSec: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60))
  return `시도 횟수를 초과했습니다 — 약 ${minutes}분 후 다시 시도하세요`
}

/**
 * 지금 이 (표면, 대상, IP) 가 잠겨 있는지.
 *
 * 잠금 해제 시각은 "창 안에 남은 가장 오래된 실패가 창 밖으로 밀려나는 시점"이다(슬라이딩 윈도우).
 * 건수와 가장 오래된 시각을 한 번의 조회로 함께 받는다 — count 는 limit 와 무관하게
 * 필터 전체의 건수를 준다(PostgREST 의 Content-Range).
 */
export async function checkAttemptLock(
  scope: AttemptScope,
  subject: string,
  ip: string
): Promise<ThrottleState> {
  if (!subject) return OPEN
  try {
    const since = new Date(Date.now() - ATTEMPT_WINDOW_MS).toISOString()
    const { data, count, error } = await createClient()
      .from(TABLE)
      .select('created_at', { count: 'exact' })
      .eq('scope', scope)
      .eq('subject', subject)
      .eq('ip_hash', hashIp(ip))
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(1)
    if (error) {
      noteCounterFailure('잠금 조회', error)
      return OPEN
    }
    const failures = count ?? 0
    if (failures < ATTEMPT_MAX) return { locked: false, retryAfterSec: 0, failures }

    const oldest = (data?.[0] as { created_at?: string } | undefined)?.created_at
    const elapsed = oldest ? Date.now() - new Date(oldest).getTime() : 0
    const remainMs = Math.max(1_000, ATTEMPT_WINDOW_MS - elapsed)
    return { locked: true, retryAfterSec: Math.ceil(remainMs / 1000), failures }
  } catch (e) {
    noteCounterFailure('잠금 조회', e)
    return OPEN
  }
}

/**
 * 실패 1건 기록. 감사 시점에 이 경로의 로그가 0건이었으므로 콘솔에도 함께 남긴다.
 * 기록이 실패해도 호출부의 흐름(401 응답)은 그대로 진행한다.
 */
export async function recordFailedAttempt(
  scope: AttemptScope,
  subject: string,
  ip: string
): Promise<void> {
  if (!subject) return
  const ipHash = hashIp(ip)
  // 입력값(PIN·비밀번호)은 절대 로그에 싣지 않는다 — 로그를 보는 사람에게도 비밀이어야 한다.
  console.warn(`[auth] 인증 실패 scope=${scope} subject=${subject} ip=${ipHash.slice(0, 8)}`)
  try {
    const { error } = await createClient().from(TABLE).insert({ scope, subject, ip_hash: ipHash })
    if (error) noteCounterFailure('실패 기록', error)
  } catch (e) {
    noteCounterFailure('실패 기록', e)
  }
}

/**
 * 성공 시 카운터 초기화.
 * 이걸 안 하면 오늘 아홉 번 틀리고 열 번째에 성공한 운영진이 내일 한 번만 틀려도 잠긴다.
 */
export async function clearFailedAttempts(
  scope: AttemptScope,
  subject: string,
  ip: string
): Promise<void> {
  if (!subject) return
  try {
    const { error } = await createClient()
      .from(TABLE)
      .delete()
      .eq('scope', scope)
      .eq('subject', subject)
      .eq('ip_hash', hashIp(ip))
    if (error) noteCounterFailure('카운터 초기화', error)
  } catch (e) {
    noteCounterFailure('카운터 초기화', e)
  }
}
