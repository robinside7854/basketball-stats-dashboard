// 온볼 운영 콘솔(/admin) 공동관리자 — 계정·초대 데이터 접근 (서버 전용)
//
// 표 셋(마이그레이션 097)을 다루는 유일한 진입점이다. 라우트마다 직접 쿼리하면
// "비활성화된 계정인지" 같은 조건을 한 곳만 빠뜨려도 fail-open 이 된다.
//
// ⚠ 이 파일은 service_role 클라이언트를 쓴다. platform_* 표는 RLS 정책이 0개라
//   anon 키로는 한 행도 안 읽힌다 — 비밀번호 해시와 초대 토큰 해시가 들어있기 때문.
//   클라이언트 컴포넌트에서 import 하지 말 것.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createClient } from '@/lib/supabase/admin'
import { hashPassword, verifyPassword } from './password'

export type PlatformAdmin = {
  id: string
  email: string
  name: string | null
  invited_by: string | null
  created_at: string
  last_login_at: string | null
  disabled_at: string | null
}

export type PlatformInvite = {
  id: string
  email: string
  invited_by: string | null
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  created_at: string
}

export type PlatformPasswordReset = {
  id: string
  admin_id: string
  email: string
  issued_by: string | null
  expires_at: string
  used_at: string | null
  revoked_at: string | null
  created_at: string
}

// 초대 유효 기간. 계정 권한을 주는 링크라 짧게 잡는다.
export const INVITE_TTL_HOURS = 72

// 비밀번호 재설정 링크 유효 기간. 초대(72h)보다 더 짧다 — 초대는 아직 계정이 없는 사람에게
// 가지만, 이 링크는 **이미 존재하는 계정을 통째로 가져갈 수 있는 링크**다. 노출 창을 줄인다.
export const PASSWORD_RESET_TTL_HOURS = 24

// 계정 목록에서 password_hash 는 절대 꺼내지 않는다 — 실수로 API 응답에 섞이는 걸 막는다.
const ADMIN_COLS = 'id, email, name, invited_by, created_at, last_login_at, disabled_at'
const INVITE_COLS = 'id, email, invited_by, expires_at, accepted_at, revoked_at, created_at'
const RESET_COLS = 'id, admin_id, email, issued_by, expires_at, used_at, revoked_at, created_at'

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  // 과하게 엄격한 정규식은 정상 주소를 막는다. 형식만 최소로 본다.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254
}

// 토큰 원문은 링크에만 담기고 DB 엔 해시만 남는다.
// (비밀번호와 달리 128비트 랜덤이라 pbkdf2 대신 sha256 으로 충분하다 — 사전공격 대상이 아니다)
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// password_changed_at 은 마이그레이션 105 이후에만 존재하는 컬럼이다.
// 아직 적용하지 않은 배포에서 이 컬럼을 select 하면 PostgREST 가 42703 을 돌려주고,
// 그러면 로그인과 CEO 가드가 **통째로** 죽는다 — 전원이 콘솔에서 잠긴다.
// 그래서 한 번 실패하면 이 프로세스가 사는 동안 옛 컬럼 목록으로 내려앉는다(세션 무효화
// 기능만 조용히 꺼지고 로그인은 계속 된다). 마이그레이션을 적용하면 다음 콜드스타트부터 켜진다.
const LOGIN_COLS = 'id, email, name, password_hash, disabled_at, password_changed_at'
const LOGIN_COLS_LEGACY = 'id, email, name, password_hash, disabled_at'
let passwordChangedAtAvailable = true

/** 로그인 시 계정 조회. 비활성화된 계정은 없는 것으로 취급한다. */
export async function findActiveAdminByEmail(email: string): Promise<{
  id: string
  email: string
  name: string | null
  password_hash: string
  /** null = 한 번도 재설정한 적이 없거나, 마이그레이션 105 미적용(판정 근거 없음) */
  password_changed_at: string | null
} | null> {
  const sb = createClient()
  const normalized = normalizeEmail(email)
  const read = (cols: string) =>
    sb.from('platform_admins').select(cols).ilike('email', normalized).maybeSingle()

  let result = await read(passwordChangedAtAvailable ? LOGIN_COLS : LOGIN_COLS_LEGACY)
  // 42703 = undefined_column. 여기서만 내려앉는다 — 아무 오류에나 내려앉으면 순단 한 번으로
  // 세션 무효화가 그 인스턴스에서 영영 꺼진 채로 남는다.
  const isMissingColumn =
    result.error?.code === '42703' || (result.error?.message ?? '').includes('password_changed_at')
  if (result.error && isMissingColumn && passwordChangedAtAvailable) {
    console.warn(
      '[platformAdmin] password_changed_at 조회 실패 — 마이그레이션 105 미적용으로 보고 이전 컬럼으로 재시도합니다',
      result.error.message,
    )
    passwordChangedAtAvailable = false
    result = await read(LOGIN_COLS_LEGACY)
  }

  const data = result.data as {
    id: string
    email: string
    name: string | null
    password_hash: string
    disabled_at: string | null
    password_changed_at?: string | null
  } | null
  if (result.error || !data) return null
  if (data.disabled_at) return null
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    password_hash: data.password_hash,
    password_changed_at: data.password_changed_at ?? null,
  }
}

