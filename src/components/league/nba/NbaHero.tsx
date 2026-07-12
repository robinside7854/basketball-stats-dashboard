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
import PlayerQuickViewModal from '@/components/league/PlayerQuickViewModal'

export type NbaHeroData = {
  playerId: string
  name: string
  number: number | null
  pts: number
  gp: number
  rd: number
  ppr: number
  photoUrl?: string | null
  roundSeries?: Array<{ date: string; pts: number }>
  teamName?: string | null
} | null

export type HeroBreakdown = {
  ts_pct: number
  reb: number
  stl: number
  blk: number
  ast: number
  wins: number
  losses: number
  compositeScore: number
  topCategory: 'volume' | 'efficiency' | 'reb' | 'stl' | 'blk' | 'ast' | 'win'
}

type Props = {
  data: NbaHeroData
  rangeLabel: string
  leagueId: string
  headline?: string           // 자동 생성 스토리 코멘트 (뉴스 헤드라인 톤)
  breakdown?: HeroBreakdown   // 지표 브레이크다운 · 우세 카테고리 강조
}

function initials(name: string): string {
  return name.slice(0, 2)
}
function shortDate(iso: string): string {
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
}

function RoundBars({ series }: { series: Array<{ date: string; pts: number }> }) {
  if (series.length === 0) return null
  const shown = series.slice(-6)
  const max = Math.max(...shown.map(s => s.pts), 1)
  return (
    <div
      className="grid gap-2 items-end"
      style={{ gridTemplateColumns: `repeat(${shown.length}, 1fr)`, minHeight: '120px' }}
    >
      {shown.map(s => {
        const heightPct = Math.max(6, (s.pts / max) * 100)
        const isMax = s.pts === max && shown.filter(x => x.pts === max).length === 1
        return (
          <div key={s.date} className="flex flex-col items-center gap-1.5">
            <span
              className="font-jersey text-[22px] font-black tabular-nums leading-none"
              style={{ color: 'var(--mm-black)' }}
            >
              {s.pts}
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

export default function NbaHero({ data, rangeLabel, leagueId, headline, breakdown }: Props) {
  const [openQuickView, setOpenQuickView] = useState(false)
  if (!data) return null
  const showTrend = (data.roundSeries?.length ?? 0) >= 2

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

          <p
            className="text-[12px] font-black tracking-[0.22em] uppercase mb-2"
            style={{ color: 'var(--mm-yellow-strong)' }}
          >
            Player of the Week
          </p>

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
              골든 위크
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
            이번 라운드{' '}
            <strong style={{ color: 'var(--mm-ink)', fontSize: '1.05em' }}>{data.pts}점</strong>
            {breakdown && (breakdown.wins + breakdown.losses) > 0 && (
              <>
                {' '}· {breakdown.wins > 0 && <span style={{ color: '#059669', fontWeight: 700 }}>{breakdown.wins}승</span>}
                {breakdown.wins > 0 && breakdown.losses > 0 && ' '}
                {breakdown.losses > 0 && <span style={{ color: '#DC2626', fontWeight: 700 }}>{breakdown.losses}패</span>}
              </>
            )}
            {data.rd > 1 && (
              <>
                {' '}· 최근 {data.rd}주 평균{' '}
                <strong style={{ color: 'var(--mm-ink)', fontSize: '1.05em' }}>{data.ppr.toFixed(1)}점</strong>
              </>
            )}
          </p>

          {/* 아바타 + 이름 — 대형화 (여백 최소) */}
          <div className="flex items-center gap-4 sm:gap-6">
            <div
              className="shrink-0 rounded-full overflow-hidden flex items-center justify-center font-jersey font-black transition-transform duration-200 group-hover/hero:scale-[1.03]"
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
                <img src={data.photoUrl} alt={data.name} className="w-full h-full object-cover object-top" />
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
            이 라운드 총 득점
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
            {data.pts}
            <span
              className="text-[26px] tracking-[0.16em] ml-2 font-sans font-black align-baseline"
              style={{ color: 'rgba(0,0,0,0.75)' }}
            >
              PTS
            </span>
          </div>

          {/* 최근 N주 흐름 sparkline — 사용자 요청 3번: RD=1 무의미 대신 흐름 강조 */}
          {showTrend ? (
            <div className="mt-6 pt-5" style={{ borderTop: '2px solid rgba(0,0,0,0.15)' }}>
              <div
                className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 mb-3"
              >
                <span
                  className="text-[11px] sm:text-[12px] font-black tracking-[0.18em] sm:tracking-[0.22em] uppercase break-keep"
                  style={{ color: 'rgba(0,0,0,0.75)' }}
                >
                  최근 {data.roundSeries!.length}주 흐름
                </span>
                <span
                  className="text-[10px] sm:text-[11px] font-black tracking-[0.14em] sm:tracking-[0.16em] uppercase break-keep"
                  style={{ color: 'rgba(0,0,0,0.55)' }}
                >
                  평균 {data.ppr.toFixed(1)} PTS
                </span>
              </div>
              <RoundBars series={data.roundSeries!} />
            </div>
          ) : (
            <div
              className="mt-6 pt-5 text-[12px] font-black tracking-[0.22em] uppercase"
              style={{ borderTop: '2px solid rgba(0,0,0,0.15)', color: 'rgba(0,0,0,0.55)' }}
            >
              첫 라운드 · 다음 라운드부터 흐름 표시
            </div>
          )}

          {/* 지표 브레이크다운 · 우세 카테고리 강조 */}
          {breakdown && (
            <div
              className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-5 pt-4"
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
