'use client'
// 추첨 결과 풀스크린 연출 — 2D 캔버스 단일 구현.
//
// 2026-09-17: three.js 3D 버전을 들어냈다(구단주 판정 "품질이 낮다"). 동시에 그 이전 2D 판정
// "촌스럽고 애니메이션이 부드럽지 않다"의 원인도 같이 고쳤다 — 옛 2D 는 공 하나하나에
// CSS keyframe(lottoChaos)을 물려 N개가 제각각 타임라인을 돌았다. 프레임이 밀리면 공끼리
// 겹치고 튀어서 "끊긴다"로 읽혔다. 지금은 공 전체를 **한 캔버스에서 한 물리 루프로** 돌린다:
// 중력 + 원형 보울 경계 + 감쇠 + 송풍기, rAF 에 dt 상한(1/30s)을 걸어 탭 복귀 시 폭발하지 않는다.
//
// 페이즈·타이밍·onClose 계약은 3D/옛 2D 와 **완전히 동일**하다. 같은 추첨을 보는 클라이언트가
// 서로 다른 시각에 닫히면 진행자가 다음 단계를 못 넘어간다.
//
//   'intro'     : 2.0s — 팀 공이 보울 안으로 떨어져 정착
//   'drawing'   : 4.0s — 송풍기가 공을 띄워 텀블링. 드럼롤. 스포트라이트.
//   'revealing' : 1.5s — 1픽 공이 상단 튜브로 ease-out 상승 + 폭죽 + 호른.
//   'revealed'  : 결과 노출. 10s 후 자동 닫힘. revealing 진입 후 탭하면 즉시 revealed 로 점프.
//
// prefers-reduced-motion: 공은 정지 배치로 한 번만 그리고, 당첨 공은 즉시 튜브에 놓는다.

import { useState, useEffect, useRef } from 'react'
import { Dice5 } from 'lucide-react'
import { playDrumroll, playLotteryHorn, primeAudio } from '@/lib/draftSounds'
import { teamInk, teamAccentOnDark } from '@/lib/util/contrastColor'

interface Team { id: string; name: string; color: string }

interface Props {
  order: string[]              // 확정된 픽 순서 (index 0 = 1픽)
  odds: Record<string, number> | null
  teams: Team[]
  onClose: () => void
}

type Phase = 'intro' | 'drawing' | 'revealing' | 'revealed'

/** 확률이 팀마다 실제로 다를 때만 true. 균등 추첨(전원 1/N)이거나 odds 가 없으면 false.
 *  실제 드래프트는 대부분 균등이라 같은 숫자가 N번 반복될 뿐이고, 그 배지는 정보가 0이다. */
export function hasVaryingOdds(order: string[], odds: Record<string, number> | null): boolean {
  if (!odds) return false
  const values = order.map(id => odds[id]).filter((v): v is number => typeof v === 'number')
  if (values.length < 2) return false
  // 1/3 이 0.3333 / 0.3334 로 갈리는 부동소수 오차는 '다르다'로 치지 않는다
  return Math.max(...values) - Math.min(...values) > 0.0005
}

const INTRO_MS = 2000
const DRAWING_MS = 4000
const REVEALING_MS = 1500
const REVEALED_AUTO_CLOSE_MS = 10000

const CONFETTI_PIECES = 80

/** 공 물리 — 픽셀/초 단위. dt 상한이 있으므로 값은 화면 크기에 비례해 스케일한다. */
interface Ball {
  x: number; y: number
  vx: number; vy: number
  r: number
  /** 팀 공이면 팀 컬러, 채움 공이면 null */
  color: string | null
  ink: string
  edge: string
  label: string
  winner: boolean
  /** revealing 에서 튜브를 타고 올라가는 중 — 물리에서 빠진다 */
  escaping: boolean
  /** 탈출 시작 좌표 (ease-out 보간용) */
  fromX: number; fromY: number
  t0: number
}

/** rgb 를 흰색/검은색 쪽으로 섞는다 — 캔버스 하이라이트/그림자용(밝기만, 색상 유지) */
function mix(hex: string, target: 0 | 255, amount: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const f = (v: number) => Math.round(v + (target - v) * amount)
  return `rgb(${f(r)},${f(g)},${f(b)})`
}

