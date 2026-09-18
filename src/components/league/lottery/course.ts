// 코스 — 세로형 하프코트. 월드 단위, y 는 아래로 증가.
//
// 참고: lazygyu/roulette (MIT, https://github.com/lazygyu/roulette) 의 코스 구성 방식을 참고했다.
// 그쪽은 세로 코스에 폴리라인 벽 + 회전 장애물을 배치하고 goalY 선 통과로 순위를 매긴다.
// 여기서는 그 "세로 지그재그 + 회전체 + 바닥 골라인" 골격만 빌렸다(물리 엔진·맵·렌더러 미사용).
//
// ⚠ 2026-09-19 전면 개편: **골인 = 바닥 한가운데 골대**.
// 예전엔 좌우 볼랙 선반에 공을 모아 두고, 레이스가 끝난 뒤에 order 순서대로 한 개씩
// 골대에 쏘았다("구석에 들어가서 레이스가 끝난 느낌이 안 난다"). 지금은 양쪽 벽이
// 가운데 **공 한 개 폭 슈트**로 모이고, 슈트 아래 림을 통과하는 순간이 곧 골인이다.
// 순위는 도착 순서 그 자체 — 연출과 결과가 같은 사건이 됐다.
//
// 이 파일은 DOM/React 를 전혀 참조하지 않는다 — Node 에서 그대로 import 해 결정론을 검증한다.

import { intRange, mulberry32, range, type Rng } from './rng'

export const COURSE_W = 24
/** 코트 위쪽 여백(구슬 스폰 구역) */
export const TOP_Y = -16
/** 팁오프 라인 — 출발 전 공이 이 위에 멈춰 있다(그림 전용, 심은 스텝을 돌리지 않는다) */
export const START_LINE_Y = 0

/** 림 중심 x 와 반폭 */
export const HOOP_X = 12
export const HOOP_HALF = 2.5

// ── 피니시: 퍼널 → 슈트 → 림 → 네트
/** 슈트 반폭. 공 지름 1.1 → 두 개가 나란히 못 들어간다(2.2 > 1.9). 이게 "한 줄 도착"의 근거다. */
export const CHUTE_HALF = 0.95
export const CHUTE_X0 = HOOP_X - CHUTE_HALF
export const CHUTE_X1 = HOOP_X + CHUTE_HALF
/** 슈트 입구(퍼널 목) */
export const CHUTE_TOP = 134
/** 퍼널이 벽에서 시작하는 높이 */
export const FUNNEL_TOP_Y = 122
/** 림 높이 · 네트 끝 */
export const RIM_Y = 142
export const NET_BOTTOM = 148
/** 마룻바닥이 끝나는 높이(= 슈트 입구). 이 아래는 골대만 있는 어두운 공간. */
export const FLOOR_Y = CHUTE_TOP
/** 백보드 — 슈트 뒤에 선다 */
export const BOARD_X0 = 7
export const BOARD_X1 = 17
export const BOARD_Y0 = CHUTE_TOP - 2
export const BOARD_Y1 = RIM_Y - 0.6

// ── 농구 장애물 (전부 step 카운트만으로 움직인다 → 결정론)
/** 스크린(픽) — 좌우로 미끄러지는 벽 2개.
 *  ⚠ 1개·길이 7 이었을 때 실측: 팀 공의 86% 가 **한 번도 안 닿고** 지나갔다(평균 접촉 0.25회).
 *  길이를 9 로 늘리고 서로 반대 방향으로 도는 2개를 다른 높이에 두어, 한쪽이 열리면
 *  다른 쪽이 그 자리를 막게 했다. 두 개가 동시에 같은 쪽을 비우는 순간이 없다. */
export const SCREEN_LEN = 11
/** 기울기 — 수평이면 마찰 0.004 에서 공이 그 위에 그대로 얹혀 한 주기를 기다린다.
 *  두 스크린의 기울기를 반대로 줘서 흘려보내는 방향이 갈린다(sim.ts) — 이게 섞임을 만든다. */
export const SCREEN_TILT = 1.2
export const SCREEN_X_MIN = 1.5
export const SCREEN_X_MAX = 11.5
/** 왕복 주기 3초 = 360스텝 */
export const SCREEN_PERIOD = 360
export const SCREEN1_Y = 80
export const SCREEN2_Y = 86.5

