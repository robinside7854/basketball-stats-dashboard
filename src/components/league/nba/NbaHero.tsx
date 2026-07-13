'use client'
// 미라클모닝 브랜드 히어로 — Player of the Week (v3)
// 팔레트: 노랑/검정/화이트 (mm-* 변수).
//
// 색 대비 절대 규칙:
//   · 노랑 배경 위 텍스트 = 검정(rgba(0,0,0,0.6~1))
//   · 검정/흰 배경 위 accent 라벨 = --mm-yellow-strong
//
// 좌: 헤드라인 + 아바타(140px) + 이름(72px) 대형화, 전체가 button (클릭 → PlayerQuickView)
// 우: 큰 숫자(총 득점) + 라운드별 세로 막대 차트 + 3열 지표

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'

// 히어로 CTA(플레이어 이름/아바타) 클릭 시에만 열리는 모달 — 초기 홈 번들에서 분리
const PlayerQuickViewModal = dynamic(() => import('@/components/league/PlayerQuickViewModal'), { ssr: false })

export type NbaHeroData = {
  playerId: string
  name: string
  number: number | null
  pts: number
  gp: number
  rd: number
  ppr: number
  photoUrl?: string | null
  // 카테고리별 라운드 값 시리즈 — sparkline 이 우세 지표(예: 리바운드/스틸)일 때
  // pts 만 그리면 흐름이 왜곡되므로 전 카테고리 값을 함께 담아 UI가 선택 렌더링.
  roundSeries?: Array<{
    date: string
    pts: number
    reb: number
    ast: number
    stl: number
    blk: number
    ts_pct: number
    clutch: number
  }>
  teamName?: string | null
} | null

export type HeroBreakdown = {
  ts_pct: number
  reb: number
  stl: number
  blk: number
  ast: number
  clutchPts: number  // 클러치 상황 총 득점
  clutchGp: number   // 클러치 상황 경험 게임 수
  compositeScore: number
  topCategory: 'volume' | 'efficiency' | 'reb' | 'stl' | 'blk' | 'ast' | 'clutch'
  // NEW · 3점 지표 (변원식 케이스 · 볼륨 + 3점 폭격 스토리)
  fg3m?: number      // 3점 성공
  fg3a?: number      // 3점 시도
  fg3_pct?: number   // 3점 성공률
  // NEW · 2번째 우세 카테고리 (동적 서브 지표 · UI 는 별도 Agent 담당)
  secondaryCategory?: 'volume' | 'efficiency' | 'reb' | 'stl' | 'blk' | 'ast' | 'clutch' | 'three'
  secondaryLabel?: string  // 예: "3점 8/12" · "리바운드 10개"
}

type Props = {
  data: NbaHeroData
  rangeLabel: string
  leagueId: string
  headline?: string           // 자동 생성 스토리 코멘트 (뉴스 헤드라인 톤)
  breakdown?: HeroBreakdown   // 지표 브레이크다운 · 우세 카테고리 강조
  // Above-fold 최적화 · 캐러셀 첫 슬라이드에서만 true(LCP 후보)
  // priority=true 시 next/image priority + preload, false 는 lazy 로드
  priority?: boolean
}

function initials(name: string): string {
  return name.slice(0, 2)
}
function shortDate(iso: string): string {
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
}

// 2번째 우세 카테고리 → 서브 배지 라벨 매핑 (지배 방법 · 예: 3점 폭격 → SNIPER)
// 메인 배지(SCORING KING 등)와 함께 병기되어 "어떻게 지배했는지" 스토리를 보강.
const SECONDARY_BADGE_LABEL: Record<string, string> = {
  three: 'SNIPER',        // 3점 폭격
  reb: 'GLASS CLEANER',   // 리바운드
  stl: 'PICKPOCKET',      // 스틸
  blk: 'RIM PROTECTOR',   // 블락
  ast: 'PLAYMAKER',       // 어시스트
  efficiency: 'EFFICIENT',
  clutch: 'CLUTCH',
  volume: 'SCORER',
}

