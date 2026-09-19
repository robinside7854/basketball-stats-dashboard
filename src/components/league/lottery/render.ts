// 캔버스 2D 렌더러 — 세로형 하프코트. 물리(sim.ts)와 완전히 분리돼 있다.
// 여기서는 sin/cos 를 마음껏 쓴다(그림은 기기마다 달라도 되지만, 궤적은 달라지면 안 된다).

import {
  BEAM_EY, BEAM_HALF, BOARD_X0, BOARD_X1, BOARD_Y0, BOARD_Y1, CHUTE_TOP, CHUTE_X0, CHUTE_X1,
  clockBar, COURSE_W, FLOOR_Y, CLOCK_Y, HOOP_HALF, HOOP_X, LANE_Y0, LANE_Y1, NET_BOTTOM,
  PROT_ARM, PROT_R, PROT_Y, RIM_Y, SCREEN_LEN, SCREEN_TILT, START_LINE_Y, TOP_Y,
  type Course,
} from './course'
import type { World } from './sim'

/** 그리기에 필요한 최소 정보 */
interface Drawable { x: number; y: number; r: number; rot: number; team: string | null }
import { teamInk } from '@/lib/util/contrastColor'

export interface Cam { x: number; y: number; zoom: number }

export interface TeamInfo { name: string; color: string }

export interface SceneOpts {
  viewW: number
  viewH: number
  cam: Cam
  teams: Record<string, TeamInfo>
  /** 림 플래시 0~1 */
  rimFlash: number
  /** 네트 출렁임 0~1 */
  netWave: number
  /** 페그 타격 잔상 */
  sparks: { x: number; y: number; life: number }[]
  /** 범퍼별 잔광 0~1 */
  bumperFlash: number[]
  /** 출발 전 — 팁오프 라인을 그린다 */
  waiting: boolean
}

const WOOD_A = '#8a5a2b'
const WOOD_B = '#7a4d23'
const WOOD_LINE = 'rgba(0,0,0,0.22)'
const PAINT = 'rgba(200,86,24,0.30)'
const LINE = 'rgba(255,255,255,0.72)'
const APRON = '#0a0a0f'
const JERSEY = '#1e40af'

/** 캔버스 좌표계를 월드로 바꾼다. 호출 후 반드시 ctx.restore(). */
function applyCam(ctx: CanvasRenderingContext2D, o: SceneOpts): number {
  const s = o.cam.zoom
  ctx.save()
  ctx.translate(o.viewW / 2, o.viewH / 2)
  ctx.scale(s, s)
  ctx.translate(-o.cam.x, -o.cam.y)
  return s
}

export function drawScene(ctx: CanvasRenderingContext2D, w: World, o: SceneOpts): void {
  ctx.clearRect(0, 0, o.viewW, o.viewH)
  ctx.fillStyle = APRON
  ctx.fillRect(0, 0, o.viewW, o.viewH)

  const s = applyCam(ctx, o)
  // 화면에 걸리는 월드 y 범위만 그린다
  const halfH = o.viewH / 2 / s
  const yTop = o.cam.y - halfH - 4
  const yBot = o.cam.y + halfH + 4

  drawFloor(ctx, yTop, yBot)
  drawPaintedKey(ctx, yTop, yBot)
  drawHoop(ctx, o, yTop, yBot)          // 백보드·네트는 코스 선분 뒤에
  drawCourse(ctx, w.course, yTop, yBot, s)
  drawBeam(ctx, w, yTop, yBot, s)       // 빔은 공 뒤 · 장애물 위
  drawScreen(ctx, w.screenX, w.course.screen1Y, 1, w.course.screenNum, yTop, yBot, s)
  drawScreen(ctx, w.screenX2, w.course.screen2Y, -1, w.course.screenNum2, yTop, yBot, s)
  drawShotClock(ctx, w, yTop, yBot, s)
  drawBumpers(ctx, w, o, yTop, yBot, s)
  drawWheel(ctx, w, yTop, yBot)
  drawProtector(ctx, w, yTop, yBot, s)
  if (o.waiting) drawStartLine(ctx, yTop, yBot)
  drawSparks(ctx, o)

  for (const m of w.marbles) {
    if (m.out || m.y < yTop - 2 || m.y > yBot + 2) continue
    drawMarble(ctx, m, m.team ? o.teams[m.team] : undefined, s, m.beamT, m.ghost)
  }

  drawRim(ctx, o, yTop, yBot)           // 림은 공 앞에 — 통과가 보이게
  ctx.restore()
}

