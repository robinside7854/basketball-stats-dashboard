// 결정론 물리 — 원 vs 선분 / 원 vs 원 만 쓰는 소형 엔진.
//
// 왜 planck/box2d 가 아닌가: 이 코스에 필요한 도형은 **원(구슬·페그) · 정적 선분(벽·램프·바닥) ·
// 회전 선분(휠)** 뿐이다. 그 세 가지면 200줄로 끝나고, 대신 다음을 확실히 통제할 수 있다.
//   1) 연산을 +,-,*,/ 와 Math.sqrt 로만 제한 → IEEE-754 가 결과를 유일하게 정한다.
//      sin/cos/pow/hypot 은 엔진 구현에 따라 마지막 비트가 갈릴 수 있어 물리에서 쓰지 않는다
//      (휠 회전조차 미리 박아 둔 cos/sin 상수의 곱셈으로 돌린다).
//   2) 번들 0KB · WASM 로딩 대기 없음.
// 참고 저장소(lazygyu/roulette, MIT)는 box2d-wasm 을 쓴다 — planck 가 아니다.
//
// 이 파일은 DOM 을 참조하지 않는다. Node 에서 두 번 돌려 체크섬을 비교할 수 있다.

import {
  BUCKET, bucketFor, buildCourse, COURSE_W, FLOOR_Y, GATE_APEX_Y, GATE_X0, GATE_X1,
  HOOP_HALF, HOOP_X, NET_BOTTOM, RIM_Y, SHELF_INNER_Y, TOP_Y,
  type Course,
} from './course'
import { hashSeed, intRange, mulberry32, range } from './rng'

export const SIM_HZ = 120
export const SIM_DT = 1 / SIM_HZ

/** 중력(월드단위/s²) — 코스 높이 142 를 램프에 튕기며 내려오는 데 약 13초 걸리도록 맞춘 값 */
const G = 20
/** 스텝당 공기저항 (상수 곱 — Math.pow 를 쓰지 않는다) */
const DRAG = 0.99925
/** 속도 상한. dt=1/120 에서 한 스텝 이동 0.45 < 반지름 0.55 → 터널링 없음 */
const VMAX = 54
const MARBLE_R = 0.55
/** 트래픽용 중립 구슬 수 */
export const NEUTRAL_COUNT = 6

export interface Marble {
  /** 팀 구슬이면 team id, 중립이면 null */
  team: string | null
  x: number; y: number
  vx: number; vy: number
  r: number
  /** 시각용 회전(심에서 결정론적으로 누적) */
  rot: number
  /** 공개 단계에서 심 밖으로 빠졌는지 */
  out: boolean
}

export type SimMode = 'race' | 'settle'

export interface World {
  course: Course
  marbles: Marble[]
  step: number
  /** 휠 방향 벡터 (cos, sin) */
  wc: number; ws: number
  /** 이번 스텝에 세게 부딪힌 페그 인덱스 */
  hits: number[]
  hitCount: number
}

// 휠: 2.4초에 1회전 = 288스텝. θ = 2π/288 의 cos/sin 을 상수로 박는다.
const WC = 0.99976196
const WS = 0.02181486
/** 각속도 rad/s — 접촉점 속도 계산용 */
const WHEEL_OMEGA = 2.617994

export function createWorld(order: string[], seed?: number): World {
  const s = seed ?? hashSeed(order.join('|'))
  const course = buildCourse(s)
  const rng = mulberry32(s)
  const marbles: Marble[] = []

  // 스폰 순서: 팀 구슬 먼저, 그 다음 중립. 순서가 곧 충돌 해소 순서라 결정론에 포함된다.
  const total = order.length + NEUTRAL_COUNT
  const lanes: number[] = []
  for (let i = 0; i < total; i++) lanes.push(i)
  // 시드 셔플(Fisher-Yates) — 팀 구슬이 항상 왼쪽에서 출발하지 않게
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = intRange(rng, 0, i)
    const t = lanes[i]; lanes[i] = lanes[j]; lanes[j] = t
  }

  const spawn = (team: string | null, lane: number) => {
    const col = lane % 6
    const row = Math.floor(lane / 6)
    marbles.push({
      team,
      x: 2.6 + col * 3.76 + range(rng, -0.55, 0.55),
      y: TOP_Y + 1.5 + row * 2.6 + range(rng, -0.4, 0.4),
      vx: range(rng, -2.2, 2.2),
      vy: range(rng, 0, 1.5),
      r: MARBLE_R,
      rot: range(rng, 0, 6),
      out: false,
    })
  }

  order.forEach((tid, i) => spawn(tid, lanes[i]))
  for (let i = 0; i < NEUTRAL_COUNT; i++) spawn(null, lanes[order.length + i])

  return { course, marbles, step: 0, wc: 1, ws: 0, hits: [], hitCount: 0 }
}

