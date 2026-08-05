// 세션 · HMAC 서명된 base64url 토큰 (JWT-style · 외부 lib 없음)
// 쿠키명 `mm_auth` · httpOnly · sameSite=lax · 최대 30일
import { createHmac, timingSafeEqual } from 'node:crypto'

const SECRET = process.env.AUTH_SESSION_SECRET
  ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? 'DEV_ONLY_INSECURE_FALLBACK'

export const AUTH_COOKIE = 'mm_auth'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30  // 30일

export interface SessionPayload {
  uid: string        // league_user_accounts.id
  lid: string        // league_id (발급 당시의 경기묶음 — 리그↔대회 이동 판정에는 더 이상 직접 쓰지 않는다)
  tid?: string        // team_id — 로그인이 실제로 매이는 단위(리그·대회를 넘나든다).
                       //   옵셔널이어야 한다: 이 필드 도입 이전에 발급된 30일짜리 쿠키에는 없다.
                       //   verifySession 의 필수 필드 검사에 넣지 않는다 — 넣으면 그 쿠키들이 전부 거부된다.
  pid: string         // league_player_id
  loginId: string     // 표시용
  exp: number         // unix ms
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

export function signSession(payload: Omit<SessionPayload, 'exp'>): { token: string; maxAge: number } {
  const full: SessionPayload = { ...payload, exp: Date.now() + MAX_AGE_SECONDS * 1000 }
  const body = base64url(JSON.stringify(full))
  const sig = base64url(createHmac('sha256', SECRET).update(body).digest())
  return { token: `${body}.${sig}`, maxAge: MAX_AGE_SECONDS }
}

export function verifySession(token: string | null | undefined): SessionPayload | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', SECRET).update(body).digest()
  const a = b64urlDecode(sig)
  if (a.length !== expected.length) return null
  if (!timingSafeEqual(a, expected)) return null
  try {
    const payload = JSON.parse(b64urlDecode(body).toString('utf-8')) as SessionPayload
    if (!payload.exp || Date.now() > payload.exp) return null
    if (!payload.uid || !payload.lid || !payload.pid) return null
    return payload
  } catch {
    return null
  }
}

// Next.js 응답 헤더에 쿠키 세팅용 문자열
export function buildAuthCookieHeader(token: string, maxAge: number): string {
  const parts = [
    `${AUTH_COOKIE}=${token}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

export function buildAuthClearCookieHeader(): string {
  return `${AUTH_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
}