// ── 마룻바닥 (절차적 널판)
function drawFloor(ctx: CanvasRenderingContext2D, yTop: number, yBot: number) {
  // ⚠ 위쪽을 TOP_Y 에서 끊지 않는다. 좁은 화면(390px)에서는 코스 폭이 배율을 정해서
  //    세로로 남는 공간이 생기는데, 거기가 검게 비면 팁오프 대기 화면 절반이 빈 화면이 된다.
  const y0 = yTop
  const y1 = Math.min(FLOOR_Y, yBot)
  if (y1 <= y0) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, y0, COURSE_W, y1 - y0)
  ctx.clip()
  const PLANK = 2.6
  for (let i = 0; i * PLANK < COURSE_W; i++) {
    ctx.fillStyle = i % 2 === 0 ? WOOD_A : WOOD_B
    ctx.fillRect(i * PLANK, y0, PLANK, y1 - y0)
  }
  // 널판 이음매 — 널판마다 다른 위치에서 끊긴다.
  // ⚠ 선마다 beginPath/stroke 하면 프레임당 40여 번의 스트로크가 된다(저사양에서 체감).
  // 전부 **경로 하나**에 모아 한 번만 stroke 한다.
  ctx.strokeStyle = WOOD_LINE
  ctx.lineWidth = 0.08
  ctx.beginPath()
  for (let i = 0; i * PLANK < COURSE_W; i++) {
    const off = (i * 7.3) % 17
    for (let y = Math.floor((y0 - off) / 17) * 17 + off; y < y1; y += 17) {
      if (y < y0) continue
      ctx.moveTo(i * PLANK, y)
      ctx.lineTo(i * PLANK + PLANK, y)
    }
    ctx.moveTo(i * PLANK, y0)
    ctx.lineTo(i * PLANK, y1)
  }
  ctx.stroke()
  ctx.restore()
}

