'use client'
// 추첨 결과 풀스크린 연출 — **마블 레이스**.
//
// 2026-09-19 개편: 「구석 볼랙에 모았다가 끝나고 쏘기」를 버렸다. 이제 골대는 **바닥 한가운데**
// 에 있고, 공 한 개 폭 슈트를 지나 림을 통과하는 순서가 곧 픽 순서다. n번째로 들어온 팀 공이
// n순위 — 연출이 끝난 뒤 결과를 알려 주는 게 아니라, 연출 도중에 결과가 정해지는 것처럼 보인다
// (실제로는 서버가 정한 order 가 유일한 진실이고, 아래 두 장치가 그것을 화면에 강제한다).
//
// ── 순서는 어떻게 보장되나 ────────────────────────────────────────────────
//  1) **시드 탐색**(lottery/search.ts) — 물리가 결정론이라 (order, seed) 하나가 도착 순서
//     하나를 정한다. 팁오프 대기 동안 헤드리스로 돌려 도착 순서가 order 와 같아지는 시드를
//     찾는다. 3팀 평균 3.4회·11ms, 4팀 23.3회·85ms 로 사실상 항상 찾는다.
//  2) **슈트 게이트**(폴백) — 6팀 이상은 기대 시도 횟수가 n! 이라 예산(400회·2.5초) 안에
//     못 찾는 일이 흔하다(6팀 실측 성공률 40%). 그때만 슈트 입구에 마개를 두고 order
//     순서대로 한 개씩 내보낸다. 시드를 찾았을 때 이 게이트는 만들어지지도 않는다.
//
// ── 왜 물리를 결정론으로 만들었나 ────────────────────────────────────────
// 같은 추첨을 여러 사람이 각자 기기로 본다. 레이스가 기기마다 다르면 "내 화면에선 락다운이
// 1등이었는데?" 가 나온다. 시드 난수 + 고정 스텝(1/120s) + 초월함수 없는 물리로 모든 기기가
// 같은 궤적을 그린다. 기기 간 몇 초의 시작 시차는 허용한다.
//
// ── 타이밍 (출발 기준) ───────────────────────────────────────────────────
//   대기      총무가 「출발」을 누를 때까지 (모두 같은 팁오프 화면)
//   레이스    12~16초 — 마지막 팀 공이 림을 통과하면 끝
//   홀드      1.5초
//   목록      10초 뒤 자동 닫힘
// 12팀 최장 실측 26.0초 + 1.5 = 27.5초 < 30초. 그래도 26초에 강제 종료 상한을 건다.

import { useState, useEffect, useRef, useCallback, type MouseEvent } from 'react'
import { Dice5, Flag, Loader2 } from 'lucide-react'
import { playBeep, playBuzzer, playDrumroll, playLotteryHorn, primeAudio } from '@/lib/draftSounds'
import { teamInk, teamAccentOnDark } from '@/lib/util/contrastColor'
import {
  createWorld, leaderIndex, raceOver, SIM_HZ, stepWorld, teamInChute, type World,
} from './lottery/sim'
import { findSeedChunked } from './lottery/search'
import { hashSeed } from './lottery/rng'
import { COURSE_W } from './lottery/course'
import { drawScene, type Cam, type TeamInfo } from './lottery/render'

interface Team { id: string; name: string; color: string }

interface Props {
  order: string[]              // 확정된 픽 순서 (index 0 = 1픽)
  odds: Record<string, number> | null
  teams: Team[]
  onClose: () => void
  /** 총무가 「출발」을 누른 시각. null 이면 아직 대기 — 레이스가 시작되지 않는다. */
  raceStartedAt: string | null
  /** 이 화면에서 출발을 누를 수 있는가 (총무/PIN 어드민) */
  canStart?: boolean
  onStart?: () => void
}

type Phase = 'wait' | 'race' | 'list'

/** 확률이 팀마다 실제로 다를 때만 true. 균등 추첨(전원 1/N)이거나 odds 가 없으면 false.
 *  실제 드래프트는 대부분 균등이라 같은 숫자가 N번 반복될 뿐이고, 그 배지는 정보가 0이다. */
export function hasVaryingOdds(order: string[], odds: Record<string, number> | null): boolean {
  if (!odds) return false
  const values = order.map(id => odds[id]).filter((v): v is number => typeof v === 'number')
  if (values.length < 2) return false
  // 1/3 이 0.3333 / 0.3334 로 갈리는 부동소수 오차는 '다르다'로 치지 않는다
  return Math.max(...values) - Math.min(...values) > 0.0005
}

