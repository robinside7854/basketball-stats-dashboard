'use client'
// 추첨 결과 풀스크린 연출
//
// 흐름 (자동 진행 — 사용자 클릭 불필요):
//   'intro'     : 1.5s 동안 "팀 공이 기계로 들어가는 중..."
//   'drawing'   : 3.0s 동안 흔들리는 추첨 기계 + 드럼롤 사운드
//   'revealed'  : 결과 노출. 8s 후 자동 닫힘. 사용자가 미리 탭하면 즉시 닫힘.
//
// `prefers-reduced-motion` 사용자는 흔들림(lottoShake) 없이도 동일 타이밍으로 페이즈 전환.

import { useState, useEffect, useRef } from 'react'
import { playDrumroll, primeAudio } from '@/lib/draftSounds'

interface Team { id: string; name: string; color: string }

interface Props {
  order: string[]              // 확정된 픽 순서 (index 0 = 1픽)
  odds: Record<string, number> | null
  teams: Team[]
  onClose: () => void
}

type Phase = 'intro' | 'drawing' | 'revealed'

const INTRO_MS = 1500
const DRAWING_MS = 3000
const REVEALED_AUTO_CLOSE_MS = 8000

export default function DraftLotteryReveal({ order, odds, teams, onClose }: Props) {
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const [phase, setPhase] = useState<Phase>('intro')
  const reducedMotionRef = useRef<boolean>(false)

  // prefers-reduced-motion 감지 (한 번)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  // 전체 자동 진행: intro → drawing → revealed → autoClose
  useEffect(() => {
    let t1: ReturnType<typeof setTimeout> | null = null
    let t2: ReturnType<typeof setTimeout> | null = null
    let t3: ReturnType<typeof setTimeout> | null = null
    // 1) intro → drawing
    t1 = setTimeout(() => {
      setPhase('drawing')
      // 드럼롤 사운드 (사용자 제스처 없으면 무음 — 사양상 안전)
      try { primeAudio(); playDrumroll() } catch { /* ignore */ }
      // 2) drawing → revealed
      t2 = setTimeout(() => {
        setPhase('revealed')
        // 3) revealed → 자동 닫힘
        t3 = setTimeout(() => onClose(), REVEALED_AUTO_CLOSE_MS)
      }, DRAWING_MS)
    }, INTRO_MS)
    return () => {
      if (t1) clearTimeout(t1)
      if (t2) clearTimeout(t2)
      if (t3) clearTimeout(t3)
    }
    // onClose 는 부모가 매 렌더 재생성하지 않는다고 가정. 마운트 시 1회만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const firstId = order[0]
  const firstTeam = teamMap[firstId]
  const firstColor = firstTeam?.color ?? '#f59e0b'
  const showShake = phase === 'drawing' && !reducedMotionRef.current

  return (
    <div
      className="fixed inset-0 z-[58] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}
      onClick={() => phase === 'revealed' && onClose()}
    >
      <style>{`
        @keyframes lottoFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
        @keyframes lottoShake { 0%,100%{transform:translate(0,0) rotate(0)} 20%{transform:translate(-6px,4px) rotate(-6deg)} 40%{transform:translate(6px,-4px) rotate(6deg)} 60%{transform:translate(-5px,-3px) rotate(-4deg)} 80%{transform:translate(5px,3px) rotate(4deg)} }
        @keyframes lottoOut { 0%{transform:scale(0.2) translateY(40px);opacity:0} 60%{transform:scale(1.15) translateY(0);opacity:1} 100%{transform:scale(1) translateY(0);opacity:1} }
      `}</style>

      <div className="text-center max-w-lg sm:max-w-xl md:max-w-2xl w-full">
        <p className="font-jersey text-sm uppercase tracking-[0.3em] text-amber-400 mb-1">DRAFT LOTTERY</p>
        <h2 className="text-2xl sm:text-3xl font-black text-white mb-5">
          {phase === 'revealed' ? '1픽 당첨!' : phase === 'drawing' ? '두근두근...' : '추첨 기계에 팀 공 투입'}
        </h2>

        {phase !== 'revealed' ? (
          <>
            {/* 추첨 기계 */}
            <div className="relative mx-auto w-60 h-60 rounded-full border-4 border-gray-600 bg-gradient-to-b from-gray-800/60 to-gray-900/80 overflow-hidden flex items-center justify-center"
              style={{ animation: showShake ? 'lottoShake 0.5s infinite' : undefined }}>
              {/* 유리 반사 */}
              <div className="absolute top-3 left-6 w-16 h-10 rounded-full bg-white/10 blur-md" />
              {/* 공들 */}
              <div className="flex items-center justify-center gap-3 flex-wrap px-6">
                {order.map((tid, i) => {
                  const t = teamMap[tid]
                  return (
                    <div key={tid} className="w-14 h-14 rounded-full flex items-center justify-center text-[11px] font-black text-white shadow-lg"
                      style={{
                        backgroundColor: t?.color ?? '#888',
                        animation: reducedMotionRef.current ? undefined : `lottoFloat ${1 + i * 0.2}s ease-in-out ${i * 0.15}s infinite`,
                        boxShadow: `0 0 14px ${t?.color ?? '#888'}aa`,
                      }}>
                      <span className="drop-shadow">{t?.name?.slice(0, 4) ?? '?'}</span>
                    </div>
                  )
                })}
              </div>
              {/* 배출구 */}
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-16 h-4 rounded-b-xl bg-gray-700 border border-gray-600" />
            </div>

            <div className="mt-6 h-12 flex items-center justify-center">
              {phase === 'drawing' && (
                <p className="text-amber-300 font-black text-lg tracking-widest animate-pulse">● ● ●</p>
              )}
              {phase === 'intro' && (
                <p className="text-gray-300 text-sm">팀 공이 기계로 들어가는 중...</p>
              )}
            </div>
          </>
        ) : (
          <>
            {/* 1픽 공 배출 */}
            <div className="mx-auto w-40 h-40 rounded-full flex flex-col items-center justify-center text-white shadow-2xl"
              style={{ backgroundColor: firstColor, boxShadow: `0 0 50px ${firstColor}`, animation: 'lottoOut 0.8s ease-out' }}>
              <span className="text-[10px] font-black tracking-widest opacity-80">1픽</span>
              <span className="font-black text-2xl px-2 text-center leading-tight">{firstTeam?.name}</span>
            </div>

            {/* 전체 순서 */}
            <div className="mt-6 space-y-2">
              {order.map((tid, idx) => {
                const t = teamMap[tid]
                const odd = odds?.[tid]
                return (
                  <div key={`${tid}-${idx}`} className="flex items-center gap-3 rounded-xl px-3 sm:px-4 py-2.5 border bg-gray-900/80"
                    style={{ borderColor: idx === 0 ? firstColor : '#374151', animation: `lottoOut 0.5s ease-out ${idx * 0.15}s both` }}>
                    <span className={`font-display text-2xl sm:text-3xl w-8 shrink-0 ${idx === 0 ? 'text-amber-300' : 'text-gray-300'}`}>{idx + 1}</span>
                    <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: t?.color }} />
                    <span className="text-white font-black flex-1 text-left text-base sm:text-lg truncate min-w-0">{t?.name}</span>
                    {idx === 0 && <span className="text-[10px] font-black text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full shrink-0">1픽</span>}
                    {odd != null && <span className="text-xs text-gray-300 shrink-0">{(odd * 100).toFixed(0)}%</span>}
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-gray-300 mt-4">탭하여 닫기 · 8초 후 자동 닫힘</p>
          </>
        )}
      </div>
    </div>
  )
}