// ── 페인트존 + 사이드라인
function drawPaintedKey(ctx: CanvasRenderingContext2D, yTop: number, yBot: number) {
  ctx.save()
  ctx.lineWidth = 0.22
  ctx.strokeStyle = LINE
  ctx.beginPath()
  ctx.moveTo(0.55, yTop); ctx.lineTo(0.55, Math.min(FLOOR_Y, yBot))
  ctx.moveTo(COURSE_W - 0.55, yTop); ctx.lineTo(COURSE_W - 0.55, Math.min(FLOOR_Y, yBot))
  ctx.stroke()
  // 골밑 페인트존 — 퍼널이 시작되는 높이까지
  // ⚠ 레인 구간(LANE_Y0~LANE_Y1) 위로 올리지 말 것 — 자유투 서클이 칸막이를 가로질러
  //    레인이 하나로 이어진 것처럼 보인다.
  if (yBot > LANE_Y1 + 1) {
    const ky0 = LANE_Y1 + 1
    const ky1 = Math.min(FLOOR_Y, yBot)
    ctx.fillStyle = PAINT
    ctx.fillRect(7, ky0, 10, ky1 - ky0)
    ctx.strokeRect(7, ky0, 10, ky1 - ky0)
    ctx.beginPath()
    ctx.arc(12, ky0, 5, 0, Math.PI)
    ctx.stroke()
  }
  // 레인 바닥 음영 — 가운데 레인만 살짝 밝게 해 세 갈래가 읽히게
  if (yBot > LANE_Y0 && yTop < LANE_Y1) {
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    ctx.fillRect(8, LANE_Y0, 8, LANE_Y1 - LANE_Y0)
  }
  // 센터 서클
  if (yTop < 60 && yBot > 48) {
    ctx.beginPath()
    ctx.arc(12, 54, 5.4, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

// ── 팁오프 라인 (출발 전)
function drawStartLine(ctx: CanvasRenderingContext2D, yTop: number, yBot: number) {
  if (START_LINE_Y < yTop || START_LINE_Y > yBot) return
  ctx.save()
  ctx.setLineDash([1.1, 0.8])
  ctx.lineWidth = 0.34
  ctx.strokeStyle = '#fbbf24'
  ctx.beginPath()
  ctx.moveTo(0.4, START_LINE_Y)
  ctx.lineTo(COURSE_W - 0.4, START_LINE_Y)
  ctx.stroke()
  ctx.restore()
}

// ── 램프·퍼널·슈트 + 수비수 페그
function drawCourse(ctx: CanvasRenderingContext2D, c: Course, yTop: number, yBot: number, scale: number) {
  for (const sg of c.segs) {
    if (Math.max(sg.y1, sg.y2) < yTop || Math.min(sg.y1, sg.y2) > yBot) continue
    if (sg.kind === 'wall') continue // 사이드라인이 대신한다
    ctx.save()
    ctx.lineCap = 'round'
    if (sg.kind === 'ramp' || sg.kind === 'tip') {
      // 코트 라인처럼 — 두꺼운 흰 페인트 + 아래에 그림자
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.lineWidth = 0.92
      ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1 + 0.3); ctx.lineTo(sg.x2, sg.y2 + 0.3); ctx.stroke()
      ctx.strokeStyle = '#f2ece2'
      ctx.lineWidth = 0.7
      ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2); ctx.stroke()
      ctx.strokeStyle = 'rgba(200,86,24,0.85)'
      ctx.lineWidth = 0.2
      ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2); ctx.stroke()
    } else if (sg.kind === 'split') {
      // 가운데 스플리터 쐐기 — 램프와 같은 코트 라인 언어로 그리되 더 두껍게
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'
      ctx.lineWidth = 1.15
      ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1 + 0.32); ctx.lineTo(sg.x2, sg.y2 + 0.32); ctx.stroke()
      ctx.strokeStyle = '#f7f2e8'
      ctx.lineWidth = 0.92
      ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2); ctx.stroke()
      ctx.strokeStyle = 'rgba(200,86,24,0.9)'
      ctx.lineWidth = 0.26
      ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2); ctx.stroke()
      ctx.restore(); continue
    } else if (sg.kind === 'divider') {
      ctx.strokeStyle = '#141922'
      ctx.lineWidth = 0.78
      ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2); ctx.stroke()
      ctx.strokeStyle = 'rgba(148,163,184,0.55)'
      ctx.lineWidth = 0.14
      ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2); ctx.stroke()
      ctx.restore(); continue
    } else {
      // 퍼널·슈트 — 골대로 모으는 벽
      ctx.strokeStyle = '#2b3242'
      ctx.lineWidth = sg.kind === 'chute' ? 0.7 : 0.95
      ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2); ctx.stroke()
      ctx.strokeStyle = 'rgba(245,158,11,0.75)'
      ctx.lineWidth = 0.18
      ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2); ctx.stroke()
    }
    ctx.restore()
  }

  // 수비수 페그 — 육각형 + 등번호
  for (const p of c.pegs) {
    if (p.y < yTop - 2 || p.y > yBot + 2) continue
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2
      const px = Math.cos(a) * p.r * 1.22
      const py = Math.sin(a) * p.r * 1.22
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fillStyle = '#1d2430'
    ctx.fill()
    ctx.lineWidth = 0.11
    ctx.strokeStyle = 'rgba(226,232,240,0.55)'
    ctx.stroke()
    // 화면에서 8px 미만이면 숫자가 뭉개질 뿐인데 텍스트 렌더링 비용은 그대로다
    if (scale * p.r > 8) {
      ctx.fillStyle = '#e2e8f0'
      ctx.font = `700 ${(p.r * 0.95).toFixed(2)}px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(p.num), 0, 0.03)
    }
    ctx.restore()
  }
}

// ── 스크린(픽) — 유니폼 색 블록 + 등번호. 좌우로 미끄러진다. tilt=+1/-1 로 기울기가 갈린다.
function drawScreen(
  ctx: CanvasRenderingContext2D, sx: number, cy: number, tilt: number, num: number,
  yTop: number, yBot: number, scale: number,
) {
  if (cy + 3 < yTop || cy - 3 > yBot) return
  const x1 = sx, y1 = cy - SCREEN_TILT * tilt
  const x2 = x1 + SCREEN_LEN, y2 = cy + SCREEN_TILT * tilt
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'
  ctx.lineWidth = 0.92
  ctx.beginPath(); ctx.moveTo(x1, y1 + 0.3); ctx.lineTo(x2, y2 + 0.3); ctx.stroke()
  ctx.strokeStyle = JERSEY
  ctx.lineWidth = 0.72
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  ctx.strokeStyle = 'rgba(226,232,240,0.9)'
  ctx.lineWidth = 0.14
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  // 등번호
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  ctx.beginPath()
  ctx.arc(mx, my, 0.95, 0, Math.PI * 2)
  ctx.fillStyle = JERSEY
  ctx.fill()
  ctx.lineWidth = 0.12
  ctx.strokeStyle = '#e2e8f0'
  ctx.stroke()
  if (scale > 9) {
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 1.05px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(num), mx, my + 0.05)
  }
  ctx.restore()
}

// ── 샷클락 게이트 — 24초 시계가 달린 가로 바. 닫혀 있을 때만 실체가 있다.
function drawShotClock(ctx: CanvasRenderingContext2D, w: World, yTop: number, yBot: number, scale: number) {
  if (CLOCK_Y + 4 < yTop || CLOCK_Y - 4 > yBot) return
  ctx.save()
  if (w.clockShut) {
    // 한쪽 끝에 공 한 개 폭 틈 — 그림에서도 그 틈이 보여야 "샌다"가 읽힌다
    const [bx1, bx2] = clockBar(w.step)
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.lineWidth = 0.8
    ctx.beginPath(); ctx.moveTo(bx1, CLOCK_Y + 0.28); ctx.lineTo(bx2, CLOCK_Y + 0.28); ctx.stroke()
    ctx.strokeStyle = '#b91c1c'
    ctx.lineWidth = 0.6
    ctx.beginPath(); ctx.moveTo(bx1, CLOCK_Y); ctx.lineTo(bx2, CLOCK_Y); ctx.stroke()
    ctx.strokeStyle = 'rgba(254,226,226,0.85)'
    ctx.lineWidth = 0.12
    ctx.beginPath(); ctx.moveTo(bx1, CLOCK_Y); ctx.lineTo(bx2, CLOCK_Y); ctx.stroke()
  } else {
    ctx.setLineDash([0.7, 0.9])
    ctx.strokeStyle = 'rgba(148,163,184,0.5)'
    ctx.lineWidth = 0.14
    ctx.beginPath(); ctx.moveTo(0, CLOCK_Y); ctx.lineTo(COURSE_W, CLOCK_Y); ctx.stroke()
    ctx.setLineDash([])
  }
  // 24초 판 — 바 위에 붙은 작은 전광판
  const bw = 3.1, bh = 2.0
  const bx = COURSE_W - bw - 0.9, by = CLOCK_Y - bh - 0.7
  ctx.beginPath()
  ctx.roundRect(bx, by, bw, bh, 0.3)
  ctx.fillStyle = '#0b0f17'
  ctx.fill()
  ctx.lineWidth = 0.12
  ctx.strokeStyle = w.clockShut ? '#ef4444' : 'rgba(148,163,184,0.7)'
  ctx.stroke()
  if (scale > 7) {
    ctx.fillStyle = w.clockShut ? '#fca5a5' : '#94a3b8'
    ctx.font = '700 1.35px ui-monospace, SFMono-Regular, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(w.clockNum).padStart(2, '0'), bx + bw / 2, by + bh / 2 + 0.06)
  }
  ctx.restore()
}

// ── 리바운드 범퍼 — 맞으면 튕겨 나가는 주황 원반
function drawBumpers(ctx: CanvasRenderingContext2D, w: World, o: SceneOpts, yTop: number, yBot: number, scale: number) {
  const bl = w.course.bumpers
  for (let i = 0; i < bl.length; i++) {
    const b = bl[i]
    if (b.y + b.r < yTop || b.y - b.r > yBot) continue
    const f = o.bumperFlash[i] ?? 0
    ctx.save()
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
    const g = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.1, b.x, b.y, b.r)
    g.addColorStop(0, f > 0 ? '#fde68a' : '#f59e0b')
    g.addColorStop(1, f > 0 ? '#f59e0b' : '#b45309')
    ctx.fillStyle = g
    ctx.fill()
    ctx.lineWidth = 0.16 + f * 0.2
    ctx.strokeStyle = f > 0 ? '#fef3c7' : 'rgba(255,255,255,0.65)'
    ctx.stroke()
    if (scale * b.r > 11) {
      ctx.fillStyle = '#3b1d05'
      ctx.font = '800 0.62px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('REB', b.x, b.y + 0.03)
    }
    ctx.restore()
  }
}

// ── 슬로우 빔 (지역방어) — 측면 수비수가 쏘는 부채꼴 광선. 안에 든 공은 기어간다.
function drawBeam(ctx: CanvasRenderingContext2D, w: World, yTop: number, yBot: number, scale: number) {
  if (BEAM_EY + 30 < yTop || BEAM_EY - 30 > yBot) return
  const ex = w.beamEx, ey = w.beamEy
  const dx = w.beamTx - ex, dy = w.beamTy - ey
  const L = Math.sqrt(dx * dx + dy * dy)
  const ux = dx / L, uy = dy / L
  const nx = -uy * BEAM_HALF, ny = ux * BEAM_HALF
  ctx.save()
  // 부채꼴 — 발사점에서 좁고 반대편에서 넓다
  const g = ctx.createLinearGradient(ex, ey, w.beamTx, w.beamTy)
  g.addColorStop(0, 'rgba(56,189,248,0.42)')
  g.addColorStop(1, 'rgba(56,189,248,0.10)')
  ctx.beginPath()
  ctx.moveTo(ex + nx * 0.25, ey + ny * 0.25)
  ctx.lineTo(w.beamTx + nx, w.beamTy + ny)
  ctx.lineTo(w.beamTx - nx, w.beamTy - ny)
  ctx.lineTo(ex - nx * 0.25, ey - ny * 0.25)
  ctx.closePath()
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = 'rgba(125,211,252,0.55)'
  ctx.lineWidth = 0.1
  ctx.stroke()

  // 발사하는 수비수 — 벽에 붙은 육각 실루엣
  const sx = ex + ux * 1.0
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2
    const hx = sx + Math.cos(a) * 1.15
    const hy = ey + Math.sin(a) * 1.15
    if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy)
  }
  ctx.closePath()
  ctx.fillStyle = '#0c4a6e'
  ctx.fill()
  ctx.lineWidth = 0.15
  ctx.strokeStyle = 'rgba(186,230,253,0.95)'
  ctx.stroke()
  if (scale > 8) {
    ctx.fillStyle = '#e0f2fe'
    ctx.font = '800 0.68px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('ZONE', sx, ey + 0.03)
  }
  ctx.restore()
}

// ── 림 프로텍터 — 슈트 입구 위에서 좌우로 흔들리는 큰 수비수 + 들어올린 팔
function drawProtector(ctx: CanvasRenderingContext2D, w: World, yTop: number, yBot: number, scale: number) {
  if (PROT_Y + 3 < yTop || PROT_Y - 4 > yBot) return
  const cx = w.protX
  ctx.save()
  ctx.lineCap = 'round'
  // 팔
  ctx.strokeStyle = '#111827'
  ctx.lineWidth = PROT_ARM.thick * 2 + 0.16
  ctx.beginPath()
  ctx.moveTo(cx - PROT_ARM.ix, PROT_Y + PROT_ARM.iy); ctx.lineTo(cx - PROT_ARM.ox, PROT_Y + PROT_ARM.oy)
  ctx.moveTo(cx + PROT_ARM.ix, PROT_Y + PROT_ARM.iy); ctx.lineTo(cx + PROT_ARM.ox, PROT_Y + PROT_ARM.oy)
  ctx.stroke()
  ctx.strokeStyle = JERSEY
  ctx.lineWidth = PROT_ARM.thick * 2
  ctx.beginPath()
  ctx.moveTo(cx - PROT_ARM.ix, PROT_Y + PROT_ARM.iy); ctx.lineTo(cx - PROT_ARM.ox, PROT_Y + PROT_ARM.oy)
  ctx.moveTo(cx + PROT_ARM.ix, PROT_Y + PROT_ARM.iy); ctx.lineTo(cx + PROT_ARM.ox, PROT_Y + PROT_ARM.oy)
  ctx.stroke()
  // 몸통 — 큰 육각
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2
    const hx = cx + Math.cos(a) * PROT_R * 1.2
    const hy = PROT_Y + Math.sin(a) * PROT_R * 1.2
    if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy)
  }
  ctx.closePath()
  ctx.fillStyle = JERSEY
  ctx.fill()
  ctx.lineWidth = 0.16
  ctx.strokeStyle = '#e2e8f0'
  ctx.stroke()
  if (scale * PROT_R > 8) {
    ctx.fillStyle = '#ffffff'
    ctx.font = `800 ${(PROT_R * 1.05).toFixed(2)}px ui-sans-serif, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(w.course.protNum), cx, PROT_Y + 0.05)
  }
  ctx.restore()
}

