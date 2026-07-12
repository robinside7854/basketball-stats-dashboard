'use client'
// 미라클모닝 브랜드 — Player of the Week 슬라이드 배너
// 최근 4주 라운드별 POTW 를 좌우 스와이프/화살표로 열람.
// 첫 슬라이드 = 최신 라운드. 이후 뒤로 갈수록 오래된 라운드.
// 각 슬라이드 = NbaHero 재활용.
// CSS scroll-snap + IntersectionObserver 로 인디케이터 동기화.

import { useRef, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import NbaHero, { type NbaHeroData } from './NbaHero'

export type WeeklyPOTW = {
  date: string        // YYYY-MM-DD (라운드)
  label: string       // "7/4 (토)"
  potw: NonNullable<NbaHeroData>
}

type Props = {
  entries: WeeklyPOTW[]
  leagueId: string
}

export default function NbaHeroCarousel({ entries, leagueId }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<Array<HTMLDivElement | null>>([])
  const [current, setCurrent] = useState(0)

  // IntersectionObserver 로 현재 슬라이드 인덱스 감지
  useEffect(() => {
    if (!scrollRef.current || entries.length <= 1) return
    const container = scrollRef.current
    const io = new IntersectionObserver(
      (observed) => {
        // 가장 큰 intersectionRatio 를 가진 슬라이드가 현재
        let maxRatio = 0
        let bestIdx = current
        for (const entry of observed) {
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio
            bestIdx = Number((entry.target as HTMLElement).dataset.idx ?? 0)
          }
        }
        if (maxRatio > 0.5) setCurrent(bestIdx)
      },
      { root: container, threshold: [0.5, 0.75, 1] },
    )
    for (const el of slideRefs.current) if (el) io.observe(el)
    return () => io.disconnect()
  }, [entries.length, current])

  function goTo(idx: number) {
    const el = slideRefs.current[idx]
    if (el && scrollRef.current) {
      scrollRef.current.scrollTo({ left: el.offsetLeft, behavior: 'smooth' })
    }
  }
  function goPrev() { goTo(Math.max(0, current - 1)) }
  function goNext() { goTo(Math.min(entries.length - 1, current + 1)) }

  // 빈 상태
  if (entries.length === 0) {
    return (
      <div
        className="mm-brand p-8 md:p-10"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
          color: 'var(--mm-ink)',
        }}
      >
        <p className="text-[11px] font-black tracking-[0.22em] uppercase mb-2" style={{ color: 'var(--mm-yellow-strong)' }}>
          Player of the Week
        </p>
        <h2 className="font-jersey text-2xl font-black uppercase" style={{ color: 'var(--mm-ink)' }}>
          아직 라운드가 마감되지 않았습니다
        </h2>
        <p className="text-sm mt-2" style={{ color: 'var(--mm-muted)' }}>
          경기가 완료되면 이 자리에 그 라운드의 최고 임팩트 선수가 표시됩니다.
        </p>
      </div>
    )
  }

  const isSingle = entries.length === 1

  return (
    <section className="mm-brand relative">
      {/* 스크롤 컨테이너 */}
      <div
        ref={scrollRef}
        className="flex overflow-x-auto overflow-y-hidden scrollbar-hide"
        style={{
          scrollSnapType: 'x mandatory',
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {entries.map((e, idx) => (
          <div
            key={e.date}
            ref={el => { slideRefs.current[idx] = el }}
            data-idx={idx}
            className="w-full shrink-0"
            style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
          >
            <NbaHero
              data={e.potw}
              rangeLabel={`${e.label} 라운드`}
              leagueId={leagueId}
            />
          </div>
        ))}
      </div>

      {/* 좌우 화살표 (데스크탑 · 태블릿) — 슬라이드가 여러 개일 때만 */}
      {!isSingle && (
        <>
          <button
            type="button"
            onClick={goPrev}
            disabled={current === 0}
            aria-label="이전 라운드"
            className="hidden md:flex absolute top-1/2 -translate-y-1/2 left-2 lg:left-4 z-10 items-center justify-center transition-opacity duration-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-100 opacity-85"
            style={{
              width: '44px',
              height: '44px',
              background: 'var(--mm-panel)',
              border: '1px solid var(--mm-rule)',
              color: 'var(--mm-ink)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            <ChevronLeft size={22} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={current === entries.length - 1}
            aria-label="다음 라운드"
            className="hidden md:flex absolute top-1/2 -translate-y-1/2 right-2 lg:right-4 z-10 items-center justify-center transition-opacity duration-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-100 opacity-85"
            style={{
              width: '44px',
              height: '44px',
              background: 'var(--mm-panel)',
              border: '1px solid var(--mm-rule)',
              color: 'var(--mm-ink)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            <ChevronRight size={22} strokeWidth={2.5} />
          </button>
        </>
      )}

      {/* 하단 인디케이터 — 도트 + 현재 라운드 라벨 */}
      {!isSingle && (
        <div
          className="flex items-center justify-center gap-3 px-4 py-3"
          style={{
            background: 'var(--mm-panel)',
            borderTop: '0',
            borderLeft: '1px solid var(--mm-rule)',
            borderRight: '1px solid var(--mm-rule)',
            borderBottom: '1px solid var(--mm-rule)',
          }}
        >
          <span className="text-[11px] tracking-[0.16em] uppercase font-bold" style={{ color: 'var(--mm-muted)' }}>
            {current + 1} / {entries.length}
          </span>
          <div className="flex items-center gap-1.5">
            {entries.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => goTo(idx)}
                aria-label={`${idx + 1}번째 라운드로 이동`}
                className="cursor-pointer transition-all duration-200"
                style={{
                  width: idx === current ? '24px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: idx === current ? 'var(--mm-yellow)' : 'var(--mm-rule)',
                  minHeight: '20px',
                  minWidth: idx === current ? '32px' : '20px',
                  padding: 0,
                  border: 'none',
                }}
              />
            ))}
          </div>
          <span className="text-[11px] tracking-[0.16em] uppercase font-bold" style={{ color: 'var(--mm-muted)' }}>
            {entries[current]?.label ?? ''}
          </span>
        </div>
      )}
    </section>
  )
}