/** 한 스텝(1/120초). mode='settle' 이면 중력을 키우고 림 위를 비우는 힘을 준다. */
export function stepWorld(w: World, mode: SimMode): void {
  const { course } = w
  const ms = w.marbles
  w.hitCount = 0

  // 휠 회전 — 상수 곱 후 재정규화(누적 오차조차 모든 기기에서 동일하다)
  const nc = w.wc * WC - w.ws * WS
  const nsv = w.wc * WS + w.ws * WC
  const norm = Math.sqrt(nc * nc + nsv * nsv)
  w.wc = nc / norm
  w.ws = nsv / norm

  const g = mode === 'settle' ? G * 3.2 : G // 정리 단계는 중력만 키운다

  for (let i = 0; i < ms.length; i++) {
    const m = ms[i]
    if (m.out) continue
    m.vy += g * SIM_DT

    // 정리 단계의 **국소** 넛지 — 게이트 텐트 꼭대기에 올라앉은 공만 좌우로 민다.
    // ⚠ 범위를 넓히지 말 것: 예전엔 ±6 폭으로 밀었다가 공이 오른쪽 벽·퍼널 모서리에
    // 눌려 박혀 절반이 바닥에 못 갔다. 여기서 미는 곳은 벽에서 9 이상 떨어진 한가운데뿐이다.
    if (mode === 'settle' && m.y < SHELF_INNER_Y && m.y > GATE_APEX_Y - 3) {
      const dxh = m.x - HOOP_X
      if (dxh > -2.6 && dxh < 2.6) m.vx += (dxh >= 0 ? 14 : -14) * SIM_DT
    }

    m.vx *= DRAG
    m.vy *= DRAG
    const sp2 = m.vx * m.vx + m.vy * m.vy
    if (sp2 > VMAX * VMAX) {
      const k = VMAX / Math.sqrt(sp2)
      m.vx *= k; m.vy *= k
    }
    m.x += m.vx * SIM_DT
    m.y += m.vy * SIM_DT
    m.rot += m.vx * SIM_DT * 1.6
  }

  // ── 정적 선분 / 페그
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i]
    if (m.out) continue
    const b = bucketFor(m.y, course.bucketCount)
    for (let d = -1; d <= 1; d++) {
      const bi = b + d
      if (bi < 0 || bi >= course.bucketCount) continue
      const sl = course.segBuckets[bi]
      for (let k = 0; k < sl.length; k++) {
        const s = course.segs[sl[k]]
        if (s.kind === 'gate' && mode !== 'race' && mode !== 'settle') continue
        collideSegment(m, s.x1, s.y1, s.x2, s.y2, s.rest, 0)
      }
      const pl = course.pegBuckets[bi]
      for (let k = 0; k < pl.length; k++) {
        const pi = pl[k]
        const p = course.pegs[pi]
        if (collideCircle(m, p.x, p.y, p.r, 0.46)) {
          w.hits[w.hitCount++] = pi
        }
      }
    }
  }

  // ── 회전 휠 (팔 4개)
  const wh = course.wheel
  for (let a = 0; a < wh.arms; a++) {
    // 팔 방향 = (wc,ws) 를 90°씩 돌린 것 — 부호 교환뿐이라 정확하다
    let dx = w.wc, dy = w.ws
    if (a === 1) { dx = -w.ws; dy = w.wc }
    else if (a === 2) { dx = -w.wc; dy = -w.ws }
    else if (a === 3) { dx = w.ws; dy = -w.wc }
    const ex = wh.x + dx * wh.len
    const ey = wh.y + dy * wh.len
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]
      if (m.out) continue
      if (m.y < wh.y - wh.len - 3 || m.y > wh.y + wh.len + 3) continue
      collideSegment(m, wh.x, wh.y, ex, ey, 0.42, wh.thick, wh.x, wh.y, WHEEL_OMEGA)
    }
  }

  // ── 구슬끼리 (최대 20개 — O(n²) 로 충분하고, 고정 순회 순서가 결정론을 지킨다)
  for (let i = 0; i < ms.length; i++) {
    const a = ms[i]
    if (a.out) continue
    for (let j = i + 1; j < ms.length; j++) {
      const c = ms[j]
      if (c.out) continue
      const dx = c.x - a.x, dy = c.y - a.y
      const d2 = dx * dx + dy * dy
      const min = a.r + c.r
      if (d2 >= min * min || d2 === 0) continue
      const d = Math.sqrt(d2)
      const nx = dx / d, ny = dy / d
      const push = (min - d) / 2
      a.x -= nx * push; a.y -= ny * push
      c.x += nx * push; c.y += ny * push
      const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny
      if (rel > 0) continue
      const imp = -1.34 * rel / 2 // 반발 0.34
      a.vx -= imp * nx; a.vy -= imp * ny
      c.vx += imp * nx; c.vy += imp * ny
    }
  }

  // ── 좌우 이탈 보정 (벽 선분이 놓친 경우의 안전망)
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i]
    if (m.out) continue
    if (m.x < m.r) { m.x = m.r; if (m.vx < 0) m.vx = -m.vx * 0.2 }
    if (m.x > COURSE_W - m.r) { m.x = COURSE_W - m.r; if (m.vx > 0) m.vx = -m.vx * 0.2 }
    // 안전망 — 선반보다 확실히 아래. 선반·텐트는 선분 충돌이 처리한다.
    if (m.y > FLOOR_Y + 1.5) { m.y = FLOOR_Y + 1.5; if (m.vy > 0) m.vy = -m.vy * 0.1 }
  }

  w.step++
}