/**
 * 이메일이 지금 이 순간 유효한 공동관리자인지.
 *
 * 세션(JWT)은 최대 30일 살아 있는데 권한 회수는 즉시 먹어야 한다. 그래서 세션 안의
 * 정보를 믿지 않고 매 요청 DB 를 본다. 마이그레이션 072 가 리그 회원 role 을 쿠키에
 * 넣지 않기로 한 것과 같은 이유다.
 */
export async function isActiveAdminEmail(email: string): Promise<boolean> {
  return (await findActiveAdminByEmail(email)) !== null
}

export type SessionAdminCheck = 'ok' | 'not_admin' | 'password_changed'

/**
 * 세션 하나가 지금도 유효한지. isActiveAdminEmail 에 "비밀번호가 그 뒤로 바뀌었나" 를 더한 것이다.
 *
 * 비밀번호를 잃어버렸다는 상황은 "누가 내 계정에 들어와 있다" 와 겹칠 수 있다. 그런데 JWT 는
 * 최대 30일 살아 있어서, 비밀번호만 바꾸면 침입자의 세션은 그대로 남는다. 그래서 재설정 시각
 * 이전에 발급된 세션은 죽은 것으로 본다.
 *
 * 두 시각 모두 앱 프로세스의 시계에서 나온다(token.loginAt = Date.now(),
 * password_changed_at = 재설정 라우트가 넣는 ISO 문자열). DB NOW() 를 쓰지 않는 이유가
 * 이것이다 — 서로 다른 시계를 비교하면 몇 초 어긋난 것만으로 방금 로그인한 사람이 튕긴다.
 * 그래도 인스턴스 간 미세한 드리프트가 있을 수 있어 아래 유예를 둔다.
 */
const PASSWORD_CHANGE_SKEW_MS = 10_000

export async function checkSessionAdmin(email: string, loginAtMs: number): Promise<SessionAdminCheck> {
  const admin = await findActiveAdminByEmail(email)
  if (!admin) return 'not_admin'
  // loginAt 이 없는 세션(옛 JWT)은 판정 근거가 없다 — 기존 동작 그대로 통과시킨다.
  if (!loginAtMs || !admin.password_changed_at) return 'ok'
  const changedAt = new Date(admin.password_changed_at).getTime()
  if (Number.isNaN(changedAt)) return 'ok'
  return changedAt > loginAtMs + PASSWORD_CHANGE_SKEW_MS ? 'password_changed' : 'ok'
}

export async function listAdmins(): Promise<PlatformAdmin[]> {
  const sb = createClient()
  const { data, error } = await sb
    .from('platform_admins')
    .select(ADMIN_COLS)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`platform_admins 조회 실패 — ${error.message}`)
  return (data ?? []) as PlatformAdmin[]
}

export async function countActiveAdmins(): Promise<number> {
  const sb = createClient()
  const { count, error } = await sb
    .from('platform_admins')
    .select('id', { count: 'exact', head: true })
    .is('disabled_at', null)
  if (error) throw new Error(`platform_admins 집계 실패 — ${error.message}`)
  return count ?? 0
}

export async function touchLastLogin(id: string): Promise<void> {
  const sb = createClient()
  // 로그인 흐름을 막지 않는다 — 실패해도 로그인 자체는 성공시킨다.
  await sb.from('platform_admins').update({ last_login_at: new Date().toISOString() }).eq('id', id)
}

/** 활성/취소 대기 중인 초대까지 포함한 목록 (화면에서 '초대함' 상태로 보여준다) */
export async function listOpenInvites(): Promise<PlatformInvite[]> {
  const sb = createClient()
  const { data, error } = await sb
    .from('platform_admin_invites')
    .select(INVITE_COLS)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`platform_admin_invites 조회 실패 — ${error.message}`)
  return (data ?? []) as PlatformInvite[]
}

