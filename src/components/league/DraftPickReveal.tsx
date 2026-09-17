'use client'
// 픽 이팩트 — 새 픽이 들어오면 전체화면으로 약 4.5초간 표시.
// 폭죽 + 농구 카드 느낌 + 광채 + pulse 백라이트 + 스포트라이트 빔.
//
// 사용 패턴:
//   const [reveal, setReveal] = useState<PickRevealData | null>(null)
//   <DraftPickReveal data={reveal} onClose={() => setReveal(null)} />

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trophy, Zap, User } from 'lucide-react'
import { playBeep, playBuzzer } from '@/lib/draftSounds'
// 타입만 가져온다(SWC 가 지운다) — 라우트 모듈이 클라이언트 번들에 섞이지 않는다.
import type { DraftPlayerBrief } from '@/app/api/leagues/[leagueId]/drafts/[draftId]/briefs/route'

export type { DraftPlayerBrief }

export interface PickRevealData {
  pickNumber: number
  roundNumber: number
  teamName: string
  teamColor: string
  playerName: string
  playerNumber: number | null
  playerPosition: string | null
  /** 선수 사진 — 없으면 팀 컬러 실루엣 카드로 폴백 */
  playerPhotoUrl?: string | null
  /** league_player_id — 드라마틱 공개에서 지난 분기 요약(briefs)을 찾는 키 */
  playerId?: string | null
}

/** 뒷면(팀 컬러 · PICK #n)이 먼저 보이고, 사진이 준비되면 뒤집혀 얼굴이 나오기까지의 최소 대기 */
const FLIP_MIN_DELAY_MS = 550
/** 사진 로드가 이보다 늦으면 기다리지 않고 뒤집는다(폴백 면이 나올 수 있다) */
const FLIP_MAX_WAIT_MS = 1400

/**
 * 픽 카드 플립 — 앞면은 팀 컬러 카드(PICK #n), 사진이 로드되면 rotateY 로 뒤집혀 얼굴이 나온다.
 * 미라클 명단은 등번호가 전부 비어 있어(2026-09-16 실측 47/47) 이 자리가 공백이었다. 사진은 37/47.
 * 관전 페이지의 인라인 히어로도 같은 컴포넌트를 쓴다.
 */
export function PickPhotoFlip(props: {
  photoUrl: string | null | undefined
  playerName: string
  pickNumber: number
  teamColor: string
  size?: 'md' | 'lg'
}) {
  // 픽이 바뀌면 key 로 다시 마운트 — 상태 초기화를 effect 안 setState 로 하지 않는다
  return <PickPhotoFlipInner key={`${props.pickNumber}:${props.photoUrl ?? ''}`} {...props} />
}