// ── 스핀무브 휠
function drawWheel(ctx: CanvasRenderingContext2D, w: World, yTop: number, yBot: number) {
  drawOneWheel(ctx, w, w.course.wheel, yTop, yBot)
  for (const d of w.course.distributors) drawOneWheel(ctx, w, d, yTop, yBot)
}
function drawOneWheel(ctx: CanvasRenderingContext2D, w: World, wh: { x: number; y: number; len: number; thick: number; arms: number; spin: number }, yTop: number, yBot: number) {
  if (wh.y + wh.len < yTop || wh.y - wh.len > yBot) return
  ctx.save()
  ctx.translate(wh.x, wh.y)
  ctx.lineCap = 'round'
  for (let a = 0; a < wh.arms; a++) {
    const wcx = w.wc, wsy = w.ws * wh.spin
    let dx = wcx, dy = wsy
    if (a === 1) { dx = -wsy; dy = wcx }
    else if (a === 2) { dx = -wcx; dy = -wsy }
    else if (a === 3) { dx = wsy; dy = -wcx }
    ctx.strokeStyle = a % 2 === 0 ? '#e2762a' : '#f4b942'
    ctx.lineWidth = wh.thick * 2
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dx * wh.len, dy * wh.len); ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(0, 0, 1.15, 0, Math.PI * 2)
  ctx.fillStyle = '#12161f'
  ctx.fill()
  ctx.lineWidth = 0.16
  ctx.strokeStyle = 'rgba(245,158,11,0.9)'
  ctx.stroke()
  ctx.restore()
}

