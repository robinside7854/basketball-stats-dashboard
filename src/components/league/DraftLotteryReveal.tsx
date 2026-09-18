'use client'
// 추첨 결과 풀스크린 연출 — **마블 레이스**(2026-09-18 전면 교체).
//
// 이전 버전은 로또 추첨기(원형 보울 + 송풍기)였다. 그 전에는 three.js 3D 였고, 그 전에는
// CSS keyframe 이었다. 이번에는 세로형 하프코트를 굴러 내려오는 농구공 레이스다.
// 참고: lazygyu/roulette (MIT, https://github.com/lazygyu/roulette) — 세로 코스 구성·리더 추적
// 카메라·바닥 골라인이라는 골격을 참고했다. 물리 엔진(그쪽은 box2d-wasm)과 코드는 쓰지 않았다.
//
// ── 순서는 어떻게 보장되나 ────────────────────────────────────────────────
// **레이스 결과는 순위와 아무 상관이 없다.** 서버가 이미 정한 `order` 가 유일한 진실이고,
// 레이스는 그저 공을 아래로 모으는 연출이다. 순위는 마지막 **공개 단계**가 정한다:
// 바닥 볼랙에 모인 공을 `order` 순서대로 하나씩 꺼내 골대에 꽂는다. 1등으로 내려온 공이
// 1픽이 아니어도 아무 문제가 없다 — 그래서 물리가 아무리 흔들려도 결과가 틀릴 수 없다.
//
// ── 그래도 물리를 결정론으로 만든 이유 ───────────────────────────────────
// 같은 추첨을 여러 사람이 각자 기기로 본다. 레이스가 기기마다 다르면 "내 화면에선 락다운이
// 1등이었는데?" 가 나온다. 그래서 시드(order 해시) 난수 + 고정 스텝(1/120s) + 초월함수 없는
// 물리로 **모든 기기가 같은 궤적**을 그린다. 검증은 Node 에서 두 번 돌려 체크섬 비교
// (scripts 로 남기지 않고 개발 중 확인 — sim.ts/course.ts/rng.ts 는 DOM 의존이 0이다).
//
// ── 타이밍 (마운트 기준, onClose 계약은 종전과 동일) ─────────────────────
//   intro   0.0~1.7s   팁오프. 공이 코트 위에서 쏟아진다
//   race    1.7~14.7s  램프·수비수·스핀무브 휠. 카메라가 선두 팀 공을 따라간다
//   settle  14.7~16.9s 낙오 공 정리. 카메라 줌아웃
//   reveal  16.9s~     order 순서대로 슛 → 스위시마다 "{n}순위 {팀}"
//   list    reveal 종료 직후. 10초 뒤 자동 닫힘(종전과 동일)
// 최대(12팀) 합계 약 27.7초 < 30초.

import { useState, useEffect, useRef, useCallback } from 'react'
import { Dice5 } from 'lucide-react'
import { playBeep, playBuzzer, playDrumroll, playLotteryHorn, primeAudio } from '@/lib/draftSounds'
import { teamInk, teamAccentOnDark } from '@/lib/util/contrastColor'
import { createWorld, stepWorld, leaderIndex, SIM_HZ, type World } from './lottery/sim'
import { COURSE_W, NET_BOTTOM, SHELF_INNER_Y, RIM_Y } from './lottery/course'
import { drawScene, shotArc, type Cam, type FlyingBall, type TeamInfo } from './lottery/render'

interface Team { id: string; name: string; color: string }

interface Props {
  order: string[]              // 확정된 픽 순서 (index 0 = 1픽)
  odds: Record<string, number> | null
  teams: Team[]
  onClose: () => void
}

type Phase = 'race' | 'reveal' | 'list'

/** 확률이 팀마다 실제로 다를 때만 true. 균등 추첨(전원 1/N)이거나 odds 가 없으면 false.
 *  실제 드래프트는 대부분 균등이라 같은 숫자가 N번 반복될 뿐이고, 그 배지는 정보가 0이다. */
export function hasVaryingOdds(order: string[], odds: Record<string, number> | null): boolean {
  if (!odds) return false
  const values = order.map(id => odds[id]).filter((v): v is number => typeof v === 'number')
  if (values.length < 2) return false
  // 1/3 이 0.3333 / 0.3334 로 갈리는 부동소수 오차는 '다르다'로 치지 않는다
  return Math.max(...values) - Math.min(...values) > 0.0005
}