// 우세 카테고리별 노출 정보 매핑 — 매 라운드 우세 지표에 따라 UI 가 다르게 노출됨.
// 이전 구현은 항상 pts 를 메인으로 노출했으나, POTW 는 종합 임팩트 선정이므로
// 우세 카테고리(volume/efficiency/reb/stl/blk/ast/win)에 맞춰 큰 숫자·헤드라인·라벨 모두 스왑.
type MainMetric = {
  value: string          // 큰 숫자 표시 값 (문자열 · 백분율 포함)
  unit: string           // 큰 숫자 옆 uppercase 라벨 (PTS/REB/STL 등)
  panelLabel: string     // 노랑 패널 상단 라벨 ("이 라운드 X" 형태)
  hero: string           // 좌측 h1 강조 부분 ("골든 위크" · "리바운드 지배" 등)
  badge: string          // 좌측 상단 배지 (SCORING KING 등)
  copyLead: string       // 좌측 서브 카피 첫 부분 ("이번 라운드 리바운드 15개")
}

function mainMetricFor(
  data: NonNullable<NbaHeroData>,
  b: HeroBreakdown,
): MainMetric {
  switch (b.topCategory) {
    case 'reb':
      return {
        value: String(b.reb), unit: 'REB',
        panelLabel: '이 라운드 리바운드',
        hero: '리바운드 지배', badge: 'REBOUND KING',
        copyLead: `이번 라운드 리바운드 ${b.reb}개`,
      }
    case 'stl':
      return {
        value: String(b.stl), unit: 'STL',
        panelLabel: '이 라운드 스틸',
        hero: '수비 잠금', badge: 'DEFENSIVE STOPPER',
        copyLead: `이번 라운드 스틸 ${b.stl}개`,
      }
    case 'blk':
      return {
        value: String(b.blk), unit: 'BLK',
        panelLabel: '이 라운드 블락',
        hero: '림 프로텍터', badge: 'RIM PROTECTOR',
        copyLead: `이번 라운드 블락 ${b.blk}개`,
      }
    case 'ast':
      return {
        value: String(b.ast), unit: 'AST',
        panelLabel: '이 라운드 어시스트',
        hero: '코트 지휘', badge: 'PLAYMAKER',
        copyLead: `이번 라운드 어시스트 ${b.ast}개`,
      }
    case 'efficiency':
      return {
        value: b.ts_pct > 0 ? b.ts_pct.toFixed(0) : '—',
        unit: 'TS%',
        panelLabel: '이 라운드 슈팅 효율',
        hero: '초효율 정조준', badge: 'EFFICIENCY KING',
        copyLead: `이번 라운드 TS ${b.ts_pct > 0 ? b.ts_pct.toFixed(0) : '—'}%`,
      }
    case 'clutch':
      return {
        value: String(b.clutchPts), unit: 'CLUTCH',
        panelLabel: '이 라운드 클러치 득점',
        hero: '접전의 왕', badge: 'CLUTCH LEADER',
        copyLead: `이번 라운드 클러치 상황 ${b.clutchPts}점 (${b.clutchGp}경기)`,
      }
    default:  // volume
      return {
        value: String(data.pts), unit: 'PTS',
        panelLabel: '이 라운드 총 득점',
        hero: '골든 위크', badge: 'SCORING KING',
        copyLead: `이번 라운드 ${data.pts}점 폭발`,
      }
  }
}

// 카테고리별 sparkline 값 선택 — POTW 우세 지표에 따라 라운드 흐름이 다른 지표로 렌더됨
// (기존은 항상 pts 만 표시해 리바운드/스틸 왕이 선정돼도 득점 흐름이 나와 데이터 불일치)
type SeriesItem = {
  date: string
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
  ts_pct: number
  clutch: number
}
type RoundCategory = HeroBreakdown['topCategory']

function pickSeriesValue(s: SeriesItem, category: RoundCategory): number {
  switch (category) {
    case 'reb': return s.reb
    case 'ast': return s.ast
    case 'stl': return s.stl
    case 'blk': return s.blk
    case 'efficiency': return s.ts_pct
    case 'clutch': return s.clutch
    default: return s.pts  // volume
  }
}

