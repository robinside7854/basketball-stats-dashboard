// 시드 고정 셔플 — "픽 순서 숨김" 발표 모드에서 명단 순서로 픽 순서가 새어나가지 않게 한다.
//
// 왜 Math.random 이 아닌가: 리렌더·새로고침마다 순서가 바뀌면 두 번 본 사람이 교집합을 눌러
// 원래 순서를 복원할 수 있고, 화면이 흔들려 캡처(PNG)도 매번 달라진다. 시드(드래프트 id 등)를
// 고정하면 같은 세션에서 항상 같은 순서가 나온다.

function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/** mulberry32 — 32bit 시드 PRNG */
function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 시드가 같으면 항상 같은 결과를 내는 Fisher-Yates 셔플(원본 배열 불변). */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items]
  const rnd = mulberry32(hashSeed(seed))
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