const INTRO_MS = 1700
const RACE_MS = 13000
const SETTLE_MS = 2200
const RACE_END_MS = INTRO_MS + RACE_MS          // 14700
const SETTLE_END_MS = RACE_END_MS + SETTLE_MS   // 16900
const RACE_END_STEPS = Math.round((RACE_END_MS / 1000) * SIM_HZ)
const SETTLE_END_STEPS = Math.round((SETTLE_END_MS / 1000) * SIM_HZ)
const REVEALED_AUTO_CLOSE_MS = 10000
/** reduced-motion 경로: 레이스 없이 3초 안에 순차 공개 */
const REDUCED_TOTAL_MS = 3000

/** 팀 수가 많으면 공개 한 건을 짧게 — 12팀에서도 총 30초를 넘기지 않는다 */
function gateMs(n: number): number { return n <= 6 ? 1150 : 900 }

/** 레이스 중 세로로 보이는 월드 높이. 코스 폭(24)과 이 값 중 빡빡한 쪽이 배율을 정한다. */
const RACE_VIEW_H = 44
/** 마무리 줌아웃 배율 */
const FINISH_ZOOM = 0.92
/** 마무리에 화면 가운데에 둘 월드 y — 페인트존 위부터 네트 끝까지가 들어온다.
 *  이 값이 낮으면(=아래) 네트 아래 빈 검은 화면이 1/3 을 차지한다(1280 실측). */
const FINISH_CAM_Y = 114