// ── 골대 — 코트 한가운데 바닥. 슈트가 곧 골대 위 통로다.
// 백보드·네트는 공보다 뒤에, 림은 공보다 앞에 그린다(통과가 눈에 보이게).
function drawHoop(ctx: CanvasRenderingContext2D, o: SceneOpts, yTop: number, yBot: number) {
  if (NET_BOTTOM < yTop || BOARD_Y0 - 6 > yBot) return
  ctx.save()
  // 백보드
  ctx.fillStyle = 'rgba(15,18,26,0.95)'
  ctx.strokeStyle = '#e8edf5'
  ctx.lineWidth = 0.22
  ctx.beginPath()
  ctx.rect(BOARD_X0, BOARD_Y0, BOARD_X1 - BOARD_X0, BOARD_Y1 - BOARD_Y0)
  ctx.fill(); ctx.stroke()
  // 백보드 안쪽 사각 타깃
  ctx.strokeStyle = o.rimFlash > 0 ? '#fbbf24' : 'rgba(232,237,245,0.85)'
  ctx.lineWidth = 0.2
  ctx.strokeRect(HOOP_X - 1.9, RIM_Y - 5.4, 3.8, 4.4)

  // 네트 — 출렁임
  const wave = o.netWave
  const rTop = HOOP_HALF
  const rBot = HOOP_HALF * 0.52
  ctx.strokeStyle = 'rgba(255,255,255,0.62)'
  ctx.lineWidth = 0.1
  for (let i = 0; i <= 8; i++) {
    const f = i / 8
    const xt = HOOP_X - rTop + rTop * 2 * f
    const xb = HOOP_X - rBot + rBot * 2 * f
    const sag = wave * 1.4 * Math.sin(f * Math.PI)
    ctx.beginPath()
    ctx.moveTo(xt, RIM_Y)
    ctx.quadraticCurveTo((xt + xb) / 2, RIM_Y + (NET_BOTTOM - RIM_Y) * 0.55 + sag, xb, NET_BOTTOM + sag)
    ctx.stroke()
  }
  for (let k = 1; k <= 3; k++) {
    const f = k / 4
    const y = RIM_Y + (NET_BOTTOM - RIM_Y) * f + wave * 1.1 * Math.sin(f * Math.PI)
    const r = rTop + (rBot - rTop) * f
    ctx.beginPath()
    ctx.ellipse(HOOP_X, y, r, r * 0.26, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function drawRim(ctx: CanvasRenderingContext2D, o: SceneOpts, yTop: number, yBot: number) {
  if (RIM_Y < yTop - 4 || RIM_Y > yBot + 4) return
  ctx.save()
  ctx.lineWidth = 0.42 + o.rimFlash * 0.25
  ctx.strokeStyle = o.rimFlash > 0 ? '#fde68a' : '#e2762a'
  if (o.rimFlash > 0) {
    ctx.shadowColor = '#fbbf24'
    ctx.shadowBlur = 18 * o.rimFlash
  }
  ctx.beginPath()
  ctx.ellipse(HOOP_X, RIM_Y, HOOP_HALF, HOOP_HALF * 0.34, 0, 0, Math.PI * 2)
  ctx.stroke()
  // 슈트 벽에서 림으로 이어지는 짧은 연결 — 통로가 골대에 꽂혀 있다는 신호
  ctx.shadowBlur = 0
  ctx.lineWidth = 0.18
  ctx.strokeStyle = 'rgba(245,158,11,0.5)'
  ctx.beginPath()
  ctx.moveTo(CHUTE_X0, RIM_Y - 0.2); ctx.lineTo(HOOP_X - HOOP_HALF, RIM_Y)
  ctx.moveTo(CHUTE_X1, RIM_Y - 0.2); ctx.lineTo(HOOP_X + HOOP_HALF, RIM_Y)
  ctx.stroke()
  ctx.restore()
}

function drawSparks(ctx: CanvasRenderingContext2D, o: SceneOpts) {
  for (const s of o.sparks) {
    ctx.save()
    ctx.globalAlpha = s.life * 0.7
    ctx.beginPath()
    ctx.arc(s.x, s.y, 0.5 + (1 - s.life) * 1.3, 0, Math.PI * 2)
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 0.14
    ctx.stroke()
    ctx.restore()
  }
}

// ── 농구공
function drawMarble(
  ctx: CanvasRenderingContext2D, m: Drawable, t: TeamInfo | undefined, scale: number, beamT = 0, ghost = false,
) {
  const r = m.r
  ctx.save()
  // 폴백 호송 중인 공 — 장애물을 통과해 곧장 골대로 간다. 금색 후광으로 "지금 이 공 차례"
  // 임을 알린다(시드가 맞았을 때는 호송 자체가 없어 이 표시도 안 나온다).
  if (ghost) {
    ctx.save()
    ctx.globalAlpha = 0.55
    ctx.beginPath()
    ctx.arc(m.x, m.y, r * 2.1, 0, Math.PI * 2)
    ctx.fillStyle = '#fbbf24'
    ctx.fill()
    ctx.restore()
  }
  // 슬로우 빔에 잡힌 공 — 파란 후광. 효과가 화면에 안 보이면 없는 것과 같다.
  if (beamT > 0) {
    ctx.save()
    ctx.globalAlpha = 0.25 + beamT * 0.5
    ctx.beginPath()
    ctx.arc(m.x, m.y, r * (1.6 + beamT * 0.5), 0, Math.PI * 2)
    ctx.fillStyle = '#38bdf8'
    ctx.fill()
    ctx.restore()
  }
  // 그림자
  ctx.globalAlpha = 0.28
  ctx.beginPath()
  ctx.ellipse(m.x + r * 0.18, m.y + r * 0.5, r * 0.95, r * 0.42, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#000000'
  ctx.fill()
  ctx.globalAlpha = 1

  const neutral = !t
  const ink = teamInk(t?.color)
  // 공 본체 — 중립은 어두운 회색, 팀 공은 주황 농구공
  const g = ctx.createRadialGradient(m.x - r * 0.35, m.y - r * 0.4, r * 0.1, m.x, m.y, r)
  if (neutral) { g.addColorStop(0, '#4b5260'); g.addColorStop(0.6, '#33383f'); g.addColorStop(1, '#1b1e24') }
  else { g.addColorStop(0, '#f6a05a'); g.addColorStop(0.55, '#dd7322'); g.addColorStop(1, '#a8490d') }
  ctx.beginPath()
  ctx.arc(m.x, m.y, r, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()

  // 실밥 — 회전한다
  ctx.save()
  ctx.beginPath()
  ctx.arc(m.x, m.y, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.translate(m.x, m.y)
  ctx.rotate(m.rot)
  // 실밥은 **어둡게** — 팀 컬러로 그리면 공 전체가 팀 색 원반으로 읽혀 농구공이 아니게 된다
  ctx.strokeStyle = 'rgba(38,20,6,0.72)'
  ctx.lineWidth = r * 0.13
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.52, r, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()

  // 테두리 링 — 팀 컬러. 흰 팀이 밝은 마루에 묻히지 않게 반대쪽 헤어라인을 겹친다.
  if (!neutral) {
    ctx.lineWidth = r * 0.16
    ctx.strokeStyle = ink.bg
    ctx.beginPath(); ctx.arc(m.x, m.y, r * 0.9, 0, Math.PI * 2); ctx.stroke()
    ctx.lineWidth = r * 0.06
    ctx.strokeStyle = ink.border
    ctx.beginPath(); ctx.arc(m.x, m.y, r * 0.99, 0, Math.PI * 2); ctx.stroke()
  } else {
    ctx.lineWidth = r * 0.08
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, Math.PI * 2); ctx.stroke()
  }

  // 팀 이름표 — 화면에서 9px 보다 작아지면 글자가 뭉개지므로 그리지 않는다
  if (t && scale * r > 7) {
    const fs = r * 0.92
    ctx.font = `700 ${fs.toFixed(2)}px ui-sans-serif, system-ui, sans-serif`
    const label = t.name.length > 6 ? `${t.name.slice(0, 5)}…` : t.name
    const tw = ctx.measureText(label).width
    const padX = fs * 0.42
    const bw = tw + padX * 2
    const bh = fs * 1.5
    // 코스 끝에서 이름표가 잘리지 않게 안으로 당긴다
    const bx = Math.max(0.2, Math.min(COURSE_W - bw - 0.2, m.x - bw / 2))
    const by = m.y - r - bh - r * 0.28
    ctx.beginPath()
    ctx.roundRect(bx, by, bw, bh, bh * 0.4)
    ctx.fillStyle = ink.bg
    ctx.fill()
    ctx.lineWidth = 0.08
    ctx.strokeStyle = ink.border
    ctx.stroke()
    ctx.fillStyle = ink.fg
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, bx + bw / 2, by + bh / 2 + fs * 0.04)
  }
  ctx.restore()
}

export { CHUTE_TOP, COURSE_W, FLOOR_Y, HOOP_X, NET_BOTTOM, RIM_Y, TOP_Y }
