// 결정론 물리 — 원 vs 선분 / 원 vs 원 만 쓰는 소형 엔진.
//
// 왜 planck/box2d 가 아닌가: 이 코스에 필요한 도형은 **원(구슬·페그·범퍼) · 정적 선분(벽·램프·퍼널·
// 슈트) · 움직이는 선분(스크린·샷클락·휠)** 뿐이다. 그 몇 가지면 400줄로 끝나고, 대신 다음을
// 확실히 통제할 수 있다.
//   1) 연산을 +,-,*,/ 와 Math.sqrt 로만 제한 → IEEE-754 가 결과를 유일하게 정한다.
//      sin/cos/pow/hypot 은 엔진 구현에 따라 마지막 비트가 갈릴 수 있어 물리에서 쓰지 않는다
//      (휠 회전조차 미리 박아 둔 cos/sin 상수의 곱셈으로 돌리고, 스크린은 삼각파로 움직인다).
//   2) 번들 0KB · WASM 로딩 대기 없음.
// 참고 저장소(lazygyu/roulette, MIT)는 box2d-wasm 을 쓴다 — planck 가 아니다.
//
// ── 순위는 어떻게 보장되나 (2026-09-19 개편) ─────────────────────────────
// **도착 순서가 곧 순위다.** 슈트를 통과해 림에 들어간 n번째 팀 공이 n순위.
// 서버가 정한 order 와 일치시키는 방법은 힘이 아니라 **시드 탐색**이다(search.ts):
// 마운트 직후 팁오프 대기 동안 헤드리스 사전 시뮬레이션을 돌려 도착 순서가 order 와
// 같아지는 시드를 찾고, 그 시드로 보이는 레이스를 돌린다.
// 예산 안에 못 찾으면 **슈트 게이트**가 켜진다 — 슈트 입구에 마개를 두고 order 순서대로
// 한 개씩 내보낸다. 맞는 시드를 찾았을 때 이 게이트는 한 번도 개입하지 않는다.
//
// 이 파일은 DOM 을 참조하지 않는다. Node 에서 두 번 돌려 체크섬을 비교할 수 있다.

import {
  BEAM_DRAG, BEAM_EY, BEAM_HALF, beamTargetY, BUMPER_REST, bucketFor, buildCourse, CHUTE_TOP,
  CHUTE_X0, CHUTE_X1, clockBar, clockClosed, clockGapLeft, clockReadout, CLOCK_Y, COURSE_W,
  FUNNEL_TOP_Y, HOOP_HALF, HOOP_X, LANE_Y0, NET_BOTTOM,
  PROT_R, PROT_Y, protectorX, RIM_Y,
  SCREEN_LEN, SCREEN_TILT, screenX, screenX2, TOP_Y,
  type Course,
} from './course'
import { hashSeed, intRange, mulberry32, range } from './rng'

export const SIM_HZ = 120
export const SIM_DT = 1 / SIM_HZ

/** 중력(월드단위/s²) */
const G = 34
/** 스텝당 공기저항 (상수 곱 — Math.pow 를 쓰지 않는다) */
const DRAG = 0.99925
/** 속도 상한. dt=1/120 에서 한 스텝 이동 0.45 < 반지름 0.55 → 터널링 없음 */
const VMAX = 54
const MARBLE_R = 0.55
/** 트래픽용 중립 구슬 수 */
export const NEUTRAL_COUNT = 6
/** 골인 뒤 이 높이를 지나면 화면에서 뺀다 */
const DESPAWN_Y = NET_BOTTOM + 12

