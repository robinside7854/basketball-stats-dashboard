// 코스 — 세로형 하프코트. 월드 단위, y 는 아래로 증가.
//
// 참고: lazygyu/roulette (MIT, https://github.com/lazygyu/roulette) 의 코스 구성 방식을 참고했다.
// 그쪽은 세로 코스에 폴리라인 벽 + 회전 장애물을 배치하고 goalY 선 통과로 순위를 매긴다.
// 여기서는 그 "세로 지그재그 + 회전체 + 바닥 골라인" 골격만 빌렸다(물리 엔진·맵·렌더러 미사용).
//
// ── 골인 = 바닥 한가운데 골대 ────────────────────────────────────────────
// 양쪽 벽이 가운데 **공 한 개 폭 슈트**로 모이고, 슈트 아래 림을 통과하는 순간이 곧 골인이다.
// 순위는 도착 순서 그 자체 — 연출과 결과가 같은 사건이다.
//
// ── 2026-09-19 3차 개편: 「한 레인으로 흘러내리는 코스」를 버렸다 ────────
// 실측(6팀 50판)이 문제를 정확히 짚어 줬다.
//   · 램프 직후 좌/중/우 = **100 / 0 / 0**  (마지막 램프가 한쪽으로만 쏟아냈다)
//   · 중간 높이 x 엔트로피 0.94 / 3.00      (사실상 한 줄)
//   · 림 프로텍터 접촉 **0.00회**            (공이 그 근처를 지나가질 않았다)
//   · 범퍼 3개의 트래픽 분위수 0.32/0.06/0.02 (아무도 안 다니는 자리에 서 있었다)
// 그래서 (1) 마지막 램프를 **가운데 스플리터 쐐기**로 바꿔 양쪽으로 갈라 보내고,
// (2) 전폭 파친코 페그 밭으로 x 를 섞고, (3) 그 아래를 **3개 레인**(칸막이)으로 나눠
// 각 레인에 서로 다른 장애물을 넣었다. 레인은 샷클락 위에서 다시 합쳐진다.
//
// ── 시드마다 다른 코스 ───────────────────────────────────────────────────
// 골격(벽·팁오프·퍼널·슈트·골대)은 고정이고 — 안 그러면 하프코트로 안 읽힌다 —
// 그 사이의 **램프 수·방향·스크린 높이·레인별 장애물 배치·페그 패턴·빔 방향·범퍼 위치**를
// 전부 같은 시드 난수에서 뽑는다. 같은 시드면 어느 기기에서도 똑같은 코스가 나온다.
// 시드 탐색(search.ts)이 시드를 돌려 보는 것은 곧 **레이아웃을 돌려 보는 것**이기도 하고,
// 완주 검증이 레이아웃마다 실행되므로 끼는 배치는 그 자리에서 탈락한다.
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

// ── 고정 골격: 아래쪽 마무리 구간 ─────────────────────────────────────────
/** 슈트 반폭. 공 지름 1.1 → 두 개가 나란히 못 들어간다(2.2 > 1.9). 이게 "한 줄 도착"의 근거다. */
export const CHUTE_HALF = 0.95
export const CHUTE_X0 = HOOP_X - CHUTE_HALF
export const CHUTE_X1 = HOOP_X + CHUTE_HALF
export const CHUTE_TOP = 141
export const FUNNEL_TOP_Y = 129
export const RIM_Y = 149
export const NET_BOTTOM = 155
/** 마룻바닥이 끝나는 높이(= 슈트 입구). 이 아래는 골대만 있는 어두운 공간. */
export const FLOOR_Y = CHUTE_TOP
/** 백보드 — 슈트 뒤에 선다 */
export const BOARD_X0 = 7
export const BOARD_X1 = 17
export const BOARD_Y0 = CHUTE_TOP - 2
export const BOARD_Y1 = RIM_Y - 0.6