function PickPhotoFlipInner({
  photoUrl,
  playerName,
  pickNumber,
  teamColor,
  size = 'lg',
}: {
  photoUrl: string | null | undefined
  playerName: string
  pickNumber: number
  teamColor: string
  size?: 'md' | 'lg'
}) {
  const [flipped, setFlipped] = useState(false)
  const [loaded, setLoaded] = useState<boolean | null>(null) // null=대기, true=성공, false=실패/없음

  // 사진 선로드 — 뒤집혔을 때 빈 면이 보이지 않게. 최소 대기 뒤 로드 완료 또는 최대 대기 초과 시 뒤집는다.
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let done = false
    const finish = (ok: boolean) => { if (done) return; done = true; setLoaded(ok) }
    if (photoUrl) {
      const img = new Image()
      img.onload = () => finish(true)
      img.onerror = () => finish(false)
      img.src = photoUrl
    } else {
      finish(false)
    }
    const started = Date.now()
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - started
      if ((done && elapsed >= (reduce ? 0 : FLIP_MIN_DELAY_MS)) || elapsed >= FLIP_MAX_WAIT_MS) {
        window.clearInterval(tick)
        setFlipped(true)
      }
    }, 50)
    return () => window.clearInterval(tick)
  }, [photoUrl])

  const box = size === 'lg' ? 'w-44 h-44 sm:w-60 sm:h-60' : 'w-36 h-36 sm:w-44 sm:h-44'
  const showPhoto = loaded === true && !!photoUrl

  return (
    <div className={`pick-flip mx-auto ${box}`} aria-live="off">
      <div className={`pick-flip-inner ${flipped ? 'is-flipped' : ''}`}>
        {/* 앞면 — 팀 컬러 카드 */}
        <div
          className="pick-flip-face rounded-3xl flex flex-col items-center justify-center gap-1"
          style={{ background: teamColor, border: `4px solid ${teamColor}`, boxShadow: `0 0 40px ${teamColor}88` }}
          aria-hidden
        >
          <span className="text-black/70 text-sm sm:text-base font-black tracking-[0.3em] uppercase">Pick</span>
          <span className="text-black text-6xl sm:text-8xl font-black leading-none tabular-nums" style={{ fontFamily: 'var(--font-bebas, sans-serif)' }}>#{pickNumber}</span>
        </div>
        {/* 뒷면 — 사진 또는 실루엣 */}
        <div
          className="pick-flip-face pick-flip-back rounded-3xl overflow-hidden bg-neutral-900"
          style={{ border: `4px solid ${teamColor}`, boxShadow: `0 0 60px ${teamColor}aa` }}
        >
          {showPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl!} alt={`${playerName} 사진`} className="w-full h-full object-cover object-top" draggable={false} />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2" style={{ background: `linear-gradient(160deg, ${teamColor}55, #111 80%)` }} role="img" aria-label={`${playerName} (사진 없음)`}>
              <span className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center" style={{ background: `${teamColor}33`, color: teamColor }}>
                <User size={24} aria-hidden />
              </span>
            </div>
          )}
        </div>
      </div>
      <style jsx>{`
        .pick-flip { perspective: 1200px; }
        .pick-flip-inner {
          position: relative; width: 100%; height: 100%;
          transform-style: preserve-3d;
          transition: transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .pick-flip-inner.is-flipped { transform: rotateY(180deg); }
        .pick-flip-face {
          position: absolute; inset: 0;
          backface-visibility: hidden; -webkit-backface-visibility: hidden;
        }
        .pick-flip-back { transform: rotateY(180deg); }
        @media (prefers-reduced-motion: reduce) {
          .pick-flip-inner { transition: none; }
        }
      `}</style>
    </div>
  )
}

const DURATION_MS = 4500
/** 내가 다음 픽 주인일 때 — 내 시계는 이미 돌고 있으므로 축약 노출 */
const MY_TURN_DURATION_MS = 1200
/** 연속 픽이 들어와도 새로 4.5초를 세지 않고 이만큼만 연장한다 */
const CONSECUTIVE_EXTEND_MS = 1500
const CONFETTI_PIECES = 220

/** 폭죽 1발 — 캔버스에 즉시 발사하고 정리 함수를 돌려준다. 일반 공개/드라마틱 공개가 함께 쓴다. */
function runConfetti(canvas: HTMLCanvasElement, teamColor: string, durationMs: number): () => void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}
  const W = canvas.width = window.innerWidth
  const H = canvas.height = window.innerHeight

  // 팀 컬러 기반 + 기본 무지개 — 농구 느낌 강조 (오렌지 메인)
  const colors = [teamColor, '#f59e0b', '#ffffff', '#fbbf24', '#fb923c', '#3b82f6', '#10b981']

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
  const secondBurstTimer = window.setTimeout(() => {
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

  let raf: number | null = null
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
      ctx!.globalAlpha = Math.max(0, 1 - elapsed / durationMs)
      if (p.shape === 'rect') ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      else { ctx!.beginPath(); ctx!.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx!.fill() }
      ctx!.restore()
    }
    if (elapsed < durationMs) raf = requestAnimationFrame(frame)
    else ctx!.clearRect(0, 0, W, H)
  }
  raf = requestAnimationFrame(frame)
  return () => {
    clearTimeout(secondBurstTimer)
    if (raf) cancelAnimationFrame(raf)
  }
}

