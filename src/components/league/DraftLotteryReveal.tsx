'use client'
// 추첨 결과 풀스크린 연출 (4-phase 드라마틱 버전)
//
// 흐름 (자동 진행 — 사용자 클릭 불필요):
//   'intro'     : 2.0s — 팀 공이 위에서 떨어져 추첨 기계 안에 정착 (stagger 100ms)
//   'drawing'   : 4.0s — 기계가 흔들리고 공이 카오스 패턴으로 움직임. 드럼롤. 2.5s 후 스포트라이트.
//   'revealing' : 1.5s — 1픽 공이 배출구를 통해 떨어지며 폭죽 + 호른. "1픽 결정!" 큰 텍스트.
//   'revealed'  : 결과 노출. 10s 후 자동 닫힘. revealing 진입 후 탭하면 즉시 revealed 로 점프.
//
// 총 ~7.5s 후 자동 닫힘 윈도우 시작.
// prefers-reduced-motion 사용자는 흔들림/폭죽 없이도 동일 타이밍 — 클라이언트 간 싱크 유지.

import { useState, useEffect, useRef } from 'react'
import { playDrumroll, playLotteryHorn, primeAudio } from '@/lib/draftSounds'

interface Team { id: string; name: string; color: string }

interface Props {
  order: string[]              // 확정된 픽 순서 (index 0 = 1픽)
  odds: Record<string, number> | null
  teams: Team[]
  onClose: () => void
}

type Phase = 'intro' | 'drawing' | 'revealing' | 'revealed'

const INTRO_MS = 2000
const DRAWING_MS = 4000
const REVEALING_MS = 1500
const REVEALED_AUTO_CLOSE_MS = 10000

const CONFETTI_PIECES = 80