export default function DraftLotteryReveal({ order, odds, teams, onClose }: Props) {
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const [phase, setPhase] = useState<Phase>('intro')
  const [reducedMotion] = useState(() =>
    typeof window !== 'undefined' && !!window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const confettiRef = useRef<HTMLCanvasElement | null>(null)
  const ballsRef = useRef<Ball[]>([])
  const rafRef = useRef<number | null>(null)
  const confettiRafRef = useRef<number | null>(null)
  // reduced-motion 경로는 rAF 루프가 없다 — 페이즈가 바뀌어도 아무도 다시 그려 주지 않으므로
  // 정지 배치 렌더러를 밖에서 부를 수 있게 잡아 둔다(당첨 공을 튜브로 즉시 옮겨야 한다).
  const redrawStaticRef = useRef<(() => void) | null>(null)
  // 물리 루프는 마운트 1회만 돈다 — 페이즈를 클로저로 잡으면 옛 값을 본다
  const phaseRef = useRef<Phase>('intro')
  phaseRef.current = phase

  // ── 자동 페이즈 전환 (타이밍 고정) ─────────────────────
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(setTimeout(() => {
      setPhase('drawing')
      try { primeAudio(); playDrumroll() } catch { /* ignore */ }
      timers.push(setTimeout(() => {
        setPhase('revealing')
        try { playLotteryHorn() } catch { /* ignore */ }
        launchConfetti()
        timers.push(setTimeout(() => {
          setPhase('revealed')
          timers.push(setTimeout(() => onClose(), REVEALED_AUTO_CLOSE_MS))
        }, REVEALING_MS))
      }, DRAWING_MS))
    }, INTRO_MS))
    return () => {
      for (const t of timers) clearTimeout(t)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (confettiRafRef.current) cancelAnimationFrame(confettiRafRef.current)
    }
    // 마운트 시 1회만 — onClose 는 부모가 재생성하지 않는다고 가정
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 캔버스 물리 루프 ──────────────────────────────────
  useEffect(() => {
    if (phase === 'revealed') return          // 결과 화면에선 캔버스가 언마운트된다
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0, H = 0
    let cx = 0, cy = 0, R = 0, ballR = 0, tubeTop = 0
    let seeded = false

    function layout() {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const rect = wrap!.getBoundingClientRect()
      W = Math.max(1, Math.round(rect.width))
      H = Math.max(1, Math.round(rect.height))
      canvas!.width = Math.round(W * dpr)
      canvas!.height = Math.round(H * dpr)
      canvas!.style.width = `${W}px`
      canvas!.style.height = `${H}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)

      // 튜브가 보울 위로 뻗을 자리를 남기고 보울을 아래쪽에 앉힌다
      tubeTop = H * 0.06
      R = Math.min(W * 0.42, (H - tubeTop) * 0.44)
      cx = W / 2
      cy = H - R - H * 0.06
      ballR = Math.max(9, Math.min(26, R * 0.155))

      if (!seeded) { seed(); seeded = true }
      else {
        // 리사이즈 — 보울 밖으로 나간 공만 안으로 당긴다(배치는 유지)
        for (const b of ballsRef.current) {
          b.r = ballR
          const dx = b.x - cx, dy = b.y - cy
          const d = Math.hypot(dx, dy) || 1
          if (d > R - b.r) { b.x = cx + (dx / d) * (R - b.r); b.y = cy + (dy / d) * (R - b.r) }
        }
      }
    }

    function seed() {
      const list: Ball[] = []
      // 팀 공 + 채움 공 — 보울이 헐렁하면 텀블링이 안 보인다. 총 12개 선.
      const fillers = Math.max(0, 12 - order.length)
      order.forEach((tid, i) => {
        const t = teamMap[tid]
        const raw = t?.color ?? '#8b93a7'
        const ink = teamInk(raw)
        list.push(makeBall(ink.bg, ink.fg, ink.border, t?.name?.slice(0, 3) ?? '?', i === 0))
      })
      for (let i = 0; i < fillers; i++) {
        list.push(makeBall(null, '#9ca3af', 'rgba(255,255,255,0.18)', '', false))
      }
      ballsRef.current = list
    }

    function makeBall(color: string | null, ink: string, edge: string, label: string, winner: boolean): Ball {
      // intro 는 "위에서 떨어져 정착" — 보울 위쪽에서 시작시킨다
      const a = Math.random() * Math.PI * 2
      const d = Math.random() * (R - ballR) * 0.7
      return {
        x: cx + Math.cos(a) * d,
        y: cy + Math.sin(a) * d - R * 1.2,
        vx: (Math.random() - 0.5) * R * 0.6,
        vy: 0,
        r: ballR, color, ink, edge, label, winner,
        escaping: false, fromX: 0, fromY: 0, t0: 0,
      }
    }

    layout()
    const ro = new ResizeObserver(() => { layout(); if (reducedMotion) drawStatic() })
    ro.observe(wrap)

    // ── 정지 배치(reduced-motion) — 바닥에 나란히 눕힌다
    function drawStatic() {
      const balls = ballsRef.current
      const perRow = Math.max(1, Math.floor((R * 1.7) / (ballR * 2.1)))
      balls.forEach((b, i) => {
        const row = Math.floor(i / perRow)
        const inRow = i % perRow
        const count = Math.min(perRow, balls.length - row * perRow)
        b.x = cx + (inRow - (count - 1) / 2) * ballR * 2.1
        b.y = cy + R * 0.55 - row * ballR * 2.1
        b.vx = 0; b.vy = 0
        if (b.winner && phaseRef.current !== 'intro' && phaseRef.current !== 'drawing') {
          b.x = cx; b.y = tubeTop + b.r * 1.2
        }
      })
      render()
    }

    // ── 물리 한 스텝
    function step(dt: number) {
      const balls = ballsRef.current
      const p = phaseRef.current
      const g = R * 6.5                                   // 중력(px/s²) — 보울 크기에 비례
      const blow = p === 'drawing' ? R * 9.5 : 0           // 송풍기 상승력
      const now = performance.now()

      for (const b of balls) {
        if (b.escaping) continue
        if (b.winner && p === 'revealing') {
          b.escaping = true; b.fromX = b.x; b.fromY = b.y; b.t0 = now
          continue
        }
        b.vy += g * dt
        if (blow > 0) {
          // 바닥에 가까울수록 세게 — 실제 추첨기처럼 아래에서 불어 올린다
          // 상수항을 두면 위로만 밀려 전원이 천장에 눌려붙는다(첫 렌더 실측) — 천장 근처에선 0
          const depth = Math.max(0, Math.min(1, (b.y - (cy - R)) / (2 * R)))
          b.vy -= blow * dt * depth * depth * 2.2
          b.vx += (Math.random() - 0.5) * R * 11 * dt
          b.vy += (Math.random() - 0.5) * R * 6 * dt
        }
        // 공기 저항 — 이게 없으면 송풍기가 공을 계속 가속시켜 화면 밖처럼 보인다
        const drag = Math.pow(blow > 0 ? 0.55 : 0.25, dt)
        b.vx *= drag; b.vy *= drag
        b.x += b.vx * dt
        b.y += b.vy * dt
      }

      // 공끼리 충돌 — 12개라 O(n²)로 충분하다
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i]
        if (a.escaping) continue
        for (let j = i + 1; j < balls.length; j++) {
          const c = balls[j]
          if (c.escaping) continue
          const dx = c.x - a.x, dy = c.y - a.y
          const dist = Math.hypot(dx, dy) || 0.0001
          const min = a.r + c.r
          if (dist >= min) continue
          const nx = dx / dist, ny = dy / dist
          const push = (min - dist) / 2
          a.x -= nx * push; a.y -= ny * push
          c.x += nx * push; c.y += ny * push
          const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny
          if (rel > 0) continue
          const imp = -1.55 * rel / 2            // 반발계수 0.55
          a.vx -= imp * nx; a.vy -= imp * ny
          c.vx += imp * nx; c.vy += imp * ny
        }
      }

      // 보울 경계
      for (const b of balls) {
        if (b.escaping) continue
        const dx = b.x - cx, dy = b.y - cy
        const d = Math.hypot(dx, dy)
        const lim = R - b.r
        if (d <= lim) continue
        const nx = dx / (d || 1), ny = dy / (d || 1)
        b.x = cx + nx * lim
        b.y = cy + ny * lim
        const vn = b.vx * nx + b.vy * ny
        if (vn > 0) {
          b.vx -= 1.45 * vn * nx     // 반발 0.45
          b.vy -= 1.45 * vn * ny
          b.vx *= 0.92; b.vy *= 0.92 // 벽 마찰
        }
      }

      // 당첨 공 상승 — 튜브를 타고 ease-out (cubic)
      for (const b of balls) {
        if (!b.escaping) continue
        const k = Math.min(1, (now - b.t0) / REVEALING_MS)
        const e = 1 - Math.pow(1 - k, 3)
        b.x = b.fromX + (cx - b.fromX) * Math.min(1, e * 1.6)
        b.y = b.fromY + (tubeTop + b.r * 1.2 - b.fromY) * e
      }
    }

    // ── 그리기
    function render() {
      ctx!.clearRect(0, 0, W, H)
      const p = phaseRef.current

      // 튜브 — 보울 위로 뻗은 유리관
      const tubeW = ballR * 2.7
      ctx!.save()
      ctx!.beginPath()
      ctx!.roundRect(cx - tubeW / 2, tubeTop, tubeW, cy - R + tubeW * 0.4 - tubeTop, tubeW / 2)
      ctx!.fillStyle = 'rgba(148,163,184,0.07)'
      ctx!.fill()
      ctx!.strokeStyle = 'rgba(148,163,184,0.35)'
      ctx!.lineWidth = 2
      ctx!.stroke()
      ctx!.restore()

      // 보울
      ctx!.save()
      const bowl = ctx!.createRadialGradient(cx - R * 0.3, cy - R * 0.4, R * 0.1, cx, cy, R)
      bowl.addColorStop(0, 'rgba(255,255,255,0.10)')
      bowl.addColorStop(1, 'rgba(15,17,26,0.65)')
      ctx!.beginPath()
      ctx!.arc(cx, cy, R, 0, Math.PI * 2)
      ctx!.fillStyle = bowl
      ctx!.fill()
      ctx!.lineWidth = 3
      ctx!.strokeStyle = p === 'drawing' ? 'rgba(251,191,36,0.75)' : 'rgba(148,163,184,0.5)'
      ctx!.stroke()
      // 유리 반사
      ctx!.beginPath()
      ctx!.ellipse(cx - R * 0.38, cy - R * 0.52, R * 0.26, R * 0.13, -0.5, 0, Math.PI * 2)
      ctx!.fillStyle = 'rgba(255,255,255,0.12)'
      ctx!.fill()
      ctx!.restore()

      for (const b of ballsRef.current) drawBall(b, p)
    }

    function drawBall(b: Ball, p: Phase) {
      const dim = p === 'revealing' && !b.winner ? 0.3 : 1
      const base = b.color ?? '#333845'
      ctx!.save()
      ctx!.globalAlpha = dim
      if (b.winner && b.escaping) {
        ctx!.shadowColor = base
        ctx!.shadowBlur = b.r * 1.6
      }
      const grad = ctx!.createRadialGradient(
        b.x - b.r * 0.35, b.y - b.r * 0.42, b.r * 0.08,
        b.x, b.y, b.r,
      )
      grad.addColorStop(0, mix(base, 255, 0.45))
      grad.addColorStop(0.55, base)
      grad.addColorStop(1, mix(base, 0, 0.28))
      ctx!.beginPath()
      ctx!.arc(b.x, b.y, b.r, 0, Math.PI * 2)
      ctx!.fillStyle = grad
      ctx!.fill()
      ctx!.shadowBlur = 0
      // 가장자리 — 흰 팀 공이 어두운 표면에 묻히지 않게 반대쪽 헤어라인
      ctx!.lineWidth = 1.5
      ctx!.strokeStyle = b.edge
      ctx!.stroke()
      if (b.label && b.r >= 13) {
        ctx!.fillStyle = b.ink
        ctx!.font = `700 ${Math.round(b.r * 0.62)}px ui-sans-serif, system-ui, sans-serif`
        ctx!.textAlign = 'center'
        ctx!.textBaseline = 'middle'
        ctx!.fillText(b.label, b.x, b.y)
      }
      ctx!.restore()
    }

    if (reducedMotion) {
      redrawStaticRef.current = drawStatic
      drawStatic()
      return () => { ro.disconnect(); redrawStaticRef.current = null }
    }

    let last = performance.now()
    function frame(t: number) {
      // dt 상한 — 탭을 떠났다 돌아오면 t 점프가 크고, 그대로 적분하면 공이 보울을 관통한다
      const dt = Math.min(1 / 30, Math.max(0, (t - last) / 1000))
      last = t
      // 2 서브스텝 — 큰 dt 에서도 충돌 해소가 안정적이다
      step(dt / 2); step(dt / 2)
      render()
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)

    return () => {
      ro.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // phase 는 phaseRef 로 읽는다 — 'revealed' 진입 시에만 루프를 접는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === 'revealed', reducedMotion])

  // reduced-motion: 페이즈가 바뀌면 즉시 다시 그린다(애니메이션 없이 결과만 갈아끼운다)
  useEffect(() => {
    if (reducedMotion) redrawStaticRef.current?.()
  }, [phase, reducedMotion])

  // ── 폭죽 ──────────────────────────────────────────────
  function launchConfetti() {
    if (reducedMotion) return
    const canvas = confettiRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width = window.innerWidth
    const H = canvas.height = window.innerHeight
    const first = teamMap[order[0]]?.color ?? '#f59e0b'
    const colors = [first, '#f59e0b', '#ffffff', '#fbbf24', '#3b82f6', '#10b981']

    interface Piece { x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; color: string; shape: 'rect' | 'circle' }
    const pieces: Piece[] = Array.from({ length: CONFETTI_PIECES }, () => ({
      x: W / 2 + (Math.random() - 0.5) * 200,
      y: H / 2 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 18,
      vy: -Math.random() * 20 - 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.5,
      size: 5 + Math.random() * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: Math.random() > 0.4 ? 'rect' : 'circle',
    }))

    const DUR = 1500
    const start = performance.now()
    function frame(t: number) {
      const elapsed = t - start
      ctx!.clearRect(0, 0, W, H)
      for (const p of pieces) {
        p.vy += 0.32
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        ctx!.save()
        ctx!.translate(p.x, p.y)
        ctx!.rotate(p.rot)
        ctx!.fillStyle = p.color
        ctx!.globalAlpha = Math.max(0, 1 - elapsed / DUR)
        if (p.shape === 'rect') ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        else { ctx!.beginPath(); ctx!.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx!.fill() }
        ctx!.restore()
      }
      if (elapsed < DUR) confettiRafRef.current = requestAnimationFrame(frame)
      else ctx!.clearRect(0, 0, W, H)
    }
    confettiRafRef.current = requestAnimationFrame(frame)
  }

  const firstId = order[0]
  const firstTeam = teamMap[firstId]
  const firstColor = firstTeam?.color ?? '#f59e0b'
  const firstInk = teamInk(firstColor)
  // 팀 컬러를 **글자색**으로 검은 배경에 쓰는 자리 — 어두운 팀 컬러는 그대로 두면 사라진다
  const firstAccent = teamAccentOnDark(firstColor)
  const showSpotlight = phase === 'drawing' || phase === 'revealing'
  const oddsVary = hasVaryingOdds(order, odds)

  function handleTap() {
    if (phase === 'revealing') setPhase('revealed')
    else if (phase === 'revealed') onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[58] flex items-center justify-center bg-[#000000]/90 p-4 cursor-pointer"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}
      onClick={handleTap}
    >
      <style>{`
        /* 등장은 opacity/transform 만 — width/height 는 매 프레임 레이아웃을 다시 계산한다 */
        @keyframes lottoRise {
          from { transform: scale(0.88) translateY(14px); opacity: 0; }
          to   { transform: scale(1)    translateY(0);    opacity: 1; }
        }
        @keyframes spotlightGlow {
          0%, 100% { opacity: 0.22; transform: scale(1); }
          50%      { opacity: 0.5;  transform: scale(1.08); }
        }
        @keyframes winnerText {
          from { transform: scale(0.82); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .lotto-anim { animation: none !important; }
        }
      `}</style>

      {/* 스포트라이트 글로우 */}
      {showSpotlight && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${firstColor}33, transparent 55%)`,
            animation: reducedMotion ? undefined : 'spotlightGlow 2s ease-in-out infinite',
            zIndex: 0,
          }}
        />
      )}

      {/* 폭죽 캔버스 */}
      <canvas ref={confettiRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }} aria-hidden />

      <div className="relative text-center max-w-lg sm:max-w-xl md:max-w-2xl w-full flex flex-col items-center" style={{ zIndex: 3 }}>
        <p className="font-jersey text-base uppercase tracking-[0.3em] text-amber-400 mb-1.5">DRAFT LOTTERY</p>
        <h2 className="text-2xl sm:text-4xl font-black text-[#ffffff] mb-3 sm:mb-4 min-h-[2.25rem]">
          {phase === 'intro' && '추첨 기계에 팀 공 투입'}
          {phase === 'drawing' && (<span className="inline-flex items-center gap-2"><Dice5 size={24} aria-hidden /> 추첨 진행 중...</span>)}
          {phase === 'revealing' && (
            <span
              className="lotto-anim"
              style={{ display: 'inline-block', animation: 'winnerText 320ms cubic-bezier(0.2,0.8,0.2,1) both', color: firstAccent }}
            >
              1픽 결정!
            </span>
          )}
          {phase === 'revealed' && '1픽 당첨!'}
        </h2>

        {phase !== 'revealed' ? (
          <>
            <div
              ref={wrapRef}
              className="w-full"
              style={{ height: 'min(52vh, 420px)' }}
              aria-hidden
            >
              <canvas ref={canvasRef} className="block" />
            </div>

            <div className="mt-3 h-14 flex flex-col items-center justify-center gap-1">
              {phase === 'drawing' && (
                <p className="text-amber-300 font-black text-2xl tracking-widest animate-pulse">● ● ●</p>
              )}
              {phase === 'intro' && (
                <p className="text-[#e5e7eb] text-base sm:text-lg leading-relaxed">팀 공이 기계로 들어가는 중...</p>
              )}
              {phase === 'revealing' && (
                <>
                  <p className="text-xl sm:text-2xl font-black" style={{ color: firstAccent }}>
                    1순위 · {firstTeam?.name ?? '?'}
                  </p>
                  <p className="text-amber-200 text-base font-bold tracking-wider">탭하여 결과 보기 →</p>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div
              className="lotto-anim mx-auto w-36 h-36 sm:w-40 sm:h-40 rounded-full flex flex-col items-center justify-center shadow-2xl"
              style={{
                backgroundColor: firstInk.bg,
                color: firstInk.fg,
                border: `2px solid ${firstInk.border}`,
                boxShadow: `0 0 50px ${firstColor}80`,
                animation: reducedMotion ? undefined : 'lottoRise 380ms cubic-bezier(0.2,0.8,0.2,1) both',
              }}
            >
              <span className="text-xs font-black tracking-widest opacity-80">1픽</span>
              <span className="font-black text-xl sm:text-2xl px-4 text-center leading-tight break-keep">{firstTeam?.name}</span>
            </div>

            {/* 전체 순서 — 스크롤 가능 (8팀 이상 대응) */}
            <div className="mt-5 w-full space-y-2 max-h-[38vh] overflow-y-auto pr-1">
              {order.map((tid, idx) => {
                const t = teamMap[tid]
                const ink = teamInk(t?.color)
                const odd = odds?.[tid]
                return (
                  <div
                    key={`${tid}-${idx}`}
                    className="lotto-anim flex items-center gap-3 rounded-xl px-3 sm:px-4 py-3 border bg-[#111827]"
                    style={{
                      borderColor: idx === 0 ? firstColor : '#374151',
                      animation: reducedMotion ? undefined : `lottoRise 300ms ease-out ${Math.min(idx * 70, 560)}ms both`,
                    }}
                  >
                    <span className={`font-display text-2xl sm:text-3xl w-8 shrink-0 ${idx === 0 ? 'text-amber-300' : 'text-[#e5e7eb]'}`}>{idx + 1}</span>
                    <div
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: ink.bg, border: `1px solid ${ink.border}` }}
                    />
                    <span className="text-[#ffffff] font-black flex-1 text-left text-lg sm:text-xl truncate min-w-0">{t?.name}</span>
                    {idx === 0 && <span className="text-xs font-black text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wider">1픽</span>}
                    {oddsVary && odd != null && <span className="text-sm text-[#e5e7eb] shrink-0 tabular-nums">{(odd * 100).toFixed(0)}%</span>}
                  </div>
                )
              })}
            </div>
            <p className="text-sm text-[#d1d5db] mt-4 leading-relaxed">탭하여 닫기 · 10초 후 자동 닫힘</p>
          </>
        )}
      </div>
    </div>
  )
}
