// 코스 — 세로형 하프코트. 월드 단위(1 = 골대 링 반지름의 약 0.4배), y 는 아래로 증가.
//
// 참고: lazygyu/roulette (MIT, https://github.com/lazygyu/roulette) 의 코스 구성 방식을 참고했다.
// 그쪽은 폭 25 × 높이 111 의 세로 코스에 폴리라인 벽 + 회전 장애물을 배치하고 goalY 선 통과로
// 순위를 매긴다. 여기서는 그 "세로 지그재그 + 회전체 + 바닥 골라인" 골격만 빌리고,
// 물리 엔진(box2d-wasm)·맵 데이터·렌더러는 쓰지 않았다(코드 복제 없음).
//
// 이 파일은 DOM/React 를 전혀 참조하지 않는다 — Node 에서 그대로 import 해 결정론을 검증한다.

import { intRange, mulberry32, range, type Rng } from './rng'

export const COURSE_W = 24
/** 볼랙 선반의 바깥(낮은) 끝 — 구슬이 최종적으로 쌓이는 높이 */
export const FLOOR_Y = 124
/** 선반의 안쪽(높은) 끝 */
export const SHELF_INNER_Y = 119
/** 코트 위쪽 여백(구슬 스폰 구역) */
export const TOP_Y = -16
/** 림 중심 x 와 반폭 */
export const HOOP_X = 12
export const HOOP_HALF = 2.5
/** 게이트(림 덮개) 텐트의 좌우 끝과 꼭대기 */
export const GATE_X0 = 8.5
export const GATE_X1 = 15.5
export const GATE_APEX_Y = 115.5
/** 림 높이 · 네트 끝 */
export const RIM_Y = 131
export const NET_BOTTOM = 137
/** 백보드 (퍼널 목과 폭이 같다 — 퍼널 벽이 곧 백보드 지지대로 읽힌다) */
export const BOARD_X0 = 7.5
export const BOARD_X1 = 16.5
export const BOARD_Y0 = 103
export const BOARD_Y1 = 117

/** 정적 선분. kind 는 렌더러가 무엇으로 그릴지 결정한다. */
export interface Seg {
  x1: number; y1: number; x2: number; y2: number
  rest: number
  kind: 'wall' | 'ramp' | 'floor' | 'gate' | 'funnel' | 'tip'
}

/** 수비수 페그 */
export interface Peg {
  x: number; y: number; r: number
  /** 등번호 — 이모지 대신 숫자를 쓴다 */
  num: number
}

export interface Wheel {
  x: number; y: number
  /** 팔 길이 */
  len: number
  /** 팔 두께(충돌 반경) */
  thick: number
  /** 스텝당 회전(도가 아니라 미리 계산된 cos/sin 상수로 돈다 — sim.ts 참조) */
  arms: number
}

export interface Course {
  segs: Seg[]
  pegs: Peg[]
  wheel: Wheel
  /** y 버킷 broad-phase (버킷 크기 BUCKET) */
  segBuckets: number[][]
  pegBuckets: number[][]
  bucketCount: number
}

export const BUCKET = 6

function bucketIndex(y: number): number {
  return Math.floor((y - TOP_Y) / BUCKET)
}

