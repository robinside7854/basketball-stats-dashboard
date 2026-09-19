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
// ── 2026-09-19 4차 개편: 「아무도 안 만지는 장애물」을 전부 걷어냈다 ─────
// 3차의 남은 문제를 **장애물 하나하나의 접촉률**로 다시 쟀다(3/4/6팀 54판 · 팀공 234개,
// 접촉률 = 그 판의 팀 공 중 이 장애물에 한 번이라도 닿은 비율). 분위수로 재면 안 된다 —
// 잘 맞는 장애물일수록 **자기 셀을 비워서** 한산해 보인다.
//   · 램프 뒤 전폭 페그줄 9.8개/판 · 평균 0.079 · **91%가 0.15 미만**
//   · 레인 안 파친코 페그 7.7개/판 · 평균 0.075 (레인 한가운데였는데 공은 벽을 탄다)
//   · 범퍼 3개/판 0.112 · 산란 페그 11.1개/판 0.151 · 합류 페그 6.3개/판 0.160
//   · 휠 0.190 · 샷클락 0.211 · 스크린2 0.233
// 원인은 하나다. **장애물을 코스 폭에 고르게 깔았는데 트래픽은 고르지 않다.**
// 실측한 코리도는 이렇다.
//   · 램프 직후: 램프 **끝점 ±2.0 안에 55%**, ±3.0 안에 71%  (전폭이 아니라 쏟아지는 자리)
//   · 분배기 아래: x 10~13 에 72%
//   · 레인 안: 공이 **벽을 탄다** — 레인0 왼벽 0.5~1.5 에 54%, 레인2 오른벽 23~23.5 에 52%
//     (레인 한가운데는 2% 대. 칸막이는 수직이고 흐름도 수직이라 **스치기만 한다**)
// 그래서 (1) 페그는 전폭 줄을 버리고 **코리도에서 표본을 뽑아** 놓고(끼임 검사를 통과할
// 때까지 후보를 차례로 시도), (2) 레인에는 **벽에 붙인 경사 디플렉터**를 넣어 벽을 타는
// 흐름을 가운데로 꺾는다 — 이게 휠·범퍼가 굶던 이유까지 같이 없앤다.
// 장애물 수는 판당 58.3 → 27 대로 줄었고, 남은 것은 전부 길목에 있다.
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
// ⚠ 길이 11 · 이동 [1.5, 11.5] 였을 때 덮는 x 는 항상 [1.5,12.5]~[11.5,22.5] 였다.
//    즉 **양쪽 벽 1.5 폭은 어떤 순간에도 못 닿는다**. 그 높이 트래픽의 x22~23 이 26% 였으니
//    스크린2 접촉률 0.233 은 자리 탓이었다. 길이를 13 으로 늘리고 이동 범위를 벽까지 민다.
export const SCREEN_LEN = 13
/** 기울기. 두 스크린의 기울기를 반대로 줘서 흘려보내는 방향이 갈린다(sim.ts) — 섞임의 재료다. */
export const SCREEN_TILT = 1.2
// ⚠ 범위가 좌우 비대칭인 데는 이유가 있다. 스크린1 은 공을 **오른쪽 끝으로 흘려보내므로**
//    그 끝이 오른쪽 벽에 닿으면 공이 벽과 스크린 끝 사이에 낀다. 반대로 왼쪽 끝은 벽에
//    붙어도 된다(공이 그 위에 떨어져 오른쪽으로 미끄러질 뿐이다). 스크린2 는 정반대.
export const SCREEN1_X_MIN = 0
export const SCREEN1_X_MAX = 9
export const SCREEN2_X_MIN = 2
export const SCREEN2_X_MAX = 11
/** 왕복 주기 3초 = 360스텝 */
export const SCREEN_PERIOD = 360

// ── 샷클락 게이트 — 1.25초 닫히고 2.75초 열린다(주기 4초) ────────────────
// ⚠ 2초/2초 였을 때 팀 공의 p95 대기가 2.07초였다. 닫힌 바는 한쪽 끝에 **공 한 개 폭 틈**을
//    남겨(매 주기 좌우 교대) 쌓이지 않고 샌다.
// ⚠ 0.8초(96스텝)일 때 접촉률이 0.201 이었다 — 닫혀 있는 시간 비율(96/480=0.20)과
//    소수점까지 같다. 게이트는 **자리를 옮길 수 없는 장애물**이라(이미 전폭이다) 접촉률을
//    올릴 손잡이는 듀티비뿐이다. 150/480 = 0.31 로 올린다.
export const CLOCK_PERIOD = 480
export const CLOCK_CLOSED_STEPS = 150
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

