'use client'
// 픽 이팩트 — 새 픽이 들어오면 전체화면으로 표시. 탭·Esc 로 닫거나 이름이 다 보인 뒤 5초.
// 폭죽 + 농구 카드 느낌 + 광채 + pulse 백라이트 + 스포트라이트 빔.
//
// 사용 패턴:
//   const [reveal, setReveal] = useState<PickRevealData | null>(null)
//   <DraftPickReveal data={reveal} onClose={() => setReveal(null)} />

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trophy, Zap, User } from 'lucide-react'
import { playBeep, playBuzzer } from '@/lib/draftSounds'
import { teamInk, teamAccentOnDark, blendHex } from '@/lib/util/contrastColor'
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
  /** drama = 1라운드 연출 전용. 같은 카드 안에 기록 8칸이 함께 서므로 모바일에서만 한 치수 작다 */
  size?: PhotoSize
}) {
  // 픽이 바뀌면 key 로 다시 마운트 — 상태 초기화를 effect 안 setState 로 하지 않는다
  return <PickPhotoFlipInner key={`${props.pickNumber}:${props.photoUrl ?? ''}`} {...props} />
}

type PhotoSize = 'md' | 'lg' | 'drama'
const PHOTO_BOX: Record<PhotoSize, string> = {
  md: 'w-36 h-36 sm:w-44 sm:h-44',
  lg: 'w-44 h-44 sm:w-60 sm:h-60',
  // 390×844 에 기록 8칸 + 이름까지 들어가야 한다 — 모바일만 176→144 로 줄여 약 32px 을 돌려받는다.
  drama: 'w-36 h-36 sm:w-48 sm:h-48',
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
  size?: PhotoSize
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

  const box = PHOTO_BOX[size]
  const showPhoto = loaded === true && !!photoUrl
  // 카드 앞면은 팀 컬러 **배경**이다 — 흰 팀(빅현욱)이면 text-[#000000], 빨강(챗지피지기)이면
  // 흰색이 4.0:1 로 AA 미달이라 역시 검정. 고정색을 쓰면 둘 중 하나는 반드시 깨진다.
  const front = teamInk(teamColor)

  return (
    <div className={`pick-flip mx-auto ${box}`} aria-live="off">
      <div className={`pick-flip-inner ${flipped ? 'is-flipped' : ''}`}>
        {/* 앞면 — 팀 컬러 카드 */}
        <div
          className="pick-flip-face rounded-3xl flex flex-col items-center justify-center gap-1"
          style={{ background: front.bg, border: `4px solid ${front.border}`, boxShadow: `0 0 40px ${teamColor}88` }}
          aria-hidden
        >
          <span className="text-sm sm:text-base font-black tracking-[0.3em] uppercase" style={{ color: front.fg, opacity: 0.75 }}>Pick</span>
          <span className="text-6xl sm:text-8xl font-black leading-none tabular-nums" style={{ color: front.fg, fontFamily: 'var(--font-bebas, sans-serif)' }}>#{pickNumber}</span>
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
              <span className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center" style={{ background: `${teamColor}33`, color: teamAccentOnDark(teamColor) }}>
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

/**
 * 일반 공개 자동 닫기 — 이름이 다 보인 뒤(= 마운트 시점) 5초.
 *
 * 2026-09-18 리허설: 예전에는 내 차례면 1.2초로 줄였다. 그런데 다음 픽의 시계는 **연출이
 * 닫힌 뒤에야** 시작하도록 바뀌었으므로(포털의 start-clock) 축약할 이유가 사라졌고,
 * 정작 카드를 읽던 단장의 화면만 순식간에 사라졌다. 이제 두 연출 모두 같은 규칙이다 —
 * 탭(또는 Esc)으로 닫거나, 이름이 다 보인 뒤 5초에 자동으로 닫힌다.
 */
const DURATION_MS = 5000
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
  seasonLabel = null,
}: {
  data: PickRevealData | null
  onClose: () => void
  /** 이 픽 직후 화면 주인이 다음 차례인지 — 「지금 내 차례」 배지를 띄운다.
   *  연출 길이는 줄이지 않는다(축약하면 정작 읽던 단장 화면만 사라졌다, 2026-09-18 리허설). */
  isMyTurn?: boolean
  /** 1라운드 지명 — 이름을 감춘 채 시즌 기록 박스를 하나씩 여는 단계 연출 */
  dramatic?: boolean
  /** 읽어 줄 시즌 요약 (없으면 "시즌 기록 없음" 한 칸) */
  brief?: DraftPlayerBrief | null
  /** 직전 분기 라벨 — 소속 팀명 옆 보조 표기용(호환 유지) */
  prevQuarterLabel?: string | null
  /** 집계 범위 라벨 — 예 "2026 시즌". 기록 헤더에 그대로 쓴다 */
  seasonLabel?: string | null
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
        seasonLabel={seasonLabel}
      />
    )
  }
  return <StandardPickReveal data={data} onClose={onClose} isMyTurn={isMyTurn} brief={brief} seasonLabel={seasonLabel} />
}