/** 샷클락 게이트 — 0.8초 닫히고 3.2초 열린다(주기 4초).
 *  ⚠ 2초/2초 였을 때 팀 공의 p95 대기가 2.07초였다 — 레이스가 그만큼 멎어 보인다.
 *  거기에 닫힌 바가 한쪽 끝에 **공 한 개 폭 틈**을 남겨(매 주기 좌우 교대) 쌓이지 않고 샌다. */
export const CLOCK_Y = 93
export const CLOCK_PERIOD = 480
export const CLOCK_CLOSED_STEPS = 96
/** 닫힌 바가 남기는 틈. 공 지름 1.1 보다 넉넉해야 구석에 물리지 않는다. */
export const CLOCK_GAP = 1.9

/** 리바운드 범퍼 — 반발 1.4 (변경 없음) */
export const BUMPER_REST = 1.4
export interface Bumper { x: number; y: number; r: number }
export const BUMPERS: Bumper[] = [
  { x: 5.5, y: 98, r: 1.0 },
  { x: 12, y: 99.6, r: 1.0 },
  { x: 18.5, y: 98, r: 1.0 },
]

/** 지역방어 슬로우존 — 충돌이 아니라 **감속**으로 막는다. 순수 곱셈이라 결정론. */
export const ZONE_Y0 = 103
export const ZONE_Y1 = 108
export const ZONE_DRAG = 0.985
/** 존 안에 웅크린 수비수 실루엣(그림 전용 — 등번호 없는 육각) */
export const ZONE_MARKS: { x: number; y: number }[] = [
  { x: 5, y: 105.5 },
  { x: 19, y: 105.5 },
]

/** 림 프로텍터 — 슈트 입구 바로 위에서 좌우로 흔들리는 큰 수비수. 공은 옆으로 돌아가야 한다. */
export const PROT_Y = 129
export const PROT_R = 0.9
/** 흔들림 폭. 키우면 퍼널 벽과의 여유가 줄어 끼임 위험이 커진다(±1.2 에서 최소 여유 3.46). */
export const PROT_SWAY = 1.2
/** 주기 2.5초 = 300스텝 */
export const PROT_PERIOD = 300
/** 들어올린 팔 — 중심 기준 오프셋 (안쪽 끝 → 바깥 위 끝) */
export const PROT_ARM = { ix: 0.62, iy: -0.62, ox: 1.75, oy: -1.9, thick: 0.22 }

/** 정적 선분. kind 는 렌더러가 무엇으로 그릴지 결정한다. */
export interface Seg {
  x1: number; y1: number; x2: number; y2: number
  rest: number
  kind: 'wall' | 'ramp' | 'floor' | 'funnel' | 'tip' | 'chute'
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
  arms: number
}

export interface Course {
  segs: Seg[]
  pegs: Peg[]
  wheel: Wheel
  bumpers: Bumper[]
  /** 스크린 2개의 등번호(그림 전용) — 같은 번호면 두 개가 한 선수처럼 읽힌다 */
  screenNum: number
  screenNum2: number
  /** 림 프로텍터 등번호(그림 전용) */
  protNum: number
  /** y 버킷 broad-phase (버킷 크기 BUCKET) */
  segBuckets: number[][]
  pegBuckets: number[][]
  bucketCount: number
}

export const BUCKET = 6

function bucketIndex(y: number): number {
  return Math.floor((y - TOP_Y) / BUCKET)
}

/** 0→1→0 삼각파. sin 을 쓰지 않는 이유는 rng.ts 주석 참조(초월함수 금지). */
function triangle(p: number, period: number): number {
  const half = period / 2
  const q = ((p % period) + period) % period
  return q < half ? q / half : (period - q) / half
}

/** 스크린 1의 왼쪽 끝 x */
export function screenX(step: number): number {
  return SCREEN_X_MIN + triangle(step, SCREEN_PERIOD) * (SCREEN_X_MAX - SCREEN_X_MIN)
}
/** 스크린 2의 왼쪽 끝 x — 스크린 1의 **거울상**이라 둘이 같은 쪽을 동시에 비우지 않는다 */
export function screenX2(step: number): number {
  return SCREEN_X_MIN + (1 - triangle(step, SCREEN_PERIOD)) * (SCREEN_X_MAX - SCREEN_X_MIN)
}

