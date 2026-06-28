'use client'
import { useEffect, useRef } from 'react'

interface Props {
  /** 변경될 때마다 새 폭죽 발사 (예: 픽 번호 / Date.now()). null 이면 비활성 */
  trigger: number | string | null
  /** 색상 팔레트 — 기본 팔레트는 모듈 상수라 안정적인 reference */
  colors?: string[]
  /** 전체 폭죽 지속 시간 (ms). 기본 3500 ms — 3차 burst 까지 포함 */
  durationMs?: number
}

interface Piece {
  x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; color: string; alive: boolean
}

// 모듈 상수 — 매 렌더마다 새 배열이 만들어지지 않도록 (useEffect 무한 재실행 방지)
const DEFAULT_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#a855f7', '#ffffff', '#fbbf24', '#22d3ee']

export default function Confetti({ trigger, colors = DEFAULT_COLORS, durationMs = 3500 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (trigger == null) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width = window.innerWidth
    const H = canvas.height = window.innerHeight

    // ── 3차 스태거 burst — 0ms / 600ms / 1200ms 에 각각 80~100개 발사
    // 총 240~300 particle. 각 burst 는 화면 다른 위치에서 시작해 입체적인 폭죽 인상.
    const burstSchedule: Array<{ at: number; n: number; cx: number; cy: number }> = [
      { at: 0,    n: 100, cx: W * 0.5,  cy: H * 0.32 },
      { at: 600,  n: 90,  cx: W * 0.3,  cy: H * 0.38 },
      { at: 1200, n: 90,  cx: W * 0.72, cy: H * 0.36 },
    ]
    const pieces: Piece[] = []

    function spawnBurst(cx: number, cy: number, n: number) {
      for (let i = 0; i < n; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 4 + Math.random() * 10
        pieces.push({
          x: cx + (Math.random() - 0.5) * 60,
          y: cy + (Math.random() - 0.5) * 40,
          vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 4,
          vy: Math.sin(angle) * speed - Math.random() * 6 - 2,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.45,
          size: 6 + Math.random() * 10,
          color: colors[Math.floor(Math.random() * colors.length)],
          alive: true,
        })
      }
    }

    // 첫 burst 즉시 발사
    spawnBurst(burstSchedule[0].cx, burstSchedule[0].cy, burstSchedule[0].n)
    const firedFlags = [true, false, false]

    const start = performance.now()
    let stopped = false

    function frame(t: number) {
      if (stopped) return
      const elapsed = t - start
      // 예약된 burst 추가 발사
      for (let i = 1; i < burstSchedule.length; i++) {
        if (!firedFlags[i] && elapsed >= burstSchedule[i].at) {
          spawnBurst(burstSchedule[i].cx, burstSchedule[i].cy, burstSchedule[i].n)
          firedFlags[i] = true
        }
      }
      ctx!.clearRect(0, 0, W, H)
      for (const p of pieces) {
        if (!p.alive) continue
        p.vy += 0.28 // gravity
        p.x += p.vx; p.y += p.vy; p.rot += p.vr
        // 화면 아래 통과 후 정리
        if (p.y - p.size > H) { p.alive = false; continue }
        ctx!.save()
        ctx!.translate(p.x, p.y); ctx!.rotate(p.rot)
        ctx!.fillStyle = p.color
        // 점진 fade-out — 70% 까지는 불투명, 이후 부드럽게 사라짐
        const fadeStart = durationMs * 0.7
        const alpha = elapsed < fadeStart ? 1 : Math.max(0, 1 - (elapsed - fadeStart) / (durationMs - fadeStart))
        ctx!.globalAlpha = alpha
        ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        ctx!.restore()
      }
      if (elapsed < durationMs) {
        rafRef.current = requestAnimationFrame(frame)
      } else {
        // 1회 burst 완료 — 영구 정지. 다시 표시되려면 trigger 가 변경되어야 함.
        ctx!.clearRect(0, 0, W, H)
        stopped = true
        rafRef.current = null
      }
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => {
      stopped = true
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [trigger, colors, durationMs])

  if (trigger == null) return null
  return <canvas ref={canvasRef} className="fixed inset-0 z-[62] pointer-events-none" aria-hidden="true" />
}
