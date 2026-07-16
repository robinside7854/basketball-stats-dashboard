'use client'
// 미라클모닝 브랜드 — Player of the Week 슬라이드 배너
// 최근 4주 라운드별 POTW 를 좌우 스와이프/화살표로 열람.
// 첫 슬라이드 = 최신 라운드. 이후 뒤로 갈수록 오래된 라운드.
// 각 슬라이드 = NbaHero 재활용.
// CSS scroll-snap + IntersectionObserver 로 인디케이터 동기화.

import { useRef, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import NbaHero, { type NbaHeroData } from './NbaHero'

// POTW 우세 카테고리 — 헤드라인 생성 · 아이콘 강조에 사용
// 'win' 은 팀 승리 기여 (모든 팀원이 동일 승수 견인이라 무의미) → 실제 접전 상황 클러치로 재정의
// efficiency 카테고리 삭제 (2026-07-17 · TS%/eFG% 등 Advanced 지표 배제 · POTW_WEIGHTS 참조)
export type POTWTopCategory = 'volume' | 'reb' | 'stl' | 'blk' | 'ast' | 'clutch'
// 2번째 우세 지표 — 볼륨 우세 + 3점 폭격 케이스만 'three' 로 특수 서브 지표
export type SecondaryCategory = POTWTopCategory | 'three'

export type POTWBreakdown = {
  pts: number       // 그 라운드 총 득점
  ts_pct: number    // True Shooting %
  reb: number       // 총 리바운드
  stl: number       // 스틸
  blk: number       // 블락
  ast: number       // 어시스트
  clutchPts: number // 클러치 상황 득점 (마지막 2분 + 3점차 이내)
  clutchGp: number  // 클러치 상황 경험 게임 수 (참고용)
  compositeScore: number  // 종합 점수 (0~100)
  topCategory: POTWTopCategory
  headline: string  // 자동 생성 스토리 코멘트
  // NEW · 3점 지표 (변원식 케이스 · "그 주에 3점 폭격")
  fg3m: number      // 3점 성공 수
  fg3a: number      // 3점 시도 수
  fg3_pct: number   // 3점 성공률
  // NEW · 2번째 우세 카테고리 + 라벨 (동적 서브 지표)
  secondaryCategory?: SecondaryCategory
  secondaryLabel?: string
}

export type WeeklyPOTW = {
  date: string        // YYYY-MM-DD (라운드)
  label: string       // "7/4 (토)"
  potw: NonNullable<NbaHeroData>
  breakdown: POTWBreakdown
}

type Props = {
  entries: WeeklyPOTW[]
  leagueId: string
}

// sessionStorage 캐시 키 — 리그별로 격리
const HEADLINE_CACHE_KEY = (leagueId: string) => `potw-headline-cache:${leagueId}`

export default function NbaHeroCarousel({ entries, leagueId }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<Array<HTMLDivElement | null>>([])
  const [current, setCurrent] = useState(0)
  // ref 로 current 값 참조 — deps 에 current 를 넣지 않고 스와이프마다 observer 재등록 방지
  const currentRef = useRef(0)
  useEffect(() => { currentRef.current = current }, [current])

  // AI 헤드라인 상태 — date → headline 매핑 (초기엔 빈 객체, 마운트 후 채워짐)
  // 각 슬라이드는 aiHeadlines[e.date] 있으면 그것, 없으면 규칙 기반 breakdown.headline 사용
  const [aiHeadlines, setAiHeadlines] = useState<Record<string, string>>({})

  useEffect(() => {
    if (entries.length === 0) return
    if (typeof window === 'undefined') return

    const cacheKey = HEADLINE_CACHE_KEY(leagueId)
    let cached: Record<string, string> = {}
    try {
      cached = JSON.parse(sessionStorage.getItem(cacheKey) ?? '{}') as Record<string, string>
    } catch {
      cached = {}
    }

    // 이미 채워진 항목은 즉시 반영
    if (Object.keys(cached).length > 0) setAiHeadlines(cached)

    const missing = entries.filter(e => !cached[e.date])
    if (missing.length === 0) return

    let aborted = false
    Promise.all(
      missing.map(e =>
        fetch(`/api/leagues/${leagueId}/potw/headline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: e.date,
            playerName: e.potw.name,
            teamName: e.potw.teamName ?? undefined,
            breakdown: {
              pts: e.breakdown.pts,
              ts_pct: e.breakdown.ts_pct,
              reb: e.breakdown.reb,
              stl: e.breakdown.stl,
              blk: e.breakdown.blk,
              ast: e.breakdown.ast,
              clutchPts: e.breakdown.clutchPts,
              clutchGp: e.breakdown.clutchGp,
              topCategory: e.breakdown.topCategory,
              compositeScore: e.breakdown.compositeScore,
            },
          }),
        })
          .then(r => (r.ok ? r.json() : { headline: e.breakdown.headline }))
          .then((d: { headline?: string }) => ({
            date: e.date,
            headline: (d.headline && d.headline.trim().length > 0) ? d.headline : e.breakdown.headline,
          }))
          .catch(() => ({ date: e.date, headline: e.breakdown.headline })),
      ),
    ).then(results => {
      if (aborted) return
      const next: Record<string, string> = { ...cached }
      for (const r of results) next[r.date] = r.headline
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(next))
      } catch {
        // 스토리지 quota / 프라이버시 모드 무시
      }
      setAiHeadlines(next)
    })

    return () => { aborted = true }
  }, [entries, leagueId])

  // IntersectionObserver 로 현재 슬라이드 인덱스 감지
  useEffect(() => {
    if (!scrollRef.current || entries.length <= 1) return
    const container = scrollRef.current
    const io = new IntersectionObserver(
      (observed) => {
        // 가장 큰 intersectionRatio 를 가진 슬라이드가 현재
        let maxRatio = 0
        let bestIdx = currentRef.current
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
  }, [entries.length])

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
        data-tour="hero"
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
    <section data-tour="hero" className="mm-brand relative">
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
              headline={aiHeadlines[e.date] ?? e.breakdown.headline}
              // 첫 슬라이드는 above-fold LCP 후보 → next/image priority · 나머지는 lazy
              priority={idx === 0}
              breakdown={{
                ts_pct: e.breakdown.ts_pct,
                reb: e.breakdown.reb,
                stl: e.breakdown.stl,
                blk: e.breakdown.blk,
                ast: e.breakdown.ast,
                clutchPts: e.breakdown.clutchPts,
                clutchGp: e.breakdown.clutchGp,
                compositeScore: e.breakdown.compositeScore,
                topCategory: e.breakdown.topCategory,
                fg3m: e.breakdown.fg3m,
                fg3a: e.breakdown.fg3a,
                fg3_pct: e.breakdown.fg3_pct,
                secondaryCategory: e.breakdown.secondaryCategory,
                secondaryLabel: e.breakdown.secondaryLabel,
              }}
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
            className="hidden md:flex absolute top-1/2 -translate-y-1/2 left-2 lg:left-4 z-10 items-center justify-center transition-opacity duration-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-100 opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
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
            className="hidden md:flex absolute top-1/2 -translate-y-1/2 right-2 lg:right-4 z-10 items-center justify-center transition-opacity duration-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-100 opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
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
                className="cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
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
