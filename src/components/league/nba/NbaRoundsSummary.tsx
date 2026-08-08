'use client'
// 미라클모닝 브랜드 — 최근 4주 라운드 요약
// 각 카드 = 1 라운드(=하루). 그 날 참여 팀별 W-L-득실차 요약.
// 하단 2개 버튼으로 분리 (v2 · 2026-07-15):
//   · 박스스코어 → /boxscore/{date}
//   · 득점 하이라이트 → /highlights/{date}
// 팔레트: 노랑/검정/화이트 (mm-* 변수)

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ClipboardList, PlayCircle, ArrowRight } from 'lucide-react'
import { ResultChips, ScoreTable } from './RecordDisplay'
import SectionCard from '@/components/league/ui/SectionCard'

export type RoundTeamSummary = {
  key: string
  name: string
  color: string
  wins: number
  losses: number
  draws: number
  ptsFor: number
  ptsAgainst: number
}
export type RoundSummary = {
  date: string
  weekLabel: string
  gamesCount: number
  teams: RoundTeamSummary[]
}

type Props = {
  rounds: RoundSummary[]
  leagueId: string
  /** 명시적 orgSlug — 없으면 useParams 로 조회 */
  orgSlug?: string
}

export default function NbaRoundsSummary({ rounds, leagueId, orgSlug }: Props) {
  const params = useParams<{ orgSlug?: string; org?: string }>()
  const resolvedOrgSlug = orgSlug ?? params?.orgSlug ?? params?.org ?? ''
  if (rounds.length === 0) return null

  return (
    <>
      <SectionCard variant="stack" background="var(--mm-panel-alt)">
        <header
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 sm:px-6 md:px-10 py-4 md:py-5"
          style={{ borderBottom: '1px solid var(--mm-rule)' }}
        >
          <h3
            className="font-bold break-keep"
            style={{ color: 'var(--mm-ink)', fontSize: 'clamp(22px, 6vw, 28px)', letterSpacing: '-0.005em', lineHeight: 1.1 }}
          >
            최근 라운드
          </h3>
          <span className="text-[11px] sm:text-[12px] tracking-[0.14em] sm:tracking-[0.18em] uppercase font-bold break-keep" style={{ color: 'var(--mm-muted)' }}>
            최근 {rounds.length}주 · 하루 = 1라운드
          </span>
        </header>

        {/* 모바일: 가로 스와이프 (flex+snap) · sm+: CSS grid (2열/4열 · sub-pixel 안정) */}
        <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 items-stretch overflow-x-auto sm:overflow-visible snap-x snap-mandatory sm:snap-none scrollbar-hide gap-4 px-4 sm:px-6 md:px-8 lg:px-10 pt-4 sm:pt-6 md:pt-8 lg:pt-10 pb-0">
          {rounds.map(r => {
            const topTeam = r.teams[0]
            const base = `/league/${resolvedOrgSlug}/${leagueId}`
            return (
              <div
                key={r.date}
                className="snap-start shrink-0 basis-[85%] sm:basis-auto sm:shrink text-left flex flex-col h-full"
                style={{
                  background: 'var(--mm-panel)',
                  border: '1px solid var(--mm-rule)',
                  padding: '18px 20px 16px',
                }}
              >
                {/* 헤더 — 날짜 + 경기 수 */}
                <div className="flex items-baseline justify-between gap-2 mb-4 pb-3" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                  <div className="min-w-0">
                    <div className="font-bold break-keep" style={{ color: 'var(--mm-ink)', fontSize: '22px', letterSpacing: '-0.005em', lineHeight: 1.1 }}>
                      {r.weekLabel}
                    </div>
                    <div className="text-[11px] tracking-[0.16em] uppercase font-bold mt-1" style={{ color: 'var(--mm-muted)' }}>
                      {r.gamesCount}경기 진행
                    </div>
                  </div>
                  {topTeam && (
                    <span
                      className="text-[11px] font-black tracking-[0.14em] uppercase shrink-0 break-keep"
                      style={{
                        background: 'var(--mm-yellow-soft)',
                        color: 'var(--mm-ink)',
                        border: '1px solid var(--mm-yellow-strong)',
                        borderRadius: '3px',
                        padding: '3px 8px',
                        maxWidth: '55%',
                        lineHeight: 1.2,
                      }}
                    >
                      1위 {topTeam.name}
                    </span>
                  )}
                </div>

                {/* 팀 리스트 · 각 팀당 세로 3단 (팀 헤더 + WIN/LOSE/DRAW 칩 + 득실 미니테이블)
                    flex-1 로 남는 세로 공간을 흡수 → 아래 액션 버튼이 카드 하단에 정렬(등높이 카드 간 일직선) */}
                <ul className="space-y-3 flex-1">
                  {r.teams.slice(0, 4).map((t, idx) => {
                    const shownCount = Math.min(4, r.teams.length)
                    return (
                      <li
                        key={t.key}
                        className="flex flex-col gap-1.5"
                        style={{
                          paddingBottom: idx < shownCount - 1 ? '10px' : '0',
                          borderBottom: idx < shownCount - 1 ? '1px dashed var(--mm-rule)' : 'none',
                        }}
                      >
                        {/* 팀 헤더 (컬러 바 + 이름) */}
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="shrink-0 block h-5 w-2 rounded-sm"
                            style={{ background: t.color }}
                            aria-hidden
                          />
                          <span
                            className="min-w-0 flex-1 font-black break-keep"
                            style={{
                              color: 'var(--mm-ink)',
                              fontSize: '15px',
                              lineHeight: 1.2,
                              wordBreak: 'break-word',
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {t.name}
                          </span>
                        </div>
                        {/* WIN/LOSE/DRAW 칩 (compact) */}
                        <div className="flex flex-wrap gap-1.5">
                          <ResultChips wins={t.wins} losses={t.losses} draws={t.draws} compact />
                        </div>
                        {/* 득실 미니 테이블 */}
                        <ScoreTable ptsFor={t.ptsFor} ptsAgainst={t.ptsAgainst} compact />
                      </li>
                    )
                  })}
                </ul>

                {/* 하단 액션 버튼 2개 · 박스스코어 · 하이라이트 */}
                <div
                  className="mt-4 pt-3 grid grid-cols-2 gap-2"
                  style={{ borderTop: '1px dashed var(--mm-rule)' }}
                >
                  <Link
                    href={`${base}/boxscore/${r.date}`}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 text-[11px] font-black tracking-[0.14em] uppercase cursor-pointer transition-all duration-200 hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-1"
                    style={{
                      background: 'var(--mm-panel-alt)',
                      color: 'var(--mm-ink)',
                      border: '1px solid var(--mm-rule)',
                      borderRadius: '4px',
                    }}
                    aria-label={`${r.weekLabel} 박스스코어 보기`}
                  >
                    <ClipboardList size={13} aria-hidden />
                    박스스코어
                  </Link>
                  {/* 영상 재생 CTA — 브랜드 주황(hoop-orange)으로 강조 · 검정 텍스트(WCAG AA 5.9:1)
                      hover 밝기 · active 눌림 · focus 링 · 200ms */}
                  <Link
                    href={`${base}/highlights/${r.date}`}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 text-[11px] font-black tracking-[0.14em] uppercase cursor-pointer transition-all duration-200 hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-hoop-orange-500)] focus-visible:ring-offset-1"
                    style={{
                      background: 'var(--color-hoop-orange-500)',
                      color: 'var(--mm-black)',
                      border: '1px solid var(--color-hoop-orange-500)',
                      borderRadius: '4px',
                      boxShadow: '0 2px 8px -3px rgba(234,88,12,0.55)',
                    }}
                    aria-label={`${r.weekLabel} 득점 하이라이트 재생`}
                  >
                    <PlayCircle size={14} aria-hidden />
                    하이라이트
                  </Link>
                </div>
              </div>
            )
          })}
        </div>

        {/* 전체 라운드 하이라이트 CTA — 노랑 배경 · 검정 텍스트 */}
        <div className="px-4 sm:px-6 md:px-8 lg:px-10 py-5 md:py-6 flex justify-center">
          <Link
            href={`/league/${resolvedOrgSlug}/${leagueId}/highlights`}
            className="mm-brand inline-flex items-center justify-center gap-2 font-bold min-h-[44px] px-6 sm:px-8 py-3 text-[13px] sm:text-[14px] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)] focus-visible:ring-offset-2 hover:brightness-95"
            style={{
              background: 'var(--mm-ink)',
              color: 'var(--mm-panel)',
              border: '2px solid var(--mm-ink)',
              borderRadius: '4px',
              boxShadow: '0 4px 0 var(--mm-yellow-strong)',
            }}
            aria-label="전체 라운드 하이라이트 보기"
          >
            전체 라운드 하이라이트 보기
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </SectionCard>
    </>
  )
}
