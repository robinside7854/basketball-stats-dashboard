'use client'
// 추첨 결과 풀스크린 연출 — 3D(three.js) 버전.
//
// 페이즈·타이밍·onClose 계약은 이전 2D 버전과 **완전히 동일**하다.
// 같은 추첨을 보는 클라이언트가 서로 다른 시각에 닫히면 진행자가 다음 단계를 못 넘어가기 때문에
// 연출만 바꾸고 시간표는 손대지 않는다.
//
//   'intro'     : 2.0s — 팀 공이 유리구 안에 정착
//   'drawing'   : 4.0s — 송풍기가 공을 띄워 텀블링. 드럼롤. 스포트라이트.
//   'revealing' : 1.5s — 1픽 공이 상단 튜브로 배출되어 카메라 앞으로 + 폭죽 + 호른.
//   'revealed'  : 결과 노출. 10s 후 자동 닫힘. revealing 진입 후 탭하면 즉시 revealed 로 점프.
//
// three(≈600KB)는 이 컴포넌트가 실제로 마운트될 때만 동적 import 된다 —
// 드래프트 포털의 다른 화면은 이 비용을 내지 않는다.
// WebGL 을 못 쓰는 기기는 기존 2D 연출(LegacyLotteryReveal)로 그대로 떨어진다.

import { useState, useEffect, useRef, useSyncExternalStore } from 'react'
import { Dice5 } from 'lucide-react'
import { playDrumroll, playLotteryHorn, primeAudio } from '@/lib/draftSounds'
// 3D/2D 두 연출이 같은 규칙으로 확률 배지를 감추도록 판정 함수는 한 곳에만 둔다
import LegacyLotteryReveal, { hasVaryingOdds } from './lottery/LegacyLotteryReveal'
import type { LotteryScene, LotteryPhase } from './lottery/lotteryScene'

interface Team { id: string; name: string; color: string }

interface Props {
  order: string[]              // 확정된 픽 순서 (index 0 = 1픽)
  odds: Record<string, number> | null
  teams: Team[]
  onClose: () => void
}

const INTRO_MS = 2000
const DRAWING_MS = 4000
const REVEALING_MS = 1500
const REVEALED_AUTO_CLOSE_MS = 10000

const CONFETTI_PIECES = 80

/** WebGL 가용 여부 — 컨텍스트 생성 비용이 있으므로 한 번만 재고, 첫 렌더에서 동기로 알아야 한다
 *  (비동기로 판정하면 폴백이 한 프레임 늦게 마운트돼 타이머 시작 시각이 어긋난다) */
let webglSupportCache: boolean | null = null
function hasWebGL(): boolean {
  if (webglSupportCache != null) return webglSupportCache
  if (typeof document === 'undefined') return false
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    webglSupportCache = !!gl
  } catch {
    webglSupportCache = false
  }
  return webglSupportCache
}

/** 구독할 외부 상태가 없다 — WebGL 지원 여부는 한 번 정해지면 안 바뀐다 */
const noopSubscribe = () => () => {}


export default function DraftLotteryReveal(props: Props) {
  // 서버에서는 WebGL 여부를 알 수 없다. 첫 렌더에서 판정하면 서버(2D)와 클라이언트(3D)가
  // 서로 다른 DOM 을 그려 하이드레이션이 깨진다 — 그래서 첫 렌더는 양쪽 모두 아무것도 안 그리고,
  // 마운트 직후(한 프레임 이내) 판정한다. 페이즈 타이머는 어느 쪽이든 마운트 시점부터 시작하므로
  // 두 연출의 시간표는 그대로 일치한다.
  const supported = useSyncExternalStore<boolean | null>(noopSubscribe, hasWebGL, () => null)
  if (supported == null) return null
  if (!supported) return <LegacyLotteryReveal {...props} />
  return <Reveal3D {...props} />
}