/** 마지막 팀 골인 뒤 목록으로 넘어가기 전 여운 */
const HOLD_AFTER_MS = 1500
/** 레이스 강제 종료 상한 — 무슨 일이 있어도 출발→목록 30초를 넘기지 않는다 */
const RACE_CAP_MS = 26_000
const REVEALED_AUTO_CLOSE_MS = 10_000
/** reduced-motion 경로: 레이스 없이 3초 안에 순차 공개 */
const REDUCED_TOTAL_MS = 3000

/** 레이스 중 세로로 보이는 월드 높이. 코스 폭(24)과 이 값 중 빡빡한 쪽이 배율을 정한다. */
const RACE_VIEW_H = 44
/** 골대 프레이밍 — 슈트 입구부터 네트 끝까지가 들어오는 높이·폭 */
const FINISH_VIEW_H = 30
const FINISH_VIEW_W = 18
/** 림 프로텍터(129)~네트 끝(148)이 화면 가운데에 오게. 낮추면 네트 아래 검은 띠가 커진다. */
const FINISH_CAM_Y = 136
/** 대기 화면 — 스폰 구역(-16~0)만 담는다. 전체 배율로 잡으면 위쪽 절반이 검게 빈다. */
const WAIT_CAM_Y = -6
const WAIT_VIEW_H = 24