function StandardPickReveal({
  data,
  onClose,
  isMyTurn = false,
  brief = null,
  seasonLabel = null,
}: {
  data: PickRevealData | null
  onClose: () => void
  isMyTurn?: boolean
  brief?: DraftPlayerBrief | null
  seasonLabel?: string | null
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // onClose 는 부모가 인라인 화살표로 넘긴다 → 렌더마다 새 함수다. 이걸 effect deps 에 두면
  // 부모의 250ms 시계 tick 마다 effect 가 재실행되며 setTimeout 이 매번 새로 걸려
  // **자동 닫기가 영원히 오지 않았다**(2026-09-18 실측: 픽 공개가 전체화면으로 고정).
  // 최신 함수만 ref 로 들고, 타이머는 픽 번호가 바뀔 때만 다시 건다.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  const pickKey = data?.pickNumber ?? null

  // 자동 닫기 — 이름은 마운트 즉시 보이므로 마운트에서 5초를 센다.
  // 카드가 열려 있는 중에 새 픽이 오면 pickKey 가 바뀌어 이 effect 가 다시 돌고,
  // 옛 타이머는 cleanup 으로 죽는다 → 새 카드가 자리를 갈아타며 5초를 새로 받는다.
  useEffect(() => {
    if (pickKey == null) return
    const t = setTimeout(() => onCloseRef.current(), DURATION_MS)
    return () => clearTimeout(t)
  }, [pickKey])

  // 어떤 오버레이든 Esc 로 닫힌다 — 탭이 먹히지 않는 상황(빔 노트북, 포인터 없는 기기)의 탈출구.
  useEffect(() => {
    if (pickKey == null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickKey])

  // 폭죽 (캔버스) — data 변경 시 발사
  useEffect(() => {
    if (!data) return
    const canvas = canvasRef.current
    if (!canvas) return
    return runConfetti(canvas, data.teamColor, DURATION_MS)
  }, [data])

  // brief 가 없으면 빈 배열 → 요약 카드를 통째로 렌더하지 않는다(기존 화면 그대로).
  const standardBoxes = useMemo(() => buildStatBoxes(brief), [brief])

  if (!data) return null

  // 팀 컬러를 배경으로 쓰는 자리(알약)와 글자색으로 쓰는 자리(등번호·포지션)는 규칙이 다르다.
  const ink = teamInk(data.teamColor)
  const accent = teamAccentOnDark(data.teamColor)
  // 포지션 칩은 배경이 팀 컬러 20% 틴트라 검정 기준 액센트가 그대로는 미달한다
  const chipAccent = teamAccentOnDark(data.teamColor, blendHex(data.teamColor, '#0a0a0f', 0.2))

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#000000]/90 backdrop-blur-md cursor-pointer overflow-hidden"
      onClick={onClose}
      role="button"
      tabIndex={0}
      aria-label="탭하여 닫기"
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClose() } }}
      style={{
        animation: 'pickFadeIn 0.25s ease-out',
        // 배지가 떠 있으면 그만큼 위를 비운다 — 안 그러면 카드 머리(ROUND·PICK)를 덮는다.
        paddingTop: isMyTurn
          ? 'calc(max(1rem, env(safe-area-inset-top)) + 4rem)'
          : 'max(1rem, env(safe-area-inset-top))',
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

      {/* 내 차례 배지 — 픽 공개가 덮고 있는 동안에도 "지금 내 시계가 돈다"를 즉시 알린다.
          한 줄로 붙이면 390px 에서 세 줄로 접혀 카드 머리를 덮는다(실측) → 제목/힌트 두 줄로 나눈다. */}
      {isMyTurn && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10 max-w-[92vw] px-4 py-2 rounded-2xl bg-emerald-500 text-[#000000] shadow-2xl text-center"
          style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}
          role="status"
        >
          <span className="flex items-center justify-center gap-1.5 text-base sm:text-lg font-black leading-tight">
            <Zap size={20} aria-hidden /> 지금 내 차례
          </span>
          <span className="block text-xs sm:text-sm font-bold leading-tight break-keep">탭하면 닫고 선수 선택으로</span>
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
          <div className="text-xs sm:text-sm font-bold tracking-[0.3em] uppercase text-[#e5e7eb]">
            Round {data.roundNumber}
          </div>
          <div className="h-3 w-px bg-[#374151]" />
          <div
            className="inline-flex items-center gap-1.5 text-sm sm:text-base font-black tracking-[0.25em] uppercase px-4 py-1.5 rounded-full shadow-lg"
            style={{ background: ink.bg, color: ink.fg, border: `1px solid ${ink.border}`, boxShadow: `0 0 20px ${data.teamColor}` }}
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
            <p className="text-xl sm:text-3xl font-bold text-[#ffffff]">{data.teamName}</p>
            <div className="w-3 h-3 rounded-full shadow-lg" style={{ background: data.teamColor, boxShadow: `0 0 12px ${data.teamColor}` }} />
          </div>
          <p className="text-xs sm:text-base font-black tracking-[0.5em] uppercase text-[#d1d5db] mt-1.5">SELECTS</p>
        </div>

        {/* 메인 — 사진 카드 플립 + 이름 + 포지션 */}
        <div className="space-y-2 sm:space-y-3">
          <div className="pick-reveal-number" style={{ animation: 'numberPop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both' }}>
            <PickPhotoFlip photoUrl={data.playerPhotoUrl} playerName={data.playerName} pickNumber={data.pickNumber} teamColor={data.teamColor} />
          </div>
          {data.playerNumber != null && (
            <p className="text-2xl sm:text-4xl font-black tabular-nums leading-none" style={{ color: accent, fontFamily: 'var(--font-bebas, sans-serif)' }}>
              #{data.playerNumber}
            </p>
          )}
          <p
            className="text-3xl sm:text-6xl font-black text-[#ffffff] tracking-tight drop-shadow-lg"
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
              <div className="h-px w-8 bg-[#374151]" />
              {data.playerPosition.split(',').map(s => s.trim()).filter(Boolean).map((pos, i) => (
                <span
                  key={i}
                  className="text-sm sm:text-lg font-black tracking-[0.2em] uppercase px-3 py-1 rounded-md"
                  style={{
                    background: `${data.teamColor}33`,
                    color: chipAccent,
                    border: `1.5px solid ${data.teamColor}66`,
                  }}
                >
                  {pos}
                </span>
              ))}
              <div className="h-px w-8 bg-[#374151]" />
            </div>
          )}
        </div>

        {/* 2라운드 이후 픽 — 요약 카드 한 장. 단계 연출 없이 한 번에 뜬다(4.5초 안에 읽혀야 한다). */}
        {standardBoxes.length > 0 && (
          <div className="mt-4 sm:mt-5 rounded-2xl border px-3 py-3 text-left"
            style={{ background: '#111114', borderColor: `${data.teamColor}55` }}>
            <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.2em] text-[#9ca3af] mb-2">
              {seasonLabel ?? '시즌'} 기록
            </p>
            {/* 모바일 4열 × 2행 · lg 이상은 한 줄 8칸. 칸이 좁아지므로 순위 알약은
                compact 에서 모집단 수를 떼고 "전체 7위"까지만 쓴다(390px 실측). */}
            <div className="grid grid-cols-4 lg:grid-cols-8 gap-1.5 sm:gap-2">
              {standardBoxes.map(b => (
                <StatBoxCell key={b.key} box={b} teamColor={data.teamColor} rankTotal={brief?.rank_total ?? 0} visible compact />
              ))}
            </div>
          </div>
        )}

        <p className="mt-6 text-xs sm:text-sm uppercase tracking-[0.3em] text-[#d1d5db]">탭하여 닫기</p>
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
/** 기록 박스 첫 칸 시작 시각 · 칸 간격.
 *  칸이 6 → 8 로 늘어 간격을 1.1s 에서 0.9s 로 줄였다 — 기록 구간 길이가 5.5s → 6.3s 로
 *  거의 그대로다(칸 하나를 읽는 데 0.9s 면 리허설에서 따라 읽혔다). */
const D_LINE_START_MS = 2000
const D_LINE_GAP_MS = 900
/** 마지막 기록 박스 이후 "…" 펄스까지 */
const D_DOTS_DELAY_MS = 1200
/** "…" 펄스 길이 */
const D_DOTS_MS = 800
/**
 * 카드가 뒤집혀 사진이 선 뒤 이름이 **사진 아래로** 슬라이드인 하기까지.
 * 플립 자체가 550~700ms 이므로 그 뒤 약 1초를 더 둔다 — 사진을 먼저 보고
 * "누구지?" 하는 순간을 만든 다음 이름이 들어와야 한다(리허설 요구).
 */
const D_NAME_AFTER_REVEAL_MS = 1600
/** 이름이 다 보인 뒤 자동 닫기까지 — 일반 공개와 같은 5초 */
const D_CLOSE_AFTER_NAME_MS = 5000
/** 폭죽 지속 — 플립(=공개) 순간에 터진다 */
const D_CONFETTI_MS = 4000

// ── 시즌 기록 박스 ──────────────────────────────────────────────────────────
// 문장 세 줄이 아니라 숫자 박스로 바꾼 이유(2026-09-16 리허설): 현장에서 소리내어 읽는
// 사람이 "평균 12.4점 · 5.1리바운드 · 4.2어시스트" 한 줄을 끝까지 읽기 전에 다음 줄이 떠서
// 어느 숫자를 말하는지 따라가지 못했다. 한 번에 한 칸만 나오면 읽을 대상이 하나로 고정된다.

interface StatBox {
  key: string
  label: string
  value: string
  /** 전체 순위(1-based). null 이면 순위 알약을 렌더하지 않는다(자격 미달·참석율 칸) */
  rank: number | null
  /** 순위 대신 붙는 보조 줄(참석율의 "18 / 25 라운드"). rank 와 같은 자리를 쓴다 */
  sub?: string
  /** compact(요약 카드 8칸) 전용 축약형 — 한 칸이 ~69px 이라 원문이 칸을 넘는다 */
  subShort?: string
}

/**
 * 공개할 기록 칸 — 참석율 → 득점 → 리바운드 → 어시스트 → 스틸 → 블락 → 야투% → 3점%,
 * 항상 이 여덟 칸. 값이 0 인 칸도 뺄 수 없다: 여덟 칸이 4×2(sm 이상)·2×4(모바일) 격자로
 * 고정이라 한 칸만 빠져도 격자가 어긋나고, 단계 연출의 칸 수가 선수마다 달라진다.
 * 기록이 아예 없으면 빈 배열(호출부가 "시즌 기록 없음" 한 칸을 그린다).
 */
function buildStatBoxes(brief: DraftPlayerBrief | null | undefined): StatBox[] {
  if (!brief || !brief.gp) return []
  const rank = brief.rank ?? {
    ppg: null, rpg: null, apg: null, spg: null, bpg: null, fg_pct: null, fg3_pct: null,
  }
  return [
    {
      key: 'att',
      label: '참석율',
      value: `${Math.round(brief.attendance_pct)}%`,
      rank: null,
      sub: `${brief.gp} / ${brief.season_rounds} 라운드`,
      subShort: `${brief.gp}/${brief.season_rounds}R`,
    },
    { key: 'ppg', label: '평균 득점', value: brief.ppg.toFixed(1), rank: rank.ppg },
    { key: 'rpg', label: '평균 리바운드', value: brief.rpg.toFixed(1), rank: rank.rpg },
    { key: 'apg', label: '평균 어시스트', value: brief.apg.toFixed(1), rank: rank.apg },
    { key: 'spg', label: '평균 스틸', value: brief.spg.toFixed(1), rank: rank.spg },
    { key: 'bpg', label: '평균 블락', value: brief.bpg.toFixed(1), rank: rank.bpg },
    // 야투율은 brief 가 이미 %(소수 1자리)로 준다 — 여기서 다시 100 을 곱하지 않는다.
    { key: 'fg', label: '야투%', value: `${(brief.fg_pct ?? 0).toFixed(1)}%`, rank: rank.fg_pct },
    { key: 'fg3', label: '3점%', value: `${(brief.fg3_pct ?? 0).toFixed(1)}%`, rank: rank.fg3_pct },
  ]
}

/** 순위 알약 — 3위 이내는 팀 컬러, 그 밖은 차분한 회색. 색만으로 구분하지 않도록 숫자를 그대로 쓴다. */
function RankPill({ rank, total, teamColor, small = false }: { rank: number; total: number; teamColor: string; small?: boolean }) {
  const top = rank <= 3
  const pill = teamInk(teamColor)
  // small(요약 카드)은 한 줄에 8칸(~69px)이라 모집단 수까지 넣으면 알약이 칸 밖으로 비어져 나온다.
  // 색만으로 구분하지 않도록 숫자("전체 n위")는 어느 쪽이든 그대로 남긴다.
  return (
    <span
      className={`inline-block rounded-full font-bold tabular-nums whitespace-nowrap ${small ? 'text-[10px] px-1 py-0.5' : 'text-xs sm:text-sm px-2 py-0.5'}`}
      style={top
        ? { background: pill.bg, color: pill.fg, border: `1px solid ${pill.border}` }
        : { background: '#27272a', color: '#d4d4d8' }}
      title={total > 0 ? `전체 ${rank}위 / ${total}명` : undefined}
    >
      전체 {rank}위{!small && total > 0 ? ` / ${total}` : ''}
    </span>
  )
}

/** 기록 한 칸. 불투명 패널 + 팀 컬러 헤어라인(블러 없음). */
function StatBoxCell({
  box, teamColor, rankTotal, visible, compact = false,
}: {
  box: StatBox
  teamColor: string
  rankTotal: number
  /** 아직 차례가 아닌 칸도 자리는 잡아 둔다 — 칸이 늘 때마다 카드가 흔들리지 않게 */
  visible: boolean
  compact?: boolean
}) {
  return (
    // styled-jsx 는 컴포넌트 단위 스코프다 — 부모(DramaticPickReveal)에 적은 .d-in 은
    // 이 자식 엘리먼트에 붙지 않는다. 그래서 등장 애니메이션을 여기서 다시 정의한다.
    <div
      className={`stat-box ${visible ? 'stat-box-in' : 'invisible'} rounded-xl border ${compact ? 'px-1 py-1.5' : 'px-2 py-2'} flex flex-col items-center justify-center gap-0.5 min-w-0`}
      style={{ background: '#111114', borderColor: `${teamColor}66` }}
    >
      <span
        className={`font-black tabular-nums leading-none text-[#ffffff] ${compact ? 'text-xl sm:text-2xl' : 'text-2xl lg:text-4xl'}`}
        style={{ fontFamily: 'var(--font-bebas, sans-serif)' }}
      >
        {box.value}
      </span>
      <span className={`${compact ? 'text-[11px]' : 'text-xs sm:text-sm'} font-bold text-[#d1d5db] leading-none break-keep text-center`}>{box.label}</span>
      {box.rank != null
        ? <RankPill rank={box.rank} total={rankTotal} teamColor={teamColor} small={compact} />
        : box.sub
          ? (
            <span className={`${compact ? 'text-[10px]' : 'text-xs sm:text-sm'} font-bold tabular-nums whitespace-nowrap text-[#d1d5db]`}>
              {compact ? (box.subShort ?? box.sub) : box.sub}
            </span>
          )
          : null}
      <style jsx>{`
        .stat-box-in { animation: statBoxIn 250ms ease-out both; }
        @keyframes statBoxIn {
          from { transform: translateY(10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .stat-box-in { animation: statBoxFade 250ms ease-out both; }
          @keyframes statBoxFade { from { opacity: 0; } to { opacity: 1; } }
        }
      `}</style>
    </div>
  )
}

/** 뒤집히지 않는 앞면 카드 — 이름 공개 전까지 이 면만 보인다(사진·이름 노출 0) */
function PickCardFrontOnly({ pickNumber, teamColor, size = 'lg' }: { pickNumber: number; teamColor: string; size?: PhotoSize }) {
  const front = teamInk(teamColor)
  return (
    <div className={`pick-front-box mx-auto ${PHOTO_BOX[size]}`}>
      <div
        className="w-full h-full rounded-3xl flex flex-col items-center justify-center gap-1"
        style={{ background: front.bg, border: `4px solid ${front.border}`, boxShadow: `0 0 40px ${teamColor}88` }}
        aria-hidden
      >
        <span className="text-sm sm:text-base font-black tracking-[0.3em] uppercase" style={{ color: front.fg, opacity: 0.75 }}>Pick</span>
        <span className="text-5xl sm:text-7xl font-black leading-none tabular-nums" style={{ color: front.fg, fontFamily: 'var(--font-bebas, sans-serif)' }}>#{pickNumber}</span>
      </div>
    </div>
  )
}

function DramaticPickReveal({
  data,
  onClose,
  isMyTurn,
  brief,
  seasonLabel,
}: {
  data: PickRevealData
  onClose: () => void
  isMyTurn: boolean
  brief: DraftPlayerBrief | null | undefined
  prevQuarterLabel: string | null | undefined
  seasonLabel: string | null | undefined
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const timersRef = useRef<number[]>([])
  const revealedRef = useRef(false)

  const boxes = useMemo(() => buildStatBoxes(brief), [brief])
  // 검은 배경 위에 팀 컬러를 **글자색**으로 쓰는 자리 — 어두운 팀 컬러는 밝기를 올려 AA 확보
  const dAccent = teamAccentOnDark(data.teamColor)
  const dChipAccent = teamAccentOnDark(data.teamColor, blendHex(data.teamColor, '#0a0a0f', 0.2))
  // 기록이 없으면 "시즌 기록 없음" 한 칸만 — 단계 수는 1로 유지해 연출 길이가 무너지지 않게 한다.
  const lines = boxes.length > 0 ? boxes : [null]
  // 단계: 0 헤더 · 1 포지션 · 2..(1+n) 기록 칸 · DOTS · REVEAL
  const DOTS = 2 + lines.length
  const REVEAL = DOTS + 1
  const [step, setStep] = useState(0)
  // 이름은 플립보다 늦게 들어온다 — 사진 먼저, 그 다음 이름. 자동 닫기는 이름 기준으로 센다.
  const [nameShown, setNameShown] = useState(false)

  const reveal = useCallback(() => {
    if (revealedRef.current) return
    revealedRef.current = true
    timersRef.current.forEach(id => clearTimeout(id))
    timersRef.current = []
    setStep(REVEAL)
    try { playBuzzer() } catch { /* 오디오 차단 환경 — 연출은 계속 */ }
    timersRef.current.push(window.setTimeout(() => setNameShown(true), D_NAME_AFTER_REVEAL_MS))
    timersRef.current.push(window.setTimeout(onClose, D_NAME_AFTER_REVEAL_MS + D_CLOSE_AFTER_NAME_MS))
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
  const onTap = useCallback(() => { if (revealedRef.current) onClose(); else reveal() }, [onClose, reveal])

  // Esc 탈출구 — 탭이 먹히지 않는 기기에서도 전면 연출을 닫을 수 있어야 한다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
        // 배지가 떠 있으면 그만큼 위를 비운다 — 안 그러면 "ROUND n · 팀명의 1순위 지명" 줄을 덮는다.
        paddingTop: isMyTurn
          ? 'calc(max(0.5rem, env(safe-area-inset-top)) + 4rem)'
          : 'max(0.75rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }} />

      {/* 내 차례 배지 — 두 줄로 나눈다(한 줄이면 390px 에서 세 줄로 접혀 카드 머리를 덮는다). */}
      {isMyTurn && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10 max-w-[92vw] px-4 py-2 rounded-2xl bg-emerald-500 text-[#000000] shadow-2xl text-center"
          style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}
          role="status"
        >
          <span className="flex items-center justify-center gap-1.5 text-base sm:text-lg font-black leading-tight">
            <Zap size={20} aria-hidden /> 지금 내 차례
          </span>
          <span className="block text-xs sm:text-sm font-bold leading-tight break-keep">탭하면 닫고 선수 선택으로</span>
        </div>
      )}

      <div
        className="dramatic-card relative w-[94vw] max-w-4xl max-h-full overflow-hidden rounded-3xl px-4 py-4 sm:px-10 sm:py-5 text-center"
        style={{
          border: `4px solid ${data.teamColor}`,
          background: `linear-gradient(135deg, ${data.teamColor}33, ${data.teamColor}0a, #050505 70%)`,
          boxShadow: `0 0 80px ${data.teamColor}88`,
          zIndex: 2,
        }}
      >
        {/* 스테이지 0 — 팀과 순번만. 이름은 없다. */}
        <p
          className="text-base sm:text-2xl lg:text-3xl font-black text-[#ffffff] tracking-tight"
          style={{ textShadow: '0 4px 24px rgba(0,0,0,0.8)' }}
        >
          <span style={{ color: dAccent }}>ROUND {data.roundNumber}</span>
          <span className="mx-2 text-[#6b7280]">·</span>
          {data.teamName}의 1순위 지명
        </p>

        <div className="mt-3 sm:mt-4">
          {revealed ? (
            <PickPhotoFlip photoUrl={data.playerPhotoUrl} playerName={data.playerName} pickNumber={data.pickNumber} teamColor={data.teamColor} size="drama" />
          ) : (
            <PickCardFrontOnly pickNumber={data.pickNumber} teamColor={data.teamColor} size="drama" />
          )}
        </div>

        {/* 이름 — 사진 **바로 아래**. 플립이 끝나고 약 1초 뒤에 들어온다.
            자리는 미리 잡아 두지 않는다: 이름이 들어오며 아래가 밀리는 움직임 자체가 신호다. */}
        {nameShown && (
          <p
            className="d-name mt-2 text-3xl sm:text-4xl lg:text-5xl font-black text-[#ffffff] tracking-tight leading-none"
            style={{ fontFamily: 'var(--font-barlow-condensed, sans-serif)', textShadow: '0 4px 30px rgba(0,0,0,0.8)' }}
          >
            {data.playerName.toUpperCase()}
          </p>
        )}

        {/* 스테이지 1 — 포지션 칩 */}
        <div className="mt-2 sm:mt-4 min-h-9 flex items-center justify-center gap-2">
          {step >= 1 && data.playerPosition && data.playerPosition.split(',').map(s => s.trim()).filter(Boolean).map((pos, i) => (
            <span
              key={i}
              className="d-in text-sm sm:text-lg font-black tracking-[0.2em] uppercase px-3 py-1 rounded-md"
              style={{
                background: `${data.teamColor}33`,
                color: dChipAccent,
                border: `1.5px solid ${data.teamColor}66`,
                animationDelay: `${i * 80}ms`,
              }}
            >
              {pos}
            </span>
          ))}
        </div>

        {/* 스테이지 2 — 시즌 기록 박스, 한 칸씩.
            모바일 2열 × 4행 / sm 이상 4열 × 2행. 아직 안 나온 칸도 invisible 로 자리를 잡아 둔다. */}
        <div className="dramatic-stats mt-2 sm:mt-3">
          {step >= 2 && (
            <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.2em] text-[#9ca3af] mb-1.5 sm:mb-2">
              {seasonLabel ?? '시즌'} 기록
            </p>
          )}
          {boxes.length === 0 ? (
            <div className={`rounded-xl border px-3 py-3 ${step >= 2 ? '' : 'invisible'}`}
              style={{ background: '#111114', borderColor: `${data.teamColor}66` }}>
              <p className="text-base sm:text-xl font-bold text-[#d1d5db] break-keep">시즌 기록 없음</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
              {boxes.map((b, i) => (
                <StatBoxCell
                  key={b.key}
                  box={b}
                  teamColor={data.teamColor}
                  rankTotal={brief?.rank_total ?? 0}
                  visible={step >= 2 + i}
                />
              ))}
            </div>
          )}
        </div>

        {/* 스테이지 3 직전 — "…" 펄스. 이름은 사진 아래로 옮겼으므로 여기는 점만 쓴다.
            공개 후에는 자리를 접어 카드 높이를 돌려준다(390×844 에서 8칸이 들어가야 한다). */}
        {!revealed && (
          <div className="mt-4 sm:mt-6 min-h-10 flex items-center justify-center gap-2" aria-hidden>
            {step === DOTS && [0, 1, 2].map(i => (
              <span
                key={i}
                className="d-dot w-3 h-3 sm:w-4 sm:h-4 rounded-full"
                style={{ background: data.teamColor, animationDelay: `${i * 180}ms` }}
              />
            ))}
          </div>
        )}

        <p className="mt-3 sm:mt-4 text-xs sm:text-sm uppercase tracking-[0.3em] text-[#d1d5db]">
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
        /* 낮은 화면(프로젝터·노트북 1280×720 등) — 기록이 8칸으로 늘어 sm 기본값으로는
           카드가 화면보다 커진다. 사진과 여백을 줄이고, 그래도 넘치면 잘라 버리는 대신
           카드 안에서 스크롤되게 둔다(아무것도 닿을 수 없는 상태를 만들지 않는다).
           사진 박스는 자식 컴포넌트라 styled-jsx 스코프가 달라 :global 로 지정한다. */
        @media (max-height: 820px) {
          .dramatic-card { overflow-y: auto; }
        }
        @media (min-width: 640px) and (max-height: 820px) {
          .dramatic-card { padding-top: 0.75rem; padding-bottom: 0.75rem; }
          .dramatic-card :global(.pick-flip),
          .dramatic-card :global(.pick-front-box) { width: 9rem; height: 9rem; }
          .d-name { font-size: 2rem; }
        }
        /* 가로 모드 폰 — 카드/사진/기록 블록이 화면 높이를 넘지 않게 */
        @media (orientation: landscape) and (max-height: 500px) {
          .dramatic-card { padding: 0.75rem 1.25rem; }
          .dramatic-card :global(.pick-flip),
          .dramatic-card :global(.pick-front-box) { width: 5.5rem; height: 5.5rem; }
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
