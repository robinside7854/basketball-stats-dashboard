// 캔버스 2D 렌더러 — 세로형 하프코트. 물리(sim.ts)와 완전히 분리돼 있다.
// 여기서는 sin/cos 를 마음껏 쓴다(그림은 기기마다 달라도 되지만, 궤적은 달라지면 안 된다).

import {
  BOARD_X0, BOARD_X1, COURSE_W, FLOOR_Y, GATE_APEX_Y, GATE_X0, GATE_X1,
  HOOP_HALF, HOOP_X, NET_BOTTOM, RIM_Y, SHELF_INNER_Y, TOP_Y,
  type Course,
} from './course'
import type { World } from './sim'

/** 그리기에 필요한 최소 정보 — 심의 Marble 도, 날아가는 공도 이 모양이면 된다 */
interface Drawable { x: number; y: number; r: number; rot: number; team: string | null }
import { teamInk } from '@/lib/util/contrastColor'

export interface Cam { x: number; y: number; zoom: number }

export interface TeamInfo { name: string; color: string }

/** 공개 단계에서 날아가는 공 */
export interface FlyingBall {
  x: number; y: number; rot: number
  teamId: string
  /** 림을 통과했는지 — 네트 앞/뒤 그리기 순서가 갈린다 */
  through: boolean
}

export interface SceneOpts {
  viewW: number
  viewH: number
  cam: Cam
  teams: Record<string, TeamInfo>
  flying: FlyingBall | null
  /** 림 플래시 0~1 */
  rimFlash: number
  /** 네트 출렁임 0~1 */
  netWave: number
  /** 페그 타격 잔상 */
  sparks: { x: number; y: number; life: number }[]
}

const WOOD_A = '#8a5a2b'
const WOOD_B = '#7a4d23'
const WOOD_LINE = 'rgba(0,0,0,0.22)'
const PAINT = 'rgba(200,86,24,0.30)'
const LINE = 'rgba(255,255,255,0.72)'
const APRON = '#0a0a0f'

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
  drawCourse(ctx, w.course, yTop, yBot, s)
  drawHoop(ctx, o, yTop, yBot)
  drawWheel(ctx, w, yTop, yBot)
  drawSparks(ctx, o)

  for (const m of w.marbles) {
    if (m.out || m.y < yTop - 2 || m.y > yBot + 2) continue
    drawMarble(ctx, m, m.team ? o.teams[m.team] : undefined, s)
  }

  if (o.flying) {
    const t = o.teams[o.flying.teamId]
    drawMarble(ctx, { x: o.flying.x, y: o.flying.y, r: 0.62, rot: o.flying.rot, team: o.flying.teamId }, t, s, true)
  }

  ctx.restore()
}

// ── 마룻바닥 (절차적 널판)
function drawFloor(ctx: CanvasRenderingContext2D, yTop: number, yBot: number) {
  const y0 = Math.max(TOP_Y, yTop)
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
  // 사이드라인
  ctx.beginPath()
  ctx.moveTo(0.55, Math.max(TOP_Y, yTop)); ctx.lineTo(0.55, Math.min(FLOOR_Y, yBot))
  ctx.moveTo(COURSE_W - 0.55, Math.max(TOP_Y, yTop)); ctx.lineTo(COURSE_W - 0.55, Math.min(FLOOR_Y, yBot))
  ctx.stroke()
  // 골밑 페인트존
  if (yBot > 92) {
    ctx.fillStyle = PAINT
    ctx.fillRect(7, 92, 10, Math.min(SHELF_INNER_Y, yBot) - 92)
    ctx.strokeRect(7, 92, 10, Math.min(SHELF_INNER_Y, yBot) - 92)
    // 자유투 서클
    ctx.beginPath()
    ctx.arc(12, 92, 5, 0, Math.PI)
    ctx.stroke()
  }
  // 센터 서클
  if (yTop < 60 && yBot > 48) {
    ctx.beginPath()
    ctx.arc(12, 54, 5.4, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

// ── 램프·퍼널·선반 + 수비수 페그
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
    } else if (sg.kind === 'funnel') {
      ctx.strokeStyle = '#2b3242'
      ctx.lineWidth = 0.95
      ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2); ctx.stroke()
      ctx.strokeStyle = 'rgba(245,158,11,0.6)'
      ctx.lineWidth = 0.18
      ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2); ctx.stroke()
    } else {
      // 선반(볼랙) · 가운데 능선
      ctx.strokeStyle = '#171b24'
      ctx.lineWidth = 1.1
      ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2); ctx.stroke()
      ctx.strokeStyle = 'rgba(245,158,11,0.75)'
      ctx.lineWidth = 0.2
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

