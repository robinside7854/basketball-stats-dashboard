// 회원 아이디 규칙 (2026-11-10 운영진 — 아이디와 실명을 따로 받는다).
//   종전엔 아이디 = 실명이었다. 이미 가입한 사람의 아이디(실명)는 그대로 로그인되고, 「계정 → 아이디 변경」으로 바꾼다.
//   비교는 로그인 라우트와 같은 규칙(NFC · 띄어쓰기 무시 · 소문자) — 「Robin」과 「robin」은 같은 아이디다.

export const LOGIN_ID_RULE = '2~20자 · 한글·영문·숫자·밑줄(_)·점(.)'

export function normLoginId(v: string): string {
  return v.normalize('NFC').replace(/\s+/g, '').toLowerCase()
}

/** 쓸 수 있는 아이디면 null, 아니면 안내 문구 */
export function loginIdProblem(raw: string): string | null {
  const v = raw.normalize('NFC').trim()
  if (v.length < 2 || v.length > 20) return '아이디는 2~20자로 정해 주세요'
  if (!/^[0-9A-Za-z가-힣_.]+$/.test(v)) return '아이디는 한글·영문·숫자·밑줄(_)·점(.)만 쓸 수 있어요'
  return null
}

/** YYMMDD → YYYY-MM-DD (올해 두 자리보다 크면 1900년대). 날짜가 아니면 null */
export function birthFromYymmdd(s: string, now = new Date()): string | null {
  if (!/^\d{6}$/.test(s)) return null
  const yy = Number(s.slice(0, 2)), mm = Number(s.slice(2, 4)), dd = Number(s.slice(4, 6))
  const year = (yy > now.getFullYear() % 100 ? 1900 : 2000) + yy
  const d = new Date(Date.UTC(year, mm - 1, dd))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}