// ── 고정 골격: 중단 구조물의 높이 ────────────────────────────────────────
// ── 중단 분배기: **모으고(V) → 두 번 가른다(텐트 2단)**
//
// ⚠ 여기까지 오는 데 세 번 틀렸다. 남겨 둔다 — 같은 실수를 또 하지 않으려고.
//   1) 방향성 지그재그 램프로 끝냈더니 램프 직후 분포가 **100 / 0 / 0**. 램프는 본질적으로
//      한쪽으로 쏟는다.
//   2) 가운데 쐐기 하나를 놓았더니 **42 / 0 / 58**. 쐐기의 그림자가 정확히 가운데 레인이라
//      가운데가 굶는다.
//   3) 2단 쐐기를 덧댔더니 그대로 **42 / 0 / 58**. 왼쪽으로 가던 공은 왼쪽 날개만 탄다 —
//      **관성은 쐐기로 못 이긴다.**
// 그래서 순서를 뒤집었다: 먼저 V 로 가운데에 모아 **입구 위치를 고정**하고(관성이 아래로
// 정렬된다), 그 다음 텐트 두 단이 1→2→4 갈래로 가른다. 텐트 날개를 가파르게(dx≪dy) 둬야
// 옆으로 쏘지 않고, 2단 꼭짓점은 1단이 실제로 떨어뜨리는 자리에 맞춰 놓는다.
/** V 수집기 — 양 벽에서 가운데로. 슬롯을 6 으로 넓게 둬야 줄서기(직렬화)가 안 생긴다. */
export const VEE_Y0 = 60
export const VEE_Y1 = 70
export const VEE_X0 = 7
export const VEE_X1 = 17
/** 분배기 — V 아래에서 **서로 반대로** 도는 회전 팔 한 쌍. 여기가 3갈래를 정한다.
 *  가운데(11.2~12.8)는 둘 사이로 그냥 떨어지는 길이라 레인 B 가 굶지 않는다. */
export const DIST_Y = 77
export const DIST_CX = [8.6, 15.4]
/** 분배기 뒤 전폭 산란 페그 줄 2개 */
export const SCATTER_Y = 86
export const SCATTER_PITCH = 3.2

/** 3개 레인 — 칸막이 x 와 위/아래 끝 */
export const LANE_X = [8, 16]
export const LANE_Y0 = 93
export const LANE_Y1 = 117
export const LANE_MID_Y = (LANE_Y0 + LANE_Y1) / 2
/** 레인 합류 직후 전폭 페그 줄 */
export const REJOIN_Y = 120
/** 샷클락 게이트 */
export const CLOCK_Y = 124
/** 림 프로텍터 */
// ⚠ 퍼널 **한가운데**(y=136)에 뒀을 때 접촉이 0.13회였다. 퍼널을 내려오는 공은 벽에
//    붙어 흐르지 살 가운데로 오지 않는다. 벽이 실제로 좁아지는 높이까지 내려야 길목이 된다.
//    y=137.5 로 내려도 0.17회였다 — 벽을 타는 공은 퍼널이 **정말로** 좁아지는 데까지
//    가야 만난다. y=138.8 에서 퍼널 폭은 5.96, 프로텍터가 3.2 를 막고 양옆에 1.38 씩
//    남는다(공 지름 1.1). 더 내리면 양옆이 1.1 미만이 되어 통째로 막힌다.
export const PROT_Y = 138.8

/** 레인 i(0~2) 의 [x0, x1] */
export function laneSpan(i: number): [number, number] {
  return [i === 0 ? 0 : LANE_X[i - 1], i === 2 ? COURSE_W : LANE_X[i]]
}
/** x 가 어느 레인인가 */
export function laneOf(x: number): number {
  return x < LANE_X[0] ? 0 : x < LANE_X[1] ? 1 : 2
}

// ── 스크린(픽) 2개 — 좌우로 미끄러지는 벽 ────────────────────────────────
export const SCREEN_LEN = 11
/** 기울기. 두 스크린의 기울기를 반대로 줘서 흘려보내는 방향이 갈린다(sim.ts) — 섞임의 재료다. */
export const SCREEN_TILT = 1.2
export const SCREEN_X_MIN = 1.5
export const SCREEN_X_MAX = 11.5
/** 왕복 주기 3초 = 360스텝 */
export const SCREEN_PERIOD = 360

