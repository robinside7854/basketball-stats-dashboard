// 비밀번호 해시 · Node built-in pbkdf2 사용 (외부 의존성 X)
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'

const ITER = 100_000
const KEYLEN = 64
const DIGEST = 'sha512'

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = pbkdf2Sync(pw, salt, ITER, KEYLEN, DIGEST).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const check = pbkdf2Sync(pw, salt, ITER, KEYLEN, DIGEST).toString('hex')
  const a = Buffer.from(check, 'hex')
  const b = Buffer.from(hash, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