// ── 스핀무브 휠
function drawWheel(ctx: CanvasRenderingContext2D, w: World, yTop: number, yBot: number) {
  const wh = w.course.wheel
  if (wh.y + wh.len < yTop || wh.y - wh.len > yBot) return
  ctx.save()
  ctx.translate(wh.x, wh.y)
  ctx.lineCap = 'round'
  for (let a = 0; a < wh.arms; a++) {
    let dx = w.wc, dy = w.ws
    if (a === 1) { dx = -w.ws; dy = w.wc }
    else if (a === 2) { dx = -w.wc; dy = -w.ws }
    else if (a === 3) { dx = w.ws; dy = -w.wc }
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

// ── 골대 — 코트가 끝나는 선 아래(에이프런)에 매달려 있다.
// 공개 단계의 공은 이 앞으로 날아가 림에 꽂힌다. 코트 바닥은 절대 열리지 않으므로
// 선반 위에 굴러다니는 공이 허공에 뜨는 일이 없다.
function drawHoop(ctx: CanvasRenderingContext2D, o: SceneOpts, yTop: number, yBot: number) {
  if (NET_BOTTOM < yTop || RIM_Y - 14 > yBot) return
  ctx.save()
  // 백보드
  const bY0 = SHELF_INNER_Y + 2
  ctx.fillStyle = 'rgba(15,18,26,0.92)'
  ctx.strokeStyle = '#e8edf5'
  ctx.lineWidth = 0.22
  ctx.beginPath()
  ctx.rect(BOARD_X0, bY0, BOARD_X1 - BOARD_X0, RIM_Y - 0.6 - bY0)
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

  // 림
  ctx.lineWidth = 0.42
  ctx.strokeStyle = o.rimFlash > 0 ? '#fde68a' : '#e2762a'
  if (o.rimFlash > 0) {
    ctx.shadowColor = '#fbbf24'
    ctx.shadowBlur = 14 * o.rimFlash
  }
  ctx.beginPath()
  ctx.ellipse(HOOP_X, RIM_Y, HOOP_HALF, HOOP_HALF * 0.34, 0, 0, Math.PI * 2)
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
  ctx: CanvasRenderingContext2D, m: Drawable, t: TeamInfo | undefined, scale: number, front = false,
) {
  const r = m.r
  ctx.save()
  // 그림자
  ctx.globalAlpha = 0.28
  ctx.beginPath()
  ctx.ellipse(m.x + r * 0.18, m.y + r * 0.5, r * 0.95, r * 0.42, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#000000'
  ctx.fill()
  ctx.globalAlpha = 1

  const neutral = !t
  const ink = teamInk(t?.color)
  if (front) {
    ctx.shadowColor = ink.bg
    ctx.shadowBlur = 18
  }
  // 공 본체 — 중립은 어두운 회색, 팀 공은 주황 농구공
  const g = ctx.createRadialGradient(m.x - r * 0.35, m.y - r * 0.4, r * 0.1, m.x, m.y, r)
  if (neutral) { g.addColorStop(0, '#4b5260'); g.addColorStop(0.6, '#33383f'); g.addColorStop(1, '#1b1e24') }
  else { g.addColorStop(0, '#f6a05a'); g.addColorStop(0.55, '#dd7322'); g.addColorStop(1, '#a8490d') }
  ctx.beginPath()
  ctx.arc(m.x, m.y, r, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
  ctx.shadowBlur = 0

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

/** 공개 단계에서 공이 그리는 슛 아치. t 0→1. */
export function shotArc(fromX: number, fromY: number, t: number): { x: number; y: number } {
  const x = fromX + (HOOP_X - fromX) * t
  // 포물선 — 시작점과 림을 잇고 위로 솟는다
  const base = fromY + (RIM_Y - fromY) * t
  const apex = 16 + Math.abs(fromX - HOOP_X) * 0.5
  return { x, y: base - apex * 4 * t * (1 - t) }
}

export { GATE_APEX_Y, GATE_X0, GATE_X1, RIM_Y, NET_BOTTOM, FLOOR_Y, SHELF_INNER_Y, HOOP_X, COURSE_W, TOP_Y }
