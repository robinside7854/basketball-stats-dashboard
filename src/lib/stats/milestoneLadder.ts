// 통산 마일스톤 사다리 — 정본 하나 (2026-10-15).
//
// 왜: 같은 「마일스톤」이 세 곳에서 서로 다른 눈금을 썼다 — 홈 최근 마일스톤(milestones.ts)은 득점 100·250·500·1000·2000,
//   /me 「다음 목표까지」(auth/dashboard)는 750·1500 이 끼어 있었고, 마일스톤 나무(PlayerMilestoneChart)는 또 달랐다.
//   그래서 /me 에선 「750까지 −40」이라는데 홈에는 750 달성 소식이 영영 안 뜨는 식으로 어긋났다.
//   눈금을 바꾸면 여기 한 곳만 고친다 — 세 화면이 전부 이 표를 읽는다.

export type MilestoneMetric = 'pts' | 'reb' | 'ast' | 'stl' | 'blk'

/** 지표별 통산 누적 눈금 (오름차순). 마지막 값을 넘으면 /me 체이서는 목표 없음, 나무는 STEP 단위로 올린다 */
export const MILESTONE_LADDER: Record<MilestoneMetric, readonly number[]> = {
  pts: [100, 250, 500, 1000, 2000, 3000, 4000, 5000],
  reb: [50, 100, 250, 500, 1000, 1500, 2000],
  ast: [25, 50, 100, 250, 500, 750, 1000],
  stl: [25, 50, 100, 250, 500, 750, 1000],
  blk: [10, 25, 50, 100, 250, 500],
}

/** 나무 그림에서 리그 1위가 사다리 끝을 넘었을 때 TOP 을 올리는 단위 */
export const MILESTONE_STEP: Record<MilestoneMetric, number> = {
  pts: 500, reb: 100, ast: 100, stl: 100, blk: 50,
}

/** 지금 값 다음 눈금과 직전 눈금(없으면 0). 끝을 넘었으면 null */
export function nextMilestone(metric: MilestoneMetric, current: number): { next: number; prev: number } | null {
  const ladder = MILESTONE_LADDER[metric]
  const next = ladder.find(t => t > current)
  if (next == null) return null
  let prev = 0
  for (const t of ladder) if (t <= current) prev = t
  return { next, prev }
}
