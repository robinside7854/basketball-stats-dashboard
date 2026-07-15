// 댓글 비번 해싱 · Node 내장 crypto 로 PBKDF2-SHA256 (외부 의존 없음)
// 4자리 비번 · salt 16 bytes · 10000 iterations · 32 bytes hash
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto'

const ITER = 10_000
const KEYLEN = 32
const DIGEST = 'sha256'

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString('hex')
  const hash = pbkdf2Sync(password, salt, ITER, KEYLEN, DIGEST).toString('hex')
  return { salt, hash }
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  try {
    const actual = pbkdf2Sync(password, salt, ITER, KEYLEN, DIGEST)
    const expected = Buffer.from(expectedHash, 'hex')
    if (actual.length !== expected.length) return false
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

// 4자리 숫자 검증 (UX: 모바일 숫자 키패드 자동)
export function isValidPassword(password: unknown): password is string {
  return typeof password === 'string' && /^\d{4}$/.test(password)
}
