// 시드 탐색 — "보이는 레이스의 도착 순서 = 서버가 정한 order" 를 만드는 유일한 장치.
//
// 물리가 결정론이므로 (order, seed) 하나가 도착 순서 하나를 정한다. 그래서 seed 를 바꿔 가며
// 헤드리스로 돌려 보고, 도착 순서가 order 와 같아지는 seed 를 쓴다. 렌더링은 하지 않으므로
// 한 번 돌리는 데 수 ms 면 끝난다.
//
// ⚠ 기대 시도 횟수는 팀 수의 계승이다 — 3팀 6회, 4팀 24회, 6팀 720회.
// 즉 **5팀 이상에서는 예산 안에 거의 못 찾는다**. 그때는 실패가 아니라 폴백이다:
// 슈트 게이트를 켜서 order 순서대로 한 개씩 내보낸다(sim.ts 참조). 맞는 시드를 찾은
// 경우 게이트는 만들어지지도 않으므로 연출에 흔적이 남지 않는다.
//
// DOM 을 참조하지 않는다 — Node 에서 그대로 돌려 통계를 잰다.

import { hashSeed } from './rng'
import { createWorld, raceOver, SIM_HZ, stepWorld } from './sim'

/** 헤드리스 한 판의 최대 스텝 — 25초. 이 안에 못 끝내면 실격(끼임 취급) */
export const MAX_SIM_STEPS = SIM_HZ * 25

export interface SimOutcome {
  /** 팀 공이 림을 통과한 순서 */
  goals: string[]
  /** 팀 공이 전부 들어왔는가 */
  complete: boolean
  /** 마지막 팀 골인 스텝 */
  endStep: number
  /** 골인한 공(중립 포함) 비율 0~1 */
  settled: number
}

/**
 * 한 판을 헤드리스로 돌린다.
 * expect 를 주면 순서가 어긋나는 즉시 중단한다(탐색 실패를 싸게 버린다).
 */
export function simulateOnce(order: string[], seed: number, expect?: string[]): SimOutcome {
  const w = createWorld(order, seed, false)
  let endStep = -1
  while (w.step < MAX_SIM_STEPS) {
    stepWorld(w)
    if (w.justScored) {
      const k = w.goals.length - 1
      if (expect && w.goals[k] !== expect[k]) {
        return { goals: w.goals, complete: false, endStep: -1, settled: 0 }
      }
    }
    if (raceOver(w)) { endStep = w.step; break }
  }
  const complete = raceOver(w)
  let scored = 0
  for (const m of w.marbles) if (m.scored) scored++
  return { goals: w.goals, complete, endStep, settled: scored / w.marbles.length }
}

export interface SeedSearch {
  seed: number
  matched: boolean
  tries: number
  ms: number
  /** 맞는 시드일 때 마지막 골인 스텝 */
  endStep: number
}

export interface SearchOpts {
  maxTries?: number
  budgetMs?: number
  /** 시간 측정 함수 — 브라우저는 performance.now, Node 는 Date.now 로 충분 */
  now?: () => number
}

/**
 * order 와 도착 순서가 같은 시드를 찾는다.
 * 못 찾으면 matched:false 와 base 시드를 돌려준다 — 호출자가 슈트 게이트를 켜야 한다.
 */
export function findSeed(order: string[], opts: SearchOpts = {}): SeedSearch {
  const maxTries = opts.maxTries ?? 400
  const budgetMs = opts.budgetMs ?? 2500
  const now = opts.now ?? (typeof performance !== 'undefined' ? () => performance.now() : () => Date.now())
  const base = hashSeed(order.join('|'))
  const t0 = now()
  for (let k = 0; k < maxTries; k++) {
    const seed = (base + k) >>> 0
    const r = simulateOnce(order, seed, order)
    if (r.complete) {
      return { seed, matched: true, tries: k + 1, ms: now() - t0, endStep: r.endStep }
    }
    if (now() - t0 > budgetMs) {
      return { seed: base, matched: false, tries: k + 1, ms: now() - t0, endStep: -1 }
    }
  }
  return { seed: base, matched: false, tries: maxTries, ms: now() - t0, endStep: -1 }
}

/**
 * 브라우저용 — 탐색을 조각내 돌린다. 팁오프 대기 동안 「출발」 버튼이 먹통이 되면 안 된다.
 * onDone 은 정확히 한 번 불린다. 반환값은 취소 함수.
 */
export function findSeedChunked(
  order: string[],
  onDone: (r: SeedSearch) => void,
  opts: SearchOpts & { chunk?: number } = {},
): () => void {
  const maxTries = opts.maxTries ?? 400
  const budgetMs = opts.budgetMs ?? 2500
  const chunk = opts.chunk ?? 8
  const now = opts.now ?? (typeof performance !== 'undefined' ? () => performance.now() : () => Date.now())
  const base = hashSeed(order.join('|'))
  const t0 = now()
  let k = 0
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null

  function run() {
    if (cancelled) return
    for (let c = 0; c < chunk && k < maxTries; c++, k++) {
      const seed = (base + k) >>> 0
      const r = simulateOnce(order, seed, order)
      if (r.complete) {
        onDone({ seed, matched: true, tries: k + 1, ms: now() - t0, endStep: r.endStep })
        return
      }
    }
    if (k >= maxTries || now() - t0 > budgetMs) {
      onDone({ seed: base, matched: false, tries: k, ms: now() - t0, endStep: -1 })
      return
    }
    timer = setTimeout(run, 0)
  }
  timer = setTimeout(run, 0)

  return () => {
    cancelled = true
    if (timer) clearTimeout(timer)
  }
}