export default function DraftLotteryReveal({ order, odds, teams, onClose }: Props) {
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const [phase, setPhase] = useState<Phase>('intro')
  const reducedMotionRef = useRef<boolean>(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const phaseRef = useRef<Phase>('intro')
  phaseRef.current = phase

  // prefers-reduced-motion 감지 (한 번)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  // 자동 페이즈 전환: intro → drawing → revealing → revealed → autoClose
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    // intro → drawing
    timers.push(setTimeout(() => {
      setPhase('drawing')
      try { primeAudio(); playDrumroll() } catch { /* ignore */ }
      // drawing → revealing
      timers.push(setTimeout(() => {
        setPhase('revealing')
        try { playLotteryHorn() } catch { /* ignore */ }
        launchConfetti()
        // revealing → revealed
        timers.push(setTimeout(() => {
          setPhase('revealed')
          // revealed → autoClose
          timers.push(setTimeout(() => onClose(), REVEALED_AUTO_CLOSE_MS))
        }, REVEALING_MS))
      }, DRAWING_MS))
    }, INTRO_MS))
    return () => { for (const t of timers) clearTimeout(t); if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // 마운트 시 1회만 — onClose 는 부모가 재생성하지 않는다고 가정
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 폭죽 발사 (canvas, revealing 진입 시)
  function launchConfetti() {
    if (reducedMotionRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width = window.innerWidth
    const H = canvas.height = window.innerHeight
    const firstColor = teamMap[order[0]]?.color ?? '#f59e0b'
    const colors = [firstColor, '#f59e0b', '#ffffff', '#fbbf24', '#3b82f6', '#10b981']

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
      if (elapsed < DUR) rafRef.current = requestAnimationFrame(frame)
      else ctx!.clearRect(0, 0, W, H)
    }
    rafRef.current = requestAnimationFrame(frame)
  }

  const firstId = order[0]
  const firstTeam = teamMap[firstId]
  const firstColor = firstTeam?.color ?? '#f59e0b'
  const showShake = phase === 'drawing' && !reducedMotionRef.current
  const showSpotlight = phase === 'drawing' || phase === 'revealing'

  // 사용자 탭으로 revealing 단계에서 즉시 revealed 로 점프 (그 외 단계는 무시)
  function handleTap() {
    if (phase === 'revealing') setPhase('revealed')
    else if (phase === 'revealed') onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[58] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 cursor-pointer"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}
      onClick={handleTap}
    >
      <style>{`
        @keyframes lottoFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
        @keyframes lottoChaos {
          0%   { transform: translate(0,0) rotate(0deg); }
          25%  { transform: translate(-12px,8px) rotate(80deg); }
          50%  { transform: translate(10px,-10px) rotate(160deg); }
          75%  { transform: translate(-8px,-6px) rotate(240deg); }
          100% { transform: translate(0,0) rotate(360deg); }
        }
        @keyframes lottoShake {
          0%,100% { transform: translate(0,0) rotate(0); }
          20%     { transform: translate(-6px,4px) rotate(-6deg); }
          40%     { transform: translate(6px,-4px) rotate(6deg); }
          60%     { transform: translate(-5px,-3px) rotate(-4deg); }
          80%     { transform: translate(5px,3px) rotate(4deg); }
        }
        @keyframes ballDrop {
          0%   { transform: translateY(-200%) scale(0.7); opacity: 0; }
          70%  { transform: translateY(8%)    scale(1.1); opacity: 1; }
          85%  { transform: translateY(-4%)   scale(0.95); }
          100% { transform: translateY(0)     scale(1);   opacity: 1; }
        }
        @keyframes ballEmerge {
          0%   { transform: translate(-50%, -100%) scale(0.4); opacity: 0; }
          50%  { transform: translate(-50%, 60%)   scale(1.0); opacity: 1; }
          80%  { transform: translate(-50%, 30%)   scale(1.3); opacity: 1; }
          100% { transform: translate(-50%, 50%)   scale(1.15);opacity: 1; }
        }
        @keyframes lottoOut {
          0%   { transform: scale(0.2) translateY(40px); opacity: 0; }
          60%  { transform: scale(1.15) translateY(0); opacity: 1; }
          100% { transform: scale(1)   translateY(0); opacity: 1; }
        }
        @keyframes spotlightGlow {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(1.1); }
        }
        @keyframes winnerText {
          0%   { transform: scale(0.5); opacity: 0; letter-spacing: 0.3em; }
          60%  { transform: scale(1.15); opacity: 1; letter-spacing: -0.02em; }
          100% { transform: scale(1); opacity: 1; letter-spacing: 0em; }
        }
      `}</style>

      {/* 폭죽 캔버스 — revealing/revealed 단계에서 떠 있음 */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }} />

      {/* 스포트라이트 글로우 — drawing 후반 + revealing */}
      {showSpotlight && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${firstColor}33, transparent 50%)`,
            animation: 'spotlightGlow 2s ease-in-out infinite',
            zIndex: 0,
          }}
        />
      )}

      <div className="relative text-center max-w-lg sm:max-w-xl md:max-w-2xl w-full" style={{ zIndex: 2 }}>
        <p className="font-jersey text-sm uppercase tracking-[0.3em] text-amber-400 mb-1">DRAFT LOTTERY</p>
        <h2 className="text-2xl sm:text-3xl font-black text-white mb-5 min-h-[2.5rem]">
          {phase === 'intro' && '추첨 기계에 팀 공 투입'}
          {phase === 'drawing' && '🎲 추첨 진행 중...'}
          {phase === 'revealing' && (
            <span style={{ display: 'inline-block', animation: 'winnerText 1s cubic-bezier(0.34, 1.56, 0.64, 1)', color: firstColor, textShadow: `0 0 30px ${firstColor}` }}>
              1픽 결정!
            </span>
          )}
          {phase === 'revealed' && '1픽 당첨!'}
        </h2>

        {phase !== 'revealed' ? (
          <>
            {/* 추첨 기계 */}
            <div
              className="relative mx-auto rounded-full border-4 border-gray-600 bg-gradient-to-b from-gray-800/60 to-gray-900/80 overflow-visible flex items-center justify-center"
              style={{
                width: 'min(60vw, 240px)',
                height: 'min(60vw, 240px)',
                animation: showShake ? 'lottoShake 0.5s infinite' : undefined,
              }}
            >
              {/* 유리 반사 */}
              <div className="absolute top-3 left-6 w-16 h-10 rounded-full bg-white/10 blur-md pointer-events-none" />

              {/* 공들 — intro 에선 drop, drawing 에선 chaos, revealing 에선 1픽만 강조 */}
              <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap px-3 sm:px-6 overflow-hidden rounded-full" style={{ maxWidth: '90%', maxHeight: '88%' }}>
                {order.map((tid, i) => {
                  const t = teamMap[tid]
                  const isFirst = i === 0
                  const dim = phase === 'revealing' && !isFirst
                  let anim: string | undefined
                  if (phase === 'intro') {
                    anim = reducedMotionRef.current ? undefined : `ballDrop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.1}s both`
                  } else if (phase === 'drawing') {
                    anim = reducedMotionRef.current ? undefined : `lottoChaos ${0.8 + (i % 3) * 0.2}s linear ${i * 0.05}s infinite`
                  }
                  return (
                    <div
                      key={tid}
                      className="rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-black text-white shadow-lg transition-opacity duration-300"
                      style={{
                        width: 'clamp(40px, 11vw, 56px)',
                        height: 'clamp(40px, 11vw, 56px)',
                        backgroundColor: t?.color ?? '#888',
                        boxShadow: `0 0 14px ${t?.color ?? '#888'}aa`,
                        opacity: dim ? 0.25 : 1,
                        animation: anim,
                      }}
                    >
                      <span className="drop-shadow truncate px-1">{t?.name?.slice(0, 4) ?? '?'}</span>
                    </div>
                  )
                })}
              </div>

              {/* 배출구 */}
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-16 h-4 rounded-b-xl bg-gray-700 border border-gray-600" />

              {/* revealing 단계: 1픽 공이 배출구를 통해 등장 */}
              {phase === 'revealing' && (
                <div
                  className="absolute left-1/2 -bottom-12 rounded-full flex flex-col items-center justify-center text-white shadow-2xl"
                  style={{
                    width: 72,
                    height: 72,
                    backgroundColor: firstColor,
                    boxShadow: `0 0 36px ${firstColor}, 0 0 12px ${firstColor} inset`,
                    animation: reducedMotionRef.current ? undefined : 'ballEmerge 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) both',
                    transform: 'translate(-50%, 50%)',
                  }}
                >
                  <span className="text-[9px] font-black tracking-widest opacity-80">1픽</span>
                  <span className="font-black text-[11px] truncate px-1">{firstTeam?.name?.slice(0, 5)}</span>
                </div>
              )}
            </div>

            <div className="mt-10 sm:mt-12 h-12 flex items-center justify-center">
              {phase === 'drawing' && (
                <p className="text-amber-300 font-black text-lg tracking-widest animate-pulse">● ● ●</p>
              )}
              {phase === 'intro' && (
                <p className="text-gray-300 text-sm">팀 공이 기계로 들어가는 중...</p>
              )}
              {phase === 'revealing' && (
                <p className="text-amber-200 text-sm font-bold tracking-wider">탭하여 결과 보기 →</p>
              )}
            </div>
          </>
        ) : (
          <>
            {/* 1픽 공 배출 — revealed 메인 */}
            <div
              className="mx-auto w-40 h-40 rounded-full flex flex-col items-center justify-center text-white shadow-2xl"
              style={{ backgroundColor: firstColor, boxShadow: `0 0 50px ${firstColor}`, animation: 'lottoOut 0.8s ease-out' }}
            >
              <span className="text-[10px] font-black tracking-widest opacity-80">1픽</span>
              <span className="font-black text-2xl px-2 text-center leading-tight">{firstTeam?.name}</span>
            </div>

            {/* 전체 순서 — 스크롤 가능 (8팀 이상 대응) */}
            <div className="mt-6 space-y-2 max-h-[44vh] overflow-y-auto pr-1">
              {order.map((tid, idx) => {
                const t = teamMap[tid]
                const odd = odds?.[tid]
                return (
                  <div
                    key={`${tid}-${idx}`}
                    className="flex items-center gap-3 rounded-xl px-3 sm:px-4 py-2.5 border bg-gray-900/80"
                    style={{ borderColor: idx === 0 ? firstColor : '#374151', animation: `lottoOut 0.5s ease-out ${idx * 0.12}s both` }}
                  >
                    <span className={`font-display text-2xl sm:text-3xl w-8 shrink-0 ${idx === 0 ? 'text-amber-300' : 'text-gray-300'}`}>{idx + 1}</span>
                    <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: t?.color }} />
                    <span className="text-white font-black flex-1 text-left text-base sm:text-lg truncate min-w-0">{t?.name}</span>
                    {idx === 0 && <span className="text-[10px] font-black text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full shrink-0">1픽</span>}
                    {odd != null && <span className="text-xs text-gray-300 shrink-0">{(odd * 100).toFixed(0)}%</span>}
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-gray-300 mt-4">탭하여 닫기 · 10초 후 자동 닫힘</p>
          </>
        )}
      </div>
    </div>
  )
}