export interface Marble {
  /** 팀 구슬이면 team id, 중립이면 null */
  team: string | null
  x: number; y: number
  vx: number; vy: number
  r: number
  /** 시각용 회전(심에서 결정론적으로 누적) */
  rot: number
  /** 림을 통과했는가 — 통과 뒤에는 아무와도 충돌하지 않고 네트 아래로 떨어진다 */
  scored: boolean
  /** 골인한 스텝 */
  scoredStep: number
  /** 화면에서 제거 */
  out: boolean
  /** 슈트 게이트 통과 허가 (폴백 전용) */
  released: boolean
  /** 감시 시계에 걸려 **강제 호송** 중 — 장애물을 통과해 곧장 골대로 간다(폴백 전용) */
  ghost: boolean
  /** 스크린(픽)에 막힌 횟수 — 코스 난이도 계측용. 붙어 있는 동안은 1회로 센다(상승 엣지). */
  screenTouches: number
  /** 직전 스텝에 스크린에 닿아 있었는가 */
  screenPrev: boolean
  /** 림 프로텍터에 막힌 횟수 (상승 엣지) */
  protTouches: number
  protPrev: boolean
  /** 리바운드 범퍼에 맞은 횟수 */
  bumpTouches: number
  /** 슬로우 빔에 맞은 잔광 0~1 (그림 전용) */
  beamT: number
  /** 빔 안에 있던 스텝 수 — 효과가 실제로 걸리는지 계측용 */
  beamSteps: number
  /** 마지막으로 "내려갔다"고 인정한 y — 끼임 감지 기준선 */
  markY: number
  /** 그 기준선 이후 진전 없이 흐른 스텝 수 */
  still: number
}

/** 폴백 게이트 — 맞는 시드를 못 찾았을 때만 켠다 */
interface GateState {
  order: string[]
  nextIdx: number
  lastReleaseStep: number
  openAll: boolean
}

export interface World {
  course: Course
  marbles: Marble[]
  step: number
  /** 휠 방향 벡터 (cos, sin) */
  wc: number; ws: number
  /** 이번 스텝에 세게 부딪힌 페그 인덱스 */
  hits: number[]
  hitCount: number
  /** 이번 스텝에 맞은 범퍼 인덱스 */
  bumpHits: number[]
  bumpHitCount: number
  /** 팀 공이 림을 통과한 순서 */
  goals: string[]
  /** 각 골의 스텝 */
  goalSteps: number[]
  /** 이번 스텝에 골이 났으면 그 팀 id (중립이면 '') — 소리·플래시용 */
  justScored: string | null
  /** 팀 공 총수 */
  teamTotal: number
  /** 렌더용 파생값 */
  screenX: number
  screenX2: number
  clockShut: boolean
  clockGapLeft: boolean
  clockNum: number
  protX: number
  /** 슬로우 빔 — 발사점과 반대쪽 벽에 닿는 점 (그림·물리 공용) */
  beamEx: number; beamEy: number
  beamTx: number; beamTy: number
  gate: GateState | null
  /** 적분 전 y — 림 통과 판정용 (매 스텝 재사용, 할당 없음) */
  prevY: number[]
}

// 휠: 2.4초에 1회전 = 288스텝. θ = 2π/288 의 cos/sin 을 상수로 박는다.
const WC = 0.99976196
const WS = 0.02181486
/** 각속도 rad/s — 접촉점 속도 계산용 */
const WHEEL_OMEGA = 2.617994

/** 게이트가 한 개 내보낸 뒤 다음까지의 최소 간격(스텝) */
const RELEASE_GAP = 42

export function createWorld(order: string[], seed?: number, gateOn = false): World {
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
      scored: false,
      scoredStep: -1,
      out: false,
      released: false,
      ghost: false,
      screenTouches: 0,
      screenPrev: false,
      protTouches: 0,
      protPrev: false,
      bumpTouches: 0,
      beamT: 0,
      beamSteps: 0,
      markY: -1e9,
      still: 0,
    })
  }

  order.forEach((tid, i) => spawn(tid, lanes[i]))
  for (let i = 0; i < NEUTRAL_COUNT; i++) spawn(null, lanes[order.length + i])

  return {
    course, marbles, step: 0, wc: 1, ws: 0,
    hits: [], hitCount: 0,
    bumpHits: [], bumpHitCount: 0,
    goals: [], goalSteps: [], justScored: null,
    teamTotal: order.length,
    screenX: screenX(0), screenX2: screenX2(0),
    clockShut: clockClosed(0), clockGapLeft: clockGapLeft(0), clockNum: clockReadout(0),
    protX: protectorX(0),
    beamEx: course.beamLeft ? 0 : COURSE_W, beamEy: BEAM_EY,
    beamTx: course.beamLeft ? COURSE_W : 0, beamTy: beamTargetY(0),
    gate: gateOn ? { order: [...order], nextIdx: 0, lastReleaseStep: -RELEASE_GAP, openAll: false } : null,
    prevY: new Array(marbles.length).fill(0),
  }
}