// ── 레인 디플렉터 — 벽에 붙여 비스듬히 튀어나온 판 ───────────────────────
// 레인 안에서 공은 **벽을 탄다**(실측: 레인0 왼벽 0.5~1.5 에 54%, 레인2 오른벽에 52%).
// 칸막이는 수직이고 흐름도 수직(90.7°)이라 스치기만 한다 — 각도가 0에 가까우면 장애물이 아니다.
// 디플렉터는 수평에서 40°(흐름과 51°) 로 눕혀 그 벽 흐름을 레인 가운데로 꺾는다.
// ⚠ 벽과 만나는 꼭짓점 위쪽은 141° 의 **둔각 홈**이라 공이 얹히지 않고 굴러 내려간다.
//    이보다 세우면(벽과 이루는 각이 작아지면) 홈이 깊어져 끼임이 생긴다.
export const DEFL_DX = 2.9
export const DEFL_DY = 2.0

/** 정적 선분. kind 는 렌더러가 무엇으로 그릴지 결정한다. */
export interface Seg {
  x1: number; y1: number; x2: number; y2: number
  rest: number
  kind: 'wall' | 'ramp' | 'floor' | 'funnel' | 'tip' | 'chute' | 'split' | 'divider' | 'deflect'
}

/** 페그가 어느 코리도에서 뽑혔는가 — 계측(접촉률)을 생성 규칙별로 묶을 때 쓴다 */
export type PegGroup = 'ramp' | 'scatter'

/** 수비수 페그 */
export interface Peg {
  x: number; y: number; r: number
  /** 등번호 — 이모지 대신 숫자를 쓴다 */
  num: number
  group: PegGroup
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

/** 레인 한가운데에 들어가는 것. 'deflect' 는 디플렉터 한 단을 더 붙인 사다리꼴 레인. */
export type LaneKind = 'wheel' | 'deflect' | 'bumpers'
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
  return SCREEN1_X_MIN + triangle(step, SCREEN_PERIOD) * (SCREEN1_X_MAX - SCREEN1_X_MIN)
}
/** 스크린 2의 왼쪽 끝 x — 스크린 1의 **거울상**이라 둘이 같은 쪽을 동시에 비우지 않는다.
 *  (위상 0 에서 1 은 [0,13] · 2 는 [11,24] 를 덮어 둘이 합쳐 전폭을 가린다) */
