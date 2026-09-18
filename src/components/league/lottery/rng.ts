// 결정론 난수 — 모든 클라이언트가 같은 코스·같은 궤적을 그리게 하는 뿌리.
//
// ⚠ Math.random 을 쓰면 기기마다 다른 레이스가 된다. 서버가 정한 순서는 게이트 단계가
// 보장하지만, "같은 추첨을 같이 본다"는 체험 자체가 깨지므로 시드 난수만 쓴다.
//
// mulberry32 는 곱셈·시프트·XOR 만 쓴다(Math.imul = 32비트 정수 곱, 명세상 결과가 유일).
// 부동소수 초월함수(sin/cos/pow)는 엔진마다 마지막 자리가 갈릴 수 있어 여기서도, 물리에서도
// 쓰지 않는다.

/** 문자열 → 32비트 시드 (FNV-1a). order.join('|') 를 넣는다. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export type Rng = () => number

/** [0,1) 균등. 나눗셈 상수는 2^32 — 정확히 표현되는 값이라 나눗셈도 정확하다. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** [lo, hi) 균등 */
export function range(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo)
}

/** 정수 [lo, hi] */
export function intRange(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1))
}