export default function DraftLotteryReveal({ order, odds, teams, onClose }: Props) {
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const teamInfo: Record<string, TeamInfo> = Object.fromEntries(
    teams.map(t => [t.id, { name: t.name, color: t.color }]),
  )
  const [reducedMotion] = useState(() =>
    typeof window !== 'undefined' && !!window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )
  const [phase, setPhase] = useState<Phase>(reducedMotion ? 'reveal' : 'race')
  /** 지금까지 공개된 순위 수 */
  const [revealed, setRevealed] = useState(0)

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const doneRef = useRef(false)

  const GATE = gateMs(order.length)
  const revealTotal = order.length * GATE
  const listAtMs = SETTLE_END_MS + revealTotal

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

  // ── reduced-motion: 레이스 없이 3초 순차 공개 ───────────────────────
  useEffect(() => {
    if (!reducedMotion) return
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
  }, [reducedMotion, order.length, finish])

  // ── 레이스 + 공개 (캔버스) ────────────────────────────────────────────
  useEffect(() => {
    if (reducedMotion) return
    if (phase === 'list') return
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w: World = createWorld(order)
    let viewW = 1, viewH = 1, baseScale = 1
    const cam: Cam = { x: COURSE_W / 2, y: 0, zoom: 1 }
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
      if (!camInit) { cam.zoom = baseScale; camInit = true }
    }
    layout()
    const ro = new ResizeObserver(layout)
    ro.observe(wrap)

    const t0 = performance.now()
    let lastTick = 0
    const sparks: { x: number; y: number; life: number }[] = []
    let rimFlash = 0
    let netWave = 0
    let flying: FlyingBall | null = null
    let flyFrom = { x: 0, y: 0 }
    let flyIndex = -1
    let swished = -1
    let drumAt = 0

    try { primeAudio(); playDrumroll() } catch { /* ignore */ }

    function frame(now: number) {
      const elapsed = now - t0

      // ── 물리: 경과 시간이 정하는 **스텝 번호**까지 따라간다.
      // 느린 기기는 한 프레임에 여러 스텝을 돌 뿐, 스텝 N 의 상태는 어디서나 같다.
      const raceMode = w.step < RACE_END_STEPS
      const targetStep = Math.min(
        SETTLE_END_STEPS,
        Math.floor((elapsed / 1000) * SIM_HZ),
      )
      // 한 프레임 상한 — 탭 복귀 같은 큰 점프에 프레임을 통째로 잡아먹지 않게.
      // 단 마지막(정리 끝)에는 남은 걸 몰아서 끝낸다 — 공개 시작 시점의 배치가 정본이라야 한다.
      const cap = targetStep >= SETTLE_END_STEPS ? 600 : 24
      let n = 0
      while (w.step < targetStep && n < cap) {
        stepWorld(w, w.step < RACE_END_STEPS ? 'race' : 'settle')
        for (let i = 0; i < w.hitCount; i++) {
          const p = w.course.pegs[w.hits[i]]
          if (sparks.length < 26) sparks.push({ x: p.x, y: p.y, life: 1 })
          // 틱은 속도 제한 — 매 충돌마다 울리면 소음이 된다
          if (raceMode && now - lastTick > 150) {
            lastTick = now
            try { playBeep() } catch { /* ignore */ }
          }
        }
        n++
      }
      // 레이스 막판 드럼롤 한 번 더
      if (drumAt === 0 && elapsed > RACE_END_MS - 3200) {
        drumAt = 1
        try { playDrumroll() } catch { /* ignore */ }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        sparks[i].life -= 0.06
        if (sparks[i].life <= 0) sparks.splice(i, 1)
      }
      rimFlash = Math.max(0, rimFlash - 0.045)
      netWave = Math.max(0, netWave - 0.03)

      // ── 카메라
      const finishing = elapsed >= RACE_END_MS
      let targetY: number
      let targetZoom: number
      if (finishing) {
        targetY = FINISH_CAM_Y
        targetZoom = baseScale * FINISH_ZOOM
      } else {
        const li = leaderIndex(w)
        targetY = (li >= 0 ? w.marbles[li].y : 0) + 6
        targetZoom = baseScale
      }
      cam.y += (targetY - cam.y) * 0.075
      cam.zoom += (targetZoom - cam.zoom) * 0.06

      // ── 공개 단계 — order 순서대로 슛
      if (elapsed >= SETTLE_END_MS) {
        const idx = Math.min(order.length - 1, Math.floor((elapsed - SETTLE_END_MS) / GATE))
        const p = ((elapsed - SETTLE_END_MS) % GATE) / GATE
        if (idx !== flyIndex) {
          flyIndex = idx
          const m = w.marbles.find(mm => mm.team === order[idx])
          if (m) {
            // 카메라 밖에서 날아오지 않게 시작점을 코트 안으로 당긴다
            flyFrom = { x: m.x, y: Math.max(m.y, SHELF_INNER_Y - 6) }
            m.out = true
          } else {
            flyFrom = { x: COURSE_W / 2, y: SHELF_INNER_Y }
          }
        }
        if (p < 0.6) {
          const a = shotArc(flyFrom.x, flyFrom.y, p / 0.6)
          flying = { x: a.x, y: a.y, rot: p * 9, teamId: order[idx], through: false }
        } else if (p < 0.9) {
          const k = (p - 0.6) / 0.3
          flying = {
            x: 12, y: RIM_Y + (NET_BOTTOM + 1.5 - RIM_Y) * k,
            rot: p * 9, teamId: order[idx], through: true,
          }
          if (swished !== idx) {
            swished = idx
            rimFlash = 1
            netWave = 1
            setRevealed(idx + 1)
            try { playBuzzer() } catch { /* ignore */ }
          }
        } else {
          flying = null
        }
      }

      drawScene(ctx!, w, {
        viewW, viewH, cam, teams: teamInfo, flying, rimFlash, netWave, sparks,
      })

      if (elapsed >= listAtMs) { finish(); return }
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)

    return () => {
      ro.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // 루프는 마운트 1회만 돈다 — 'list' 로 넘어갈 때만 접는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === 'list', reducedMotion])

  // 레이스 → 공개 단계 전환 (헤더 문구용). 캔버스 루프는 이 상태를 보지 않는다.
  useEffect(() => {
    if (reducedMotion) return
    const t = setTimeout(() => setPhase(p => (p === 'race' ? 'reveal' : p)), SETTLE_END_MS)
    timersRef.current.push(t)
    return () => clearTimeout(t)
  }, [reducedMotion])

  // 공개가 다 끝나면 목록으로 (rAF 가 멈춘 경우의 안전망)
  useEffect(() => {
    if (reducedMotion) return
    const t = setTimeout(finish, listAtMs + 400)
    timersRef.current.push(t)
    return () => clearTimeout(t)
  }, [reducedMotion, listAtMs, finish])

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
    else finish()
  }

  const latest = revealed > 0 ? order[revealed - 1] : null
  const latestTeam = latest ? teamMap[latest] : null

  return (
    <div
      className="fixed inset-0 z-[58] flex flex-col bg-[#000000]/95 cursor-pointer overflow-hidden"
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
          {phase === 'race' && (
            <span className="inline-flex items-center gap-2">
              <Dice5 size={20} aria-hidden /> 마블 레이스 진행 중
            </span>
          )}
          {phase === 'reveal' && (latestTeam
            ? (
              <span
                className="lotto-anim inline-block"
                style={{ color: teamAccentOnDark(latestTeam.color), animation: 'swishPop 260ms cubic-bezier(0.2,0.8,0.2,1) both' }}
                key={revealed}
              >
                {revealed}순위 · {latestTeam.name}
              </span>
            )
            : '골대 앞 정렬 중')}
          {phase === 'list' && '추첨 결과'}
        </h2>
      </div>

      {phase !== 'list' ? (
        <div ref={wrapRef} className="relative flex-1 min-h-0">
          <canvas ref={canvasRef} className="block absolute inset-0" aria-hidden />
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
          <p className="absolute bottom-0 inset-x-0 text-center text-sm text-[#e5e7eb] py-2 bg-gradient-to-t from-[#000000] via-[#000000cc] to-transparent">탭하여 건너뛰기</p>
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
