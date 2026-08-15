import { createClient } from '@/lib/supabase/admin'
import {
  checkAttemptLock,
  clearFailedAttempts,
  clientIp,
  recordFailedAttempt,
} from '@/lib/auth/attemptThrottle'
import { secretsMatch } from '@/lib/auth/constantTime'
import type { PinVerifyResult } from '@/lib/leaguePinAuth'

// 2026-08-15 보안 수정 — 감사 02 항목(리그 PIN 과 같은 구멍이 팀 PIN 에도 그대로 있었다).
//   1) (팀, IP) 조합 시도 제한. 잠금 중엔 정답이라도 통과시키지 않는다 — 정답만 통과시키면
//      응답이 갈려 "이 PIN 은 맞다"는 사실이 새고 잠금이 대입을 못 막는다.
//   2) `.eq('edit_pin', pin)` 대신 저장된 PIN 을 읽어 secretsMatch(timingSafeEqual)로 비교.
//      DB 쪽 `=` 는 조기 종료라 "몇 자리까지 맞았나"가 응답 시간으로 샌다.
//   카운터 subject 는 팀 UUID 를 쓴다. 슬러그 경로(아래 verifyTeamPinBySlug)만 예외로
//   `org/team` 문자열을 쓰는데, 그건 팀을 못 찾은 경우에도 세야 하기 때문이다.

/**
 * 팀 편집 PIN 검증 — 슬러그 기준. /api/auth/pin 이 부른다.
 *
 * team 을 생략하면 그 org 안의 아무 팀 PIN 이나 맞으면 통과한다(기존 동작 유지).
 * 예전에는 `.eq('edit_pin', pin)` 한 방으로 처리했지만, 타이밍 안전 비교로 바꾸면서
 * 후보 행을 받아와 앱에서 대조하는 형태가 됐다. 한 org 의 팀 수는 한 자릿수라 부담이 없다.
 */
export async function verifyTeamPinBySlug(
  org: string,
  team: string | undefined,
  pin: string,
  ip: string
): Promise<PinVerifyResult & { teamId?: string }> {
  if (!org || !pin) return { status: 'invalid' }
  const subject = `${org}/${team ?? '*'}`

  const lock = await checkAttemptLock('team_pin', subject, ip)
  if (lock.locked) return { status: 'locked', retryAfterSec: lock.retryAfterSec }

  // service_role 클라이언트를 쓴다. 예전엔 createServerClient() 였는데 그건 service role 키가
  // 없으면 anon 키로 조용히 폴백하고, 마이그레이션 089 가 anon 의 edit_pin SELECT 를 회수해
  // 놓았기 때문에 그 경우 이 경로만 통째로 죽는다(089 주석의 지적 그대로). 여기서 정리한다.
  const supabase = createClient()
  let query = supabase.from('teams').select('id, edit_pin').eq('org_slug', org)
  if (team) query = query.eq('sub_slug', team)
  const { data, error } = await query.limit(50)

  const match = error
    ? undefined
    : (data ?? []).find((row) => secretsMatch(pin, (row as { edit_pin: string | null }).edit_pin))

  if (!match) {
    await recordFailedAttempt('team_pin', subject, ip)
    return { status: 'invalid' }
  }

  if (lock.failures > 0) await clearFailedAttempts('team_pin', subject, ip)
  return { status: 'ok', teamId: (match as { id: string }).id }
}

/**
 * 팀 편집 PIN 검증 — 대회(파란날개) mutation API 가드.
 * 리그의 verifyLeaguePin 과 같은 구조. X-Team-Pin 헤더를 teams.edit_pin 과 대조한다.
 *
 * 불리언 대신 teams.id 를 돌려준다. 호출부가 핀 생성 시 team_id 를 채우거나
 * 리소스 소유권을 대조하는 데 그대로 쓰기 위함이다. 실패 시 null.
 * (잠금 중에도 null — 시그니처를 유지하려고 401 과 429 를 합쳐 내려보낸다. 남은 시간 안내는
 *  PIN 을 실제로 입력받는 /api/auth/pin 이 담당한다.)
 */
export async function verifyTeamPin(req: Request, org: string, team: string): Promise<string | null> {
  const pin = req.headers.get('X-Team-Pin')
  if (!pin) return null
  const result = await verifyTeamPinBySlug(org, team, pin, clientIp(req.headers))
  return result.status === 'ok' ? (result.teamId ?? null) : null
}