/** 시드에서 코스를 짓는다. 같은 시드 → 완전히 같은 코스. */
export function buildCourse(seed: number): Course {
  const rng: Rng = mulberry32(seed ^ 0x5bf03635)
  const segs: Seg[] = []
  const pegs: Peg[] = []

  const push = (x1: number, y1: number, x2: number, y2: number, rest: number, kind: Seg['kind']) =>
    segs.push({ x1, y1, x2, y2, rest, kind })

  // ── 사이드라인(벽)
  push(0, TOP_Y, 0, FLOOR_Y, 0.08, 'wall')
  push(COURSE_W, TOP_Y, COURSE_W, FLOOR_Y, 0.08, 'wall')

  // ── 팁오프 — 가운데 텐트가 공을 좌우로 가른다
  push(12, 2, 4.8, 10, 0.2, 'tip')
  push(12, 2, 19.2, 10, 0.2, 'tip')

  // ── 지그재그 램프 (페인트존 라인처럼 그려진다). 램프 끝에 6.2 폭의 통로를 남겨 공이 쏟아진다.
  //
  // ⚠ **페그를 램프와 같은 y 띠에 놓지 말 것.** 첫 튜닝에서 수비수 줄을 "램프 끝 4.2 아래"에
  // 뒀는데, 그 높이를 다음 램프가 가로질러서 페그와 비탈 사이 V 홈에 공이 끼었다 — 전원이
  // y=33 에 붙어 레이스가 6초째에 멈췄다. 램프 띠와 페그 띠는 **번갈아** 놓는다.
  const RAMP_PITCH = 15
  const RAMP_COUNT = 5
  // ⚠ 마지막 램프의 **진행 방향**이 공이 쌓일 선반을 결정한다(실측: 270개 중 242개가 한쪽).
  // 퍼널·휠·페그로는 그 수평 관성이 지워지지 않는다 — 휠의 밀어내는 힘을 0 으로 해도
  // 분포가 그대로였다. 그래서 방향 자체를 시드로 뒤집는다: 추첨마다 쌓이는 쪽이 바뀌고,
  // 같은 추첨을 보는 사람끼리는 여전히 똑같은 화면을 본다.
  const lastGoesRight = rng() < 0.5
  for (let i = 0; i < RAMP_COUNT; i++) {
    const y0 = 18 + i * RAMP_PITCH
    const drop = range(rng, 10.5, 12.0)
    // ⚠ 마지막 램프는 **가운데**로 내보낸다. 끝을 한쪽에 두면 공이 전부 그쪽 선반에만
    // 쌓여(첫 렌더 실측: 9개 전부 오른쪽) 반대쪽 볼랙이 텅 빈 채로 결과 화면이 나온다.
    const last = i === RAMP_COUNT - 1
    const goesRight = last ? lastGoesRight : i % 2 === 0
    const endX = last ? HOOP_X : (goesRight ? 17.8 : 6.2)
    if (goesRight) {
      push(0.5, y0, endX, y0 + drop, 0.16, 'ramp')
    } else {
      push(COURSE_W - 0.5, y0, endX, y0 + drop, 0.16, 'ramp')
    }
    // 램프 띠가 끝난 뒤(y0+RAMP_PITCH 직전) 빈 띠에 수비수 한 줄
    const rowY = y0 + 12.5
    const count = intRange(rng, 5, 6)
    for (let k = 0; k < count; k++) {
      const x = 2.6 + ((COURSE_W - 5.2) * (k + 0.5)) / count + range(rng, -0.6, 0.6)
      pegs.push({ x, y: rowY + range(rng, -0.5, 0.5), r: 0.62, num: intRange(rng, 0, 55) })
    }
  }

  // ── 스핀무브 휠 (회전 장애물). 마지막 램프(78~88) 아래 빈 공간.
  const wheel: Wheel = { x: 12, y: 99, len: 4.6, thick: 0.45, arms: 4 }

  // ── 퍼널 직전 조밀한 수비 필드. x 는 5~19 로 좁힌다 — 더 넓히면 퍼널 벽과 페그 사이에
  // 공 지름(1.1)보다 좁은 틈이 생겨 또 낀다.
  for (let row = 0; row < 2; row++) {
    const y = 106 + row * 3.4
    const n = 6
    for (let k = 0; k < n; k++) {
      const off = row % 2 === 0 ? 0 : 14 / n / 2
      const x = 5 + (14 * (k + 0.5)) / n + off + range(rng, -0.35, 0.35)
      pegs.push({ x, y, r: 0.58, num: intRange(rng, 0, 55) })
    }
  }

  // ── 퍼널 — 백보드 폭으로 좁힌다
  push(0, 108, 7.2, 115, 0.1, 'funnel')
  push(COURSE_W, 108, 16.8, 115, 0.1, 'funnel')

  // ── 볼랙 선반 + 게이트 텐트.
  //
  // ⚠ 림 위를 "힘으로" 비우려던 첫 설계는 실패했다 — 정리 단계에 바깥으로 미는 힘을 주니
  // 구슬이 오른쪽 벽과 퍼널 모서리에 **눌려 박혀** 12개 중 7개가 바닥에 못 갔다.
  // 지금은 힘이 아니라 **모양**으로 비운다: 가운데 게이트가 텐트(↑)라 구슬이 저절로 좌우로
  // 굴러떨어지고, 선반은 바깥쪽이 낮아 벽 쪽에 모인다. 정리 단계는 중력만 키운다.
  push(0, FLOOR_Y, GATE_X0, SHELF_INNER_Y, 0.05, 'floor')
  push(GATE_X1, SHELF_INNER_Y, COURSE_W, FLOOR_Y, 0.05, 'floor')
  push(GATE_X0, SHELF_INNER_Y, HOOP_X, GATE_APEX_Y, 0.05, 'gate')
  push(HOOP_X, GATE_APEX_Y, GATE_X1, SHELF_INNER_Y, 0.05, 'gate')

  // ── ⚠ 끼임 방지 불변식: **선분에서 공 지름보다 가까운 페그는 버린다.**
  // 손으로 배치를 피해 다니는 것으로는 안 된다 — 두 번(램프 교차·램프 끝 모서리) 당했고,
  // 그때마다 레이스가 중간에 멎었다(에러는 없고 공만 안 내려온다). 규칙으로 못박는다.
  const MARBLE_D = 1.1
  const kept = pegs.filter(p => {
    for (const s of segs) {
      if (s.kind === 'floor' || s.kind === 'gate') continue
      if (pointSegDist(p.x, p.y, s) < p.r + MARBLE_D + 0.25) return false
    }
    return true
  })
  pegs.length = 0
  pegs.push(...kept)

  // ── broad-phase 버킷
  const bucketCount = bucketIndex(NET_BOTTOM + BUCKET) + 2
  const segBuckets: number[][] = Array.from({ length: bucketCount }, () => [])
  const pegBuckets: number[][] = Array.from({ length: bucketCount }, () => [])
  segs.forEach((s, i) => {
    const lo = Math.max(0, bucketIndex(Math.min(s.y1, s.y2) - 1))
    const hi = Math.min(bucketCount - 1, bucketIndex(Math.max(s.y1, s.y2) + 1))
    for (let b = lo; b <= hi; b++) segBuckets[b].push(i)
  })
  pegs.forEach((p, i) => {
    const lo = Math.max(0, bucketIndex(p.y - p.r - 1))
    const hi = Math.min(bucketCount - 1, bucketIndex(p.y + p.r + 1))
    for (let b = lo; b <= hi; b++) pegBuckets[b].push(i)
  })

  return { segs, pegs, wheel, segBuckets, pegBuckets, bucketCount }
}

function pointSegDist(px: number, py: number, s: Seg): number {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1
  const L2 = dx * dx + dy * dy
  let t = L2 === 0 ? 0 : ((px - s.x1) * dx + (py - s.y1) * dy) / L2
  if (t < 0) t = 0; else if (t > 1) t = 1
  const ox = px - (s.x1 + dx * t), oy = py - (s.y1 + dy * t)
  return Math.sqrt(ox * ox + oy * oy)
}

export function bucketFor(y: number, bucketCount: number): number {
  const b = bucketIndex(y)
  return b < 0 ? 0 : b >= bucketCount ? bucketCount - 1 : b
}