export function screenX2(step: number): number {
  return SCREEN2_X_MIN + (1 - triangle(step, SCREEN_PERIOD)) * (SCREEN2_X_MAX - SCREEN2_X_MIN)
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
  // 페그는 구조물이 전부 선 **뒤에** 놓는다(끼임 검사가 모든 선분을 봐야 하므로).
  // 여기서는 "어디가 길목인가" 만 후보로 적어 둔다.
  interface PegCand { x: number; y: number }

  const rampCount = intRange(rng, 2, 3)
  const firstRight = rng() < 0.5
  const RAMP_PITCH = 9
  let lastEndX = HOOP_X, lastEndY = 30, lastGoesRight = true
  for (let i = 0; i < rampCount; i++) {
    const y0 = 18 + i * RAMP_PITCH
    const drop = range(rng, 8.0, 9.5)
    const goesRight = firstRight ? i % 2 === 0 : i % 2 === 1
    const endX = goesRight ? range(rng, 16.5, 18.5) : range(rng, 5.5, 7.5)
    if (goesRight) push(0.5, y0, endX, y0 + drop, 0.16, 'ramp')
    else push(COURSE_W - 0.5, y0, endX, y0 + drop, 0.16, 'ramp')
    lastEndX = endX; lastEndY = y0 + drop; lastGoesRight = goesRight
  }
  // ⚠ 램프 끝 아래에 페그를 놓아 봤다 — 접촉률 0.003 이 나왔다. 이유는 기하다:
  //    RAMP_PITCH 9 에 낙차가 8~9.5 라 **한 램프가 끝나는 곳이 곧 다음 램프의 몸통 속**이다.
  //    끼임 검사를 통과하는 자리는 다음 램프의 **아래쪽**(공이 절대 안 가는 그늘)뿐이었다.
  //    램프 사이에는 페그를 놓을 자리가 없다 — 놓을 수 있는 자리는 전부 죽은 자리다.

  // ── 스크린 2개 (높이도 시드마다). 스플리터 트리 **위**에 둔다 — 아래에 두면 트리가
  //    이미 x 를 정해 버린 뒤라 스크린이 닿을 일이 없다(실측 접촉 0.11회).
  const screen1Y = range(rng, 51, 53.5)
  const screen2Y = screen1Y + range(rng, 5.5, 6.5)
  const pegPattern: PegPattern = (['grid', 'diamond', 'jitter'] as const)[intRange(rng, 0, 2)]

  /** 벽 x=wallX 에 붙여 dir 방향으로 비스듬히 내려가는 판 */
  const pushDeflector = (wallX: number, dir: 1 | -1, y: number) =>
    push(wallX, y, wallX + dir * DEFL_DX, y + DEFL_DY, 0.18, 'deflect')
  /**
   * 디플렉터를 놓을 수 있는가 — 붙어 있는 벽 자신은 빼고(앵커에서 0.05 이내인 선분),
   * 나머지 선분과 **공 지름만큼** 떨어져 있어야 한다. 아니면 그 사이가 끼임 홈이 된다.
   */
  const deflectorFits = (wallX: number, dir: 1 | -1, y: number) => {
    // 움직이는 스크린이 쓸고 가는 띠에는 두지 않는다(공을 디플렉터에 눌러 박는다)
    for (const sy of [screen1Y, screen2Y]) {
      if (y + DEFL_DY > sy - SCREEN_TILT - 2.2 && y < sy + SCREEN_TILT + 2.2) return false
    }
    for (const s of segs) {
      if (pointSegDist(wallX, y, s) < 0.05) continue  // 앵커 벽 자신
      for (const t of [0.25, 0.5, 0.75, 1]) {
        const px = wallX + dir * DEFL_DX * t, py = y + DEFL_DY * t
        if (pointSegDist(px, py, s) < 1.45) return false
      }
    }
    return true
  }
  /** 후보 높이를 차례로 시도해 처음 통과하는 자리에 놓는다. 놓았으면 true. */
  const tryDeflector = (wallX: number, dir: 1 | -1, ys: number[]) => {
    for (const y of ys) {
      if (deflectorFits(wallX, dir, y)) { pushDeflector(wallX, dir, y); return true }
    }
    return false
  }

  // ── 램프 끝 벽 디플렉터 + 그 아래 페그 2개 — 4차 개편의 절반.
  //
  // ⚠ 처음에는 램프 구간 전체(y 20~45)에 좌우 번갈아 3장을 깔았다. 접촉률 0.021.
  //    한 판씩 뜯어보니 이유가 분명했다: **램프 사이에는 벽에 공이 없다**(공은 램프 위에
  //    있다). 벽 트래픽은 **마지막 램프가 끝난 뒤**에만 생기고, 그것도 램프가 향하던
  //    쪽 벽에만 생긴다(실측 seed 610001: y40~50 샘플의 100%가 왼벽, 그 판의 마지막
  //    램프는 오른벽 → 왼쪽으로 내려온다). 그 자리에 놓인 한 장은 4/4 를 맞혔다.
  //    그래서 **한 장만**, 마지막 램프가 향한 쪽에 놓는다.
  const rampPegCands: PegCand[][] = []
  {
    const dir: 1 | -1 = lastGoesRight ? -1 : 1   // 벽은 램프가 향한 쪽
    const wallX = lastGoesRight ? COURSE_W : 0
    const base = lastEndY + range(rng, 0.0, 1.6)
    const ok = tryDeflector(wallX, dir, [base, base + 2.6, base + 5.0, base - 2.4, base + 7.4])
    if (ok) {
      // 디플렉터 끝에서 튕겨 나온 줄기 — 그 바로 아래가 이 구간의 유일한 가운데 길목이다
      const tip = segs[segs.length - 1]
      for (const k of [0, 1]) {
        rampPegCands.push([2.6, 4.0, 5.4, 6.8].map(d => ({
          x: tip.x2 + dir * (1.1 + k * 2.2 + range(rng, -0.3, 0.3)),
          y: tip.y2 + d + k * 1.3,
        })))
      }
    }
  }

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

  // ── 분배기 뒤 산란 페그 — 전폭 2줄(11.1개/판·접촉 0.151)을 **가운데 코리도 3개**로 줄였다.
  // 실측: 분배기 아래(y 79~84) 트래픽의 72% 가 x 10~13 에 있다. x 2·6·18·22 의 페그는
  // 판마다 서 있기만 했다. 패턴(격자/다이아/흔들기)은 그 코리도 **안에서** 모양을 바꾼다.
  const SCAT_CX = 11.9
  const scatCands: PegCand[][] = []
  {
    const spread = pegPattern === 'diamond' ? range(rng, 1.9, 2.4) : range(rng, 1.3, 1.8)
    const jit = () => (pegPattern === 'jitter' ? range(rng, -0.6, 0.6) : 0)
    // 윗줄 두 개가 가운데를 사이에 두고 서고, 아랫줄 한 개가 그 사이로 빠진 공을 받는다
    scatCands.push([{ x: SCAT_CX - spread + jit(), y: SCATTER_Y }, { x: SCAT_CX - spread - 1.2, y: SCATTER_Y + 1.1 }])
    scatCands.push([{ x: SCAT_CX + spread + jit(), y: SCATTER_Y }, { x: SCAT_CX + spread + 1.2, y: SCATTER_Y + 1.1 }])
    scatCands.push([{ x: SCAT_CX + jit(), y: SCATTER_Y + SCATTER_PITCH }, { x: SCAT_CX, y: SCATTER_Y + SCATTER_PITCH + 1.2 }])
  }

  // ── 3개 레인. 칸막이 꼭대기는 텐트로 — 수직선 끝에 공이 올라앉는 것을 막는다.
  for (const lx of LANE_X) {
    push(lx, LANE_Y0, lx, LANE_Y1, 0.1, 'divider')
    push(lx - 1.3, LANE_Y0 + 1.5, lx, LANE_Y0, 0.2, 'divider')
    push(lx, LANE_Y0, lx + 1.3, LANE_Y0 + 1.5, 0.2, 'divider')
  }

  // ── 레인별 장애물 — 어느 레인이 무엇을 받는지 시드가 정한다.
  // **모든 레인에 디플렉터 2단**(위·아래)을 깐다. 이게 이번 개편의 핵심이다:
  // 레인 안 공은 벽을 타는데(왼벽 54% / 오른벽 52%) 칸막이는 수직이라 아무 일도 안 일어났다.
  // 디플렉터가 그 흐름을 가운데로 꺾어 주면서, 가운데에 있던 휠(0.190)·범퍼(0.112)가
  // 비로소 길목에 놓인다. 레인 종류는 **가운데 한 칸에 무엇을 넣는가**만 정한다.
  const kinds: LaneKind[] = ['wheel', 'deflect', 'bumpers']
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = intRange(rng, 0, i)
    const t = kinds[i]; kinds[i] = kinds[j]; kinds[j] = t
  }
  let wheel: Wheel = { x: HOOP_X, y: LANE_MID_Y, len: 2.2, thick: 0.4, arms: 4, spin: 1 }
  /** 범퍼도 페그처럼 구조물이 다 선 뒤에 끼임 검사를 통과하는 자리에 놓는다 */
  const bumpCands: PegCand[][] = []
  kinds.forEach((kind, li) => {
    const [lx0, lx1] = laneSpan(li)
    const cx = (lx0 + lx1) / 2
    // ⚠ 첫 단의 벽을 시드로 고르게 했더니 칸막이 쪽에 붙은 판이 죽었다(x8/x16 의 y92~96
    //    접촉률 0.02~0.06). 칸막이 꼭대기 텐트가 공을 칸막이에서 **밀어내기** 때문이다.
    //    실측한 레인별 우세 벽은 바깥쪽이다 — 레인0 왼벽 41%, 레인2 오른벽 52%.
    //    그래서 바깥 레인의 첫 단은 바깥 벽에 고정하고, 가운데 레인만 시드가 고른다.
    let left = li === 0 ? true : li === 2 ? false : rng() < 0.5
    // ── 판 하나를 세우고, 그 판이 뱉는 줄기의 기준점을 돌려준다.
    // 실측(디플렉터 끝점 기준 상대 분포): 공은 끝점에서 **비스듬히 건너가** ry 2~3 이면
    // 반대쪽 벽에 붙는다(ry 6~9 에서 반대벽 한 칸이 30~35%). 그러니
    //   · 다음 **판**은 반대쪽 벽 ry 5~7 에
    //   · 판 사이에 끼울 **범퍼**는 건너가는 줄기 위 ry 1.2~2.0 · rx 2.6~3.4 에
    // 둔다. 이 두 자리 말고는 레인 안에 길목이 없다.
    const step = (y: number) => {
      const [wx, d] = left ? ([lx0, 1] as const) : ([lx1, -1] as const)
      pushDeflector(wx, d, y)
      left = !left
      return { x: wx + d * DEFL_DX, y: y + DEFL_DY, dir: d }
    }
    const a = step(LANE_Y0 + range(rng, 5.5, 7.5))
    const b = step(a.y + range(rng, 5.0, 7.0))
    if (kind === 'wheel') {
      // 팔 끝(2.2+0.4=2.6) + 공 반지름 0.55 < 레인 반폭 4 — 벽에 공을 짓이기지 않는다
      // ⚠ len 2.8 + thick 0.4 = 3.2 → 레인 반폭 4 와의 여유가 0.8 로 **공 지름 1.1 보다 좁아**
      //    공이 팔과 레인 벽 사이에 끼었다(실측 정지: (0.7, 98.2)). 여유 1.4 를 남긴다.
      //    즉 휠은 **가운데를 떠날 수 없다.** 옮길 수 있는 것은 높이뿐이라, 두 번째 판이
      //    건너보내는 줄기 아래에 맞춘다. 3.6 미만으로 올리면 팔이 판을 스쳐 공을 끼운다.
      // ⚠ 아래 끝: 팔 끝이 칸막이 아래 끝(LANE_Y1)을 넘어가면 그 끝점과 팔 사이에서 공을 집는다
      wheel = {
        x: cx, y: Math.min(b.y + range(rng, 3.6, 4.6), LANE_Y1 - 3.8),
        len: 2.2, thick: 0.4, arms: 4, spin: rng() < 0.5 ? 1 : -1,
      }
    } else if (kind === 'deflect') {
      step(b.y + range(rng, 5.0, 6.3))
    } else {
      // 리바운드 범퍼 — 판 두 개가 각각 건너보내는 줄기 위에 하나씩.
      // ⚠ 자리를 세 번 옮겼다. 판 끝 바로 아래(rx 1·ry 3) 0.065 → rx 3·ry 1.6 0.210.
      //    **공 단위** 상대 분포를 다시 재고서야 정답이 보였다(샘플 단위로 재면 반대쪽
      //    벽에 붙어 오래 머무는 공이 표를 지배한다). 판을 지난 공 기준으로
      //    rx 1.0~1.5 · ry 0~1 을 63~68% 가 지나간다 — 끝점에서 반 칸 앞이 길목이다.
      // ⚠ 그런데 그만큼 판 끝에 가까워서 **판 끝과 범퍼 사이가 공 지름보다 좁아진다.**
      //    rx 1.5·ry 1.2 일 때 틈이 1.02(공 지름 1.1)라 거기에 공이 박혔다
      //    (실측: 3·4·6팀 seed 20013 이 전부 (20.6, 101.9) 에서 멈췄다).
      //    그래서 범퍼도 페그와 **같은 끼임 검사**를 통과하는 자리에만 놓는다.
      for (const d of [a, b]) {
        bumpCands.push([0, 1, 2, 3].map(t => ({
          x: d.x + d.dir * (1.9 + t * 0.45 + range(rng, -0.15, 0.15)),
          y: d.y + 1.5 + t * 0.35 + range(rng, -0.15, 0.15),
        })))
      }
    }
  })

  // ── 레인 합류 직후 페그줄은 **없앴다**.
  // 전폭 7개일 때 0.160, 레인 출구에 맞춰 3개로 줄였을 때도 0.047 이었다. 세 레인이 서로
  // 다른 x 로 뱉는 데다 그 아래 1.5 초면 전폭 샷클락이 어차피 전원을 한 번 거른다 —
  // 이 높이에 페그를 놓을 이유가 없다. 안 맞는 장애물은 장식이라 지운다.

  // ── 퍼널 → 슈트 → 림.
  // ⚠ 퍼널 끝점과 슈트 벽 위끝을 **정확히 같은 점**으로 둔다. 어긋나면 그 모서리가 오목해져
  //    공이 낀다(예전 볼랙 설계에서 실제로 12개 중 7개가 못 내려왔다).
  push(0, FUNNEL_TOP_Y, CHUTE_X0, CHUTE_TOP, 0.06, 'funnel')
  push(COURSE_W, FUNNEL_TOP_Y, CHUTE_X1, CHUTE_TOP, 0.06, 'funnel')
  push(CHUTE_X0, CHUTE_TOP, CHUTE_X0, RIM_Y, 0.04, 'chute')
  push(CHUTE_X1, CHUTE_TOP, CHUTE_X1, RIM_Y, 0.04, 'chute')

  // ── ⚠ 끼임 방지 불변식: **선분·범퍼·휠·다른 페그에서 공 지름보다 가까운 자리는 못 쓴다.**
  // 손으로 배치를 피해 다니는 것으로는 안 된다 — 여러 번 당했고, 그때마다 레이스가 중간에
  // 멎었다(에러는 없고 공만 안 내려온다). 규칙으로 못박는다. 시드마다 배치가 달라진 지금은
  // 더더욱 손으로 못 피한다.
  //
  // 2026-09-19: 예전에는 "일단 다 깔고 걸리는 것을 버린다" 였다. 그러면 **길목에 있던 페그가
  // 버려지고 한산한 자리의 페그만 남는다**(구조물은 길목에 서 있으니까). 지금은 반대로,
  // 길목 후보를 순서대로 시도해 **통과하는 첫 자리에 놓는다**. 후보 사다리가 다 막히면
  // 그 페그는 아예 없는 편이 낫다(안 맞는 페그는 장식일 뿐이다).
  const MARBLE_D = 1.1
  const blocked = (x: number, y: number, r: number) => {
    for (const s of segs) {
      if (pointSegDist(x, y, s) < r + MARBLE_D + 0.2) return true
    }
    for (const b of bumpers) {
      const dx = x - b.x, dy = y - b.y
      if (Math.sqrt(dx * dx + dy * dy) < r + b.r + MARBLE_D + 0.2) return true
    }
    for (const wh of [wheel, ...distributors]) {
      const wdx = x - wh.x, wdy = y - wh.y
      if (Math.sqrt(wdx * wdx + wdy * wdy) < wh.len + wh.thick + MARBLE_D + 0.25) return true
    }
    // 페그끼리도 공 지름만큼은 떨어져야 한다 — 두 개가 붙으면 그 사이가 V 홈이 된다
    for (const p of pegs) {
      const dx = x - p.x, dy = y - p.y
      if (Math.sqrt(dx * dx + dy * dy) < r + p.r + MARBLE_D + 0.1) return true
    }
    // 움직이는 것들이 지나다니는 띠는 통째로 비운다 — 여기에 페그가 있으면 스크린·프로텍터가
    // 공을 그 페그에 **눌러 박는다**(정적 검사로는 안 잡힌다).
    for (const sy of [screen1Y, screen2Y]) {
      if (y > sy - SCREEN_TILT - 2.5 && y < sy + SCREEN_TILT + 2.5) return true
    }
    if (y > CLOCK_Y - 2.5 && y < CLOCK_Y + 2.5) return true
    if (y > PROT_Y + PROT_ARM.oy - MARBLE_D - 1 && y < PROT_Y + PROT_R + MARBLE_D + 1
      && x > HOOP_X - PROT_SWAY - PROT_ARM.ox - MARBLE_D - 1
      && x < HOOP_X + PROT_SWAY + PROT_ARM.ox + MARBLE_D + 1) return true
    return false
  }
  // 범퍼 먼저 — 페그 검사가 범퍼를 봐야 하므로 순서가 중요하다
  const BUMP_R = 0.95
  for (const cands of bumpCands) {
    for (const c of cands) {
      if (blocked(c.x, c.y, BUMP_R)) continue
      bumpers.push({ x: c.x, y: c.y, r: BUMP_R })
      break
    }
  }
  /** 후보를 차례로 시도해 **처음 통과하는 자리**에 페그 하나를 놓는다 */
  const placeOne = (cands: PegCand[], r: number, group: PegGroup) => {
    for (const c of cands) {
      if (blocked(c.x, c.y, r)) continue
      pegs.push({ x: c.x, y: c.y, r, num: intRange(rng, 0, 55), group })
      return
    }
  }
  for (const c of rampPegCands) placeOne(c, 0.6, 'ramp')
  for (const c of scatCands) placeOne(c, 0.55, 'scatter')

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
    segs.filter(s => s.kind === 'deflect').map(s => `${s.x1.toFixed(0)}@${s.y1.toFixed(1)}`).join(','),
    pegs.map(p => p.x.toFixed(1)).join(','),
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
