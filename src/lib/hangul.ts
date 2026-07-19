// 한글 초성 유틸 — 라벨 자동완성용 (예: 'ㅍ' 입력 → '필스위치' 추천)
//
// 한글 음절은 유니코드 AC00~D7A3 에 (초성 19 × 중성 21 × 종성 28) 순서로 배열된다.
// 따라서 초성 인덱스 = floor((code - 0xAC00) / (21 * 28)) = floor((code - 0xAC00) / 588).

const CHOSUNG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
] as const

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
const CHOSUNG_BLOCK = 588   // 21 중성 × 28 종성

/** 한글 음절을 초성으로 변환. 비한글 문자는 그대로 둔다. */
export function toChosung(s: string): string {
  let out = ''
  for (const ch of s) {
    const code = ch.codePointAt(0)!
    if (code >= HANGUL_START && code <= HANGUL_END) {
      out += CHOSUNG[Math.floor((code - HANGUL_START) / CHOSUNG_BLOCK)]
    } else {
      out += ch
    }
  }
  return out
}

/** 질의가 전부 초성 자모인지 (ㄱ~ㅎ 영역). 'ㅍㅅ' → true, '필' → false */
function isChosungOnly(q: string): boolean {
  if (!q) return false
  for (const ch of q) {
    if (!CHOSUNG.includes(ch as (typeof CHOSUNG)[number])) return false
  }
  return true
}

/**
 * 자동완성 매칭.
 * - 질의가 전부 초성이면 라벨 초성 문자열에 대한 prefix 매칭
 *   ('ㅍㅅ' → '필스위치' 히트, 'ㅅㅇ' → 불히트 — 중간부터 시작하는 초성은 오탐이 많아 제외)
 * - 그 외에는 대소문자 무시 부분문자열 매칭
 * - 빈 질의는 전부 통과
 */
export function matchesLabel(query: string, label: string): boolean {
  const q = query.trim()
  if (!q) return true
  if (isChosungOnly(q)) return toChosung(label).startsWith(q)
  return label.toLowerCase().includes(q.toLowerCase())
}