/** 림 프로텍터의 현재 중심 x */
export function protectorX(step: number): number {
  return HOOP_X + (triangle(step, PROT_PERIOD) * 2 - 1) * PROT_SWAY
}

/** 샷클락이 닫혀 있는가 */
export function clockClosed(step: number): boolean {
  return step % CLOCK_PERIOD < CLOCK_CLOSED_STEPS
}

/** 이번 주기의 틈이 왼쪽인가 — 주기마다 좌우가 바뀐다 */
export function clockGapLeft(step: number): boolean {
  return Math.floor(step / CLOCK_PERIOD) % 2 === 0
}

/** 닫힌 바의 양 끝 [x1, x2]. 한쪽에 CLOCK_GAP 만큼 틈이 남는다. */
export function clockBar(step: number): [number, number] {
  return clockGapLeft(step) ? [CLOCK_GAP, COURSE_W] : [0, COURSE_W - CLOCK_GAP]
}

/** 샷클락 표시값 24→0 (그림 전용) */
export function clockReadout(step: number): number {
  const p = step % CLOCK_PERIOD
  const within = p < CLOCK_CLOSED_STEPS
    ? p / CLOCK_CLOSED_STEPS
    : (p - CLOCK_CLOSED_STEPS) / (CLOCK_PERIOD - CLOCK_CLOSED_STEPS)
  return Math.max(0, 24 - Math.floor(within * 25))
}

