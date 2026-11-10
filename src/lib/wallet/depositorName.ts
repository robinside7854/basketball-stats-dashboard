// 입금자명 규칙 — 화면(입력 칸)과 서버가 같이 쓴다.

/** 입금자명에 쓸 수 없는 글자 — 입금 알림 글에 늘 들어 있어 남의 입금과 짝지어진다(2026-11-10 운영진). */
const RESERVED_WORDS = ['모임통장']
export function stripReservedDepositor(s: string): string {
  let out = s
  for (const w of RESERVED_WORDS) out = out.split(w).join('')
  return out
}
export function hasReservedDepositor(s: string): boolean {
  const q = s.normalize('NFC').replace(/\s+/g, '')
  return RESERVED_WORDS.some(w => q.includes(w))
}