// ── 샷클락 게이트 — 0.8초 닫히고 3.2초 열린다(주기 4초) ──────────────────
// ⚠ 2초/2초 였을 때 팀 공의 p95 대기가 2.07초였다. 닫힌 바는 한쪽 끝에 **공 한 개 폭 틈**을
//    남겨(매 주기 좌우 교대) 쌓이지 않고 샌다.
export const CLOCK_PERIOD = 480
export const CLOCK_CLOSED_STEPS = 96
export const CLOCK_GAP = 1.9

/** 리바운드 범퍼 — 반발 1.4 */
export const BUMPER_REST = 1.4
export interface Bumper { x: number; y: number; r: number }

// ── 슬로우 빔 (지역방어) ─────────────────────────────────────────────────
// 옛 「빗금 친 존 띠」는 화면에서 아무 일도 안 일어나는 것처럼 보였다(감속 0.985 = 눈에 안 보임).
// 지금은 측면 벽의 수비수가 쏘는 **쓸고 지나가는 광선**이다. 빔 안의 공은 스텝마다 ×0.90 —
// 중력(28)과 균형이 맞는 종단속도가 2.1 이라 **멈추지 않고 기어간다**(바깥은 15~20).
export const BEAM_EY = 105
export const BEAM_T0 = 94
export const BEAM_T1 = 116
export const BEAM_PERIOD = 360
/** 빔 반폭 — 전체 폭 4 */
export const BEAM_HALF = 2.0
export const BEAM_DRAG = 0.90

/** 정적 선분. kind 는 렌더러가 무엇으로 그릴지 결정한다. */
export interface Seg {
  x1: number; y1: number; x2: number; y2: number
  rest: number
  kind: 'wall' | 'ramp' | 'floor' | 'funnel' | 'tip' | 'chute' | 'split' | 'divider'
}

/** 수비수 페그 */
export interface Peg {
  x: number; y: number; r: number
  /** 등번호 — 이모지 대신 숫자를 쓴다 */
  num: number
}

export interface Wheel {
  x: number; y: number
  len: number
  thick: number
  arms: number
  /** 회전 방향 +1 / -1. 회전체 하나는 **한쪽으로 치우쳐 튕긴다**(실측 16/7/76) —
   *  분배기를 좌우 한 쌍으로 두고 서로 반대로 돌려야 편향이 상쇄된다. */
  spin: number
}

export type LaneKind = 'wheel' | 'pegs' | 'bumpers'
export type PegPattern = 'grid' | 'diamond' | 'jitter'

export interface Course {
  segs: Seg[]
  pegs: Peg[]
  wheel: Wheel
  /** V 아래의 분배기 회전체 한 쌍(반대 방향) — 3갈래를 정한다 */
  distributors: Wheel[]
  bumpers: Bumper[]
  /** 스크린 2개의 높이·등번호 (시드마다 다르다) */
  screen1Y: number
  screen2Y: number
  screenNum: number
  screenNum2: number
  /** 림 프로텍터 등번호 */
  protNum: number
  /** 빔이 왼쪽 벽에서 나오는가 */
  beamLeft: boolean
  /** 레인 0/1/2 에 배치된 장애물 */
  laneKind: LaneKind[]
  pegPattern: PegPattern
  rampCount: number
  /** 같은 레이아웃인지 비교하는 지문 */
  layoutId: string
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

/** 빔이 반대쪽 벽에 닿는 높이 — 이것이 바뀌며 빔이 코트를 쓸고 지나간다 */
export function beamTargetY(step: number): number {
  return BEAM_T0 + triangle(step, BEAM_PERIOD) * (BEAM_T1 - BEAM_T0)
}

/** 림 프로텍터의 현재 중심 x */
export const PROT_R = 1.0
/** 흔들림 폭. 키우면 퍼널 벽과의 여유가 줄어 끼임 위험이 커진다. */
export const PROT_SWAY = 0.8
export const PROT_PERIOD = 300
/** 들어올린 팔 — 중심 기준 오프셋 (안쪽 끝 → 바깥 위 끝) */
// ⚠ 팔을 눕히지 말 것. dx1.13 : dy1.28(48°) 이었을 때 공이 **팔 위에 올라타** 흔들림과 함께
//    끌려다녔다 — 50판 중 9판이 (11.0, 134.6) 부근에서 안 내려왔다. 67° 로 세우면 미끄러진다.
export const PROT_ARM = { ix: 0.55, iy: -0.55, ox: 1.25, oy: -2.2, thick: 0.2 }
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
  const bumpers: Bumper[] = []

