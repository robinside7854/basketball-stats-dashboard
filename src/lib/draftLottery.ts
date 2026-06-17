// 드래프트 추첨 — 지난 분기 승률 기반 가중 추첨 (NBA 로터리 방식)
//
// 하위 팀(승률 낮은 팀)일수록 1픽 당첨 확률이 높아지도록 가중치를 부여한다.
//   weight = (1 - winRate) + BASELINE
//     - winRate 0%  → weight 1.0 + BASELINE  (가장 유리)
//     - winRate 100% → weight 0.0 + BASELINE  (그래도 0은 아님 → 역전 가능)
//
// 지난 분기 데이터가 전혀 없으면(neutral) 모든 팀 동일 가중 = 순수 랜덤.

const BASELINE = 0.15

export interface TeamRecord {
  teamId: string
  played: number
  wins: number
}

export interface TeamWeight {
  teamId: string
  weight: number
}

/** 팀별 (played, wins) → 가중치. played=0 이면 winRate 0 취급(중립적으로 동일해짐). */
export function recordsToWeights(records: TeamRecord[]): TeamWeight[] {
  return records.map(r => {
    const winRate = r.played > 0 ? r.wins / r.played : 0.5 // 경기 없으면 중립(0.5)
    return { teamId: r.teamId, weight: (1 - winRate) + BASELINE }
  })
}

/** 1픽(첫 추첨) 당첨 확률 — 표시용. weight 정규화. */
export function computeOdds(weights: TeamWeight[]): Record<string, number> {
  const total = weights.reduce((s, w) => s + w.weight, 0) || 1
  return Object.fromEntries(weights.map(w => [w.teamId, w.weight / total]))
}

/**
 * 가중치 기반 비복원 추첨으로 픽 순서 생성.
 * 가중치가 높을수록(=승률이 낮을수록) 앞 순서에 뽑힐 확률이 높다.
 * @param rng 0~1 난수 생성기 (테스트 주입용, 기본 Math.random)
 */
export function weightedOrder(
  weights: TeamWeight[],
  rng: () => number = Math.random,
): string[] {
  const pool = weights.map(w => ({ ...w }))
  const order: string[] = []
  while (pool.length > 0) {
    const total = pool.reduce((s, w) => s + w.weight, 0)
    let r = rng() * total
    let idx = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight
      if (r <= 0) { idx = i; break }
    }
    order.push(pool[idx].teamId)
    pool.splice(idx, 1)
  }
  return order
}