/**
 * 초대 생성. 토큰 원문을 딱 한 번 돌려주며, 이후로는 어디서도 다시 꺼낼 수 없다.
 * 같은 이메일로 열려 있던 이전 초대는 무효화한다 — 링크가 여러 개 살아 있으면 회수가 어렵다.
 */
export async function createInvite(
  email: string,
  invitedBy: string | null
): Promise<{ token: string; invite: PlatformInvite }> {
  const normalized = normalizeEmail(email)
  const sb = createClient()

  await sb
    .from('platform_admin_invites')
    .update({ revoked_at: new Date().toISOString() })
    .ilike('email', normalized)
    .is('accepted_at', null)
    .is('revoked_at', null)

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000).toISOString()

  const { data, error } = await sb
    .from('platform_admin_invites')
    .insert({ email: normalized, token_hash: hashToken(token), invited_by: invitedBy, expires_at: expiresAt })
    .select(INVITE_COLS)
    .single()
  if (error || !data) throw new Error(`초대 생성 실패 — ${error?.message ?? '알 수 없음'}`)

  return { token, invite: data as PlatformInvite }
}

export async function revokeInvite(id: string): Promise<void> {
  const sb = createClient()
  const { error } = await sb
    .from('platform_admin_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('accepted_at', null)
  if (error) throw new Error(`초대 취소 실패 — ${error.message}`)
}

export type InviteCheck =
  | { ok: true; email: string; inviteId: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'used' | 'revoked' }

/**
 * 토큰으로 초대를 확인한다. 실패 사유를 구분해서 돌려주되, 화면에서 '이미 사용됨'과
 * '없는 토큰'을 다르게 보여줄지는 호출부가 정한다.
 */
export async function checkInvite(token: string): Promise<InviteCheck> {
  if (!token) return { ok: false, reason: 'not_found' }
  const sb = createClient()
  const { data, error } = await sb
    .from('platform_admin_invites')
    .select('id, email, expires_at, accepted_at, revoked_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle()
  if (error || !data) return { ok: false, reason: 'not_found' }
  if (data.revoked_at) return { ok: false, reason: 'revoked' }
  if (data.accepted_at) return { ok: false, reason: 'used' }
  if (new Date(data.expires_at).getTime() <= Date.now()) return { ok: false, reason: 'expired' }
  return { ok: true, email: data.email, inviteId: data.id }
}

export type AcceptResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_invite' | 'weak_password' | 'already_admin' }

export const MIN_PASSWORD_LENGTH = 10

/**
 * 초대 수락 — 비밀번호를 설정하고 계정을 만든다.
 *
 * 초대 소진(accepted_at)은 계정 생성이 성공한 뒤에 찍는다. 순서를 뒤집으면
 * 계정 생성이 실패했을 때 초대만 타 버려서 초대받은 사람이 영영 못 들어온다.
 */
export async function acceptInvite(token: string, password: string, name?: string): Promise<AcceptResult> {
  const check = await checkInvite(token)
  if (!check.ok) return { ok: false, reason: 'invalid_invite' }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: 'weak_password' }
  }

  const sb = createClient()
  const { data: existing } = await sb
    .from('platform_admins')
    .select('id')
    .ilike('email', check.email)
    .maybeSingle()
  if (existing) {
    // 이미 계정이 있는데 초대가 남아 있던 경우 — 초대만 닫고 알린다.
    await sb.from('platform_admin_invites').update({ accepted_at: new Date().toISOString() }).eq('id', check.inviteId)
    return { ok: false, reason: 'already_admin' }
  }

  const { error: insertError } = await sb.from('platform_admins').insert({
    email: check.email,
    name: name?.trim() || null,
    password_hash: hashPassword(password),
    invited_by: null,
  })
  if (insertError) return { ok: false, reason: 'invalid_invite' }

  await sb.from('platform_admin_invites').update({ accepted_at: new Date().toISOString() }).eq('id', check.inviteId)
  return { ok: true }
}

// ── 비밀번호 재설정 ────────────────────────────────────────────────────────
// 초대와 같은 토큰 방식을 그대로 쓴다: 32바이트 랜덤 · sha256 해시만 저장 · 만료 · 1회용.
// 표만 따로 둔다(마이그레이션 105 주석 참조) — 겸용 표로 만들면 재설정 토큰이 초대 화면에서
// 조회에 걸려 엉뚱한 자리에서 소진되는 fail-open 이 생긴다.

/**
 * 이메일 가리기 — 'robin@example.com' → 'ro***@example.com'.
 *
 * 재설정 화면은 "내 계정이 맞나" 를 확인시켜 줘야 하지만, 주소 전체를 그대로 뿌리면
 * 링크가 엉뚱한 사람 손에 들어갔을 때 관리자 주소를 그냥 알려주는 꼴이 된다.
 * (초대 화면이 주소를 다 보여주는 것과 다른 판단이다 — 그쪽은 아직 계정이 아니라 노출 가치가 없다)
 */