function formatSeriesValue(v: number, category: RoundCategory): string {
  if (category === 'efficiency') return v > 0 ? v.toFixed(1) : '—'
  return String(Math.round(v))
}

function RoundBars({
  series,
  category,
}: {
  series: SeriesItem[]
  category: RoundCategory
}) {
  if (series.length === 0) return null
  const shown = series.slice(-6)
  const values = shown.map(s => pickSeriesValue(s, category))
  const max = Math.max(...values, category === 'efficiency' ? 0.01 : 1)
  return (
    <div
      className="grid gap-2 items-end"
      style={{ gridTemplateColumns: `repeat(${shown.length}, 1fr)`, minHeight: '120px' }}
    >
      {shown.map((s, i) => {
        const v = values[i]
        const heightPct = Math.max(6, (v / max) * 100)
        const isMax = v === max && values.filter(x => x === max).length === 1 && v > 0
        return (
          <div key={s.date} className="flex flex-col items-center gap-1.5">
            <span
              className="font-jersey text-[18px] sm:text-[22px] font-black tabular-nums leading-none"
              style={{ color: 'var(--mm-black)' }}
            >
              {formatSeriesValue(v, category)}
            </span>
            <div className="w-full flex items-end" style={{ height: '68px' }}>
              <div
                className="w-full"
                style={{
                  height: `${heightPct}%`,
                  background: isMax ? 'var(--mm-black)' : 'rgba(0,0,0,0.70)',
                  minHeight: '4px',
                }}
                aria-hidden
              />
            </div>
            <span
              className="text-[10px] font-bold tabular-nums leading-none"
              style={{ color: 'rgba(0,0,0,0.60)' }}
            >
              {shortDate(s.date)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// 우세 카테고리별 sparkline 라벨 세트 — 헤더/평균 문구를 스왑
function metricLabelFor(category: RoundCategory): {
  headerLabel: string     // "라운드별 득점" 형태 (헤더 우측 label)
  headerFlow: string      // "득점 흐름" 형태 (헤더 좌측 문구)
  avgFormat: (v: number) => string
  avgUnit: string
} {
  switch (category) {
    case 'reb':
      return { headerLabel: '라운드별 리바운드', headerFlow: '리바운드 흐름', avgFormat: v => v.toFixed(1), avgUnit: 'REB' }
    case 'ast':
      return { headerLabel: '라운드별 어시스트', headerFlow: '어시스트 흐름', avgFormat: v => v.toFixed(1), avgUnit: 'AST' }
    case 'stl':
      return { headerLabel: '라운드별 스틸', headerFlow: '스틸 흐름', avgFormat: v => v.toFixed(1), avgUnit: 'STL' }
    case 'blk':
      return { headerLabel: '라운드별 블락', headerFlow: '블락 흐름', avgFormat: v => v.toFixed(1), avgUnit: 'BLK' }
    case 'efficiency':
      return { headerLabel: '라운드별 TS%', headerFlow: 'TS% 흐름', avgFormat: v => v.toFixed(1), avgUnit: '%' }
    case 'clutch':
      return { headerLabel: '라운드별 클러치 득점', headerFlow: '클러치 득점 흐름', avgFormat: v => v.toFixed(1), avgUnit: 'CLT' }
    default:
      return { headerLabel: '라운드별 득점', headerFlow: '득점 흐름', avgFormat: v => v.toFixed(1), avgUnit: 'PTS' }
  }
}

export default function NbaHero({ data, rangeLabel, leagueId, headline, breakdown, priority = false }: Props) {
  const [openQuickView, setOpenQuickView] = useState(false)
  if (!data) return null
  const showTrend = (data.roundSeries?.length ?? 0) >= 2
  // 우세 카테고리별 메인 지표 매핑 (breakdown 없으면 볼륨 fallback)
  const metric: MainMetric = breakdown
    ? mainMetricFor(data, breakdown)
    : { value: String(data.pts), unit: 'PTS', panelLabel: '이 라운드 총 득점', hero: '골든 위크', badge: 'SCORING KING', copyLead: `이번 라운드 ${data.pts}점` }

  return (
    <>
      <article
        className="mm-brand grid md:grid-cols-[1.4fr_1fr]"
        style={{
          background: 'var(--mm-panel)',
          color: 'var(--mm-ink)',
          border: '1px solid var(--mm-rule)',
        }}
      >
        {/* ===== 좌: 클릭 가능한 히어로 (선수 카드 열기) ===== */}
        <button
          type="button"
          onClick={() => setOpenQuickView(true)}
          aria-label={`${data.name} 프로필 카드 열기`}
          className="text-left group/hero relative transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1 p-5 sm:p-8 md:p-10"
          style={{
            paddingBlockEnd: undefined,
            borderRight: '1px solid var(--mm-rule)',
            color: 'var(--mm-ink)',
          }}
        >
          {/* 좌측 accent bar (hover 시 노랑) */}
          <span
            aria-hidden
            className="absolute left-0 top-4 bottom-4 w-1 opacity-0 group-hover/hero:opacity-100 transition-opacity duration-200"
            style={{ background: 'var(--mm-yellow)' }}
          />

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
            <p
              className="text-[12px] font-black tracking-[0.22em] uppercase"
              style={{ color: 'var(--mm-yellow-strong)' }}
            >
              Player of the Week
            </p>
            <span
              className="text-[10px] font-black tracking-[0.20em] uppercase"
              style={{
                color: 'var(--mm-black)',
                background: 'var(--mm-yellow)',
                padding: '2px 8px',
              }}
            >
              {metric.badge}
            </span>
          </div>

          <h1
            className="font-jersey font-black leading-[0.95] uppercase mb-3"
            style={{
              fontSize: 'clamp(40px, 6.5vw, 68px)',
              letterSpacing: '-0.015em',
              color: 'var(--mm-ink)',
              textWrap: 'balance',
            }}
          >
            {data.name}의{' '}
            <span
              style={{
                background: 'var(--mm-yellow)',
                color: 'var(--mm-black)',
                padding: '0 10px',
                display: 'inline-block',
              }}
            >
              {metric.hero}
            </span>
          </h1>

          {/* 자동 스토리 헤드라인 (뉴스 톤) — 우세 카테고리 기반 */}
          {headline && (
            <p
              className="font-jersey uppercase mb-4"
              style={{
                fontSize: 'clamp(16px, 2.2vw, 22px)',
                fontWeight: 900,
                letterSpacing: '-0.005em',
                lineHeight: 1.25,
                color: 'var(--mm-ink)',
                borderLeft: '4px solid var(--mm-yellow)',
                paddingLeft: '12px',
                textWrap: 'balance',
              }}
            >
              {headline}
            </p>
          )}
          <p className="text-[14px] leading-relaxed mb-5" style={{ color: 'var(--mm-ink-soft)' }}>
            <strong style={{ color: 'var(--mm-ink)', fontSize: '1.05em' }}>{metric.copyLead}</strong>
            {/* 우세 카테고리가 볼륨이 아니면 총 득점도 참고로 병기 */}
            {breakdown && breakdown.topCategory !== 'volume' && data.pts > 0 && (
              <>{' '}· {data.pts}점</>
            )}
          </p>

          {/* 아바타 + 이름 — 대형화 (여백 최소) */}
          <div className="flex items-center gap-4 sm:gap-6">
            <div
              className="shrink-0 rounded-full overflow-hidden flex items-center justify-center font-jersey font-black transition-transform duration-200 group-hover/hero:scale-[1.03] relative"
              style={{
                width: 'clamp(80px, 22vw, 140px)',
                height: 'clamp(80px, 22vw, 140px)',
                background: 'var(--mm-panel-alt)',
                border: '4px solid var(--mm-yellow)',
                color: 'var(--mm-ink)',
                fontSize: '40px',
              }}
            >
              {data.photoUrl ? (
                // next/image · LCP 후보(첫 슬라이드) 만 priority · 나머지는 lazy
                // sizes = 컨테이너 clamp(80px, 22vw, 140px) 근사 → 옵티마이저가 3배 밀도 대응
                <Image
                  src={data.photoUrl}
                  alt={data.name}
                  fill
                  sizes="(max-width: 640px) 22vw, 140px"
                  priority={priority}
                  className="object-cover object-top"
                />
              ) : (
                <span>{initials(data.name)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="font-jersey font-black uppercase break-keep group-hover/hero:underline underline-offset-4 decoration-[3px]"
                style={{
                  color: 'var(--mm-ink)',
                  fontSize: 'clamp(32px, 8.5vw, 72px)',
                  letterSpacing: '-0.015em',
                  lineHeight: '1',
                  textDecorationColor: 'var(--mm-yellow)',
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                }}
              >
                {data.name}
                {data.number != null && (
                  <span
                    className="font-sans font-black ml-3 align-baseline"
                    style={{ color: 'var(--mm-muted)', fontSize: '0.45em' }}
                  >
                    #{data.number}
                  </span>
                )}
              </div>
              <div
                className="text-[12px] sm:text-[13px] tracking-[0.14em] sm:tracking-[0.16em] uppercase font-black mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 break-keep"
                style={{ color: 'var(--mm-muted)' }}
              >
                <span className="break-keep">
                  {data.teamName ? `${data.teamName} · ` : ''}{rangeLabel}
                </span>
                <span
                  className="text-[11px] tracking-[0.14em] transition-opacity duration-200 group-hover/hero:opacity-100 opacity-70"
                  style={{ color: 'var(--mm-yellow-strong)' }}
                >
                  카드 열기 →
                </span>
              </div>
            </div>
          </div>
        </button>

        {/* ===== 우: 노랑 패널 - 큰 숫자 + 막대 차트 ===== */}
        <aside
          className="p-5 sm:p-8 md:p-10"
          style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)' }}
        >
          <div
            className="text-[11px] sm:text-[12px] font-black tracking-[0.18em] sm:tracking-[0.22em] uppercase break-keep"
            style={{ color: 'rgba(0,0,0,0.75)' }}
          >
            {metric.panelLabel}
          </div>

          <div
            className="font-jersey leading-[0.85] tabular-nums mt-2"
            style={{
              fontSize: 'clamp(72px, 22vw, 140px)',
              letterSpacing: '-0.025em',
              fontWeight: 900,
              color: 'var(--mm-black)',
            }}
          >
            {metric.value}
            <span
              className="text-[26px] tracking-[0.16em] ml-2 font-sans font-black align-baseline"
              style={{ color: 'rgba(0,0,0,0.75)' }}
            >
              {metric.unit}
            </span>
          </div>

          {/* 서브 지표 라인 — "어떻게 지배했는지" 두번째 스토리 (예: 32점 볼륨 + 3점 8/12 SNIPER)
              조건: secondaryLabel 존재 AND topCategory !== secondaryCategory (중복 방지) */}
          {breakdown?.secondaryCategory &&
            breakdown?.secondaryLabel &&
            breakdown.topCategory !== breakdown.secondaryCategory && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span
                  className="tabular-nums"
                  style={{
                    fontSize: 'clamp(14px, 3vw, 16px)',
                    fontWeight: 800,
                    letterSpacing: '-0.005em',
                    color: 'rgba(0,0,0,0.78)',
                    lineHeight: 1.2,
                  }}
                >
                  {breakdown.secondaryLabel}
                </span>
                <span
                  className="font-jersey font-black uppercase inline-flex items-center"
                  style={{
                    fontSize: 'clamp(11px, 2.4vw, 13px)',
                    letterSpacing: '0.14em',
                    color: 'var(--mm-black)',
                    background: 'transparent',
                    border: '1.5px solid var(--mm-black)',
                    padding: '3px 8px',
                    lineHeight: 1,
                  }}
                >
                  {SECONDARY_BADGE_LABEL[breakdown.secondaryCategory] ??
                    String(breakdown.secondaryCategory).toUpperCase()}
                </span>
              </div>
            )}

          {/* 최근 N주 흐름 sparkline — 우세 카테고리별 값 스왑 (득점/리바운드/스틸/블락/어시스트/TS%/클러치) */}
          {showTrend ? (() => {
            const cat: RoundCategory = breakdown?.topCategory ?? 'volume'
            const labels = metricLabelFor(cat)
            const series = data.roundSeries!
            const vals = series.map(s => pickSeriesValue(s, cat))
            const avgRaw = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
            return (
              <div className="mt-6 pt-5" style={{ borderTop: '2px solid rgba(0,0,0,0.15)' }}>
                <div
                  className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 mb-3"
                >
                  <span
                    className="text-[11px] sm:text-[12px] font-black tracking-[0.18em] sm:tracking-[0.22em] uppercase break-keep"
                    style={{ color: 'rgba(0,0,0,0.75)' }}
                  >
                    최근 {series.length}주 {labels.headerFlow}
                  </span>
                  <span
                    className="text-[10px] sm:text-[11px] font-black tracking-[0.14em] sm:tracking-[0.16em] uppercase break-keep"
                    style={{ color: 'rgba(0,0,0,0.55)' }}
                  >
                    평균 {labels.avgFormat(avgRaw)} {labels.avgUnit}
                  </span>
                </div>
                <RoundBars series={series} category={cat} />
              </div>
            )
          })() : (
            <div
              className="mt-6 pt-5 text-[12px] font-black tracking-[0.22em] uppercase"
              style={{ borderTop: '2px solid rgba(0,0,0,0.15)', color: 'rgba(0,0,0,0.55)' }}
            >
              첫 라운드 · 다음 라운드부터 흐름 표시
            </div>
          )}

          {/* 지표 브레이크다운 · 우세 카테고리 강조 (7열: PTS/TS%/REB/AST/STL/BLK/CLT) */}
          {breakdown && (
            <div
              className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 mt-5 pt-4"
              style={{ borderTop: '2px solid rgba(0,0,0,0.15)' }}
            >
              {(() => {
                const items: Array<{ key: HeroBreakdown['topCategory']; label: string; value: string }> = [
                  { key: 'volume',     label: 'PTS', value: String(data.pts) },
                  { key: 'efficiency', label: 'TS%', value: breakdown.ts_pct > 0 ? `${breakdown.ts_pct.toFixed(0)}%` : '—' },
                  { key: 'reb',        label: 'REB', value: String(breakdown.reb) },
                  { key: 'ast',        label: 'AST', value: String(breakdown.ast) },
                  { key: 'stl',        label: 'STL', value: String(breakdown.stl) },
                  { key: 'blk',        label: 'BLK', value: String(breakdown.blk) },
                  { key: 'clutch',     label: 'CLT', value: String(breakdown.clutchPts) },
                ]
                return items.map(it => {
                  const isTop = breakdown.topCategory === it.key
                  return (
                    <div
                      key={it.key}
                      className="text-[10px] tracking-[0.16em] uppercase font-black text-center py-1"
                      style={{
                        color: isTop ? 'var(--mm-black)' : 'rgba(0,0,0,0.55)',
                        background: isTop ? 'rgba(0,0,0,0.10)' : 'transparent',
                        border: isTop ? '1.5px solid var(--mm-black)' : '1.5px solid transparent',
                      }}
                    >
                      {it.label}
                      <strong
                        className="block font-jersey tabular-nums font-black leading-none mt-0.5"
                        style={{
                          color: isTop ? 'var(--mm-black)' : 'rgba(0,0,0,0.75)',
                          fontSize: '18px',
                        }}
                      >
                        {it.value}
                      </strong>
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </aside>
      </article>

      {openQuickView && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={data.playerId}
          playerName={data.name}
          onClose={() => setOpenQuickView(false)}
        />
      )}
    </>
  )
}