export default function DraftPickReveal({
  data,
  onClose,
  isMyTurn = false,
  dramatic = false,
  brief = null,
  prevQuarterLabel = null,
}: {
  data: PickRevealData | null
  onClose: () => void
  /** 이 픽 직후 화면 주인이 다음 차례인지 — true 면 1.2초로 축약 + 「지금 내 차례」 배지 */
  isMyTurn?: boolean
  /** 1라운드 지명 — 이름을 감춘 채 지난 시즌 기록부터 한 줄씩 여는 단계 연출 */
  dramatic?: boolean
  /** 드라마틱 공개에서 읽어 줄 지난 분기 요약 (없으면 "기록 없음" 한 줄) */
  brief?: DraftPlayerBrief | null
  prevQuarterLabel?: string | null
}) {
  // 드라마틱 공개는 픽마다 처음부터 다시 시작해야 한다 — key 로 재마운트해 상태를 초기화한다
  //   (effect 안 setState 로 리셋하지 않는다).
  if (data && dramatic) {
    return (
      <DramaticPickReveal
        key={data.pickNumber}
        data={data}
        onClose={onClose}
        isMyTurn={isMyTurn}
        brief={brief}
        prevQuarterLabel={prevQuarterLabel}
      />
    )
  }
  return <StandardPickReveal data={data} onClose={onClose} isMyTurn={isMyTurn} />
}

