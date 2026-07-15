'use client'
// 미라클모닝 브랜드 — 최근 4주 라운드 요약
// 각 카드 = 1 라운드(=하루). 그 날 참여 팀별 W-L-득실차 요약.
// 하단 2개 버튼으로 분리 (v2 · 2026-07-15):
//   · 박스스코어 → /boxscore/{date}
//   · 득점 하이라이트 → /highlights/{date}
// 팔레트: 노랑/검정/화이트 (mm-* 변수)

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ClipboardList, Film, ArrowRight } from 'lucide-react'

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

function diff(t: { ptsFor: number; ptsAgainst: number }): number {
  return t.ptsFor - t.ptsAgainst
}
function record(t: { wins: number; losses: number; draws: number }): string {
  return t.draws > 0 ? `${t.wins}-${t.losses}-${t.draws}` : `${t.wins}-${t.losses}`
}

export default function NbaRoundsSummary({ rounds, leagueId, orgSlug }: Props) {
  const params = useParams<{ orgSlug?: string; org?: string }>()
  const resolvedOrgSlug = orgSlug ?? params?.orgSlug ?? params?.org ?? ''
  if (rounds.length === 0) return null

  return (
    <>
      <section
        data-tour="rounds"
        className="mm-brand"
        style={{
          background: 'var(--mm-panel-alt)',
          border: '1px solid var(--mm-rule)',
          borderTop: 0,
        }}
      >
        <header
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 sm:px-6 md:px-10 py-4 md:py-5"
          style={{ borderBottom: '1px solid var(--mm-rule)' }}
        >
          <h3
            className="font-jersey font-black uppercase break-keep"
            style={{ color: 'var(--mm-ink)', fontSize: 'clamp(22px, 6vw, 28px)', letterSpacing: '-0.005em', lineHeight: 1.1 }}
          >
            최근 라운드
          </h3>
          <span className="text-[11px] sm:text-[12px] tracking-[0.14em] sm:tracking-[0.18em] uppercase font-bold break-keep" style={{ color: 'var(--mm-muted)' }}>
            최근 {rounds.length}주 · 하루 = 1라운드
          </span>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-4 sm:px-6 md:px-8 lg:px-10 pt-4 sm:pt-6 md:pt-8 lg:pt-10 pb-0">
          {rounds.map(r => {
            const topTeam = r.teams[0]
            const base = `/league/${resolvedOrgSlug}/${leagueId}`
            return (
              <div
                key={r.date}
                className="text-left transition-shadow duration-200 hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.25)]"
                style={{
                  background: 'var(--mm-panel)',
                  border: '1px solid var(--mm-rule)',
                  padding: '18px 20px 16px',
                }}
              >
                {/* 헤더 — 날짜 + 경기 수 */}
                <div className="flex items-baseline justify-between gap-2 mb-4 pb-3" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                  <div className="min-w-0">
                    <div className="font-jersey font-black uppercase break-keep" style={{ color: 'var(--mm-ink)', fontSize: '22px', letterSpacing: '-0.005em', lineHeight: 1.1 }}>
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
                        background: 'var(--mm-yellow)',
                        color: 'var(--mm-black)',
                        padding: '3px 8px',
                        maxWidth: '55%',
                        lineHeight: 1.2,
                      }}
                    >
                      1위 {topTeam.name}
                    </span>
                  )}
                </div>

                {/* 팀 리스트 */}
                <ul className="space-y-2">
                  {r.teams.slice(0, 4).map((t, idx) => {
                    const d = diff(t)
                    const isTop = idx === 0
                    const shownCount = Math.min(4, r.teams.length)
                    return (
                      <li
                        key={t.key}
                        className="grid gap-2.5 items-center"
                        style={{
                          gridTemplateColumns: '8px 1fr auto auto',
                          padding: '5px 0',
                          borderBottom: idx < shownCount - 1 ? '1px dashed var(--mm-rule)' : 'none',
                        }}
                      >
                        <span
                          className="block h-5 rounded-sm"
                          style={{ background: t.color }}
                          aria-hidden
                        />
                        <span
                          className={`min-w-0 break-keep ${isTop ? 'font-black' : 'font-bold'}`}
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
                        <span
                          className="font-jersey font-black tabular-nums"
                          style={{ color: isTop ? 'var(--mm-yellow-strong)' : 'var(--mm-ink)', fontSize: '16px' }}
                        >
                          {record(t)}
                        </span>
                        <span
                          className="font-black tabular-nums"
                          style={{
                            color: d > 0 ? '#059669' : d < 0 ? '#DC2626' : 'var(--mm-muted)',
                            fontSize: '13px',
                            minWidth: '44px',
                            textAlign: 'right',
                          }}
                        >
                          {d > 0 ? `+${d}` : d}
                        </span>
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
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 text-[11px] font-black tracking-[0.14em] uppercase cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
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
                  <Link
                    href={`${base}/highlights/${r.date}`}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 text-[11px] font-black tracking-[0.14em] uppercase cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                    style={{
                      background: 'var(--mm-yellow)',
                      color: 'var(--mm-black)',
                      border: '1px solid var(--mm-black)',
                      borderRadius: '4px',
                    }}
                    aria-label={`${r.weekLabel} 득점 하이라이트 재생`}
                  >
                    <Film size={13} aria-hidden />
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
            className="mm-brand inline-flex items-center justify-center gap-2 font-jersey font-black uppercase min-h-[44px] px-6 sm:px-8 py-3 tracking-[0.14em] text-[13px] sm:text-[14px] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)] focus-visible:ring-offset-2 hover:brightness-95"
            style={{
              background: 'var(--mm-yellow)',
              color: 'var(--mm-black)',
              border: '2px solid var(--mm-black)',
              borderRadius: '4px',
              boxShadow: '0 4px 0 var(--mm-black)',
            }}
            aria-label="전체 라운드 하이라이트 보기"
          >
            전체 라운드 하이라이트 보기
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </section>
    </>
  )
}