  const push = (x1: number, y1: number, x2: number, y2: number, rest: number, kind: Seg['kind']) =>
    segs.push({ x1, y1, x2, y2, rest, kind })

  // ── 사이드라인(벽) — 퍼널이 시작되는 높이까지만. 그 아래는 퍼널이 벽 노릇을 한다.
  push(0, TOP_Y, 0, FUNNEL_TOP_Y, 0.08, 'wall')
  push(COURSE_W, TOP_Y, COURSE_W, FUNNEL_TOP_Y, 0.08, 'wall')

  // ── 팁오프 — 가운데 텐트가 공을 좌우로 가른다
  push(12, 3, 4.8, 11, 0.2, 'tip')
  push(12, 3, 19.2, 11, 0.2, 'tip')

  // ── 지그재그 램프 (시드마다 개수·방향·기울기가 다르다)
  //
  // ⚠ **페그를 램프와 같은 y 띠에 놓지 말 것.** 첫 튜닝에서 수비수 줄을 "램프 끝 4.2 아래"에
  // 뒀는데, 그 높이를 다음 램프가 가로질러서 페그와 비탈 사이 V 홈에 공이 끼었다 — 전원이
  // y=33 에 붙어 레이스가 6초째에 멈췄다. 램프 띠와 페그 띠는 **번갈아** 놓는다.
  const rampCount = intRange(rng, 2, 3)
  const firstRight = rng() < 0.5
  const RAMP_PITCH = 9
  for (let i = 0; i < rampCount; i++) {
    const y0 = 18 + i * RAMP_PITCH
    const drop = range(rng, 8.0, 9.5)
    const goesRight = firstRight ? i % 2 === 0 : i % 2 === 1
    const endX = goesRight ? range(rng, 16.5, 18.5) : range(rng, 5.5, 7.5)
    if (goesRight) push(0.5, y0, endX, y0 + drop, 0.16, 'ramp')
    else push(COURSE_W - 0.5, y0, endX, y0 + drop, 0.16, 'ramp')
    // 램프 띠가 끝난 뒤 빈 띠에 수비수 한 줄 — 전폭으로 깐다
    const rowY = y0 + 9.6
    const count = intRange(rng, 5, 6)
    for (let k = 0; k < count; k++) {
      const x = 2.4 + ((COURSE_W - 4.8) * (k + 0.5)) / count + range(rng, -0.6, 0.6)
      pegs.push({ x, y: rowY + range(rng, -0.5, 0.5), r: 0.62, num: intRange(rng, 0, 55) })
    }
  }

  // ── 스크린 2개 (높이도 시드마다). 스플리터 트리 **위**에 둔다 — 아래에 두면 트리가
  //    이미 x 를 정해 버린 뒤라 스크린이 닿을 일이 없다(실측 접촉 0.11회).
  const screen1Y = range(rng, 51, 53.5)
  const screen2Y = screen1Y + range(rng, 5.5, 6.5)
  const pegPattern: PegPattern = (['grid', 'diamond', 'jitter'] as const)[intRange(rng, 0, 2)]

  // ── V 수집기 — 흐름을 가운데로 모아 **입구 위치를 고정**한다(위 주석 참조)
  push(0.5, VEE_Y0, VEE_X0, VEE_Y1, 0.12, 'split')
  push(COURSE_W - 0.5, VEE_Y0, VEE_X1, VEE_Y1, 0.12, 'split')

  // ── 분배기(회전 팔) — **텐트로는 안 됐다.** 텐트는 꼭짓점 좌우로 갈라 주는 물건인데,
  // V 를 지난 공은 폭이 0.2 도 안 되는 한 줄기라 전원이 같은 날개만 탔다(레인 B 0%).
  // 회전체는 공이 **도착한 시점의 팔 각도**가 방향을 정하므로 줄기가 얼마나 좁든 갈린다.
  // (같은 시드면 각도도 같으니 결정론은 그대로다.)
  const distributors: Wheel[] = [
    { x: DIST_CX[0], y: DIST_Y, len: 2.6, thick: 0.45, arms: 4, spin: 1 },
    { x: DIST_CX[1], y: DIST_Y, len: 2.6, thick: 0.45, arms: 4, spin: -1 },
  ]