/** 팀 공이 전부 골인했는가 */
export function raceOver(w: World): boolean {
  return w.goals.length >= w.teamTotal
}

/** 한 스텝(1/120초). */
export function stepWorld(w: World): void {
  const { course } = w
  const ms = w.marbles
  w.hitCount = 0
  w.bumpHitCount = 0
  w.justScored = null

  // 휠 회전 — 상수 곱 후 재정규화(누적 오차조차 모든 기기에서 동일하다)
  const nc = w.wc * WC - w.ws * WS
  const nsv = w.wc * WS + w.ws * WC
  const norm = Math.sqrt(nc * nc + nsv * nsv)
  w.wc = nc / norm
  w.ws = nsv / norm

  // 장애물 상태 — step 만으로 정해진다
  const sx = screenX(w.step)
  const sx2 = screenX2(w.step)
  const shut = clockClosed(w.step)
  const bar = clockBar(w.step)
  const px = protectorX(w.step)
  const bex = course.beamLeft ? 0 : COURSE_W
  const btx = course.beamLeft ? COURSE_W : 0
  const bty = beamTargetY(w.step)
  const bdx = btx - bex, bdy = bty - BEAM_EY
  const blen = Math.sqrt(bdx * bdx + bdy * bdy)
  const bux = bdx / blen, buy = bdy / blen
  w.beamEx = bex; w.beamEy = BEAM_EY; w.beamTx = btx; w.beamTy = bty
  w.screenX = sx
  w.screenX2 = sx2
  w.clockShut = shut
  w.clockGapLeft = clockGapLeft(w.step)
  w.clockNum = clockReadout(w.step)
  w.protX = px

  // ── 폴백 게이트: 슈트가 비었을 때만 다음 한 개를 내보낸다
  const g = w.gate
  if (g && !g.openAll) {
    // ⚠ "슈트 안에 있는가" 로 세면 안 된다. 허가만 받고 아직 퍼널에 있는 공이 둘이면
    //    나중에 허가받은 공이 앞질러 들어가 순서가 뒤집힌다(실측: 30판 중 5~8판 불일치).
    //    허가받고 아직 골인 안 한 공이 **하나라도** 있으면 다음을 안 내보낸다.
    let chuteBusy = false
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]
      if (m.out || m.scored || !m.released) continue
      chuteBusy = true; break
    }
    if (!chuteBusy && w.step - g.lastReleaseStep >= RELEASE_GAP) {
      if (g.nextIdx >= g.order.length) {
        g.openAll = true
      } else {
        // 다음 차례 팀 공이 퍼널 안에 와 있으면 내보낸다
        let pick = -1
        const want = g.order[g.nextIdx]
        for (let i = 0; i < ms.length; i++) {
          const m = ms[i]
          if (m.team === want && !m.released && !m.out) { pick = i; break }
        }
        // ⚠ 감시 시계: 3초를 기다렸으면 **어디 있든** 호송을 시작한다. 예전엔 "퍼널 근처에
        //    와 있을 때만" 내보냈는데, 기다리는 팀 공이 위쪽 레인에서 늦어지면 게이트가
        //    영원히 멈췄다(12팀 실측: 45초 초과·정착률 67%). 폴백이 멎으면 순서 보장이 없다.
        const overdue = w.step - g.lastReleaseStep > 360
        if (pick >= 0 && (overdue || ms[pick].y > CHUTE_TOP - 18)) {
          ms[pick].released = true
          // 늦어서 불려 나온 공은 장애물을 통과시킨다. 안 그러면 위쪽 레인에 갇힌 공을
          // 기다리다 폴백이 통째로 멎는다(12팀에서 45초 초과가 남아 있었다).
          if (overdue) ms[pick].ghost = true
          g.nextIdx++
          g.lastReleaseStep = w.step
        } else {
          // 아직 안 내려왔다 — 기다리는 동안 중립 공 하나를 흘려보내 화면이 멎지 않게 한다
          let nb = -1, nbY = -Infinity
          for (let i = 0; i < ms.length; i++) {
            const m = ms[i]
            if (m.team || m.released || m.out) continue
            if (m.y > CHUTE_TOP - 14 && m.y > nbY) { nbY = m.y; nb = i }
          }
          if (nb >= 0) { ms[nb].released = true; g.lastReleaseStep = w.step }
        }
      }
    }
  }
  const gateActive = !!g && !g.openAll

  // ── 적분
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i]
    w.prevY[i] = m.y
    if (m.out) continue
    m.vy += G * SIM_DT

    if (!m.scored) {
      // ── 끼임 해제(불변식). 페그 꼭대기에 올라앉거나 퍼널 목에서 두 개가 맞물리면
      // 마찰이 0.004 라 **영원히** 그 자리에 있는다(실측: 6팀 판에서 t2 가 (7.2,114.1)
      // 에 45초간 정지). 「0.5초 동안 0.35 도 못 내려갔다」를 끼임으로 보고 옆으로 턴다.
      // 조건이 심 상태에서만 나오므로 결정론은 유지된다.
      if (m.y > m.markY + 0.5) { m.markY = m.y; m.still = 0 }
      else if (++m.still > 45) {
        // 옆으로만 털면 장애물 위에 올라탄 공은 제자리로 돌아온다 — 아래로도 민다
        m.vx += (((i + (w.step >> 6)) & 1) === 0 ? -3 : 3)
        m.vy += 2.5
        m.still = 0
        m.markY = m.y
      }
      // 게이트가 허가한 공은 입구로 안내한다(다른 공을 통과해서라도 내려가야 교착이 없다)
      // 호송 구간을 레인 아래 전체로 넓힌다 — 감시 시계가 위쪽 공을 부를 수 있으므로
      if (gateActive && m.released && (m.ghost || m.y > LANE_Y0) && m.y < CHUTE_TOP + 1) {
        m.vx += (HOOP_X - m.x) * (m.ghost ? 10 : 7) * SIM_DT
        m.vy += (m.ghost ? 40 : 22) * SIM_DT
      }
    }

    m.vx *= DRAG
    m.vy *= DRAG
    // 슬로우 빔 — 충돌체가 아니라 감속이라 끼임을 만들지 않는다. 순수 곱셈 + sqrt 뿐.
    // ×0.90/스텝 은 중력(28)과 균형이 맞는 종단속도 2.1 을 만든다 → 멈추지 않고 **기어간다**.
    m.beamT = m.beamT > 0 ? m.beamT - 0.06 : 0
    if (!m.scored) {
      const rx = m.x - bex, ry = m.y - BEAM_EY
      const along = rx * bux + ry * buy
      if (along > 0 && along < blen) {
        const perp = rx * buy - ry * bux
        if (perp < BEAM_HALF && perp > -BEAM_HALF) {
          m.vx *= BEAM_DRAG
          m.vy *= BEAM_DRAG
          m.beamT = 1
          m.beamSteps++
        }
      }
    }
    const sp2 = m.vx * m.vx + m.vy * m.vy
    if (sp2 > VMAX * VMAX) {
      const k = VMAX / Math.sqrt(sp2)
      m.vx *= k; m.vy *= k
    }
    m.x += m.vx * SIM_DT
    m.y += m.vy * SIM_DT
    m.rot += m.vx * SIM_DT * 1.6
  }

  // ── 정적 선분 / 페그 / 범퍼 / 장애물
  // 스크린 2는 기울기를 반대로 준다 — 두 개가 같은 쪽으로 공을 흘리면 한쪽 레인만 뚫린다.
  const s1a = course.screen1Y - SCREEN_TILT, s1b = course.screen1Y + SCREEN_TILT
  const s2a = course.screen2Y + SCREEN_TILT, s2b = course.screen2Y - SCREEN_TILT
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i]
    if (m.out || m.scored) continue
    const ghost = m.ghost
    const b = bucketFor(m.y, course.bucketCount)
    for (let d = -1; d <= 1; d++) {
      const bi = b + d
      if (bi < 0 || bi >= course.bucketCount) continue
      const sl = course.segBuckets[bi]
      for (let k = 0; k < sl.length; k++) {
        const s = course.segs[sl[k]]
        if (ghost && s.kind !== 'wall' && s.kind !== 'funnel' && s.kind !== 'chute') continue
        collideSegment(m, s.x1, s.y1, s.x2, s.y2, s.rest, 0)
      }
      const pl = ghost ? [] : course.pegBuckets[bi]
      for (let k = 0; k < pl.length; k++) {
        const pi = pl[k]
        const p = course.pegs[pi]
        if (collideCircle(m, p.x, p.y, p.r, 0.46)) {
          w.hits[w.hitCount++] = pi
        }
      }
    }

    // 스크린(픽) 2개 — 좌우로 미끄러지는 기울어진 벽
    let onScreen = false
    if (!ghost && m.y > s1a - 2 && m.y < s1b + 2) {
      if (collideSegment(m, sx, s1a, sx + SCREEN_LEN, s1b, 0.24, 0.36)) onScreen = true
    }
    if (!ghost && m.y > s2b - 2 && m.y < s2a + 2) {
      if (collideSegment(m, sx2, s2a, sx2 + SCREEN_LEN, s2b, 0.24, 0.36)) onScreen = true
    }
    if (!m.screenPrev && onScreen) m.screenTouches++
    m.screenPrev = onScreen
    // 샷클락 게이트 — 닫혀 있는 동안만 존재. 한쪽 끝에 공 한 개 폭 틈이 남아 조금씩 샌다.
    // 호송 중인 공은 샷클락도 통과시킨다 — 0.8초라도 호송이 막히면 폴백이 늘어진다
    if (shut && !(gateActive && m.released) && m.y > CLOCK_Y - 2 && m.y < CLOCK_Y + 2) {
      collideSegment(m, bar[0], CLOCK_Y, bar[1], CLOCK_Y, 0.05, 0.3)
    }
    // 림 프로텍터 — 슈트 입구 위에서 흔들리는 큰 수비수 + 들어올린 팔
    // ⚠ 팔에 **충돌을 주지 않는다.** 팔을 달았더니 어깨와 머리 사이 오목한 홈이 생겨 공이
    //    거기 얹혔다 — 팔을 세워도(67°) 50판 중 8판이 (11.1, 134.5)에서 안 내려왔다.
    //    몸통 원 하나만 충돌시키면 **볼록한 도형**이라 낄 자리가 없다. 팔은 그림 전용.
    // ⚠ 게이트가 호송 중인 공은 프로텍터를 통과시킨다. 안 그러면 슈트 입구로 조준된 공이
    //    프로텍터에 정면으로 박혀 멎고, **폴백 자체가 깨진다**(12팀 실측: 순서일치 18/20,
    //    최장 45초, 정착률 67%). 폴백은 순서를 보장하는 마지막 장치라 여기서 막히면 안 된다.
    let onProt = false
    if (!(gateActive && m.released) && m.y > PROT_Y - 4 && m.y < PROT_Y + PROT_R + 2) {
      collideCircle(m, px, PROT_Y, PROT_R, 0.4)
      // collideCircle 의 true 는 "세게 맞았나"(소리용)라 접촉 계측에는 못 쓴다 — 거리로 센다
      const ddx = m.x - px, ddy = m.y - PROT_Y, reach = m.r + PROT_R + 0.02
      if (ddx * ddx + ddy * ddy < reach * reach) onProt = true
    }
    if (!m.protPrev && onProt) m.protTouches++
    m.protPrev = onProt
    // 리바운드 범퍼 — 반발 1.4
    const bl = ghost ? [] : course.bumpers
    for (let k = 0; k < bl.length; k++) {
      const bp = bl[k]
      if (m.y < bp.y - bp.r - 2 || m.y > bp.y + bp.r + 2) continue
      if (collideCircle(m, bp.x, bp.y, bp.r, BUMPER_REST)) {
        w.bumpHits[w.bumpHitCount++] = k
        m.bumpTouches++
      }
    }
    // 슈트 마개 — 허가받지 않은 공을 입구에서 세운다(폴백일 때만 존재)
    if (gateActive && !m.released && m.y > CHUTE_TOP - 2 && m.y < CHUTE_TOP + 1.5) {
      collideSegment(m, CHUTE_X0 - 0.2, CHUTE_TOP, CHUTE_X1 + 0.2, CHUTE_TOP, 0.05, 0.22)
    }
  }

  // ── 회전체 2개: 레인 안의 스핀무브 휠 + V 아래의 분배기
  for (const wh of [course.wheel, ...course.distributors]) {
  for (let a = 0; a < wh.arms; a++) {
    // 팔 방향 = (wc,ws) 를 90°씩 돌린 것 — 부호 교환뿐이라 정확하다
    const sgn = wh.spin
    const wcx = w.wc, wsy = w.ws * sgn
    let dx = wcx, dy = wsy
    if (a === 1) { dx = -wsy; dy = wcx }
    else if (a === 2) { dx = -wcx; dy = -wsy }
    else if (a === 3) { dx = wsy; dy = -wcx }
    const ex = wh.x + dx * wh.len
    const ey = wh.y + dy * wh.len
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]
      if (m.out || m.scored || m.ghost) continue
      if (m.y < wh.y - wh.len - 3 || m.y > wh.y + wh.len + 3) continue
      collideSegment(m, wh.x, wh.y, ex, ey, 0.42, wh.thick, wh.x, wh.y, WHEEL_OMEGA * sgn)
    }
  }
  }

  // ── 구슬끼리 (최대 20개 — O(n²) 로 충분하고, 고정 순회 순서가 결정론을 지킨다).
  // 골인한 공과 게이트가 안내 중인 공은 빠진다(안내 중인 공이 더미를 뚫고 내려가야 교착이 없다).
  for (let i = 0; i < ms.length; i++) {
    const a = ms[i]
    if (a.out || a.scored || (gateActive && a.released)) continue
    for (let j = i + 1; j < ms.length; j++) {
      const c = ms[j]
      if (c.out || c.scored || (gateActive && c.released)) continue
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

  // ── 좌우 이탈 보정 + 골인 판정
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i]
    if (m.out) continue
    if (!m.scored && m.y < FUNNEL_TOP_Y) {
      // 벽 선분이 놓친 경우의 안전망. 퍼널 아래에서는 퍼널이 벽이므로 걸지 않는다.
      if (m.x < m.r) { m.x = m.r; if (m.vx < 0) m.vx = -m.vx * 0.2 }
      if (m.x > COURSE_W - m.r) { m.x = COURSE_W - m.r; if (m.vx > 0) m.vx = -m.vx * 0.2 }
    }
    // 림 통과 = 골인. 슈트가 x 를 가운데로 묶어 두므로 여기 닿은 공은 항상 림 안이다.
    if (!m.scored && w.prevY[i] <= RIM_Y && m.y > RIM_Y
      && m.x > HOOP_X - HOOP_HALF && m.x < HOOP_X + HOOP_HALF) {
      m.scored = true
      m.scoredStep = w.step
      if (m.team) {
        w.goals.push(m.team)
        w.goalSteps.push(w.step)
        w.justScored = m.team
      } else if (w.justScored === null) {
        w.justScored = ''
      }
    }
    if (m.y > DESPAWN_Y) m.out = true
  }

  w.step++
}

