// 하이라이트 필터 교차 연동(cross-filtering) 유틸
//
// 목적: 한 축(팀/선수/슛유형/쿼터)을 고르면 나머지 축의 선택지가 그에 맞게 좁혀지도록 한다.
//   예) 1쿼터를 고르면 1쿼터 득점이 없는 선수 칩은 0개 → 회색 비활성 처리
//
// 핵심 규칙: 어떤 축의 선택지 수를 셀 때는 "자기 축을 뺀 나머지 필터"만 적용한다.
//   자기 축까지 적용하면 현재 선택한 값만 남고 나머지가 전부 0이 되어, 축을 바꿀 수 없게 된다.

/**
 * 자기 축을 제외한 나머지 술어만 통과한 클립을 기준으로 선택지별 개수를 집계.
 *
 * @param clips      전체 클립
 * @param others     자기 축을 뺀 나머지 활성 필터 술어들
 * @param keyOf      클립 → 이 축에서의 선택지 키 (null/undefined 면 집계 제외)
 * @returns          선택지 키(문자열) → 개수. 키가 없으면 0개라는 뜻.
 */
export function availabilityCounts<T, K extends string | number>(
  clips: T[],
  others: Array<(c: T) => boolean>,
  keyOf: (c: T) => K | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of clips) {
    let ok = true
    for (const f of others) {
      if (!f(c)) { ok = false; break }
    }
    if (!ok) continue
    const k = keyOf(c)
    if (k === null || k === undefined) continue
    const s = String(k)
    out[s] = (out[s] ?? 0) + 1
  }
  return out
}

/**
 * 한 축이 여러 클립 속성에 걸쳐 판정될 때(예: 슛유형 카테고리 · 클러치) 쓰는 변형.
 * keyOf 대신 "이 선택지에 해당하는가" 술어를 선택지별로 받아 개수를 센다.
 */
export function availabilityCountsBy<T>(
  clips: T[],
  others: Array<(c: T) => boolean>,
  optionMatchers: Record<string, (c: T) => boolean>,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const key of Object.keys(optionMatchers)) out[key] = 0
  for (const c of clips) {
    let ok = true
    for (const f of others) {
      if (!f(c)) { ok = false; break }
    }
    if (!ok) continue
    for (const [key, match] of Object.entries(optionMatchers)) {
      if (match(c)) out[key]++
    }
  }
  return out
}

// 게임 쿼터 라벨 — 1~4Q, 5=OT, 6 이상=OT2, OT3...
export function gameQuarterLabel(q: number): string {
  if (q <= 4) return `${q}Q`
  if (q === 5) return 'OT'
  return `OT${q - 4}`
}
