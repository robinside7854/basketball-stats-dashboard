// 출전 시간 산출 — 세 갈래로 나눠 계산한다.
//
// ## 왜 이렇게 됐나 (2026-08-10 실측)
//
// 이 리그는 **5대5 고정에 벤치가 없다**. 261경기 중 224경기가 코트 인원 정확히 10명이고,
// 교체가 기록된 경기는 30경기(11%)뿐이다. 선발 등록 행(`league_player_minutes`)은
// 2,724행 중 2,689행이 `in_time = 0` — 경기 시작부터 뛰었다는 뜻이다.
//
// 그래서 **대부분의 정답은 "경기 전체 길이"** 다. 처음엔 이벤트가 찍힌 구간만 이어 붙여
// 추정했는데(첫 구현), 그 값이 경기 길이의 **중앙값 51%** 밖에 안 됐다 — 10분 내내 뛴
// 선수를 5.3분으로 깎고 있었다. 이벤트를 남기지 않은 시간(수비만 하다 온 구간 등)이
// 통째로 빠지기 때문이다. 이벤트 기반 추정은 "코트를 밟은 시간"이 아니라 "관여한 시간"이다.
//
// ## 계산 규칙
//
//   ① 교체가 실제로 기록됨 (in_time·out_time 둘 다)  → out − in            [실측]
//   ② 선발 등록만 있고 교체 아웃이 없음               → in ~ 경기 끝        [추정·대부분]
//   ③ 선발 등록이 아예 없는데 이벤트는 있음            → 이벤트 구간 이어 붙임 [추정·소수]
//
// ②가 추정인 이유: 교체하고 나갔는데 기록만 안 했을 수 있다. 다만 교체 자체가 11% 경기에서만
// 일어나므로, "끝까지 뛰었다"고 보는 쪽이 실제에 훨씬 가깝다.
// ③은 명단에 없는데 임시로 투입된 선수(비정규·타팀 임시 출전)라 기댈 기록이 이벤트뿐이다.

/** ③에서만 씀 — 이 간격을 넘겨 이벤트가 없으면 벤치에 앉았던 것으로 본다 */
export const STINT_GAP = 120
/** ③에서만 씀 — 첫/마지막 이벤트 앞뒤로 더해 주는 여유 */
export const STINT_PAD = 30

/**
 * ② 선발 등록됐고 교체 아웃 기록이 없는 경우 — 경기 끝까지 뛴 것으로 본다.
 * @returns 출전 시간(초)
 */
export function minutesFromStartToEnd(inTime: number | null, gameSpan: number): number {
  return Math.max(0, gameSpan - (inTime ?? 0))
}

/**
 * ③ 명단에 없는데 이벤트만 있는 선수 — 이벤트가 찍힌 구간을 이어 붙여 추정한다.
 * ⚠ 이벤트를 남기지 않은 시간은 잡히지 않으므로 실제보다 적게 나온다. ②로 커버되지
 * 않는 선수에게만 쓴다.
 * @param timestamps 영상 시각(초) 목록 — 정렬돼 있지 않아도 된다
 * @param gameSpan   그 경기 마지막 이벤트 시각(초). 구간을 여기로 자른다
 * @returns 추정 출전 시간(초)
 */
export function estimatePlayerGameSeconds(timestamps: number[], gameSpan: number): number {
  const ts = timestamps.filter(t => Number.isFinite(t) && t > 0).sort((a, b) => a - b)
  if (ts.length === 0) return 0

  const upper = Math.max(gameSpan, ts[ts.length - 1])
  let total = 0
  let start = ts[0]
  let prev = ts[0]

  const close = (from: number, to: number) => {
    const s = Math.max(0, from - STINT_PAD)
    const e = Math.min(upper, to + STINT_PAD)
    total += Math.max(0, e - s)
  }

  for (let i = 1; i < ts.length; i++) {
    if (ts[i] - prev > STINT_GAP) {
      close(start, prev)
      start = ts[i]
    }
    prev = ts[i]
  }
  close(start, prev)
  return total
}
