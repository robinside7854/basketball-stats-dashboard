'use client'
import { useEffect, useRef } from 'react'

interface Props {
  /** 변경될 때마다 새 폭죽 발사 (예: 픽 번호) */
  trigger: number | string | null
  colors?: string[]
  durationMs?: number
}

interface Piece {
  x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; color: string
}

export default function Confetti({ trigger, colors = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#a855f7', '#ffffff'], durationMs = 2200 }: Props) {
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
    const N = 140
    const pieces: Piece[] = Array.from({ length: N }, () => ({
      x: W / 2 + (Math.random() - 0.5) * 200,
      y: H / 3 + (Math.random() - 0.5) * 80,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 14 - 4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      size: 6 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
    }))
    const start = performance.now()
    function frame(t: number) {
      const elapsed = t - start
      ctx!.clearRect(0, 0, W, H)
      for (const p of pieces) {
        p.vy += 0.3 // gravity
        p.x += p.vx; p.y += p.vy; p.rot += p.vr
        ctx!.save()
        ctx!.translate(p.x, p.y); ctx!.rotate(p.rot)
        ctx!.fillStyle = p.color
        ctx!.globalAlpha = Math.max(0, 1 - elapsed / durationMs)
        ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        ctx!.restore()
      }
      if (elapsed < durationMs) rafRef.current = requestAnimationFrame(frame)
      else ctx!.clearRect(0, 0, W, H)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [trigger, colors, durationMs])

  if (trigger == null) return null
  return <canvas ref={canvasRef} className="fixed inset-0 z-[62] pointer-events-none" />
}
