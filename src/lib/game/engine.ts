// 미라클 후프스 0단계 — 손맛 시험판 엔진 (2026-11-13)
//
// 설계: docs/miracle-hoops-game-design.md
// 0단계 목적은 「조작이 재밌나」만 보는 것이다. 선수 데이터·스킬·그림은 없다(네모 캐릭터).
// 외부 게임 엔진 없이 캔버스 2D 하나로 그린다 — 의존성 0.
//
// 좌표: 코트 단위는 미터. x = 0(왼쪽 사이드라인)~15, y = 0(골대 쪽 끝선)~11(하프라인).
// 높이 z 는 미터(바닥 0, 림 3.05). 화면은 위에서 비스듬히 본 모습으로 그린다.

export type Difficulty = 'easy' | 'normal' | 'hard'

export interface GameOptions {
  /** 경기 시간(초) */
  seconds: number
  /** 먼저 도달하면 끝나는 점수 (0 = 없음) */
  target: number
  difficulty: Difficulty
  /** 진동(안드로이드 브라우저만 — 아이폰 사파리는 웹 진동을 막는다) */
  vibrate: boolean
}

export interface GameResult {
  score: [number, number]
  stats: { shots: number; made: number; threes: number; steals: number; blocks: number; assists: number }
}

// ── 코트 ──
const COURT_W = 15
const COURT_D = 11
const HOOP = { x: 7.5, y: 1.4 }
const RIM_Z = 3.05
const ARC_R = 6.0
const TOP = { x: 7.5, y: 8.6 }

// ── 화면(논리 좌표 960×540) ──
const VW = 960
const VH = 540
const PX = 46 // 가로 1m
const PY = 30 // 세로 1m (기울여 봄)
const PZ = 34 // 높이 1m
const OX = (VW - COURT_W * PX) / 2
const OY = 188

/** 픽셀 그림체 — 코트·선수는 이 배율만큼 거칠게 그린 뒤 키운다(글자·버튼은 선명하게) */
const PIXEL = 2

const sx = (x: number) => OX + x * PX
const sy = (y: number, z = 0) => OY + y * PY - z * PZ

// ── 규칙 ──
const SHOT_CLOCK = 12
const BASE_SPEED = 5.2
const DASH_SPEED = 9.5
const DASH_TIME = 0.32
const DASH_COOL = 2.4
const STEAL_COOL = 0.9
const STEAL_RANGE = 1.25
/** 사람이 조종하는 수비는 손이 더 길다(스틸이 어렵다는 피드백, 2026-11-13) */
const STEAL_RANGE_HUMAN = 1.7
const PICKUP_R = 0.62
const GRAVITY = 9.8

const TEAM_COLOR = ['#f5c518', '#2e3a59'] as const
const TEAM_EDGE = ['#8a6a00', '#9fb0d8'] as const
const TEAM_NAME = ['우리 팀', '컴퓨터'] as const

interface Player {
  id: number
  team: 0 | 1
  num: number
  x: number; y: number
  vx: number; vy: number
  z: number; vz: number
  dashT: number; dashCool: number
  stealCool: number
  stunT: number
  spot: { x: number; y: number }
  aiT: number
  faceX: number; faceY: number
  /** 연속 성공 수 — 3이면 핫핸드 */
  streak: number
  fire: boolean
  fakeT: number; fakeCool: number
  /** 컴퓨터 슛 준비 동작 — 이 사이에 사람이 뛰어 막을 수 있다 */
  windT: number; windQ: number; windKind: ShotKind
}

type BallState = 'held' | 'pass' | 'shot' | 'loose'
export type ShotKind = 'jump' | 'layup' | 'dunk'

interface Ball {
  state: BallState
  holder: Player | null
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  // 패스·슛 비행
  t: number; dur: number
  fromX: number; fromY: number; fromZ: number
  toX: number; toY: number; toZ: number
  peak: number
  target: Player | null
  passer: Player | null
  shooter: Player | null
  willMake: boolean
  isThree: boolean
  kind: ShotKind
  /** 날아가는 동안 블록을 시도한 수비(한 번씩만) */
  blockTried: Set<number>
  lastTeam: 0 | 1
  interceptTried: Set<number>
}

interface Pop { text: string; x: number; y: number; t: number; color: string; big?: boolean }

interface Pointer { id: number; kind: 'stick' | 'shoot' | 'pass' | 'dash'; ox: number; oy: number; x: number; y: number }


const DIFF = {
  // onBall·offBall = 수비가 상대에게서 떨어지는 거리(m, 작을수록 바짝) · fakeBite = 페이크에 속아 뛸 확률
  easy: { qMin: 0.15, qMax: 0.75, stealRate: 0.15, stealChance: 0.12, blockReact: 0.3, speed: 0.86, onBall: 0.95, offBall: 1.6, help: false, fakeBite: 0.8, fakeUse: 0.1, windup: 0.5 },
  normal: { qMin: 0.35, qMax: 0.95, stealRate: 0.3, stealChance: 0.2, blockReact: 0.5, speed: 0.95, onBall: 0.7, offBall: 1.15, help: true, fakeBite: 0.6, fakeUse: 0.25, windup: 0.38 },
  hard: { qMin: 0.55, qMax: 1.0, stealRate: 0.5, stealChance: 0.28, blockReact: 0.7, speed: 1.0, onBall: 0.55, offBall: 0.9, help: true, fakeBite: 0.4, fakeUse: 0.4, windup: 0.28 },
} as const

/** 타격감 진동 — 이벤트마다 한 벌. 숫자 = 진동 ms, 쉼 ms, 진동 ms … */
const HAPTIC = {
  tap: 8,
  release: 12,
  perfect: [12, 30, 28],
  dash: 10,
  score2: 45,
  score3: [40, 40, 75],
  dunk: [70, 30, 110],
  oppScore: 18,
  block: 70,
  blocked: [30, 25, 30],
  steal: 38,
  stolen: [25, 25, 25],
  rim: 10,
  fakeHit: 22,
  fire: [30, 40, 30, 40, 110],
  end: [80, 60, 160],
} as const satisfies Record<string, number | readonly number[]>

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by)
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const hoopDist = (p: { x: number; y: number }) => dist(p.x, p.y, HOOP.x, HOOP.y)

export class HoopsGame {
  private ctx: CanvasRenderingContext2D
  private canvas: HTMLCanvasElement
  private raf = 0
  private last = 0
  private scale = 1
  private offX = 0
  private offY = 0
  /** 화면 실제 가장자리(논리 좌표) — 폰처럼 옆이 남는 화면에서 버튼을 가장자리에 붙인다 */
  private viewL = 0
  private viewR = VW
  private viewB = VH
  private opts: GameOptions
  private onOver: (r: GameResult) => void

  private players: Player[] = []
  private ball!: Ball
  private score: [number, number] = [0, 0]
  private clock = 0
  private shotClock = SHOT_CLOCK
  /** 공을 잡은 뒤 지난 시간 — 잡자마자 컴퓨터가 뺏지 않게 */
  private holdT = 0
  private offense: 0 | 1 = 0
  private needsClear = false
  private suddenDeath = false
  private deadT = 0
  private deadNext: (() => void) | null = null
  private over = false
  private pops: Pop[] = []
  private shake = 0
  private controlled!: Player
  private userDefender: Player | null = null
  private result: GameResult['stats'] = { shots: 0, made: 0, threes: 0, steals: 0, blocks: 0, assists: 0 }

  // 입력
  private pointers = new Map<number, Pointer>()
  private keys = new Set<string>()
  private stick = { x: 0, y: 0 }
  private shootHeld = false
  private shootWas = false
  private passEdge = false
  private dashEdge = false
  /** 이번 슛의 종류(누른 순간 정한다) */
  private shotKind: ShotKind = 'jump'
  private meter = 0
  private metering = false
  private meterT = 0
  private callForBall = false
  private touchSeen = false