export default function DraftLotteryReveal({
  order, odds, teams, onClose, raceStartedAt, canStart = false, onStart,
}: Props) {
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const teamInfo: Record<string, TeamInfo> = Object.fromEntries(
    teams.map(t => [t.id, { name: t.name, color: t.color }]),
  )
  const [reducedMotion] = useState(() =>
    typeof window !== 'undefined' && !!window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )
  const started = !!raceStartedAt
  const [phase, setPhase] = useState<Phase>('wait')
  /** 지금까지 공개된 순위 수 */
  const [revealed, setRevealed] = useState(0)
  const [starting, setStarting] = useState(false)
  const [seedReady, setSeedReady] = useState(false)

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const doneRef = useRef(false)
  /** 탐색 결과 — rAF 루프가 읽는다 */
  const seedRef = useRef<{ seed: number; gate: boolean; ready: boolean }>({
    seed: hashSeed(order.join('|')), gate: true, ready: false,
  })
  /** 출발 관측 여부 — rAF 루프가 읽는다 */
  const startedRef = useRef(false)
  startedRef.current = started

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    setRevealed(order.length)
    setPhase('list')
    try { playLotteryHorn() } catch { /* ignore */ }
    timersRef.current.push(setTimeout(() => onClose(), REVEALED_AUTO_CLOSE_MS))
    // onClose 는 부모가 재생성하지 않는다고 가정(종전 구현과 동일한 전제)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.length])

  // ── 시드 탐색 — 팁오프 대기 동안 조각내 돌린다(「출발」 버튼이 먹통이 되면 안 된다) ──
  useEffect(() => {
    const cancel = findSeedChunked(order, r => {
      seedRef.current = { seed: r.seed, gate: !r.matched, ready: true }
      setSeedReady(true)
    })
    return cancel
    // order 는 서버가 확정한 뒤 바뀌지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 출발 관측 → 레이스 단계 ──────────────────────────────────────────
  useEffect(() => {
    if (!started || phase !== 'wait') return
    if (!seedReady) return       // 코스가 정해지기 전에 시작하면 도중에 코스가 바뀐다
    setPhase('race')
  }, [started, seedReady, phase])

  // ── reduced-motion: 레이스 없이 3초 순차 공개 ───────────────────────
  useEffect(() => {
    if (!reducedMotion || phase !== 'race') return
    const per = REDUCED_TOTAL_MS / Math.max(1, order.length)
    for (let i = 0; i < order.length; i++) {
      timersRef.current.push(setTimeout(() => {
        setRevealed(i + 1)
        try { playBuzzer() } catch { /* ignore */ }
      }, per * (i + 1)))
    }
    timersRef.current.push(setTimeout(finish, REDUCED_TOTAL_MS + 200))
    const timers = timersRef.current
    return () => { for (const t of timers) clearTimeout(t) }
  }, [reducedMotion, phase, order.length, finish])

  // ── 캔버스: 대기 화면 + 레이스 ────────────────────────────────────────
  const canvasActive = !reducedMotion && phase !== 'list'
  useEffect(() => {
    if (!canvasActive) return
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w: World = createWorld(order, seedRef.current.seed, seedRef.current.gate)
    let applied = seedRef.current.ready
    let viewW = 1, viewH = 1, baseScale = 1, finishScale = 1, waitScale = 1
    const cam: Cam = { x: COURSE_W / 2, y: WAIT_CAM_Y, zoom: 1 }
    let camInit = false

    function layout() {
      const dpr = Math.min(2, window.devicePixelRatio || 1)  // DPR 상한 2
      const rect = wrap!.getBoundingClientRect()
      viewW = Math.max(1, Math.round(rect.width))
      viewH = Math.max(1, Math.round(rect.height))
      canvas!.width = Math.round(viewW * dpr)
      canvas!.height = Math.round(viewH * dpr)
      canvas!.style.width = `${viewW}px`
      canvas!.style.height = `${viewH}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      // 세로 코스를 유지하고 가로는 여백으로 둔다(넓은 화면에서 레터박스)
      baseScale = Math.min(viewW / COURSE_W, viewH / RACE_VIEW_H)
      finishScale = Math.min(viewW / FINISH_VIEW_W, viewH / FINISH_VIEW_H)
      waitScale = Math.min(viewW / COURSE_W, viewH / WAIT_VIEW_H)
      if (!camInit) { cam.zoom = waitScale; camInit = true }
    }
    layout()
    const ro = new ResizeObserver(layout)
    ro.observe(wrap)

    let t0 = 0
    let running = false
    let lastTick = 0
    let seenGoals = 0
    let chuteCam = false
    let endAt = -1
    const sparks: { x: number; y: number; life: number }[] = []
    const bumperFlash = [0, 0, 0]
    let rimFlash = 0
    let netWave = 0

    function frame(now: number) {
      // 탐색이 끝나면 확정된 시드로 월드를 다시 짓는다(아직 한 스텝도 안 돌렸으므로 무손실)
      if (!applied && seedRef.current.ready) {
        w = createWorld(order, seedRef.current.seed, seedRef.current.gate)
        applied = true
      }
      if (!running && applied && startedRef.current) {
        running = true
        t0 = now
        try { primeAudio(); playDrumroll() } catch { /* ignore */ }
      }

      if (running) {
        const elapsed = now - t0
        // ── 물리: 경과 시간이 정하는 **스텝 번호**까지 따라간다.
        // 느린 기기는 한 프레임에 여러 스텝을 돌 뿐, 스텝 N 의 상태는 어디서나 같다.
        const targetStep = Math.floor((elapsed / 1000) * SIM_HZ)
        let n = 0
        while (w.step < targetStep && n < 30 && endAt < 0) {
          stepAndCollect(w, sparks, bumperFlash)
          if (w.hitCount > 0 && now - lastTick > 150) {
            lastTick = now
            try { playBeep() } catch { /* ignore */ }
          }
          if (w.goals.length > seenGoals) {
            seenGoals = w.goals.length
            rimFlash = 1
            netWave = 1
            setRevealed(seenGoals)
            try { playBuzzer() } catch { /* ignore */ }
          } else if (w.justScored === '') {
            netWave = Math.max(netWave, 0.5)
          }
          if (raceOver(w) && endAt < 0) endAt = now
          n++
        }
        if (endAt < 0 && elapsed > RACE_CAP_MS) endAt = now
        if (endAt > 0 && now - endAt > HOLD_AFTER_MS) { finish(); return }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        sparks[i].life -= 0.06
        if (sparks[i].life <= 0) sparks.splice(i, 1)
      }
      for (let i = 0; i < bumperFlash.length; i++) bumperFlash[i] = Math.max(0, bumperFlash[i] - 0.07)
      rimFlash = Math.max(0, rimFlash - 0.04)
      netWave = Math.max(0, netWave - 0.028)

      // ── 카메라: 선두 추적 → 첫 팀 공이 슈트에 들어오면 골대 프레이밍
      let targetY = WAIT_CAM_Y
      let targetZoom = waitScale
      if (running) {
        targetZoom = baseScale
        if (!chuteCam && teamInChute(w)) chuteCam = true
        if (chuteCam) {
          targetY = FINISH_CAM_Y
          targetZoom = finishScale
        } else {
          const li = leaderIndex(w)
          targetY = (li >= 0 ? w.marbles[li].y : 0) + 6
        }
      }
      cam.y += (targetY - cam.y) * 0.075
      cam.zoom += (targetZoom - cam.zoom) * 0.06

      drawScene(ctx!, w, {
        viewW, viewH, cam, teams: teamInfo,
        rimFlash, netWave, sparks, bumperFlash, waiting: !running,
      })

      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)

    return () => {
      ro.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // 루프는 캔버스가 살아 있는 동안 한 번만 돈다 — 'list' 로 넘어갈 때만 접는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasActive])

  // 안전망 — rAF 가 멈춘(탭 비활성 등) 경우에도 출발 후 30초면 목록으로
  useEffect(() => {
    if (phase !== 'race' || reducedMotion) return
    const t = setTimeout(finish, RACE_CAP_MS + HOLD_AFTER_MS + 1500)
    timersRef.current.push(t)
    return () => clearTimeout(t)
  }, [phase, reducedMotion, finish])

  useEffect(() => {
    const timers = timersRef.current
    return () => { for (const t of timers) clearTimeout(t) }
  }, [])

  const firstId = order[0]
  const firstTeam = teamMap[firstId]
  const firstColor = firstTeam?.color ?? '#f59e0b'
  const firstInk = teamInk(firstColor)
  // 팀 컬러를 **글자색**으로 검은 배경에 쓰는 자리 — 어두운 팀 컬러는 그대로 두면 사라진다
  const firstAccent = teamAccentOnDark(firstColor)
  const oddsVary = hasVaryingOdds(order, odds)

  function handleTap() {
    if (phase === 'list') onClose()
    else if (phase === 'race') finish()
    // 대기 중에는 탭으로 건너뛸 수 없다 — 출발은 총무만 누른다
  }

  function handleStart(e: MouseEvent) {
    e.stopPropagation()
    if (!onStart || starting) return
    setStarting(true)
    try { primeAudio() } catch { /* ignore */ }
    onStart()
  }

  const latest = revealed > 0 ? order[revealed - 1] : null
  const latestTeam = latest ? teamMap[latest] : null

  return (
    <div
      className={`fixed inset-0 z-[58] flex flex-col bg-[#000000]/95 overflow-hidden ${phase === 'wait' ? '' : 'cursor-pointer'}`}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
      onClick={handleTap}
      role="dialog"
      aria-label="드래프트 추첨 결과"
    >
      <style>{`
        @keyframes lottoRise {
          from { transform: scale(0.88) translateY(14px); opacity: 0; }
          to   { transform: scale(1)    translateY(0);    opacity: 1; }
        }
        @keyframes swishPop {
          from { transform: scale(0.8); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .lotto-anim { animation: none !important; }
        }
      `}</style>

      {/* 헤더 — 캔버스는 이 아래를 전부 채운다 */}
      <div className="shrink-0 px-4 pt-3 pb-2 text-center">
        <p className="font-jersey text-sm uppercase tracking-[0.3em] text-amber-400">DRAFT LOTTERY</p>
        <h2 className="text-xl sm:text-3xl font-black text-[#ffffff] leading-tight">
          {phase === 'wait' && '팁오프 대기'}
          {phase === 'race' && (latestTeam
            ? (
              <span
                className="lotto-anim inline-block"
                style={{ color: teamAccentOnDark(latestTeam.color), animation: 'swishPop 260ms cubic-bezier(0.2,0.8,0.2,1) both' }}
                key={revealed}
              >
                {revealed}순위 · {latestTeam.name}
              </span>
            )
            : (
              <span className="inline-flex items-center gap-2">
                <Dice5 size={20} aria-hidden /> 마블 레이스 진행 중
              </span>
            ))}
          {phase === 'list' && '추첨 결과'}
        </h2>
      </div>

      {phase !== 'list' ? (
        <div ref={wrapRef} className="relative flex-1 min-h-0">
          <canvas ref={canvasRef} className="block absolute inset-0" aria-hidden />

          {/* 출발 대기 오버레이 — 모두에게 안내, 총무에게만 버튼 */}
          {phase === 'wait' && (
            <div className="absolute inset-0 flex flex-col items-center justify-end gap-4 px-4 pb-10 bg-gradient-to-t from-[#000000] via-[#000000b3] to-transparent">
              <p className="text-base sm:text-lg text-[#f3f4f6] font-bold text-center leading-relaxed break-keep">
                총무가 출발을 누르면 레이스가 시작됩니다
              </p>
              {canStart ? (
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={starting || !seedReady}
                  className="h-14 min-w-[180px] px-8 rounded-2xl bg-[var(--mm-yellow)] text-[var(--mm-black)] text-lg font-black inline-flex items-center justify-center gap-2 cursor-pointer transition-colors duration-200 hover:bg-[var(--mm-yellow-strong)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/70 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {starting || !seedReady
                    ? <Loader2 size={20} className="animate-spin" aria-hidden />
                    : <Flag size={20} aria-hidden />}
                  {starting ? '출발 신호 전송 중' : !seedReady ? '코스 준비 중' : '출발'}
                </button>
              ) : (
                <p className="text-sm text-[#d1d5db]">잠시만 기다려 주세요</p>
              )}
            </div>
          )}

          {/* 공개된 순위 — 캔버스 위 DOM 오버레이 */}
          {revealed > 0 && (
            <div className="absolute left-2 top-2 right-2 flex flex-col gap-1 pointer-events-none max-h-[46%] overflow-hidden">
              {order.slice(0, revealed).map((tid, i) => {
                const t = teamMap[tid]
                const ink = teamInk(t?.color)
                return (
                  <div
                    key={`${tid}-${i}`}
                    className="lotto-anim flex items-center gap-2 self-start rounded-lg px-2.5 py-1 bg-[#111827] border"
                    style={{ borderColor: ink.bg, animation: 'swishPop 220ms ease-out both' }}
                  >
                    <span className="font-display text-base text-amber-300 tabular-nums">{i + 1}</span>
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: ink.bg, border: `1px solid ${ink.border}` }}
                    />
                    <span className="text-[#ffffff] font-bold text-base">{t?.name ?? '?'}</span>
                  </div>
                )
              })}
            </div>
          )}
          {phase === 'race' && (
            <p className="absolute bottom-0 inset-x-0 text-center text-sm text-[#e5e7eb] py-2 bg-gradient-to-t from-[#000000] via-[#000000cc] to-transparent">탭하여 건너뛰기</p>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col items-center px-4 pb-3 overflow-hidden">
          <div
            className="lotto-anim shrink-0 mt-1 w-28 h-28 sm:w-32 sm:h-32 rounded-full flex flex-col items-center justify-center shadow-2xl"
            style={{
              backgroundColor: firstInk.bg,
              color: firstInk.fg,
              border: `2px solid ${firstInk.border}`,
              boxShadow: `0 0 50px ${firstColor}80`,
              animation: reducedMotion ? undefined : 'lottoRise 380ms cubic-bezier(0.2,0.8,0.2,1) both',
            }}
          >
            <span className="text-xs font-black tracking-widest opacity-80">1픽</span>
            <span className="font-black text-lg sm:text-xl px-3 text-center leading-tight break-keep">{firstTeam?.name}</span>
          </div>
          <p className="shrink-0 text-base font-black mt-2" style={{ color: firstAccent }}>
            {firstTeam?.name} 1픽 확정
          </p>

          {/* 전체 순서 — 스크롤 가능 (8팀 이상 대응) */}
          <div className="mt-3 w-full max-w-lg space-y-2 flex-1 min-h-0 overflow-y-auto pr-1">
            {order.map((tid, idx) => {
              const t = teamMap[tid]
              const ink = teamInk(t?.color)
              const odd = odds?.[tid]
              return (
                <div
                  key={`${tid}-${idx}`}
                  className="lotto-anim flex items-center gap-3 rounded-xl px-3 sm:px-4 py-2.5 border bg-[#111827]"
                  style={{
                    borderColor: idx === 0 ? firstColor : '#374151',
                    animation: reducedMotion ? undefined : `lottoRise 300ms ease-out ${Math.min(idx * 60, 480)}ms both`,
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
          <p className="shrink-0 text-sm text-[#d1d5db] mt-3 leading-relaxed">탭하여 닫기 · 10초 후 자동 닫힘</p>
        </div>
      )}
    </div>
  )
}

/** 한 스텝 돌리고 이번 스텝의 타격을 잔상으로 옮긴다 */
function stepAndCollect(
  w: World,
  sparks: { x: number; y: number; life: number }[],
  bumperFlash: number[],
) {
  stepWorld(w)
  for (let i = 0; i < w.hitCount; i++) {
    const p = w.course.pegs[w.hits[i]]
    if (sparks.length < 26) sparks.push({ x: p.x, y: p.y, life: 1 })
  }
  for (let i = 0; i < w.bumpHitCount; i++) bumperFlash[w.bumpHits[i]] = 1
}
