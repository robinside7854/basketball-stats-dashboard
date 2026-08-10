// 이벤트 시각으로 출전 시간을 추정한다.
//
// 왜 필요한가: 교체 패널이 사실상 안 쓰이고 있다. 운영 DB 실측(2026-08-10) 결과
// `league_player_minutes` 2,724행 중 2,688행(98.7%)이 `out_time` NULL 이라, 출전 시간을
// in/out 이 둘 다 있는 행으로만 합산하는 현재 계산에서는 MIN 이 사실상 0으로 나온다.
// 교체를 손으로 찍게 만드는 대신, 이미 찍혀 있는 이벤트의 영상 시각으로 되짚는다.
//
// 규칙은 일부러 단순하게 뒀다 — 설명할 수 있어야 사용자가 숫자를 믿는다.
//   · 한 선수의 이벤트를 시각순으로 늘어놓고, 간격이 STINT_GAP 이하면 같은 출전 구간으로 묶는다
//   · 각 구간 = (첫 이벤트 − PAD) ~ (마지막 이벤트 + PAD). 코트에 있었지만 기록이 안 남은
//     앞뒤 시간을 메우는 여유다
//   · 경기 영상 길이로 잘라낸다
//
// ⚠ 이것은 추정치다. 이벤트가 하나도 없는 선수는 0분으로 나오고(실제로는 뛰었을 수 있다),
// 이벤트가 뜸한 선수는 과소 추정된다. 화면에는 반드시 "추정"으로 표기한다.

/** 이 간격을 넘겨 이벤트가 없으면 벤치에 앉았던 것으로 본다 */
export const STINT_GAP = 120
/** 첫/마지막 이벤트 앞뒤로 더해 주는 여유 */
export const STINT_PAD = 30

/**
 * 한 선수·한 경기의 이벤트 시각들로 출전 시간을 추정한다.
 * @param timestamps 영상 시각(초) 목록 — 정렬돼 있지 않아도 된다
 * @param gameSpan   그 경기 영상에서 마지막 이벤트 시각(초). 구간을 여기로 자른다
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