  constructor(canvas: HTMLCanvasElement, opts: GameOptions, onOver: (r: GameResult) => void) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('캔버스를 열 수 없어요')
    this.ctx = ctx
    this.opts = opts
    this.onOver = onOver
    this.reset()
    this.bind()
    this.resize()
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.unbind()
  }

  // ───────────────────────── 준비 ─────────────────────────
  private reset() {
    const mk = (id: number, team: 0 | 1, num: number, spot: { x: number; y: number }): Player => ({
      id, team, num, x: spot.x, y: spot.y, vx: 0, vy: 0, z: 0, vz: 0,
      dashT: 0, dashCool: 0, stealCool: 0, stunT: 0, spot, aiT: Math.random(), faceX: 0, faceY: -1,
      streak: 0, fire: false, fakeT: 0, fakeCool: 0, windT: 0, windQ: 0, windKind: 'jump',
    })
    const spots = [{ x: 7.5, y: 8.4 }, { x: 2.6, y: 5.0 }, { x: 12.4, y: 5.0 }]
    this.players = [
      mk(0, 0, 7, spots[0]), mk(1, 0, 11, spots[1]), mk(2, 0, 23, spots[2]),
      mk(3, 1, 3, { ...spots[0] }), mk(4, 1, 8, { ...spots[1] }), mk(5, 1, 30, { ...spots[2] }),
    ]
    this.ball = {
      state: 'held', holder: null, x: 0, y: 0, z: 1, vx: 0, vy: 0, vz: 0,
      t: 0, dur: 0, fromX: 0, fromY: 0, fromZ: 0, toX: 0, toY: 0, toZ: 0, peak: 0,
      target: null, passer: null, shooter: null, willMake: false, isThree: false, lastTeam: 0,
      interceptTried: new Set(), kind: 'jump', blockTried: new Set(),
    }
    this.score = [0, 0]
    this.clock = this.opts.seconds
    this.over = false
    this.suddenDeath = false
    this.result = { shots: 0, made: 0, threes: 0, steals: 0, blocks: 0, assists: 0 }
    this.giveTop(Math.random() < 0.5 ? 0 : 1, '점프볼!')
  }

  /** 3대3 규칙: 득점·공격 시간 초과 뒤엔 상대가 3점 선 밖 꼭대기에서 시작 */
  private giveTop(team: 0 | 1, msg?: string) {
    const mine = this.players.filter(p => p.team === team)
    const theirs = this.players.filter(p => p.team !== team)
    const offSpots = [{ x: 7.5, y: 8.8 }, { x: 2.4, y: 5.4 }, { x: 12.6, y: 5.4 }]
    const defSpots = [{ x: 7.5, y: 7.2 }, { x: 3.6, y: 4.4 }, { x: 11.4, y: 4.4 }]
    mine.forEach((p, i) => { p.x = offSpots[i].x; p.y = offSpots[i].y; p.vx = p.vy = 0; p.z = 0; p.vz = 0 })
    theirs.forEach((p, i) => { p.x = defSpots[i].x; p.y = defSpots[i].y; p.vx = p.vy = 0; p.z = 0; p.vz = 0 })
    this.offense = team
    this.needsClear = false
    this.shotClock = SHOT_CLOCK
    this.hold(mine[0])
    if (msg) this.pop(msg, VW / 2, 250, '#ffffff', true)
  }

  private hold(p: Player) {
    const b = this.ball
    b.state = 'held'
    b.holder = p
    b.target = null
    b.vx = b.vy = b.vz = 0
    if (b.lastTeam !== p.team) {
      // 공격권이 바뀜
      this.offense = p.team
      this.shotClock = SHOT_CLOCK
    }
    b.lastTeam = p.team
    this.holdT = 0
    for (const o of this.players) o.windT = 0
    if (p.team === 0) this.controlled = p
    this.callForBall = false
  }

  // ───────────────────────── 입력 ─────────────────────────
  private toLogical(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect()
    return { x: (e.clientX - r.left - this.offX) / this.scale, y: (e.clientY - r.top - this.offY) / this.scale }
  }

  private get btn() {
    const R = this.viewR - 18, B = this.viewB - 16
    return {
      shoot: { x: R - 56, y: B - 64, r: 54 },
      pass: { x: R - 168, y: B - 34, r: 36 },
      dash: { x: R - 50, y: B - 192, r: 34 },
    }
  }

  private onDown = (e: PointerEvent) => {
    const BTN = this.btn
    if (e.pointerType === 'touch') this.touchSeen = true
    const { x, y } = this.toLogical(e)
    this.canvas.setPointerCapture?.(e.pointerId)
    let kind: Pointer['kind'] = 'stick'
    if (dist(x, y, BTN.shoot.x, BTN.shoot.y) < BTN.shoot.r + 14) kind = 'shoot'
    else if (dist(x, y, BTN.pass.x, BTN.pass.y) < BTN.pass.r + 12) kind = 'pass'
    else if (dist(x, y, BTN.dash.x, BTN.dash.y) < BTN.dash.r + 12) kind = 'dash'
    else if (x > (this.viewL + this.viewR) / 2) return
    if (kind === 'pass') this.passEdge = true
    if (kind === 'dash') this.dashEdge = true
    if (kind !== 'stick') this.haptic(HAPTIC.tap)
    this.pointers.set(e.pointerId, { id: e.pointerId, kind, ox: x, oy: y, x, y })
    e.preventDefault()
  }
  private onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    const { x, y } = this.toLogical(e)
    p.x = x; p.y = y
  }
  private onUp = (e: PointerEvent) => { this.pointers.delete(e.pointerId) }
  private onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase()
    const game = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'j', 'k', 'l', ' ', 'shift']
    if (!game.includes(k)) return
    e.preventDefault()
    if (e.type === 'keydown') {
      if (!this.keys.has(k)) {
        if (k === 'k') this.passEdge = true
        if (k === 'l' || k === 'shift') this.dashEdge = true
      }
      this.keys.add(k)
    } else this.keys.delete(k)
  }
  private onResize = () => this.resize()
  private onBlur = () => { this.keys.clear(); this.pointers.clear() }

  private bind() {
    const c = this.canvas
    c.addEventListener('pointerdown', this.onDown)
    c.addEventListener('pointermove', this.onMove)
    c.addEventListener('pointerup', this.onUp)
    c.addEventListener('pointercancel', this.onUp)
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', this.onKey)
    window.addEventListener('resize', this.onResize)
    window.addEventListener('blur', this.onBlur)
  }
  private unbind() {
    const c = this.canvas
    c.removeEventListener('pointerdown', this.onDown)
    c.removeEventListener('pointermove', this.onMove)
    c.removeEventListener('pointerup', this.onUp)
    c.removeEventListener('pointercancel', this.onUp)
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('keyup', this.onKey)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('blur', this.onBlur)
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.round(r.width * dpr)
    this.canvas.height = Math.round(r.height * dpr)
    this.scale = Math.min(r.width / VW, r.height / VH)
    this.offX = (r.width - VW * this.scale) / 2
    this.offY = (r.height - VH * this.scale) / 2
    this.viewL = -this.offX / this.scale
    this.viewR = VW + this.offX / this.scale
    this.viewB = VH + this.offY / this.scale
    this.ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, dpr * this.offX, dpr * this.offY)
  }

  private readInput() {
    let x = 0, y = 0
    let shoot = false
    for (const p of this.pointers.values()) {
      if (p.kind === 'stick') {
        const dx = p.x - p.ox, dy = p.y - p.oy
        const m = Math.hypot(dx, dy)
        const R = 56
        if (m > 6) { x = dx / Math.max(m, R); y = dy / Math.max(m, R) }
        if (m > R) { p.ox = p.x - (dx / m) * R; p.oy = p.y - (dy / m) * R }
      }
      if (p.kind === 'shoot') shoot = true
    }
    const k = this.keys
    if (k.has('arrowleft') || k.has('a')) x -= 1
    if (k.has('arrowright') || k.has('d')) x += 1
    if (k.has('arrowup') || k.has('w')) y -= 1
    if (k.has('arrowdown') || k.has('s')) y += 1
    if (k.has('j') || k.has(' ')) shoot = true
    const m = Math.hypot(x, y)
    if (m > 1) { x /= m; y /= m }
    // 화면 세로는 코트 세로보다 눌려 있으므로 그대로 써도 손 느낌이 맞다
    this.stick = { x, y }
    this.shootWas = this.shootHeld
    this.shootHeld = shoot
  }

  // ───────────────────────── 진행 ─────────────────────────
  private loop = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    this.readInput()
    if (!this.over) this.update(dt)
    this.render()
    this.passEdge = false
    this.dashEdge = false
    this.raf = requestAnimationFrame(this.loop)
  }

  private update(dt: number) {
    for (const p of this.pops) p.t += dt
    this.pops = this.pops.filter(p => p.t < 1.3)
    this.shake = Math.max(0, this.shake - dt * 3)

    if (this.deadT > 0) {
      this.deadT -= dt
      this.updateBall(dt)
      for (const p of this.players) this.physics(p, dt, 0, 0, false)
      if (this.deadT <= 0 && this.deadNext) { const f = this.deadNext; this.deadNext = null; f() }
      return
    }

    if (!this.suddenDeath) {
      this.clock -= dt
      if (this.clock <= 0) {
        this.clock = 0
        if (this.score[0] === this.score[1]) {
          this.suddenDeath = true
          this.pop('동점! 다음 골이 이겨요', VW / 2, 250, '#ffd23f', true)
        } else return this.finish()
      }
    }
    if (this.ball.state === 'held' || this.ball.state === 'pass') {
      this.shotClock -= dt
      if (this.shotClock <= 0) {
        this.pop('공격 시간 초과', VW / 2, 250, '#ff8a65', true)
        const other = (1 - this.offense) as 0 | 1
        this.dead(0.9, () => this.giveTop(other))
        return
      }
    }

    this.holdT += dt
    this.pickControlled()
    this.userControl(dt)
    for (const p of this.players) {
      if (p === this.controlled) continue
      this.ai(p, dt)
    }
    this.updateBall(dt)
  }

  private dead(t: number, next: () => void) {
    this.deadT = t
    this.deadNext = next
    this.metering = false
  }

  private finish() {
    this.over = true
    this.haptic(HAPTIC.end)
    this.onOver({ score: [...this.score] as [number, number], stats: { ...this.result } })
  }

  /** 수비 때는 공에 가장 가까운 우리 선수로 자동 전환(너무 자주 바뀌지 않게 여유를 둔다) */
  private pickControlled() {
    const b = this.ball
    if (b.state === 'held' && b.holder?.team === 0) { this.controlled = b.holder; return }
    if (b.state === 'pass' && b.target?.team === 0) return
    if (b.state === 'held' && b.holder?.team === 1 || b.state === 'loose' || b.state === 'shot') {
      const mine = this.players.filter(p => p.team === 0)
      const bx = b.holder ? b.holder.x : b.x, by = b.holder ? b.holder.y : b.y
      let best = mine[0], bd = Infinity
      for (const p of mine) { const d = dist(p.x, p.y, bx, by); if (d < bd) { bd = d; best = p } }
      const cur = this.controlled && this.controlled.team === 0 ? dist(this.controlled.x, this.controlled.y, bx, by) : Infinity
      if (best !== this.controlled && bd < cur - 1.2) this.controlled = best
    }
  }

  private userControl(dt: number) {
    const p = this.controlled
    const b = this.ball
    const hasBall = b.state === 'held' && b.holder === p
    if (this.dashEdge && p.dashCool <= 0) { p.dashT = DASH_TIME; p.dashCool = p.fire ? DASH_COOL / 2 : DASH_COOL; this.haptic(HAPTIC.dash) }

    if (hasBall) {
      // 슛 게이지: 누르면 차오르고, 떼면 쏜다
      if (this.shootHeld && !this.metering) {
        if (this.needsClear) {
          if (!this.shootWas) this.pop('먼저 3점 선 밖으로!', sx(p.x), sy(p.y) - 70, '#ffd23f')
        } else { this.metering = true; this.meterT = 0; this.shotKind = this.kindFor(p) }
      }
      if (this.metering) {
        this.meterT += dt
        // 골밑 슛(덩크·레이업)은 게이지가 두 배 빨리 찬다
        const fill = this.shotKind === 'jump' ? 0.85 : 0.42
        this.meter = this.meterT < fill ? this.meterT / fill : Math.abs(((this.meterT / fill + 1) % 2) - 1)
        if (!this.shootHeld || this.meterT > 2.4) {
          this.metering = false
          // 짧게 톡 = 페이크
          if (this.meterT < 0.14) { this.pumpFake(p); return }
          const q = this.meterQuality(this.meter, p.fire || this.shotKind !== 'jump')
          this.haptic(q === 1 ? HAPTIC.perfect : HAPTIC.release)
          this.shoot(p, q, this.shotKind)
          return
        }
        if (this.shotKind === 'jump') { p.vx *= 0.8; p.vy *= 0.8; this.physics(p, dt, 0, 0, false); return }
      }
      if (this.passEdge) this.passFrom(p, this.stick.x, this.stick.y)
    } else {
      this.metering = false
      const handler = b.state === 'held' ? b.holder : null
      if (handler && handler.team === 0 && this.passEdge) {
        // 동료가 공을 들고 있을 때 패스 버튼 = 「나한테 줘」
        this.callForBall = true
        this.pop('패스!', sx(p.x), sy(p.y) - 70, '#ffffff')
      }
      if (handler && handler.team === 1) {
        if (this.passEdge) this.trySteal(p, handler, 0.5)
        if (this.shootHeld && !this.shootWas && p.z === 0) this.jump(p)
      } else if ((b.state === 'loose' || b.state === 'shot') && this.shootHeld && !this.shootWas && p.z === 0) {
        this.jump(p)
      }
    }
    this.physics(p, dt, this.stick.x, this.stick.y, true)
  }

  /** 게이지 0~1 중 0.78~0.92 가 초록 칸 */
  private meterQuality(m: number, fire = false) {
    const sweet = 0.85
    const d = Math.abs(m - sweet)
    if (d < (fire ? 0.13 : 0.07)) return 1
    return clamp(1 - (d - 0.07) * 2.6, 0, 0.9)
  }

  private physics(p: Player, dt: number, ix: number, iy: number, isUser: boolean) {
    p.dashCool = Math.max(0, p.dashCool - dt)
    p.stealCool = Math.max(0, p.stealCool - dt)
    p.stunT = Math.max(0, p.stunT - dt)
    p.dashT = Math.max(0, p.dashT - dt)
    const diffSpeed = p.team === 1 ? DIFF[this.opts.difficulty].speed : 1
    let max = (p.dashT > 0 ? DASH_SPEED : BASE_SPEED) * diffSpeed
    if (this.ball.holder === p) max *= 0.9
    if (p.fire) max *= 1.1
    p.fakeT = Math.max(0, p.fakeT - dt)
    p.fakeCool = Math.max(0, p.fakeCool - dt)
    if (p.fakeT > 0) max *= 0.3
    if (p.stunT > 0) max *= 0.35
    if (p.z > 0) { ix *= 0.2; iy *= 0.2 }
    const tx = ix * max, ty = iy * max
    const acc = isUser ? 30 : 22
    p.vx += clamp(tx - p.vx, -acc * dt, acc * dt)
    p.vy += clamp(ty - p.vy, -acc * dt, acc * dt)
    p.x = clamp(p.x + p.vx * dt, 0.3, COURT_W - 0.3)
    p.y = clamp(p.y + p.vy * dt, 0.5, COURT_D - 0.3)
    if (Math.hypot(p.vx, p.vy) > 0.5) { const m = Math.hypot(p.vx, p.vy); p.faceX = p.vx / m; p.faceY = p.vy / m }
    if (p.z > 0 || p.vz > 0) {
      p.vz -= GRAVITY * 1.6 * dt
      p.z += p.vz * dt
      if (p.z <= 0) { p.z = 0; p.vz = 0 }
    }
    // 서로 겹치지 않게 살짝 밀어낸다
    for (const o of this.players) {
      if (o === p) continue
      const d = dist(p.x, p.y, o.x, o.y)
      if (d > 0 && d < 0.55) { const k = (0.55 - d) / d * 0.5; p.x += (p.x - o.x) * k; p.y += (p.y - o.y) * k }
    }
    // 공을 다시 3점 선 밖으로 뺐는지
    if (this.needsClear && this.ball.holder === p && p.team === this.offense && hoopDist(p) > ARC_R + 0.2) {
      this.needsClear = false
      this.pop('공격 시작!', sx(p.x), sy(p.y) - 70, '#7ee787')
    }
  }

  private jump(p: Player, v = 6.0) { p.vz = v; p.z = 0.01 }

  // ───────────────────────── 슛 · 패스 · 스틸 ─────────────────────────
  /** 골대 가까이(2m)에서 달리거나 대시 중이면 덩크, 아니면 레이업, 그 밖은 점프슛 */
  private kindFor(p: Player): ShotKind {
    if (hoopDist(p) > 2.1) return 'jump'
    return Math.hypot(p.vx, p.vy) > 3.6 || p.dashT > 0 ? 'dunk' : 'layup'
  }

  private shoot(p: Player, q: number, kind: ShotKind = this.kindFor(p)) {
    const b = this.ball
    const d = hoopDist(p)
    const isThree = kind === 'jump' && d > ARC_R
    let pct = kind === 'dunk' ? 0.84 : kind === 'layup' ? 0.66 : d < 4.2 ? 0.47 : isThree ? (d > 8.4 ? 0.08 : 0.36) : 0.42
    // 가까운 수비
    let near = Infinity
    for (const o of this.players) if (o.team !== p.team) near = Math.min(near, dist(o.x, o.y, p.x, p.y))
    const contest = kind === 'dunk' ? 0.5 : 1 // 덩크는 수비 영향이 적다
    if (near < 1.0) pct *= 1 - (p.fire ? 0.25 : 0.45) * contest
    else if (near < 2.0) pct *= 1 - (p.fire ? 0.08 : 0.2) * contest
    pct *= 0.5 + 0.75 * q
    if (q === 1) pct += 0.12
    if (p.fire) pct += 0.15
    pct = clamp(pct, 0.03, 0.93)

    if (p.team === 0) { this.result.shots++; if (q === 1) this.pop('완벽!', sx(p.x), sy(p.y) - 92, '#7ee787') }

    // 블록: 점프한 수비가 가까이 있으면
    for (const o of this.players) {
      if (o.team === p.team) continue
      const human = o === this.controlled
      const chance = (human ? 0.75 : 0.5) * (kind === 'dunk' ? 0.5 : 1)
      if (o.z > 0.25 && dist(o.x, o.y, p.x, p.y) < (human ? 1.6 : 1.2) && Math.random() < chance) {
        b.state = 'loose'
        b.holder = null
        b.x = p.x; b.y = p.y; b.z = 2.4
        const ang = Math.atan2(p.y - o.y, p.x - o.x) + rand(-0.6, 0.6)
        b.vx = Math.cos(ang) * 6; b.vy = Math.sin(ang) * 6; b.vz = 2.5
        b.lastTeam = o.team
        this.pop('블록!', sx(o.x), sy(o.y) - 90, '#ff6b6b', true)
        this.shake = 0.6
        if (o.team === 0) this.result.blocks++
        p.streak = 0
        this.needsClear = true
        if (o.team === 0) this.haptic(HAPTIC.block)
        else if (p.team === 0) this.haptic(HAPTIC.blocked)
        return
      }
    }

    b.state = 'shot'
    b.holder = null
    b.shooter = p
    b.willMake = Math.random() < pct
    b.isThree = isThree
    b.kind = kind
    b.fromX = p.x; b.fromY = p.y; b.fromZ = 2.3
    b.toX = HOOP.x + (b.willMake ? 0 : rand(-0.35, 0.35))
    b.toY = HOOP.y + (b.willMake ? 0 : rand(-0.25, 0.3))
    b.toZ = RIM_Z
    b.t = 0
    b.dur = 0.62 + d * 0.065
    b.peak = 1.4 + d * 0.22
    b.blockTried = new Set()
    // 슛 동작 — 몸이 같이 뜬다
    const hx = HOOP.x - p.x, hy = HOOP.y - p.y, hm = Math.hypot(hx, hy) || 1
    if (kind === 'dunk') {
      this.jump(p, 6.6)
      p.vx = (hx / hm) * 4.5; p.vy = (hy / hm) * 4.5
      b.fromZ = 2.6; b.dur = 0.36; b.peak = 0.35
    } else if (kind === 'layup') {
      this.jump(p, 5.0)
      p.vx = (hx / hm) * 3; p.vy = (hy / hm) * 3
      b.fromZ = 2.4; b.dur = 0.55; b.peak = 0.8
    } else {
      this.jump(p, 3.6)
      p.vx = 0; p.vy = 0
    }
    b.lastTeam = p.team
    // 동료 AI 가 그때 막 슛하면 블록 기회를 준다(수비 AI 반응)
    for (const o of this.players) {
      if (o.team !== p.team && o !== this.controlled && o.z === 0 && dist(o.x, o.y, p.x, p.y) < 1.6
        && Math.random() < DIFF[this.opts.difficulty].blockReact * (o.team === 1 ? 1 : 0.7)) this.jump(o)
    }
  }

  /** 날아가는 공을 쳐냄 */
  private swat(o: Player, shooter: Player | null) {
    const b = this.ball
    b.state = 'loose'
    b.holder = null
    const ang = Math.atan2(b.y - o.y, b.x - o.x) + rand(-0.6, 0.6)
    b.vx = Math.cos(ang) * 6; b.vy = Math.sin(ang) * 6; b.vz = 2.5
    b.lastTeam = o.team
    this.pop('블록!', sx(o.x), sy(o.y) - 90, '#ff6b6b', true)
    this.shake = 0.7
    if (o.team === 0) { this.result.blocks++; this.haptic(HAPTIC.block) }
    else if (shooter?.team === 0) this.haptic(HAPTIC.blocked)
    if (shooter) shooter.streak = 0
    this.needsClear = true
  }

  /** 떨어지는 공을 잡을 수 있는 곳(내려오며 높이 2.7m 지점) — 없으면 null */
  private landing(): { x: number; y: number; t: number } | null {
    const b = this.ball
    if (b.state !== 'loose') return null
    let x = b.x, y = b.y, z = b.z, vx = b.vx, vy = b.vy, vz = b.vz
    if (z < 1.4 && vz <= 0) return null
    const step = 1 / 60
    for (let t = 0; t < 2.5; t += step) {
      vz -= GRAVITY * step
      x += vx * step; y += vy * step; z += vz * step
      if (x < 0.2 || x > COURT_W - 0.2) { vx *= -0.7; x = clamp(x, 0.2, COURT_W - 0.2) }
      if (y < 0.3 || y > COURT_D - 0.2) { vy *= -0.7; y = clamp(y, 0.3, COURT_D - 0.2) }
      if (vz < 0 && z <= 2.7) return { x, y, t }
    }
    return null
  }

  private passFrom(p: Player, dx: number, dy: number, to?: Player) {
    const mates = this.players.filter(o => o.team === p.team && o !== p)
    let target = to
    if (!target) {
      const m = Math.hypot(dx, dy)
      if (m > 0.3) {
        let best = -Infinity
        for (const o of mates) {
          const ox = o.x - p.x, oy = o.y - p.y
          const om = Math.hypot(ox, oy) || 1
          const score = (ox * dx + oy * dy) / (om * m) - om * 0.02
          if (score > best) { best = score; target = o }
        }
      } else {
        target = mates.reduce((a, o) => (this.openness(o) > this.openness(a) ? o : a), mates[0])
      }
    }
    if (!target) return
    const b = this.ball
    const d = dist(p.x, p.y, target.x, target.y)
    b.state = 'pass'
    b.holder = null
    b.passer = p
    b.target = target
    b.fromX = p.x; b.fromY = p.y; b.fromZ = 1.3
    b.t = 0
    b.dur = 0.12 + d / 15
    b.interceptTried = new Set()
  }

  private openness(p: Player) {
    let near = Infinity
    for (const o of this.players) if (o.team !== p.team) near = Math.min(near, dist(o.x, o.y, p.x, p.y))
    return near
  }

  private trySteal(p: Player, handler: Player, chance: number) {
    if (p.stealCool > 0) return
    const human = p === this.controlled
    p.stealCool = human ? 0.55 : STEAL_COOL
    if (dist(p.x, p.y, handler.x, handler.y) > (human ? STEAL_RANGE_HUMAN : STEAL_RANGE)) {
      if (p.team === 0) this.pop('헛손질', sx(p.x), sy(p.y) - 70, '#aaaaaa')
      return
    }
    if (Math.random() < chance) {
      const b = this.ball
      b.state = 'loose'
      b.holder = null
      b.x = handler.x; b.y = handler.y; b.z = 0.9
      const ang = Math.atan2(p.y - handler.y, p.x - handler.x) + rand(-0.4, 0.4)
      b.vx = Math.cos(ang) * 3.5; b.vy = Math.sin(ang) * 3.5; b.vz = 1.2
      b.lastTeam = p.team
      handler.stunT = 0.5
      this.pop('스틸!', sx(p.x), sy(p.y) - 80, '#4fc3f7', true)
      if (p.team === 0) { this.result.steals++; this.haptic(HAPTIC.steal) }
      else if (handler.team === 0) this.haptic(HAPTIC.stolen)
    } else {
      p.stunT = 0.35
    }
  }

  // ───────────────────────── 공 ─────────────────────────
  private updateBall(dt: number) {
    const b = this.ball
    if (b.state === 'held' && b.holder) {
      const h = b.holder
      const bounce = Math.abs(Math.sin(performance.now() / 140)) * 0.7
      b.x = h.x + h.faceX * 0.35 + 0.2
      b.y = h.y + h.faceY * 0.25
      b.z = (this.metering && h === this.controlled) || h.fakeT > 0 || h.windT > 0 ? 2.1 : 0.15 + bounce
      return
    }
    if (b.state === 'pass' && b.target) {
      b.t += dt
      const k = clamp(b.t / b.dur, 0, 1)
      const tx = b.target.x, ty = b.target.y
      b.x = b.fromX + (tx - b.fromX) * k
      b.y = b.fromY + (ty - b.fromY) * k
      b.z = b.fromZ + Math.sin(k * Math.PI) * 0.5
      // 가로채기
      for (const o of this.players) {
        if (o.team === b.passer?.team || b.interceptTried.has(o.id)) continue
        if (dist(o.x, o.y, b.x, b.y) < 0.55 && k > 0.15 && k < 0.9) {
          b.interceptTried.add(o.id)
          if (Math.random() < 0.5) {
            this.pop('가로채기!', sx(o.x), sy(o.y) - 80, '#4fc3f7', true)
            if (o.team === 0) { this.result.steals++; this.haptic(HAPTIC.steal) }
            else this.haptic(HAPTIC.stolen)
            this.needsClear = true
            this.hold(o)
            return
          }
        }
      }
      if (k >= 1) {
        const passer = b.passer
        this.hold(b.target)
        if (passer) (b as Ball & { assistFrom?: Player }).assistFrom = passer
      }
      return
    }
    if (b.state === 'shot') {
      b.t += dt
      const k = clamp(b.t / b.dur, 0, 1)
      b.x = b.fromX + (b.toX - b.fromX) * k
      b.y = b.fromY + (b.toY - b.fromY) * k
      b.z = b.fromZ + (b.toZ - b.fromZ) * k + Math.sin(k * Math.PI) * b.peak
      // 올라가는 동안(앞쪽 40%)엔 뛰어오른 수비가 쳐낼 수 있다
      if (k < 0.4 && this.deadT <= 0) {
        for (const o of this.players) {
          if (o.team === b.lastTeam || o.z < 0.3 || b.blockTried.has(o.id)) continue
          if (dist(o.x, o.y, b.x, b.y) > 1.3 || b.z > 2.5 + o.z + 0.6) continue
          b.blockTried.add(o.id)
          const human = o === this.controlled
          if (Math.random() < (human ? 0.6 : 0.35) * (b.kind === 'dunk' ? 0.5 : 1)) { this.swat(o, b.shooter); return }
        }
      }
      if (k >= 1) this.resolveShot()
      return
    }
    if (b.state === 'loose') {
      b.vz -= GRAVITY * dt
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt
      if (b.z < 0.12) { b.z = 0.12; b.vz = Math.abs(b.vz) * 0.55; b.vx *= 0.82; b.vy *= 0.82 }
      if (b.x < 0.2 || b.x > COURT_W - 0.2) { b.vx *= -0.7; b.x = clamp(b.x, 0.2, COURT_W - 0.2) }
      if (b.y < 0.3 || b.y > COURT_D - 0.2) { b.vy *= -0.7; b.y = clamp(b.y, 0.3, COURT_D - 0.2) }
      if (this.deadT > 0) return
      // 줍기 — 점프하면 더 높이 닿는다
      let grab: Player | null = null, gd = Infinity
      for (const p of this.players) {
        const d = dist(p.x, p.y, b.x, b.y)
        const reach = 2.5 + p.z
        const r = p.z > 0.2 ? PICKUP_R + 0.25 : PICKUP_R
        if (d < r && b.z < reach && d < gd) { gd = d; grab = p }
      }
      if (grab) {
        const wasShot = this.offense
        const isRebound = b.z > 1.2
        this.hold(grab)
        if (grab.team !== wasShot) this.needsClear = true
        else this.shotClock = SHOT_CLOCK
        if (isRebound) this.pop('리바운드', sx(grab.x), sy(grab.y) - 80, '#ffffff')
      }
    }
  }

  private resolveShot() {
    const b = this.ball
    const shooter = b.shooter
    const team = shooter ? shooter.team : this.offense
    const assist = (b as Ball & { assistFrom?: Player }).assistFrom
    ;(b as Ball & { assistFrom?: Player }).assistFrom = undefined
    if (b.willMake) {
      const pts = b.isThree ? 3 : 2
      this.score[team] += pts
      if (team === 0) {
        this.result.made++
        if (b.isThree) this.result.threes++
        if (assist && assist.team === 0 && assist !== shooter) this.result.assists++
      }
      if (b.kind === 'dunk') { this.pop('덩크!', sx(HOOP.x), sy(HOOP.y, RIM_Z) - 64, '#ff7a1a', true); this.shake = 1.2 }
      else if (b.kind === 'layup') this.pop('레이업', sx(HOOP.x), sy(HOOP.y, RIM_Z) - 64, '#ffffff')
      this.pop(b.isThree ? '3점!' : '+2', sx(HOOP.x), sy(HOOP.y, RIM_Z) - 30, TEAM_COLOR[team] === '#2e3a59' ? '#9fb0d8' : TEAM_COLOR[team], true)
      this.shake = Math.max(this.shake, b.isThree ? 0.8 : 0.4)
      this.haptic(team === 0 ? (b.kind === 'dunk' ? HAPTIC.dunk : b.isThree ? HAPTIC.score3 : HAPTIC.score2) : HAPTIC.oppScore)
      // 핫핸드: 3연속 성공이면 불붙음 · 상대가 넣으면 꺼짐
      for (const o of this.players) {
        if (o.team === team) continue
        if (o.fire) this.pop('불이 꺼졌다', sx(o.x), sy(o.y) - 80, '#9aa3b5')
        o.fire = false
        o.streak = 0
      }
      if (shooter) {
        shooter.streak++
        if (shooter.streak >= 3 && !shooter.fire) {
          shooter.fire = true
          this.pop('핫핸드!', sx(shooter.x), sy(shooter.y) - 110, '#ff7a1a', true)
          this.shake = 1
          if (shooter.team === 0) this.haptic(HAPTIC.fire)
        }
      }
      b.state = 'loose'
      b.holder = null
      b.x = HOOP.x; b.y = HOOP.y + 0.1; b.z = 2.6; b.vx = 0; b.vy = 1; b.vz = -2
      const target = this.opts.target
      if (this.suddenDeath || (target > 0 && this.score[team] >= target)) {
        this.dead(1.1, () => this.finish())
        return
      }
      const other = (1 - team) as 0 | 1
      this.dead(1.0, () => this.giveTop(other))
      return
    }
    // 실패 → 림에 맞고 튄다
    if (shooter) shooter.streak = 0
    if (team === 0) this.haptic(HAPTIC.rim)
    b.state = 'loose'
    b.holder = null
    const ang = rand(0, Math.PI) // 코트 쪽(아래)으로
    const sp = rand(1.6, 3.6)
    b.vx = Math.cos(ang) * sp
    b.vy = Math.abs(Math.sin(ang)) * sp + 0.6
    b.vz = rand(4.6, 6.4)
    b.x = HOOP.x; b.y = HOOP.y + 0.3; b.z = RIM_Z
    b.lastTeam = team
  }

  // ───────────────────────── 컴퓨터 ─────────────────────────
  private ai(p: Player, dt: number) {
    const b = this.ball
    const diff = DIFF[this.opts.difficulty]
    const isOffense = (b.state === 'held' || b.state === 'pass') ? (b.holder ?? b.target)?.team === p.team : false
    let tx = p.x, ty = p.y

    if (b.state === 'loose' || b.state === 'shot') {
      // 공에 가까운 순서로 두 명까지 쫓는다
      const lx = b.state === 'shot' ? HOOP.x : b.x
      const ly = b.state === 'shot' ? HOOP.y + 1.2 : b.y
      const mates = this.players.filter(o => o.team === p.team).sort((a, c) => dist(a.x, a.y, lx, ly) - dist(c.x, c.y, lx, ly))
      if (mates.indexOf(p) < 2) {
        tx = lx; ty = ly
        if (b.state === 'loose' && b.vz < 0 && b.z > 1.8 && b.z < 4.4 && dist(p.x, p.y, b.x, b.y) < 1.1 && p.z === 0 && Math.random() < 3 * dt) this.jump(p)
        if (b.state === 'loose') { const land = this.landing(); if (land) { tx = land.x; ty = land.y } }
      } else { tx = TOP.x; ty = TOP.y - 1 }
      this.steer(p, dt, tx, ty)
      return
    }

    if (b.state === 'held' && b.holder === p) {
      this.aiHandler(p, dt)
      return
    }

    if (isOffense) {
      // 공 없는 공격수: 자리를 잡고 가끔 골밑으로 파고든다
      p.aiT -= dt
      if (p.aiT <= 0) {
        p.aiT = rand(1.6, 3.2)
        const spots = [{ x: 2.2, y: 3.0 }, { x: 12.8, y: 3.0 }, { x: 3.0, y: 7.0 }, { x: 12.0, y: 7.0 }, { x: 7.5, y: 9.2 }, { x: 5.6, y: 2.2 }, { x: 9.4, y: 2.2 }]
        p.spot = spots[Math.floor(Math.random() * spots.length)]
      }
      tx = p.spot.x; ty = p.spot.y
      if (this.callForBall && p.team === 0 && b.holder !== p) { /* 사용자 쪽은 손으로 움직인다 */ }
      this.steer(p, dt, tx, ty)
      return
    }

    // 수비: 맨투맨 — 내 상대와 골대 사이
    const opp = this.players.filter(o => o.team !== p.team)
    const mine = this.players.filter(o => o.team === p.team)
    const idx = mine.indexOf(p)
    const handler = b.state === 'held' ? b.holder : null
    let man = opp[idx]
    // 사용자가 수비 중이면, 사용자가 맡지 않은 남은 둘을 나눠 맡는다
    if (p.team === 0 && this.controlled.team === 0) {
      const ctrlIdx = mine.indexOf(this.controlled)
      if (idx !== ctrlIdx && handler && opp.indexOf(handler) === idx) man = opp[ctrlIdx]
    }
    // 붙는 거리 — 공 가진 사람은 바짝, 3점 선 밖 슈터도 놓치지 않는다
    const dd = p.team === 1 ? diff : DIFF.normal
    let tight: number = man === handler ? dd.onBall : dd.offBall
    if (man !== handler && hoopDist(man) > ARC_R - 0.3) tight = Math.min(tight, dd.onBall + 0.35)
    const ddx = HOOP.x - man.x, ddy = HOOP.y - man.y
    const dm = Math.hypot(ddx, ddy) || 1
    tx = man.x + (ddx / dm) * tight
    ty = man.y + (ddy / dm) * tight
    // 도움 수비: 공 가진 사람이 골밑까지 파고들면, 공에서 가장 가까운 다른 수비가 막으러 온다
    if (handler && man !== handler && dd.help && hoopDist(handler) < 3.4) {
      const helper = mine.filter(o => o !== this.controlled && o !== mine[opp.indexOf(handler)])
        .sort((a, c) => dist(a.x, a.y, handler.x, handler.y) - dist(c.x, c.y, handler.x, handler.y))[0]
      if (helper === p) { tx = (handler.x + HOOP.x) / 2; ty = (handler.y + HOOP.y) / 2 }
    }
    this.steer(p, dt, tx, ty)
    if (handler && man === handler && this.holdT > 1.2 && dist(p.x, p.y, handler.x, handler.y) < STEAL_RANGE) {
      const rate = p.team === 1 ? diff.stealRate : 0.35
      if (Math.random() < rate * dt) this.trySteal(p, handler, p.team === 1 ? diff.stealChance : 0.24)
    }
  }

  private aiHandler(p: Player, dt: number) {
    const diff = DIFF[this.opts.difficulty]
    const d = hoopDist(p)
    if (p.windT > 0) {
      p.windT -= dt
      if (p.windT <= 0) this.shoot(p, p.windQ, p.windKind)
      else this.physics(p, dt, 0, 0, false)
      return
    }
    // 사용자가 「나한테 줘」를 눌렀으면 바로 준다
    if (p.team === 0 && this.callForBall && this.controlled.team === 0 && this.controlled !== p) {
      this.passFrom(p, 0, 0, this.controlled)
      return
    }
    if (this.needsClear) {
      this.steer(p, dt, TOP.x + (p.x < 7.5 ? -1.5 : 1.5), TOP.y + 0.6)
      return
    }
    p.aiT -= dt
    if (p.aiT <= 0) {
      p.aiT = rand(0.35, 0.7)
      const open = this.openness(p)
      const wantShot = (open > 1.7 && d < ARC_R + 0.8 && Math.random() < 0.55) || (d < 1.6 && Math.random() < 0.7) || this.shotClock < 2.2
      if (wantShot && !this.needsClear) {
        // 바로 쏘지 않고 잠깐 올려 잡는다 — 그 사이에 사람이 뛰어 막을 수 있다
        p.windQ = p.team === 1 ? rand(diff.qMin, diff.qMax) : rand(0.4, 0.95)
        p.windKind = this.kindFor(p)
        p.windT = p.windKind === 'jump' ? diff.windup : diff.windup * 0.55
        return
      }
      if (open < 1.3 && p.fakeCool <= 0 && Math.random() < (p.team === 1 ? diff.fakeUse : 0.2)) { this.pumpFake(p); p.aiT = 0.45; return }
      if (open < 1.1 && Math.random() < 0.45) { this.passFrom(p, 0, 0); return }
      // 드리블 목표: 골밑 쪽으로, 좌우로 흔들며
      p.spot = { x: clamp(HOOP.x + rand(-4, 4), 1.5, 13.5), y: clamp(HOOP.y + rand(0.8, 5.5), 1.8, 9.5) }
    }
    this.steer(p, dt, p.spot.x, p.spot.y)
  }

  private steer(p: Player, dt: number, tx: number, ty: number) {
    const dx = tx - p.x, dy = ty - p.y
    const m = Math.hypot(dx, dy)
    const s = m < 0.25 ? 0 : Math.min(1, m / 1.2)
    this.physics(p, dt, m > 0 ? (dx / m) * s : 0, m > 0 ? (dy / m) * s : 0, false)
  }

  private pop(text: string, x: number, y: number, color: string, big = false) {
    this.pops.push({ text, x, y, t: 0, color, big })
  }

  /** 페이크: 슛하는 척 — 가까운 수비가 속아서 뛰면, 내려올 때까지 노마크 */
  private pumpFake(p: Player) {
    if (p.fakeCool > 0 || p.z > 0) return
    p.fakeT = 0.35
    p.fakeCool = 0.9
    let bit = false
    for (const o of this.players) {
      if (o.team === p.team || o.z > 0 || dist(o.x, o.y, p.x, p.y) > 2.0) continue
      if (o === this.controlled) continue // 사람이 조종하는 수비는 스스로 판단한다
      const bite = o.team === 1 ? DIFF[this.opts.difficulty].fakeBite : 0.5
      if (Math.random() < bite) {
        this.jump(o)
        o.stunT = 0.5
        bit = true
        this.pop('속았다!', sx(o.x), sy(o.y) - 86, '#ffd23f')
      }
    }
    if (bit && p.team === 0) this.haptic(HAPTIC.fakeHit)
  }

  private haptic(pattern: number | readonly number[]) {
    if (!this.opts.vibrate) return
    try { navigator.vibrate?.(pattern as number | number[]) } catch { /* 지원하지 않는 기기 */ }
  }

  // ───────────────────────── 그리기 ─────────────────────────
  private low: HTMLCanvasElement | null = null

  private render() {
    const main = this.ctx
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (!this.low) { this.low = document.createElement('canvas'); this.low.width = VW / PIXEL; this.low.height = VH / PIXEL }
    const lc = this.low.getContext('2d')
    if (!lc) return
    // 1) 코트·선수·공을 작은 캔버스에 그린다
    this.ctx = lc
    lc.setTransform(1, 0, 0, 1, 0, 0)
    lc.clearRect(0, 0, this.low.width, this.low.height)
    lc.setTransform(1 / PIXEL, 0, 0, 1 / PIXEL, 0, 0)
    lc.imageSmoothingEnabled = false
    this.drawCourt()
    this.drawLanding()
    {
      type D = { y: number; draw: () => void }
      const list: D[] = this.players.map(p => ({ y: p.y, draw: () => this.drawPlayer(p) }))
      list.push({ y: this.ball.y + 0.01, draw: () => this.drawBall() })
      list.push({ y: HOOP.y - 0.05, draw: () => this.drawHoop() })
      list.sort((a, b) => a.y - b.y)
      for (const d of list) d.draw()
    }
    this.ctx = main
    const c = main
    c.save()
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.fillStyle = '#0d1018'
    c.fillRect(0, 0, this.canvas.width, this.canvas.height)
    c.restore()
    c.save()
    c.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, dpr * this.offX, dpr * this.offY)
    if (this.shake > 0) c.translate(rand(-1, 1) * this.shake * 6, rand(-1, 1) * this.shake * 6)
    // 2) 작은 그림을 흐리지 않게 키운다 = 픽셀
    c.imageSmoothingEnabled = false
    c.drawImage(this.low, 0, 0, VW, VH)
    this.drawShotMeter()
    this.drawPops()
    c.restore()

    c.save()
    c.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, dpr * this.offX, dpr * this.offY)
    this.drawHud()
    this.drawControls()
    c.restore()
  }

  private drawCourt() {
    const c = this.ctx
    // 바닥
    const g = c.createLinearGradient(0, sy(0), 0, sy(COURT_D))
    g.addColorStop(0, '#c98a4b')
    g.addColorStop(1, '#e0a565')
    // 끝선 뒤 바닥 — 골대 기둥이 서 있는 곳
    c.fillStyle = '#9c6534'
    c.fillRect(sx(-0.6), sy(-3.4), (COURT_W + 1.2) * PX, (COURT_D + 3.4 + 0.4) * PY)
    c.fillStyle = g
    c.beginPath()
    c.rect(sx(0), sy(0), COURT_W * PX, COURT_D * PY)
    c.fill()
    // 나뭇결
    c.strokeStyle = 'rgba(120,70,30,0.12)'
    c.lineWidth = 1
    for (let x = 0; x <= COURT_W; x += 0.75) { c.beginPath(); c.moveTo(sx(x), sy(0)); c.lineTo(sx(x), sy(COURT_D)); c.stroke() }
    // 페인트 존
    c.fillStyle = 'rgba(30,50,110,0.28)'
    c.fillRect(sx(HOOP.x - 2.45), sy(0), 4.9 * PX, 5.8 * PY)
    c.strokeStyle = 'rgba(255,255,255,0.85)'
    c.lineWidth = 2.5
    c.strokeRect(sx(0), sy(0), COURT_W * PX, COURT_D * PY)
    c.strokeRect(sx(HOOP.x - 2.45), sy(0), 4.9 * PX, 5.8 * PY)
    // 자유투 원
    c.beginPath()
    c.ellipse(sx(HOOP.x), sy(5.8), 1.8 * PX, 1.8 * PY, 0, 0, Math.PI)
    c.stroke()
    // 3점 선 — 골대 중심 반지름 ARC_R 원 중 코트 안쪽(끝선 아래)
    const aEnd = Math.PI / 2 + Math.asin(clamp(HOOP.y / ARC_R, 0, 1))
    c.beginPath()
    for (let a = -aEnd; a <= aEnd + 0.001; a += 0.02) c.lineTo(sx(HOOP.x + Math.sin(a) * ARC_R), sy(HOOP.y + Math.cos(a) * ARC_R))
    c.stroke()
    // 공 빼야 할 때 3점 선을 빛낸다
    if (this.needsClear && this.ball.state === 'held') {
      c.save()
      c.strokeStyle = `rgba(255,210,63,${0.5 + 0.4 * Math.sin(performance.now() / 120)})`
      c.lineWidth = 5
      c.beginPath()
      for (let a = -aEnd; a <= aEnd + 0.001; a += 0.02) c.lineTo(sx(HOOP.x + Math.sin(a) * ARC_R), sy(HOOP.y + Math.cos(a) * ARC_R))
      c.stroke()
      c.restore()
    }
  }

  private drawHoop() {
    const c = this.ctx
    const bx = sx(HOOP.x), by = sy(HOOP.y - 0.4, RIM_Z + 0.6)
    // 기둥
    c.fillStyle = '#3b3f4a'
    c.fillRect(bx - 4, sy(-0.6, 0) - 2, 8, 2)
    c.fillRect(bx - 3, sy(-0.6, 3.8), 6, 3.8 * PZ)
    // 백보드
    c.fillStyle = 'rgba(255,255,255,0.92)'
    c.strokeStyle = '#1b1d24'
    c.lineWidth = 2
    c.fillRect(bx - 42, by - 30, 84, 46)
    c.strokeRect(bx - 42, by - 30, 84, 46)
    c.strokeStyle = '#e4572e'
    c.strokeRect(bx - 14, by - 8, 28, 20)
    // 림 + 그물
    const rx = sx(HOOP.x), ry = sy(HOOP.y, RIM_Z)
    c.strokeStyle = 'rgba(255,255,255,0.8)'
    c.lineWidth = 1.2
    for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(rx + i * 5, ry); c.lineTo(rx + i * 3, ry + 22); c.stroke() }
    c.strokeStyle = '#ff5a1f'
    c.lineWidth = 4
    c.beginPath()
    c.ellipse(rx, ry, 18, 7, 0, 0, Math.PI * 2)
    c.stroke()
  }

  private drawPlayer(p: Player) {
    const c = this.ctx
    const x = sx(p.x), y = sy(p.y)
    const top = sy(p.y, p.z)
    // 그림자
    c.fillStyle = 'rgba(0,0,0,0.25)'
    c.beginPath(); c.ellipse(x, y, 16, 6, 0, 0, Math.PI * 2); c.fill()
    // 스틸 가능 표시
    const ctl = this.controlled
    if (ctl && this.ball.state === 'held' && this.ball.holder === p && p.team !== ctl.team && dist(ctl.x, ctl.y, p.x, p.y) < STEAL_RANGE_HUMAN) {
      c.strokeStyle = '#4fc3f7'
      c.lineWidth = 3
      c.beginPath(); c.ellipse(x, y, 22, 9, 0, 0, Math.PI * 2); c.stroke()
    }
    // 조종 중 표시
    if (p === this.controlled) {
      c.strokeStyle = '#7ee787'
      c.lineWidth = 3
      c.beginPath(); c.ellipse(x, y, 20, 8, 0, 0, Math.PI * 2); c.stroke()
    }
    // 핫핸드 불꽃
    if (p.fire) {
      const t = performance.now() / 90
      for (let i = 0; i < 7; i++) {
        const fx = x + Math.sin(t + i * 1.7) * 14
        const fh = 22 + Math.sin(t * 1.3 + i) * 8
        c.fillStyle = i % 2 ? 'rgba(255,122,26,0.75)' : 'rgba(255,214,63,0.8)'
        c.beginPath()
        c.moveTo(fx - 7, top - 4)
        c.quadraticCurveTo(fx, top - 30 - fh, fx + 7, top - 4)
        c.fill()
      }
    }
    // 몸(큰 머리 · 작은 몸 — 0단계는 네모)
    c.fillStyle = TEAM_COLOR[p.team]
    c.strokeStyle = TEAM_EDGE[p.team]
    c.lineWidth = 2
    const bodyW = 24, bodyH = 30
    roundRect(c, x - bodyW / 2, top - bodyH, bodyW, bodyH, 6)
    c.fill(); c.stroke()
    c.fillStyle = p.team === 0 ? '#1b1d24' : '#ffffff'
    c.font = '900 16px system-ui, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(String(p.num), x, top - bodyH / 2)
    // 머리
    c.fillStyle = '#f2d2b6'
    c.strokeStyle = '#1b1d24'
    c.lineWidth = 2
    c.beginPath(); c.arc(x, top - bodyH - 13, 15, 0, Math.PI * 2); c.fill(); c.stroke()
    c.fillStyle = '#1b1d24'
    c.fillRect(x - 6 + p.faceX * 3, top - bodyH - 15, 3, 3)
    c.fillRect(x + 3 + p.faceX * 3, top - bodyH - 15, 3, 3)
    if (p.stunT > 0) { c.fillStyle = '#ffd23f'; c.font = '700 14px system-ui'; c.fillText('★', x + 16, top - bodyH - 26) }

  }

  /** 착지 표시 — 튄 공이 내려와 잡을 수 있는 곳 */
  private drawLanding() {
    const land = this.landing()
    if (!land) return
    const c = this.ctx
    const x = sx(land.x), y = sy(land.y)
    const pulse = 1 + 0.15 * Math.sin(performance.now() / 90)
    const k = clamp(land.t / 1.2, 0, 1) // 멀수록 크다 → 다가올수록 작아진다
    c.strokeStyle = '#ffffff'
    c.lineWidth = 3
    c.beginPath(); c.ellipse(x, y, (18 + 22 * k) * pulse, (7 + 9 * k) * pulse, 0, 0, Math.PI * 2); c.stroke()
    c.fillStyle = 'rgba(255,210,63,0.85)'
    c.beginPath(); c.ellipse(x, y, 8, 3.5, 0, 0, Math.PI * 2); c.fill()
  }

  private drawShotMeter() {
    const p = this.controlled
    if (!this.metering || !p) return
    const c = this.ctx
    const x = sx(p.x)
    const top = sy(p.y, p.z)
    const gx = x + 30, gy = top - 84, gh = 60, gw = 12
    const green = p.fire || this.shotKind !== 'jump' ? 0.26 : 0.14
    c.fillStyle = 'rgba(0,0,0,0.65)'
    c.fillRect(gx - 3, gy - 3, gw + 6, gh + 6)
    c.fillStyle = '#3a3f4b'
    c.fillRect(gx, gy, gw, gh)
    c.fillStyle = '#2ea043'
    c.fillRect(gx, gy + gh * (1 - 0.85 - green / 2), gw, gh * green)
    c.fillStyle = '#ffffff'
    c.fillRect(gx - 4, gy + gh * (1 - this.meter) - 2, gw + 8, 4)
    c.font = '800 12px system-ui, sans-serif'
    c.textAlign = 'center'
    c.fillStyle = '#ffffff'
    c.fillText(this.shotKind === 'dunk' ? '덩크' : this.shotKind === 'layup' ? '레이업' : '', gx + gw / 2, gy - 10)
  }

  private drawBall() {
    const c = this.ctx
    const b = this.ball
    const x = sx(b.x), y = sy(b.y), top = sy(b.y, b.z)
    c.fillStyle = 'rgba(0,0,0,0.22)'
    c.beginPath(); c.ellipse(x, y, 7, 3, 0, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#f07c1e'
    c.strokeStyle = '#5a2a00'
    c.lineWidth = 1.5
    c.beginPath(); c.arc(x, top, 8, 0, Math.PI * 2); c.fill(); c.stroke()
    c.beginPath(); c.moveTo(x - 8, top); c.lineTo(x + 8, top); c.stroke()
  }

  private drawPops() {
    const c = this.ctx
    for (const p of this.pops) {
      const a = 1 - p.t / 1.3
      c.globalAlpha = Math.max(0, a)
      c.font = `900 ${p.big ? 34 : 18}px system-ui, sans-serif`
      c.textAlign = 'center'
      c.lineWidth = 5
      c.strokeStyle = 'rgba(0,0,0,0.6)'
      c.strokeText(p.text, p.x, p.y - p.t * 40)
      c.fillStyle = p.color
      c.fillText(p.text, p.x, p.y - p.t * 40)
      c.globalAlpha = 1
    }
  }

  /** 점수판 — 화면 위 가운데(온라인 농구게임·축구게임 공통 배치, 2026-11-13 피드백) */
  private drawHud() {
    const c = this.ctx
    const w = 460, h = 54, x = VW / 2 - w / 2, y = 4
    const side = 170
    c.textBaseline = 'middle'
    // 왼쪽(우리) · 가운데(시간) · 오른쪽(컴퓨터)
    c.fillStyle = 'rgba(13,16,24,0.92)'
    roundRect(c, x, y, w, h, 12); c.fill()
    c.fillStyle = TEAM_COLOR[0]
    roundRect(c, x, y, side, h, 12); c.fill()
    c.fillStyle = '#2e3a59'
    roundRect(c, x + w - side, y, side, h, 12); c.fill()
    const team = (i: 0 | 1) => {
      const left = i === 0
      const bx = left ? x : x + w - side
      c.fillStyle = left ? '#1b1d24' : '#ffffff'
      c.font = '800 14px system-ui, sans-serif'
      c.textAlign = left ? 'left' : 'right'
      c.fillText(TEAM_NAME[i], left ? bx + 14 : bx + side - 14, y + h / 2)
      c.font = '900 34px system-ui, sans-serif'
      c.textAlign = left ? 'right' : 'left'
      c.fillText(String(this.score[i]), left ? bx + side - 12 : bx + 12, y + h / 2 + 1)
      if (this.offense === i && !this.over) {
        c.fillStyle = '#f07c1e'
        const ax = left ? bx + side + 8 : bx - 8
        c.beginPath(); c.arc(ax, y + h / 2, 5, 0, Math.PI * 2); c.fill()
      }
    }
    team(0); team(1)
    const t = Math.ceil(this.clock)
    const clockText = this.suddenDeath ? '다음 골' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
    c.textAlign = 'center'
    c.fillStyle = '#ffffff'
    c.font = '800 22px system-ui, sans-serif'
    c.fillText(clockText, VW / 2, y + 20)
    c.font = '800 13px system-ui, sans-serif'
    c.fillStyle = this.shotClock < 4 ? '#ff6b6b' : '#ffd23f'
    c.fillText(`공격 ${Math.max(0, Math.ceil(this.shotClock))}`, VW / 2, y + 42)
    if (this.opts.target > 0) {
      c.textAlign = 'left'
      c.fillStyle = 'rgba(255,255,255,0.55)'
      c.font = '600 12px system-ui, sans-serif'
      c.fillText(`${this.opts.target}점 먼저 이기기`, x + w + 14, y + h / 2)
    }
  }

  private drawControls() {
    const c = this.ctx
    const BTN = this.btn
    const touch = this.touchSeen || (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches)
    if (!touch) {
      c.fillStyle = 'rgba(255,255,255,0.55)'
      c.font = '600 13px system-ui, sans-serif'
      c.textAlign = 'left'
      c.fillText('이동 WASD · 방향키   슛·점프 J(누르고 떼기)   패스·스틸 K   대시 L   (슛 짧게 톡 = 페이크)', this.viewL + 16, this.viewB - 16)
      return
    }
    // 조이스틱
    for (const p of this.pointers.values()) {
      if (p.kind !== 'stick') continue
      c.strokeStyle = 'rgba(255,255,255,0.35)'
      c.lineWidth = 3
      c.beginPath(); c.arc(p.ox, p.oy, 56, 0, Math.PI * 2); c.stroke()
      c.fillStyle = 'rgba(255,255,255,0.45)'
      const dx = p.x - p.ox, dy = p.y - p.oy, m = Math.hypot(dx, dy), k = m > 56 ? 56 / m : 1
      c.beginPath(); c.arc(p.ox + dx * k, p.oy + dy * k, 24, 0, Math.PI * 2); c.fill()
    }
    if (![...this.pointers.values()].some(p => p.kind === 'stick')) {
      c.fillStyle = 'rgba(255,255,255,0.4)'
      c.font = '600 13px system-ui, sans-serif'
      c.textAlign = 'center'
      c.fillText('왼쪽을 누르고 끌어서 이동', this.viewL + 150, this.viewB - 30)
    }
    const b = this.ball
    const mineHas = b.state === 'held' && b.holder?.team === 0
    const pressed = (k: Pointer['kind']) => [...this.pointers.values()].some(p => p.kind === k)
    const btn = (o: { x: number; y: number; r: number }, label: string, color: string, on: boolean, dim = false) => {
      c.globalAlpha = dim ? 0.4 : 1
      c.fillStyle = on ? color : 'rgba(13,16,24,0.55)'
      c.strokeStyle = color
      c.lineWidth = 3
      c.beginPath(); c.arc(o.x, o.y, o.r, 0, Math.PI * 2); c.fill(); c.stroke()
      c.fillStyle = on ? '#0d1018' : '#ffffff'
      c.font = `800 ${o.r > 50 ? 20 : 15}px system-ui, sans-serif`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(label, o.x, o.y)
      c.globalAlpha = 1
    }
    const ctrl = this.controlled
    btn(BTN.shoot, mineHas && b.holder === ctrl ? (this.needsClear ? '밖으로' : '슛') : '점프', '#ffd23f', pressed('shoot'))
    btn(BTN.pass, mineHas ? (b.holder === ctrl ? '패스' : '줘!') : '스틸', '#4fc3f7', pressed('pass'))
    btn(BTN.dash, '대시', '#7ee787', pressed('dash'), ctrl.dashCool > 0)
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}
