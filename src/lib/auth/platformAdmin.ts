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

// 초대 유효 기간. 계정 권한을 주는 링크라 짧게 잡는다.
export const INVITE_TTL_HOURS = 72

// 계정 목록에서 password_hash 는 절대 꺼내지 않는다 — 실수로 API 응답에 섞이는 걸 막는다.
const ADMIN_COLS = 'id, email, name, invited_by, created_at, last_login_at, disabled_at'
const INVITE_COLS = 'id, email, invited_by, expires_at, accepted_at, revoked_at, created_at'

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

/** 로그인 시 계정 조회. 비활성화된 계정은 없는 것으로 취급한다. */
export async function findActiveAdminByEmail(
  email: string
): Promise<{ id: string; email: string; name: string | null; password_hash: string } | null> {
  const sb = createClient()
  const { data, error } = await sb
    .from('platform_admins')
    .select('id, email, name, password_hash, disabled_at')
    .ilike('email', normalizeEmail(email))
    .maybeSingle()
  if (error || !data) return null
  if (data.disabled_at) return null
  return { id: data.id, email: data.email, name: data.name, password_hash: data.password_hash }
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