/** 시드에서 코스를 짓는다. 같은 시드 → 완전히 같은 코스. */
export function buildCourse(seed: number): Course {
  const rng: Rng = mulberry32(seed ^ 0x5bf03635)
  const segs: Seg[] = []
  const pegs: Peg[] = []

  const push = (x1: number, y1: number, x2: number, y2: number, rest: number, kind: Seg['kind']) =>
    segs.push({ x1, y1, x2, y2, rest, kind })

  // ── 사이드라인(벽) — 퍼널이 시작되는 높이까지만. 그 아래는 퍼널이 벽 노릇을 한다.
  push(0, TOP_Y, 0, FUNNEL_TOP_Y, 0.08, 'wall')
  push(COURSE_W, TOP_Y, COURSE_W, FUNNEL_TOP_Y, 0.08, 'wall')

  // ── 팁오프 — 가운데 텐트가 공을 좌우로 가른다
  push(12, 3, 4.8, 11, 0.2, 'tip')
  push(12, 3, 19.2, 11, 0.2, 'tip')

  // ── 지그재그 램프 (페인트존 라인처럼 그려진다).
  //
  // ⚠ **페그를 램프와 같은 y 띠에 놓지 말 것.** 첫 튜닝에서 수비수 줄을 "램프 끝 4.2 아래"에
  // 뒀는데, 그 높이를 다음 램프가 가로질러서 페그와 비탈 사이 V 홈에 공이 끼었다 — 전원이
  // y=33 에 붙어 레이스가 6초째에 멈췄다. 램프 띠와 페그 띠는 **번갈아** 놓는다.
  const RAMP_PITCH = 15
  const RAMP_COUNT = 4
  for (let i = 0; i < RAMP_COUNT; i++) {
    const y0 = 18 + i * RAMP_PITCH
    const drop = range(rng, 10.5, 12.0)
    const goesRight = i % 2 === 0
    const endX = goesRight ? 17.8 : 6.2
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

  // ── 스핀무브 휠 (회전 장애물). 슬로우존(103~108) 아래, 팔 끝이 109.4~118.6.
  const wheel: Wheel = { x: 12, y: 114, len: 4.6, thick: 0.45, arms: 4 }

  // ── 퍼널 직전 조밀한 수비 필드. x 는 5~19 로 좁힌다 — 더 넓히면 퍼널 벽과 페그 사이에
  // 공 지름(1.1)보다 좁은 틈이 생겨 또 낀다.
  // ⚠ 간격을 좁히지 말 것. n=6·r=0.58 이었을 때 이웃한 두 페그 표면 사이가 1.17 로,
  //    공 지름 1.1 과 0.07 밖에 차이가 안 났다 — 실측에서 공이 그 틈에 물려 영영 안 내려왔다.
  //    n=5·r=0.5 이면 틈이 1.8 이라 공이 지나간다.
  for (let row = 0; row < 2; row++) {
    const y = 121 + row * 3.5
    const n = 5
    for (let k = 0; k < n; k++) {
      const off = row % 2 === 0 ? 0 : 14 / n / 2
      const x = 5 + (14 * (k + 0.5)) / n + off + range(rng, -0.35, 0.35)
      pegs.push({ x, y, r: 0.5, num: intRange(rng, 0, 55) })
    }
  }

  // ── 퍼널 → 슈트 → 림.
  // ⚠ 퍼널 끝점과 슈트 벽 위끝을 **정확히 같은 점**으로 둔다. 어긋나면 그 모서리가 오목해져
  //    공이 낀다(예전 볼랙 설계에서 실제로 12개 중 7개가 못 내려왔다).
  push(0, FUNNEL_TOP_Y, CHUTE_X0, CHUTE_TOP, 0.06, 'funnel')
  push(COURSE_W, FUNNEL_TOP_Y, CHUTE_X1, CHUTE_TOP, 0.06, 'funnel')
  // 슈트 — 림까지 수직. 공 한 개 폭이라 도착이 한 줄로 정렬된다.
  push(CHUTE_X0, CHUTE_TOP, CHUTE_X0, RIM_Y, 0.04, 'chute')
  push(CHUTE_X1, CHUTE_TOP, CHUTE_X1, RIM_Y, 0.04, 'chute')

  // ── ⚠ 끼임 방지 불변식: **선분에서 공 지름보다 가까운 페그는 버린다.**
  // 손으로 배치를 피해 다니는 것으로는 안 된다 — 두 번(램프 교차·램프 끝 모서리) 당했고,
  // 그때마다 레이스가 중간에 멎었다(에러는 없고 공만 안 내려온다). 규칙으로 못박는다.
  const MARBLE_D = 1.1
  const near = (p: Peg) => {
    for (const s of segs) {
      if (pointSegDist(p.x, p.y, s) < p.r + MARBLE_D + 0.25) return true
    }
    // 범퍼·휠과도 겹치면 안 된다
    for (const b of BUMPERS) {
      const dx = p.x - b.x, dy = p.y - b.y
      if (Math.sqrt(dx * dx + dy * dy) < p.r + b.r + MARBLE_D + 0.25) return true
    }
    const wdx = p.x - wheel.x, wdy = p.y - wheel.y
    if (Math.sqrt(wdx * wdx + wdy * wdy) < wheel.len + wheel.thick + MARBLE_D + 0.25) return true
    // 움직이는 것들이 지나다니는 띠는 통째로 비운다 — 여기에 페그가 있으면
    // 스크린·프로텍터가 공을 그 페그에 **눌러 박는다**(정적 검사로는 안 잡힌다).
    for (const sy of [SCREEN1_Y, SCREEN2_Y]) {
      if (p.y > sy - SCREEN_TILT - 2.5 && p.y < sy + SCREEN_TILT + 2.5) return true
    }
    if (p.y > CLOCK_Y - 2.5 && p.y < CLOCK_Y + 2.5) return true
    // 림 프로텍터: 흔들림 폭 + 팔 길이 + 공 지름만큼 비켜 둔다
    if (p.y > PROT_Y + PROT_ARM.oy - MARBLE_D - 1 && p.y < PROT_Y + PROT_R + MARBLE_D + 1
      && p.x > HOOP_X - PROT_SWAY - PROT_ARM.ox - MARBLE_D - 1
      && p.x < HOOP_X + PROT_SWAY + PROT_ARM.ox + MARBLE_D + 1) return true
    return false
  }
  const kept = pegs.filter(p => !near(p))
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

  return {
    segs, pegs, wheel, bumpers: BUMPERS,
    screenNum: intRange(rng, 0, 55),
    screenNum2: intRange(rng, 0, 55),
    protNum: intRange(rng, 0, 55),
    segBuckets, pegBuckets, bucketCount,
  }
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