function StandardPickReveal({
  data,
  onClose,
  isMyTurn = false,
}: {
  data: PickRevealData | null
  onClose: () => void
  isMyTurn?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // 연출이 열려 있는 동안 유지되는 마감 시각. 연속 픽은 이 값을 연장만 한다.
  const closeAtRef = useRef<number | null>(null)

  // 자동 닫기
  useEffect(() => {
    if (!data) { closeAtRef.current = null; return }
    const now = Date.now()
    const base = isMyTurn ? MY_TURN_DURATION_MS : DURATION_MS
    // 이미 열려 있으면(연속 픽) 남은 시간에 최대 1.5초만 더한다 — 다음 단장의 시계를 잡아먹지 않도록.
    const prev = closeAtRef.current
    const next = prev != null && prev > now
      ? Math.min(prev + CONSECUTIVE_EXTEND_MS, now + base)
      : now + base
    closeAtRef.current = next
    const t = setTimeout(() => { closeAtRef.current = null; onClose() }, Math.max(0, next - now))
    return () => clearTimeout(t)
  }, [data, onClose, isMyTurn])

  // 폭죽 (캔버스) — data 변경 시 발사
  useEffect(() => {
    if (!data) return
    const canvas = canvasRef.current
    if (!canvas) return
    return runConfetti(canvas, data.teamColor, DURATION_MS)
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

      {/* 내 차례 배지 — 픽 공개가 덮고 있는 동안에도 "지금 내 시계가 돈다"를 즉시 알린다 */}
      {isMyTurn && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-2 px-4 py-2.5 min-h-11 rounded-full bg-emerald-500 text-black text-base sm:text-lg font-black shadow-2xl"
          style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
          role="status"
        >
          <Zap size={20} aria-hidden /> 지금 내 차례 — 탭해서 닫기
        </div>
      )}

      {/* 메인 카드 */}
      <div
        className="pick-reveal-card relative w-[94vw] max-w-3xl rounded-3xl p-6 sm:p-12 shadow-2xl text-center overflow-hidden"
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
            className="inline-flex items-center gap-1.5 text-sm sm:text-base font-black tracking-[0.25em] uppercase px-4 py-1.5 rounded-full shadow-lg"
            style={{ background: data.teamColor, color: '#000', boxShadow: `0 0 20px ${data.teamColor}` }}
          >
            <Trophy size={14} aria-hidden /> Pick #{data.pickNumber}
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

        {/* 메인 — 사진 카드 플립 + 이름 + 포지션 */}
        <div className="space-y-2 sm:space-y-3">
          <div className="pick-reveal-number" style={{ animation: 'numberPop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both' }}>
            <PickPhotoFlip photoUrl={data.playerPhotoUrl} playerName={data.playerName} pickNumber={data.pickNumber} teamColor={data.teamColor} />
          </div>
          {data.playerNumber != null && (
            <p className="text-2xl sm:text-4xl font-black tabular-nums leading-none" style={{ color: data.teamColor, fontFamily: 'var(--font-bebas, sans-serif)' }}>
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
        /* 가로 모드 폰 — 카드가 화면 높이를 넘지 않게(2026-09-16 실측) */
        @media (orientation: landscape) and (max-height: 500px) {
          .pick-reveal-card { padding: 1rem 1.5rem; }
          .pick-reveal-number { transform: scale(0.6); transform-origin: center top; margin-bottom: -3.5rem; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pick-reveal-card { animation: none !important; }
          .pick-reveal-number { animation: none !important; }
        }
      `}</style>
    </div>
  )
}

// ───────────────────────── 1라운드 드라마틱 공개 ─────────────────────────
// 이름을 끝까지 감춘 채 지난 시즌 기록 → 포지션 → "…" → 이름 순으로 연다.
// 총 길이는 기록 줄 수에 따라 8~10초. 다음 단장의 시계가 이미 돌고 있으므로
// 어느 시점에 탭하든 즉시 공개로 건너뛸 수 있다(두 번째 탭이 닫기).

/** 단계 0(헤더) → 1(포지션 칩) */
const D_CHIPS_MS = 1000
/** 기록 첫 줄 시작 시각 · 줄 간격 */
const D_LINE_START_MS = 2000
const D_LINE_GAP_MS = 1000
/** 마지막 기록 줄 이후 "…" 펄스까지 */
const D_DOTS_DELAY_MS = 1200
/** "…" 펄스 길이 */
const D_DOTS_MS = 800
/** 이름 공개 후 자동 닫기까지 */
const D_CLOSE_AFTER_REVEAL_MS = 4000
/** 폭죽 지속 — 자동 닫힘과 맞춘다 */
const D_CONFETTI_MS = D_CLOSE_AFTER_REVEAL_MS

/** 읽어 줄 기록 줄. 값이 전부 0/없음인 줄은 빼고, 아예 기록이 없으면 한 줄만. */
function buildBriefLines(brief: DraftPlayerBrief | null | undefined, prevQuarterLabel: string | null | undefined): string[] {
  if (!brief || !brief.gp) return ['지난 시즌 기록 없음']
  const season = prevQuarterLabel ? `지난 시즌(${prevQuarterLabel})` : '지난 시즌'
  const lines = [`${season} · ${brief.prev_team_name ?? '—'} · ${brief.gp}경기`]
  if (brief.ppg || brief.rpg || brief.apg) {
    lines.push(`평균 ${brief.ppg}점 · ${brief.rpg}리바운드 · ${brief.apg}어시스트`)
  }
  if (brief.fg_pct || brief.fg3_pct) {
    lines.push(`야투 ${brief.fg_pct}% · 3점 ${brief.fg3_pct}%`)
  }
  return lines
}

/** 뒤집히지 않는 앞면 카드 — 이름 공개 전까지 이 면만 보인다(사진·이름 노출 0) */
function PickCardFrontOnly({ pickNumber, teamColor }: { pickNumber: number; teamColor: string }) {
  return (
    <div className="pick-front-box mx-auto w-44 h-44 sm:w-60 sm:h-60">
      <div
        className="w-full h-full rounded-3xl flex flex-col items-center justify-center gap-1"
        style={{ background: teamColor, border: `4px solid ${teamColor}`, boxShadow: `0 0 40px ${teamColor}88` }}
        aria-hidden
      >
        <span className="text-black/70 text-sm sm:text-base font-black tracking-[0.3em] uppercase">Pick</span>
        <span className="text-black text-5xl sm:text-7xl font-black leading-none tabular-nums" style={{ fontFamily: 'var(--font-bebas, sans-serif)' }}>#{pickNumber}</span>
      </div>
    </div>
  )
}

function DramaticPickReveal({
  data,
  onClose,
  isMyTurn,
  brief,
  prevQuarterLabel,
}: {
  data: PickRevealData
  onClose: () => void
  isMyTurn: boolean
  brief: DraftPlayerBrief | null | undefined
  prevQuarterLabel: string | null | undefined
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const timersRef = useRef<number[]>([])
  const revealedRef = useRef(false)

  const lines = useMemo(() => buildBriefLines(brief, prevQuarterLabel), [brief, prevQuarterLabel])
  // 단계: 0 헤더 · 1 포지션 · 2..(1+n) 기록 줄 · DOTS · REVEAL
  const DOTS = 2 + lines.length
  const REVEAL = DOTS + 1
  const [step, setStep] = useState(0)

  const reveal = useCallback(() => {
    if (revealedRef.current) return
    revealedRef.current = true
    timersRef.current.forEach(id => clearTimeout(id))
    timersRef.current = []
    setStep(REVEAL)
    try { playBuzzer() } catch { /* 오디오 차단 환경 — 연출은 계속 */ }
    timersRef.current.push(window.setTimeout(onClose, D_CLOSE_AFTER_REVEAL_MS))
  }, [REVEAL, onClose])

  // 단계 스케줄 — 픽마다 key 로 재마운트되므로 마운트 시 한 번만 건다.
  useEffect(() => {
    // 사진은 스테이지 0 에서 미리 받아 둔다 — 마지막에 뒤집을 때 빈 면이 보이지 않게.
    if (data.playerPhotoUrl) { const img = new Image(); img.src = data.playerPhotoUrl }
    const push = (ms: number, fn: () => void) => timersRef.current.push(window.setTimeout(fn, ms))
    push(D_CHIPS_MS, () => setStep(1))
    lines.forEach((_, i) => push(D_LINE_START_MS + i * D_LINE_GAP_MS, () => {
      setStep(2 + i)
      try { playBeep(false) } catch { /* 음소거/차단 — 무시 */ }
    }))
    const dotsAt = D_LINE_START_MS + (lines.length - 1) * D_LINE_GAP_MS + D_DOTS_DELAY_MS
    push(dotsAt, () => setStep(DOTS))
    push(dotsAt + D_DOTS_MS, () => reveal())
    return () => {
      timersRef.current.forEach(id => clearTimeout(id))
      timersRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 폭죽은 이름이 나오는 순간에만 — 픽 도착 시점이 아니다.
  useEffect(() => {
    if (step !== REVEAL) return
    const canvas = canvasRef.current
    if (!canvas) return
    return runConfetti(canvas, data.teamColor, D_CONFETTI_MS)
  }, [step, REVEAL, data.teamColor])

  const revealed = step >= REVEAL
  const onTap = () => { if (revealed) onClose(); else reveal() }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center cursor-pointer overflow-hidden"
      onClick={onTap}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap() } }}
      aria-label={revealed ? '탭하여 닫기' : '탭하면 바로 공개'}
      style={{
        // 스테이지 0 부터 팀 컬러가 화면을 덮는다 — "어느 팀 차례인가"가 먼저 읽히게.
        background: `radial-gradient(ellipse at center, ${data.teamColor}44, #050505 70%)`,
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }} />

      {/* 내 차례 배지 — 드라마틱 공개는 길다. 건너뛰는 법을 명시한다. */}
      {isMyTurn && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-2 px-4 py-2.5 min-h-11 rounded-full bg-emerald-500 text-black text-base sm:text-lg font-black shadow-2xl"
          style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}
          role="status"
        >
          <Zap size={20} aria-hidden /> 지금 내 차례 — 탭하면 바로 공개
        </div>
      )}

      <div
        className="dramatic-card relative w-[94vw] max-w-4xl max-h-full overflow-hidden rounded-3xl px-5 py-6 sm:px-10 sm:py-7 text-center"
        style={{
          border: `4px solid ${data.teamColor}`,
          background: `linear-gradient(135deg, ${data.teamColor}33, ${data.teamColor}0a, #050505 70%)`,
          boxShadow: `0 0 80px ${data.teamColor}88`,
          zIndex: 2,
        }}
      >
        {/* 스테이지 0 — 팀과 순번만. 이름은 없다. */}
        <p
          className="text-base sm:text-2xl lg:text-3xl font-black text-white tracking-tight"
          style={{ textShadow: '0 4px 24px rgba(0,0,0,0.8)' }}
        >
          <span style={{ color: data.teamColor }}>ROUND {data.roundNumber}</span>
          <span className="mx-2 text-gray-500">·</span>
          {data.teamName}의 1순위 지명
        </p>

        <div className="mt-4 sm:mt-6">
          {revealed ? (
            <PickPhotoFlip photoUrl={data.playerPhotoUrl} playerName={data.playerName} pickNumber={data.pickNumber} teamColor={data.teamColor} />
          ) : (
            <PickCardFrontOnly pickNumber={data.pickNumber} teamColor={data.teamColor} />
          )}
        </div>

        {/* 스테이지 1 — 포지션 칩 */}
        <div className="mt-3 sm:mt-4 min-h-9 flex items-center justify-center gap-2">
          {step >= 1 && data.playerPosition && data.playerPosition.split(',').map(s => s.trim()).filter(Boolean).map((pos, i) => (
            <span
              key={i}
              className="d-in text-sm sm:text-lg font-black tracking-[0.2em] uppercase px-3 py-1 rounded-md"
              style={{
                background: `${data.teamColor}33`,
                color: data.teamColor,
                border: `1.5px solid ${data.teamColor}66`,
                animationDelay: `${i * 80}ms`,
              }}
            >
              {pos}
            </span>
          ))}
        </div>

        {/* 스테이지 2 — 지난 시즌 기록, 한 줄씩.
            break-keep: 390px 에서 "4.2어시 / 스트" 처럼 한글 단어 중간이 끊기던 것을 막는다(실측).
            아직 안 나온 줄도 invisible 로 자리를 잡아 둔다 — 줄이 늘 때마다 카드가 흔들리지 않게. */}
        <div className="dramatic-stats mt-4 sm:mt-6 space-y-1.5 sm:space-y-2 font-mono tabular-nums">
          {lines.map((line, i) => (
            <p
              key={i}
              className={`text-lg sm:text-2xl lg:text-3xl font-semibold text-white leading-snug break-keep ${step >= 2 + i ? 'd-in' : 'invisible'}`}
            >
              {line}
            </p>
          ))}
        </div>

        {/* 스테이지 3 직전 — "…" 펄스 */}
        <div className="mt-4 sm:mt-6 min-h-10 flex items-center justify-center gap-2" aria-hidden>
          {step === DOTS && [0, 1, 2].map(i => (
            <span
              key={i}
              className="d-dot w-3 h-3 sm:w-4 sm:h-4 rounded-full"
              style={{ background: data.teamColor, animationDelay: `${i * 180}ms` }}
            />
          ))}
          {revealed && (
            <p
              className="d-name text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-none"
              style={{ fontFamily: 'var(--font-barlow-condensed, sans-serif)', textShadow: '0 4px 30px rgba(0,0,0,0.8)' }}
            >
              {data.playerName.toUpperCase()}
            </p>
          )}
        </div>

        <p className="mt-4 text-xs sm:text-sm uppercase tracking-[0.3em] text-gray-300">
          {revealed ? '탭하여 닫기' : '탭하면 바로 공개'}
        </p>
      </div>

      <style jsx>{`
        .d-in { animation: dIn 250ms ease-out both; }
        @keyframes dIn {
          from { transform: translateY(8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .d-dot { animation: dDot 800ms ease-in-out infinite; }
        @keyframes dDot {
          0%, 100% { opacity: 0.25; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        .d-name { animation: nameSlide 0.6s ease-out both; }
        @keyframes nameSlide {
          0% { transform: translateY(30px); opacity: 0; letter-spacing: -0.1em; }
          100% { transform: translateY(0); opacity: 1; letter-spacing: -0.01em; }
        }
        /* 가로 모드 폰 — 카드/사진/기록 블록이 화면 높이를 넘지 않게 */
        @media (orientation: landscape) and (max-height: 500px) {
          .dramatic-card { padding: 0.75rem 1.25rem; }
          .pick-front-box { width: 5.5rem; height: 5.5rem; }
          .dramatic-stats :global(p) { font-size: 1rem; line-height: 1.35; }
        }
        @media (prefers-reduced-motion: reduce) {
          .d-in, .d-name { animation: dFade 200ms ease-out both; }
          .d-dot { animation: dFadeLoop 800ms ease-in-out infinite; }
          @keyframes dFade { from { opacity: 0; } to { opacity: 1; } }
          @keyframes dFadeLoop { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
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