function Reveal3D({ order, odds, teams, onClose }: Props) {
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const [phase, setPhase] = useState<LotteryPhase>('intro')
  const [sceneReady, setSceneReady] = useState(false)
  const [reducedMotion] = useState(() =>
    typeof window !== 'undefined' && !!window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )

  const glCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const glWrapRef = useRef<HTMLDivElement | null>(null)
  const confettiRef = useRef<HTMLCanvasElement | null>(null)
  const sceneRef = useRef<LotteryScene | null>(null)
  const rafRef = useRef<number | null>(null)
  // 씬이 준비되기 전에 페이즈가 넘어갈 수 있다 — 준비 직후 현재 페이즈를 밀어 넣기 위해 보관
  const phaseRef = useRef<LotteryPhase>('intro')
  phaseRef.current = phase

  // ── 3D 씬 부팅 (마운트 1회) ────────────────────────────
  useEffect(() => {
    let cancelled = false
    let ro: ResizeObserver | null = null

    ;(async () => {
      try {
        const { createLotteryScene } = await import('./lottery/lotteryScene')
        if (cancelled) return
        const canvas = glCanvasRef.current
        const wrap = glWrapRef.current
        if (!canvas || !wrap) return

        const sceneTeams = order.map(id => ({
          id,
          color: teamMap[id]?.color ?? '#8b93a7',
        }))
        const scene = createLotteryScene(canvas, {
          teams: sceneTeams,
          reducedMotion,
          revealingMs: REVEALING_MS,
        })
        sceneRef.current = scene
        scene.resize(wrap.clientWidth, wrap.clientHeight)
        scene.setPhase(phaseRef.current)
        setSceneReady(true)

        ro = new ResizeObserver(entries => {
          const r = entries[0]?.contentRect
          if (r) scene.resize(r.width, r.height)
        })
        ro.observe(wrap)
      } catch {
        // three 로딩 실패 시에도 연출만 빠지고 타이머·onClose 는 그대로 돈다
      }
    })()

    return () => {
      cancelled = true
      ro?.disconnect()
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
    // 마운트 시 1회만 — order/teams 는 한 추첨 동안 바뀌지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 페이즈를 씬에 전달
  useEffect(() => {
    sceneRef.current?.setPhase(phase)
  }, [phase])

  // ── 자동 페이즈 전환 (기존 타이밍 그대로) ───────────────
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
    return () => { for (const t of timers) clearTimeout(t); if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // 마운트 시 1회만 — onClose 는 부모가 재생성하지 않는다고 가정
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 폭죽 (2D 캔버스, 기존 그대로) ──────────────────────
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
      if (elapsed < DUR) rafRef.current = requestAnimationFrame(frame)
      else ctx!.clearRect(0, 0, W, H)
    }
    rafRef.current = requestAnimationFrame(frame)
  }

  const firstId = order[0]
  const firstTeam = teamMap[firstId]
  const firstColor = firstTeam?.color ?? '#f59e0b'
  const showSpotlight = phase === 'drawing' || phase === 'revealing'
  // 실제 드래프트는 대부분 균등 확률(1/N)이라 모든 팀에 같은 숫자가 찍힌다 —
  // 같은 값이 N번 반복되는 배지는 정보가 0이므로 아예 그리지 않는다.
  const oddsVary = hasVaryingOdds(order, odds)

  function handleTap() {
    if (phase === 'revealing') setPhase('revealed')
    else if (phase === 'revealed') onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[58] flex items-center justify-center bg-black/90 p-4 cursor-pointer"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}
      onClick={handleTap}
    >
      <style>{`
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

      {/* 3D 캔버스 — 제목/안내문과 겹치지 않도록 가운데 띠에만 둔다.
          (전체화면으로 두면 유리구가 제목 글자를 덮어 대비가 무너진다 — 실측으로 확인)
          revealed 에서도 띠 크기를 그대로 둔다: 전체화면으로 펴면 같은 화각이 더 넓은 픽셀에
          그려져 기계가 확대·상단 절단된 채 목록 뒤에 남는다(실측). 흐리기만 한다. */}
      <div
        ref={glWrapRef}
        className="absolute left-0 right-0 pointer-events-none transition-opacity duration-700"
        style={{
          zIndex: 0,
          top: '34%',
          bottom: '27%',
          opacity: phase === 'revealed' ? 0.35 : 1,
        }}
        aria-hidden
      >
        <canvas ref={glCanvasRef} className="block w-full h-full" />
      </div>

      {/* 스포트라이트 글로우 */}
      {showSpotlight && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 45%, ${firstColor}33, transparent 55%)`,
            animation: reducedMotion ? undefined : 'spotlightGlow 2s ease-in-out infinite',
            zIndex: 1,
          }}
        />
      )}

      {/* 폭죽 캔버스 */}
      <canvas ref={confettiRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }} />

      <div className="relative text-center max-w-lg sm:max-w-xl md:max-w-2xl w-full" style={{ zIndex: 3 }}>
        <p className="font-jersey text-base uppercase tracking-[0.3em] text-amber-400 mb-1.5">DRAFT LOTTERY</p>
        <h2 className="text-3xl sm:text-4xl font-black text-white mb-5 min-h-[2.5rem] drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
          {phase === 'intro' && '추첨 기계에 팀 공 투입'}
          {phase === 'drawing' && (<span className="inline-flex items-center gap-2"><Dice5 size={24} aria-hidden /> 추첨 진행 중...</span>)}
          {phase === 'revealing' && (
            <span style={{ display: 'inline-block', animation: reducedMotion ? undefined : 'winnerText 1s cubic-bezier(0.34, 1.56, 0.64, 1)', color: firstColor, textShadow: `0 0 30px ${firstColor}` }}>
              1픽 결정!
            </span>
          )}
          {phase === 'revealed' && '1픽 당첨!'}
        </h2>

        {phase !== 'revealed' ? (
          <>
            {/* 3D 가 차지하는 중앙 영역 — 텍스트가 구를 덮지 않도록 자리만 비워 둔다 */}
            <div className="mx-auto" style={{ height: 'min(58vh, 320px)' }}>
              {!sceneReady && (
                <div className="h-full flex flex-col items-center justify-center gap-3">
                  <div className={`w-10 h-10 rounded-full border-2 border-gray-600 border-t-amber-400 ${reducedMotion ? '' : 'animate-spin'}`} />
                  <p className="text-gray-200 text-base">추첨기 준비 중...</p>
                </div>
              )}
            </div>

            <div className="mt-6 h-16 flex flex-col items-center justify-center gap-1">
              {phase === 'drawing' && (
                <p className="text-amber-300 font-black text-2xl tracking-widest animate-pulse">● ● ●</p>
              )}
              {phase === 'intro' && (
                <p className="text-gray-200 text-base sm:text-lg leading-relaxed">팀 공이 기계로 들어가는 중...</p>
              )}
              {phase === 'revealing' && (
                <>
                  <p
                    className="text-xl sm:text-2xl font-black"
                    style={{ color: firstColor, textShadow: '0 2px 10px rgba(0,0,0,0.9)' }}
                  >
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
              className="mx-auto w-40 h-40 rounded-full flex flex-col items-center justify-center text-white shadow-2xl"
              style={{ backgroundColor: firstColor, boxShadow: `0 0 50px ${firstColor}`, animation: reducedMotion ? undefined : 'lottoOut 0.8s ease-out' }}
            >
              <span className="text-xs font-black tracking-widest opacity-80">1픽</span>
              <span className="font-black text-xl sm:text-2xl px-4 text-center leading-tight break-keep">{firstTeam?.name}</span>
            </div>

            {/* 전체 순서 — 스크롤 가능 (8팀 이상 대응) */}
            <div className="mt-6 space-y-2 max-h-[44vh] overflow-y-auto pr-1">
              {order.map((tid, idx) => {
                const t = teamMap[tid]
                const odd = odds?.[tid]
                return (
                  <div
                    key={`${tid}-${idx}`}
                    className="flex items-center gap-3 rounded-xl px-3 sm:px-4 py-3 border bg-gray-900"
                    style={{ borderColor: idx === 0 ? firstColor : '#374151', animation: reducedMotion ? undefined : `lottoOut 0.5s ease-out ${idx * 0.12}s both` }}
                  >
                    <span className={`font-display text-2xl sm:text-3xl w-8 shrink-0 ${idx === 0 ? 'text-amber-300' : 'text-gray-200'}`}>{idx + 1}</span>
                    <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: t?.color }} />
                    <span className="text-white font-black flex-1 text-left text-lg sm:text-xl truncate min-w-0">{t?.name}</span>
                    {idx === 0 && <span className="text-xs font-black text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wider">1픽</span>}
                    {oddsVary && odd != null && <span className="text-sm text-gray-200 shrink-0 tabular-nums">{(odd * 100).toFixed(0)}%</span>}
                  </div>
                )
              })}
            </div>
            <p className="text-sm text-gray-300 mt-4 leading-relaxed">탭하여 닫기 · 10초 후 자동 닫힘</p>
          </>
        )}
      </div>
    </div>
  )
}