/** 원 vs 선분. thick>0 이면 두꺼운 선분(캡슐). omega 를 주면 (cx,cy) 중심 회전체로 본다. */
function collideSegment(
  m: Marble, x1: number, y1: number, x2: number, y2: number, rest: number, thick: number,
  cx = 0, cy = 0, omega = 0,
): boolean {
  const dx = x2 - x1, dy = y2 - y1
  const L2 = dx * dx + dy * dy
  let t = L2 === 0 ? 0 : ((m.x - x1) * dx + (m.y - y1) * dy) / L2
  if (t < 0) t = 0; else if (t > 1) t = 1
  const px = x1 + dx * t, py = y1 + dy * t
  let ox = m.x - px, oy = m.y - py
  const d2 = ox * ox + oy * oy
  const reach = m.r + thick
  if (d2 >= reach * reach) return false
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
  return true
}

/** 원 vs 정적 원. 세게 맞으면 true(소리·플래시용). */
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

/** 아직 골인하지 않은 팀 구슬 중 가장 앞선(아래쪽) 것 — 카메라 추적 대상 */
export function leaderIndex(w: World): number {
  let best = -1, bestY = -Infinity
  for (let i = 0; i < w.marbles.length; i++) {
    const m = w.marbles[i]
    if (!m.team || m.out || m.scored) continue
    if (m.y > bestY) { bestY = m.y; best = i }
  }
  return best
}

/** 팀 공 하나라도 슈트에 들어왔는가 — 카메라를 골대 프레이밍으로 옮기는 신호 */
export function teamInChute(w: World): boolean {
  for (const m of w.marbles) {
    if (!m.team || m.out) continue
    if (m.scored || m.y > CHUTE_TOP - 2) return true
  }
  return false
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