  // ── 분배기 뒤 전폭 산란 페그 2줄 — 튕겨 나간 공의 속도를 죽이고 한 번 더 섞는다
  for (let row = 0; row < 2; row++) {
    const y = SCATTER_Y + row * SCATTER_PITCH
    const n = 6
    for (let k = 0; k < n; k++) {
      let x = (COURSE_W / n) * (k + 0.5)
      if (pegPattern === 'diamond') x += (row % 2 === 0 ? 0 : COURSE_W / n / 2)
      else if (pegPattern === 'jitter') x += range(rng, -0.9, 0.9)
      if (x < 1.7 || x > COURSE_W - 1.7) continue
      pegs.push({ x, y, r: 0.55, num: intRange(rng, 0, 55) })
    }
  }

  // ── 3개 레인. 칸막이 꼭대기는 텐트로 — 수직선 끝에 공이 올라앉는 것을 막는다.
  for (const lx of LANE_X) {
    push(lx, LANE_Y0, lx, LANE_Y1, 0.1, 'divider')
    push(lx - 1.3, LANE_Y0 + 1.5, lx, LANE_Y0, 0.2, 'divider')
    push(lx, LANE_Y0, lx + 1.3, LANE_Y0 + 1.5, 0.2, 'divider')
  }

  // ── 레인별 장애물 — 어느 레인이 무엇을 받는지 시드가 정한다
  const kinds: LaneKind[] = ['wheel', 'pegs', 'bumpers']
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = intRange(rng, 0, i)
    const t = kinds[i]; kinds[i] = kinds[j]; kinds[j] = t
  }
  let wheel: Wheel = { x: HOOP_X, y: LANE_MID_Y, len: 2.2, thick: 0.4, arms: 4, spin: 1 }
  kinds.forEach((kind, li) => {
    const [lx0, lx1] = laneSpan(li)
    const cx = (lx0 + lx1) / 2
    if (kind === 'wheel') {
      // 팔 끝(2.8+0.4=3.2) + 공 반지름 0.55 < 레인 반폭 4 — 벽에 공을 짓이기지 않는다
      // ⚠ len 2.8 + thick 0.4 = 3.2 → 레인 반폭 4 와의 여유가 0.8 로 **공 지름 1.1 보다 좁아**
      //    공이 팔과 레인 벽 사이에 끼었다(실측 정지: (0.7, 98.2)). 여유 1.4 를 남긴다.
      wheel = { x: cx, y: range(rng, LANE_MID_Y - 2, LANE_MID_Y + 2), len: 2.2, thick: 0.4, arms: 4, spin: rng() < 0.5 ? 1 : -1 }
    } else if (kind === 'pegs') {
      // 파친코 — 패턴이 시드마다 다르다(격자 / 다이아 / 흔들기)
      const rows = 5
      for (let r = 0; r < rows; r++) {
        const y = LANE_Y0 + 4 + r * ((LANE_Y1 - LANE_Y0 - 7) / (rows - 1))
        for (let k = 0; k < 2; k++) {
          let x = lx0 + 8 * (k === 0 ? 0.3 : 0.7)
          if (pegPattern === 'diamond') x += (r % 2 === 0 ? -0.9 : 0.9)
          else if (pegPattern === 'jitter') x += range(rng, -1.0, 1.0)
          pegs.push({ x, y, r: 0.52, num: intRange(rng, 0, 55) })
        }
      }
    } else {
      // 범퍼 골목 — 레인 전체가 트래픽이라 여기 놓이면 반드시 길목이다
      // ⚠ 세 개를 중심선 근처에 모았더니 레인 벽 쪽 2.3 폭 통로로 공이 그냥 지나갔다
      //    (범퍼를 한 번이라도 맞은 팀 공 18%). **레인 폭을 가로질러** 엇갈리게 놓아야
      //    수직 통로가 없어진다. 벽과의 여유 1.25 는 공 지름 1.1 보다 크므로 안 낀다.
      const flip = rng() < 0.5 ? 1 : -1
      const offs = [-1.8, 0, 1.8]
      for (let b = 0; b < 3; b++) {
        const y = LANE_Y0 + 5 + b * ((LANE_Y1 - LANE_Y0 - 9) / 2) + range(rng, -0.6, 0.6)
        bumpers.push({ x: cx + offs[b] * flip, y, r: 0.95 })
      }
    }
  })

  // ── 레인 합류 직후 전폭 페그 줄
  {
    const n = 7
    for (let k = 0; k < n; k++) {
      const x = 1.9 + ((COURSE_W - 3.8) * k) / (n - 1) + range(rng, -0.35, 0.35)
      pegs.push({ x, y: REJOIN_Y + range(rng, -0.4, 0.4), r: 0.5, num: intRange(rng, 0, 55) })
    }
  }

  // ── 퍼널 → 슈트 → 림.
  // ⚠ 퍼널 끝점과 슈트 벽 위끝을 **정확히 같은 점**으로 둔다. 어긋나면 그 모서리가 오목해져
  //    공이 낀다(예전 볼랙 설계에서 실제로 12개 중 7개가 못 내려왔다).
  push(0, FUNNEL_TOP_Y, CHUTE_X0, CHUTE_TOP, 0.06, 'funnel')
  push(COURSE_W, FUNNEL_TOP_Y, CHUTE_X1, CHUTE_TOP, 0.06, 'funnel')
  push(CHUTE_X0, CHUTE_TOP, CHUTE_X0, RIM_Y, 0.04, 'chute')
  push(CHUTE_X1, CHUTE_TOP, CHUTE_X1, RIM_Y, 0.04, 'chute')

  // ── ⚠ 끼임 방지 불변식: **선분·범퍼·휠에서 공 지름보다 가까운 페그는 버린다.**
  // 손으로 배치를 피해 다니는 것으로는 안 된다 — 여러 번 당했고, 그때마다 레이스가 중간에
  // 멎었다(에러는 없고 공만 안 내려온다). 규칙으로 못박는다. 시드마다 배치가 달라진 지금은
  // 더더욱 손으로 못 피한다.
  const MARBLE_D = 1.1
  const near = (p: Peg) => {
    for (const s of segs) {
      if (pointSegDist(p.x, p.y, s) < p.r + MARBLE_D + 0.2) return true
    }
    for (const b of bumpers) {
      const dx = p.x - b.x, dy = p.y - b.y
      if (Math.sqrt(dx * dx + dy * dy) < p.r + b.r + MARBLE_D + 0.2) return true
    }
    for (const wh of [wheel, ...distributors]) {
      const wdx = p.x - wh.x, wdy = p.y - wh.y
      if (Math.sqrt(wdx * wdx + wdy * wdy) < wh.len + wh.thick + MARBLE_D + 0.25) return true
    }
    // 움직이는 것들이 지나다니는 띠는 통째로 비운다 — 여기에 페그가 있으면 스크린·프로텍터가
    // 공을 그 페그에 **눌러 박는다**(정적 검사로는 안 잡힌다).
    for (const sy of [screen1Y, screen2Y]) {
      if (p.y > sy - SCREEN_TILT - 2.5 && p.y < sy + SCREEN_TILT + 2.5) return true
    }
    if (p.y > CLOCK_Y - 2.5 && p.y < CLOCK_Y + 2.5) return true
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

  const beamLeft = rng() < 0.5
  const layoutId = [
    rampCount, firstRight ? 'R' : 'L', kinds.join(''), pegPattern,
    beamLeft ? 'BL' : 'BR', screen1Y.toFixed(1), bumpers.map(b => b.x.toFixed(1)).join(','),
  ].join('|')

  return {
    segs, pegs, wheel, distributors, bumpers,
    screen1Y, screen2Y,
    screenNum: intRange(rng, 0, 55),
    screenNum2: intRange(rng, 0, 55),
    protNum: intRange(rng, 0, 55),
    beamLeft, laneKind: kinds, pegPattern, rampCount, layoutId,
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