export function maskEmail(email: string): string {
  const [local, domain] = normalizeEmail(email).split('@')
  if (!local || !domain) return '***'
  const head = local.slice(0, 2)
  return `${head}${'*'.repeat(Math.max(3, local.length - head.length))}@${domain}`
}

/** 아직 살아 있는 재설정 링크 목록 — 화면에서 '발급됨' 상태로 보여준다. */
export async function listOpenPasswordResets(): Promise<PlatformPasswordReset[]> {
  const sb = createClient()
  const { data, error } = await sb
    .from('platform_admin_password_resets')
    .select(RESET_COLS)
    .is('used_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`platform_admin_password_resets 조회 실패 — ${error.message}`)
  return (data ?? []) as PlatformPasswordReset[]
}

/**
 * 재설정 링크 생성. 토큰 원문을 딱 한 번 돌려주며, 이후로는 어디서도 다시 꺼낼 수 없다.
 * 같은 계정으로 열려 있던 이전 링크는 무효화한다 — 살아 있는 링크가 여러 개면 회수가 어렵다.
 * (createInvite 와 같은 규칙)
 */
export async function createPasswordReset(
  adminId: string,
  issuedBy: string | null,
): Promise<{ token: string; reset: PlatformPasswordReset }> {
  const admin = await getAdminById(adminId)
  if (!admin) throw new Error('계정을 찾을 수 없습니다')

  const sb = createClient()
  await sb
    .from('platform_admin_password_resets')
    .update({ revoked_at: new Date().toISOString() })
    .eq('admin_id', adminId)
    .is('used_at', null)
    .is('revoked_at', null)

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_HOURS * 3600_000).toISOString()

  const { data, error } = await sb
    .from('platform_admin_password_resets')
    .insert({
      admin_id: adminId,
      email: normalizeEmail(admin.email),
      token_hash: hashToken(token),
      issued_by: issuedBy,
      expires_at: expiresAt,
    })
    .select(RESET_COLS)
    .single()
  if (error || !data) throw new Error(`재설정 링크 생성 실패 — ${error?.message ?? '알 수 없음'}`)

  return { token, reset: data as PlatformPasswordReset }
}

export async function revokePasswordReset(id: string): Promise<void> {
  const sb = createClient()
  // PostgREST 는 아무 행도 못 바꿔도 204 를 준다(감사 04 ② 패턴) — 반환 행으로 판정한다.
  const { data, error } = await sb
    .from('platform_admin_password_resets')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('used_at', null)
    .is('revoked_at', null)
    .select('id')
  if (error) throw new Error(`재설정 링크 회수 실패 — ${error.message}`)
  if (!data || data.length === 0) throw new Error('이미 사용되었거나 회수된 링크입니다')
}

export type PasswordResetCheck =
  | { ok: true; maskedEmail: string; resetId: string; adminId: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'used' | 'revoked' }

/**
 * 토큰으로 재설정 링크를 확인한다. 조회 키는 토큰 해시 하나뿐이라 이메일을 입력받지 않는다 —
 * 즉 이 경로로는 "그 주소가 관리자인가" 를 물어볼 수 없다(열거 불가).
 */