/** 원 vs 선분. thick>0 이면 두꺼운 선분(캡슐). omega 를 주면 (cx,cy) 중심 회전체로 본다. */
function collideSegment(
  m: Marble, x1: number, y1: number, x2: number, y2: number, rest: number, thick: number,
  cx = 0, cy = 0, omega = 0,
): void {
  const dx = x2 - x1, dy = y2 - y1
  const L2 = dx * dx + dy * dy
  let t = L2 === 0 ? 0 : ((m.x - x1) * dx + (m.y - y1) * dy) / L2
  if (t < 0) t = 0; else if (t > 1) t = 1
  const px = x1 + dx * t, py = y1 + dy * t
  let ox = m.x - px, oy = m.y - py
  const d2 = ox * ox + oy * oy
  const reach = m.r + thick
  if (d2 >= reach * reach) return
  let d = Math.sqrt(d2)
  if (d === 0) {
    // 선분 위에 정확히 겹침 — 법선을 선분 수직으로 잡는다
    const L = Math.sqrt(L2) || 1
    ox = -dy / L; oy = dx / L; d = 1
  }
  const nx = ox / d, ny = oy / d
  m.x = px + nx * reach
  m.y = py + ny * reach

  // 접촉점의 속도(회전체면 ω × r)
  let cvx = 0, cvy = 0
  if (omega !== 0) {
    cvx = -omega * (py - cy)
    cvy = omega * (px - cx)
  }
  const rvx = m.vx - cvx, rvy = m.vy - cvy
  const vn = rvx * nx + rvy * ny
  if (vn < 0) {
    const jn = -(1 + rest) * vn
    m.vx += jn * nx
    m.vy += jn * ny
    // 접선 마찰 — ⚠ 값이 크면 안 된다. 램프에 얹힌 공은 **매 스텝** 접촉을 해소하므로
    // 0.05 만 돼도 120Hz 에서 1초에 접선속도가 0.2% 로 줄어 공이 비탈 위에 그대로 멈춘다
    // (첫 튜닝에서 실제로 전원이 y=35 에 붙어 버렸다).
    const tx = -ny, ty = nx
    const vt = (m.vx - cvx) * tx + (m.vy - cvy) * ty
    m.vx -= vt * 0.004 * tx
    m.vy -= vt * 0.004 * ty
  }
  if (omega !== 0) {
    // 회전체는 공을 떠민다
    m.vx += cvx * 0.22
    m.vy += cvy * 0.22
  }
}

/** 원 vs 정적 원. 세게 맞으면 true(소리용). */
function collideCircle(m: Marble, cx: number, cy: number, cr: number, rest: number): boolean {
  const dx = m.x - cx, dy = m.y - cy
  const d2 = dx * dx + dy * dy
  const min = m.r + cr
  if (d2 >= min * min) return false
  const d = Math.sqrt(d2) || 0.0001
  const nx = dx / d, ny = dy / d
  m.x = cx + nx * min
  m.y = cy + ny * min
  const vn = m.vx * nx + m.vy * ny
  if (vn >= 0) return false
  const jn = -(1 + rest) * vn
  m.vx += jn * nx
  m.vy += jn * ny
  return jn > 4
}

/** 팀 구슬 중 가장 앞선(아래쪽) 것 — 카메라 추적 대상 */
export function leaderIndex(w: World): number {
  let best = -1, bestY = -Infinity
  for (let i = 0; i < w.marbles.length; i++) {
    const m = w.marbles[i]
    if (!m.team || m.out) continue
    if (m.y > bestY) { bestY = m.y; best = i }
  }
  return best
}

export function findMarble(w: World, teamId: string): Marble | undefined {
  return w.marbles.find(m => m.team === teamId)
}

/** 결정론 검증용 체크섬 — 위치·속도를 1/1000 단위로 굳혀 이어 붙인다 */
export function checksum(w: World): string {
  let h = 0x811c9dc5
  const put = (v: number) => {
    const n = Math.round(v * 1000) | 0
    h ^= n & 0xff; h = Math.imul(h, 0x01000193)
    h ^= (n >>> 8) & 0xff; h = Math.imul(h, 0x01000193)
    h ^= (n >>> 16) & 0xff; h = Math.imul(h, 0x01000193)
    h ^= (n >>> 24) & 0xff; h = Math.imul(h, 0x01000193)
  }
  put(w.step); put(w.wc); put(w.ws)
  for (const m of w.marbles) { put(m.x); put(m.y); put(m.vx); put(m.vy); put(m.rot) }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export { COURSE_W, FLOOR_Y, SHELF_INNER_Y, GATE_X0, GATE_X1, GATE_APEX_Y, HOOP_X, HOOP_HALF, RIM_Y, NET_BOTTOM, TOP_Y, BUCKET }
