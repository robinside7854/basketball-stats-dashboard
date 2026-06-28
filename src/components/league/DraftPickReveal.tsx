'use client'
// 픽 이팩트 — 새 픽이 들어오면 전체화면으로 약 4.5초간 표시.
// 폭죽 + 농구 카드 느낌 + 광채 + pulse 백라이트 + 스포트라이트 빔.
//
// 사용 패턴:
//   const [reveal, setReveal] = useState<PickRevealData | null>(null)
//   <DraftPickReveal data={reveal} onClose={() => setReveal(null)} />

import { useEffect, useRef } from 'react'

export interface PickRevealData {
  pickNumber: number
  roundNumber: number
  teamName: string
  teamColor: string
  playerName: string
  playerNumber: number | null
  playerPosition: string | null
}

const DURATION_MS = 4500
const CONFETTI_PIECES = 220

export default function DraftPickReveal({
  data,
  onClose,
}: {
  data: PickRevealData | null
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)

  // 자동 닫기
  useEffect(() => {
    if (!data) return
    const t = setTimeout(onClose, DURATION_MS)
    return () => clearTimeout(t)
  }, [data, onClose])

  // 폭죽 (캔버스) — data 변경 시 발사
  useEffect(() => {
    if (!data) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width = window.innerWidth
    const H = canvas.height = window.innerHeight

    // 팀 컬러 기반 + 기본 무지개 — 농구 느낌 강조 (오렌지 메인)
    const colors = [data.teamColor, '#f59e0b', '#ffffff', '#fbbf24', '#fb923c', '#3b82f6', '#10b981']

    interface Piece { x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; color: string; shape: 'rect' | 'circle' }
    const pieces: Piece[] = Array.from({ length: CONFETTI_PIECES }, () => ({
      x: W / 2 + (Math.random() - 0.5) * 300,
      y: H / 2 + (Math.random() - 0.5) * 100,
      vx: (Math.random() - 0.5) * 22,
      vy: -Math.random() * 22 - 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.6,
      size: 6 + Math.random() * 12,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: Math.random() > 0.4 ? 'rect' : 'circle',
    }))

    // 2차 폭죽 (0.6초 후) — 더 임팩트
    const secondBurstTimer = setTimeout(() => {
      for (let i = 0; i < CONFETTI_PIECES / 2; i++) {
        pieces.push({
          x: W * (0.2 + Math.random() * 0.6),
          y: H * 0.7,
          vx: (Math.random() - 0.5) * 18,
          vy: -Math.random() * 24 - 8,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.5,
          size: 4 + Math.random() * 10,
          color: colors[Math.floor(Math.random() * colors.length)],
          shape: Math.random() > 0.4 ? 'rect' : 'circle',
        })
      }
    }, 600)

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
        ctx!.globalAlpha = Math.max(0, 1 - elapsed / DURATION_MS)
        if (p.shape === 'rect') ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        else { ctx!.beginPath(); ctx!.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx!.fill() }
        ctx!.restore()
      }
      if (elapsed < DURATION_MS) rafRef.current = requestAnimationFrame(frame)
      else ctx!.clearRect(0, 0, W, H)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => {
      clearTimeout(secondBurstTimer)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [data])

  if (!data) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md cursor-pointer overflow-hidden"
      onClick={onClose}
      style={{
        animation: 'pickFadeIn 0.25s ease-out',
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      {/* 스포트라이트 회전 빔 */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300vmax] h-[60vh]"
          style={{
            background: `conic-gradient(from 0deg, transparent 0deg, ${data.teamColor}55 30deg, transparent 60deg, transparent 180deg, ${data.teamColor}55 210deg, transparent 240deg)`,
            animation: 'spotlightRotate 3s linear infinite',
            transformOrigin: 'center',
          }}
        />
      </div>

      {/* 백라이트 펄스 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at center, ${data.teamColor}33, transparent 65%)`,
          animation: 'pulseBg 1.8s ease-in-out infinite',
        }}
      />

      {/* 폭죽 캔버스 */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }} />

      {/* 메인 카드 */}
      <div
        className="relative w-[94vw] max-w-3xl rounded-3xl p-6 sm:p-12 shadow-2xl text-center overflow-hidden"
        style={{
          border: `4px solid ${data.teamColor}`,
          background: `linear-gradient(135deg, ${data.teamColor}33, ${data.teamColor}0a, #050505 70%)`,
          boxShadow: `0 0 80px ${data.teamColor}88, 0 0 30px ${data.teamColor}cc inset`,
          animation: 'pickPop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)',
          zIndex: 2,
        }}
      >
        {/* 코트 라인 배경 패턴 */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.06]"
          style={{ background: 'repeating-linear-gradient(45deg, transparent, transparent 20px, #fff 20px, #fff 21px)' }} />

        {/* 글로우 효과 */}
        <div
          className="absolute -inset-20 opacity-50 blur-3xl -z-10"
          style={{ background: `radial-gradient(circle at center, ${data.teamColor}, transparent 60%)` }}
        />

        {/* 라운드 + 픽 번호 */}
        <div className="mb-3 flex items-center justify-center gap-3 flex-wrap">
          <div className="text-xs sm:text-sm font-bold tracking-[0.3em] uppercase text-gray-200">
            Round {data.roundNumber}
          </div>
          <div className="h-3 w-px bg-gray-700" />
          <div
            className="text-sm sm:text-base font-black tracking-[0.25em] uppercase px-4 py-1.5 rounded-full shadow-lg"
            style={{ background: data.teamColor, color: '#000', boxShadow: `0 0 20px ${data.teamColor}` }}
          >
            🏀 Pick #{data.pickNumber}
          </div>
        </div>

        {/* WITH THE PICK 문구 */}
        <p className="text-xs sm:text-sm font-bold tracking-[0.4em] uppercase text-amber-300/90 mb-2">
          ─── With The {ordinal(data.pickNumber)} Pick ───
        </p>

        {/* 팀명 + 'SELECTS' */}
        <div className="mb-3 sm:mb-5">
          <div className="flex items-center justify-center gap-3">
            <div className="w-3 h-3 rounded-full shadow-lg" style={{ background: data.teamColor, boxShadow: `0 0 12px ${data.teamColor}` }} />
            <p className="text-xl sm:text-3xl font-bold text-white">{data.teamName}</p>
            <div className="w-3 h-3 rounded-full shadow-lg" style={{ background: data.teamColor, boxShadow: `0 0 12px ${data.teamColor}` }} />
          </div>
          <p className="text-xs sm:text-base font-black tracking-[0.5em] uppercase text-gray-300 mt-1.5">SELECTS</p>
        </div>

        {/* 메인 — 선수 번호 + 이름 + 포지션 */}
        <div className="space-y-1 sm:space-y-2">
          {data.playerNumber != null && (
            <p
              className="text-8xl sm:text-[10rem] font-black tracking-tighter leading-none drop-shadow-2xl"
              style={{
                color: data.teamColor,
                fontFamily: 'var(--font-bebas, sans-serif)',
                textShadow: `0 0 40px ${data.teamColor}aa, 0 0 80px ${data.teamColor}55`,
                animation: 'numberPop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both',
              }}
            >
              #{data.playerNumber}
            </p>
          )}
          <p
            className="text-3xl sm:text-6xl font-black text-white tracking-tight drop-shadow-lg"
            style={{
              fontFamily: 'var(--font-barlow-condensed, sans-serif)',
              textShadow: '0 4px 30px rgba(0,0,0,0.8)',
              animation: 'nameSlide 0.6s ease-out 0.35s both',
            }}
          >
            {data.playerName.toUpperCase()}
          </p>
          {data.playerPosition && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <div className="h-px w-8 bg-gray-700" />
              {data.playerPosition.split(',').map(s => s.trim()).filter(Boolean).map((pos, i) => (
                <span
                  key={i}
                  className="text-sm sm:text-lg font-black tracking-[0.2em] uppercase px-3 py-1 rounded-md"
                  style={{
                    background: `${data.teamColor}33`,
                    color: data.teamColor,
                    border: `1.5px solid ${data.teamColor}66`,
                  }}
                >
                  {pos}
                </span>
              ))}
              <div className="h-px w-8 bg-gray-700" />
            </div>
          )}
        </div>

        <p className="mt-8 text-xs sm:text-sm uppercase tracking-[0.3em] text-gray-300">탭하여 닫기</p>
      </div>

      <style jsx>{`
        @keyframes pickFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pickPop {
          0% { transform: scale(0.5) rotate(-3deg); opacity: 0; }
          50% { transform: scale(1.08) rotate(1deg); opacity: 1; }
          80% { transform: scale(0.98) rotate(0deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes numberPop {
          0% { transform: scale(0.3) translateY(40px); opacity: 0; }
          60% { transform: scale(1.15) translateY(-8px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes nameSlide {
          0% { transform: translateY(30px); opacity: 0; letter-spacing: -0.1em; }
          100% { transform: translateY(0); opacity: 1; letter-spacing: -0.01em; }
        }
        @keyframes spotlightRotate {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes pulseBg {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}