export async function checkPasswordReset(token: string): Promise<PasswordResetCheck> {
  if (!token) return { ok: false, reason: 'not_found' }
  const sb = createClient()
  const { data, error } = await sb
    .from('platform_admin_password_resets')
    .select('id, admin_id, email, expires_at, used_at, revoked_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle()
  if (error || !data) return { ok: false, reason: 'not_found' }
  if (data.revoked_at) return { ok: false, reason: 'revoked' }
  if (data.used_at) return { ok: false, reason: 'used' }
  if (new Date(data.expires_at).getTime() <= Date.now()) return { ok: false, reason: 'expired' }
  return { ok: true, maskedEmail: maskEmail(data.email), resetId: data.id, adminId: data.admin_id }
}

export type PasswordResetResult =
  // adminId 는 감사 로그가 "누구의 비밀번호가 바뀌었나" 를 남기기 위해 필요하다.
  // 토큰이 인증인 공개 라우트라 호출부가 대상을 알 방법이 이것뿐이다 —
  // ⚠ 응답 본문에 실어 보내지 말 것(가려진 이메일만 나가야 한다).
  | { ok: true; adminId: string }
  | { ok: false; reason: 'invalid_token' | 'weak_password' | 'update_failed' }

/**
 * 재설정 완료 — 비밀번호를 새로 설정하고 토큰을 태운다.
 *
 * ⚠ acceptInvite 와 순서가 반대다(저쪽은 계정 생성 성공 뒤에 초대를 소진한다).
 *   여기서는 토큰 소진을 **먼저**, 그것도 `used_at IS NULL` 조건부 update 로 한다.
 *   같은 링크로 두 요청이 동시에 들어와도 update 가 행을 돌려주는 쪽은 하나뿐이라
 *   1회용이 경합 상황에서도 깨지지 않는다. 초대와 달리 이 링크는 **이미 있는 계정을
 *   가져갈 수 있는 링크**라 재사용 위험이 헛걸음 위험보다 무겁다.
 *   (비밀번호 갱신이 뒤이어 실패하면 토큰만 죽고 계정은 그대로다 — CEO 가 다시 발급하면 된다)
 */
export async function completePasswordReset(
  token: string,
  password: string,
  ipHash: string | null,
): Promise<PasswordResetResult> {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: 'weak_password' }
  }
  const check = await checkPasswordReset(token)
  if (!check.ok) return { ok: false, reason: 'invalid_token' }

  const sb = createClient()
  const now = new Date().toISOString()

  const { data: consumed, error: consumeError } = await sb
    .from('platform_admin_password_resets')
    .update({ used_at: now, used_ip_hash: ipHash })
    .eq('id', check.resetId)
    .is('used_at', null)
    .is('revoked_at', null)
    .select('id')
  if (consumeError || !consumed || consumed.length === 0) {
    return { ok: false, reason: 'invalid_token' }
  }

  // password_changed_at 은 세션 무효화의 기준선이다 — DB NOW() 가 아니라 앱 시계로 넣는다
  // (checkSessionAdmin 주석 참조). 성공 판정은 반환 행 수로 한다.
  const { data: updated, error: updateError } = await sb
    .from('platform_admins')
    .update({ password_hash: hashPassword(password), password_changed_at: now })
    .eq('id', check.adminId)
    .select('id')
  if (updateError || !updated || updated.length === 0) {
    console.error('[platformAdmin] 비밀번호 갱신 실패 — 토큰은 이미 소진됨', updateError)
    return { ok: false, reason: 'update_failed' }
  }

  return { ok: true, adminId: check.adminId }
}

/**
 * 계정 비활성화. 삭제하지 않는 이유는 과거 행위 기록(drafts.created_by 등)이
 * 이메일 문자열을 가리키고 있어서다.
 */
export async function setAdminDisabled(id: string, disabled: boolean): Promise<void> {
  const sb = createClient()
  const { error } = await sb
    .from('platform_admins')
    .update({ disabled_at: disabled ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw new Error(`계정 상태 변경 실패 — ${error.message}`)
}

export async function getAdminById(id: string): Promise<PlatformAdmin | null> {
  const sb = createClient()
  const { data } = await sb.from('platform_admins').select(ADMIN_COLS).eq('id', id).maybeSingle()
  return (data as PlatformAdmin) ?? null
}

/** DB 계정으로 로그인 검증. 성공하면 계정을, 실패하면 null. */
export async function verifyAdminLogin(
  email: string,
  password: string
): Promise<{ id: string; email: string; name: string | null } | null> {
  const admin = await findActiveAdminByEmail(email)
  if (!admin) return null
  if (!verifyPassword(password, admin.password_hash)) return null
  return { id: admin.id, email: admin.email, name: admin.name }
}

/**
 * 부트스트랩 계정(환경변수) 검증.
 *
 * DB 가 비어 있거나 조회가 실패해도 소유자는 항상 들어올 수 있어야 한다 —
 * 공동관리자 체계를 얹다가 스스로 잠기는 사고를 막는 안전장치다.
 * 기존 평문 `===` 비교를 timingSafeEqual 로 바꿔 타이밍 누출도 함께 없앤다.
 */
export function verifyBootstrapLogin(email: string, password: string): { email: string } | null {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminEmail || !adminPassword) return null
  if (normalizeEmail(email) !== normalizeEmail(adminEmail)) return null

  const a = Buffer.from(password, 'utf8')
  const b = Buffer.from(adminPassword, 'utf8')
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null
  return { email: adminEmail }
}

export function isBootstrapEmail(email: string): boolean {
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) return false
  return normalizeEmail(email) === normalizeEmail(adminEmail)
}

/** 접근 요청 남용 방지 — 같은 이메일/IP 로 짧은 시간에 반복 제출하는 것을 막는다. */
export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 32)
}