/**
 * 팀 편집 PIN 검증 — "이 리소스를 소유한 팀의 PIN 인가"를 한 번에 확인한다.
 *
 * 레거시(대회) 쓰기 라우트는 org/team 슬러그를 모르는 경우가 대부분(id/gameId 등 리소스
 * 참조로만 동작)이라 `verifyTeamPin(req, org, team)` 을 그대로 쓸 수 없다. 대신 라우트가
 * `resolveTeamIdFor*` 헬퍼로 리소스 소유 팀을 먼저 역산한 뒤, 그 teamId 로 이 함수를 호출해
 * PIN 이 "정확히 그 팀"의 것인지 대조한다. teamId 를 PIN 만으로 역산하지 않는 이유: 여러 팀이
 * 같은 PIN 을 쓸 수 있어 PIN → 팀 매핑이 모호해질 수 있기 때문이다.
 *
 * teamId 가 null 이면(소유 팀을 역산하지 못한 경우) 검증 대상이 없으므로 무조건 실패시킨다.
 */
export async function verifyTeamPinForTeam(req: Request, teamId: string | null): Promise<boolean> {
  if (!teamId) return false
  const pin = req.headers.get('X-Team-Pin')
  // PIN 헤더가 없으면 이 경로로 인증을 시도한 게 아니다 — 카운터를 건드리지 않는다.
  if (!pin) return false
  const ip = clientIp(req.headers)

  const lock = await checkAttemptLock('team_pin', teamId, ip)
  if (lock.locked) return false

  const supabase = createClient()
  const { data, error } = await supabase
    .from('teams')
    .select('edit_pin')
    .eq('id', teamId)
    .maybeSingle()

  // 조회 실패는 거부 방향으로 떨어뜨린다 — fail-closed.
  if (error || !data || !secretsMatch(pin, data.edit_pin as string | null)) {
    await recordFailedAttempt('team_pin', teamId, ip)
    return false
  }

  // 지울 게 있을 때만 지운다 — 헤더 경로는 요청마다 여기를 타므로 빈 DELETE 왕복을 아낀다.
  if (lock.failures > 0) await clearFailedAttempts('team_pin', teamId, ip)
  return true
}

/** tournaments.team_id 직접 조회 */
export async function resolveTeamIdForTournament(tournamentId: string | null | undefined): Promise<string | null> {
  if (!tournamentId) return null
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tournaments')
    .select('team_id')
    .eq('id', tournamentId)
    .maybeSingle()
  if (error) return null
  return (data?.team_id as string) ?? null
}

/** games.tournament_id → tournaments.team_id 역산. games.team_type 은 신뢰하지 않는다. */
export async function resolveTeamIdForGame(gameId: string | null | undefined): Promise<string | null> {
  if (!gameId) return null
  const supabase = createClient()
  const { data, error } = await supabase
    .from('games')
    .select('tournament_id')
    .eq('id', gameId)
    .maybeSingle()
  if (error || !data?.tournament_id) return null
  return resolveTeamIdForTournament(data.tournament_id as string)
}

/** game_events.game_id → games → tournaments.team_id 역산 */
export async function resolveTeamIdForGameEvent(eventId: string | null | undefined): Promise<string | null> {
  if (!eventId) return null
  const supabase = createClient()
  const { data, error } = await supabase
    .from('game_events')
    .select('game_id')
    .eq('id', eventId)
    .maybeSingle()
  if (error || !data?.game_id) return null
  return resolveTeamIdForGame(data.game_id as string)
}

/** player_minutes.game_id → games → tournaments.team_id 역산 */
export async function resolveTeamIdForPlayerMinutes(minutesId: string | null | undefined): Promise<string | null> {
  if (!minutesId) return null
  const supabase = createClient()
  const { data, error } = await supabase
    .from('player_minutes')
    .select('game_id')
    .eq('id', minutesId)
    .maybeSingle()
  if (error || !data?.game_id) return null
  return resolveTeamIdForGame(data.game_id as string)
}

/** players.team_id 직접 조회. players.team_type 은 신뢰하지 않는다. */
export async function resolveTeamIdForPlayer(playerId: string | null | undefined): Promise<string | null> {
  if (!playerId) return null
  const supabase = createClient()
  const { data, error } = await supabase
    .from('players')
    .select('team_id')
    .eq('id', playerId)
    .maybeSingle()
  if (error) return null
  return (data?.team_id as string) ?? null
}
