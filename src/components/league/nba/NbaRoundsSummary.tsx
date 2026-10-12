'use client'
// 미라클모닝 브랜드 — 기록이 있는 최근 4라운드 요약
// 각 카드 = 1 라운드(=하루). 그 날 참여 팀별 승패 막대 + 득실 마진 한 줄 요약.
// 하단 2개 버튼으로 분리 (v2 · 2026-07-15):
//   · 박스스코어 → /boxscore/{date}
//   · 득점 하이라이트 → /highlights/{date}
// 팔레트: 노랑/검정/화이트 (mm-* 변수)

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ClipboardList, PlayCircle, ArrowRight } from 'lucide-react'
import { RecordBar, MarginFigure } from '@/components/league/ui/viz'
import SectionCard from '@/components/league/ui/SectionCard'
import { RECENT_ROUNDS } from '@/lib/league/recentRounds'

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
/** 그날의 경기 한 칸 — 홈 「지난 토요일」 타임라인용 (2026-10-12 리뉴얼 2단계).
 *  팀명은 서버가 (team_id, quarter_id) 정체성으로 풀어 둔 값이다. */
export type RoundGame = {
  id: string
  slot_num: number | null
  home: { name: string; color: string } | null
  away: { name: string; color: string } | null
  home_score: number
  away_score: number
  youtube_url: string | null
  youtube_start_offset: number
}
export type RoundSummary = {
  date: string
  weekLabel: string
  gamesCount: number
  teams: RoundTeamSummary[]
  /** 슬롯 순서(1→N). 캐시가 옛 모양일 수 있어 optional */
  games?: RoundGame[]
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
      <SectionCard variant="stack" background="var(--mm-panel-alt)" pad="none">
        <header
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 sm:px-6 md:px-10 py-4 md:py-5"
          style={{ borderBottom: '1px solid var(--mm-rule)' }}
        >
          <h3
            className="font-black break-keep"
            style={{ color: 'var(--mm-ink)', fontSize: 'clamp(22px, 6vw, 28px)', letterSpacing: '-0.005em', lineHeight: 1.1 }}
          >
            최근 라운드
          </h3>
          <span className="t-label break-keep">
            기록이 있는 최근 {RECENT_ROUNDS}라운드 · 하루 = 1라운드
          </span>
        </header>

        {/* 모바일: 가로 스와이프 (flex+snap) · sm+: CSS grid (2열/4열 · sub-pixel 안정) */}
        <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 items-stretch overflow-x-auto sm:overflow-visible snap-x snap-mandatory sm:snap-none scrollbar-hide gap-3 sm:gap-4 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-5 lg:pt-6 pb-0">
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
                  padding: '14px 16px 14px',
                }}
              >
                {/* 헤더 — 날짜 + 경기 수 */}
                <div className="flex items-baseline justify-between gap-2 mb-1 pb-2.5" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                  <div className="min-w-0">
                    {/* 날짜 옆에 경기 수 — 한 줄 아끼기 */}
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-bold break-keep" style={{ color: 'var(--mm-ink)', fontSize: '20px', letterSpacing: '-0.005em', lineHeight: 1.1 }}>
                        {r.weekLabel}
                      </span>
                      <span className="t-label">{r.gamesCount}경기</span>
                    </div>
                  </div>
                  {topTeam && (
                    <span
                      className="t-label shrink-0 break-keep"
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

                {/* 팀 리스트 — 팀당 한 줄 (2026-10-12 재구성).
                    종전엔 팀 이름 / WIN·LOSE 칩 / 득점·실점·마진 3칸 표로 팀당 세 줄이라
                    모바일 카드가 화면을 넘겼다. 이제 [색·이름] [승패 막대] [마진] 한 줄.
                    flex-1 로 남는 세로 공간을 흡수 → 아래 액션 버튼이 카드 하단에 정렬(등높이 카드 간 일직선) */}
                <ul className="flex-1">
                  {r.teams.slice(0, 4).map((t, idx) => {
                    const shownCount = Math.min(4, r.teams.length)
                    return (
                      <li
                        key={t.key}
                        className="py-2"
                        style={{
                          borderBottom: idx < shownCount - 1 ? '1px dashed var(--mm-rule)' : 'none',
                        }}
                      >
                        {/* 1줄: 색·이름 … 마진 / 2줄: 승패 막대(카드 폭 전체).
                            한 줄에 다 넣었더니 PC 4칸 카드에서 막대가 좁아 「무」 칸이 잘렸다(2026-10-12). */}
                        <div className="flex items-center gap-2">
                          <span
                            className="shrink-0 block h-4 w-1.5 rounded-sm"
                            style={{ background: t.color, border: '1px solid var(--mm-rule)' }}
                            aria-hidden
                          />
                          <span
                            className="min-w-0 flex-1 font-black break-keep text-sm sm:text-base truncate"
                            style={{ color: 'var(--mm-ink)', lineHeight: 1.2 }}
                            title={t.name}
                          >
                            {t.name}
                          </span>
                          <MarginFigure ptsFor={t.ptsFor} ptsAgainst={t.ptsAgainst} size="sm" />
                        </div>
                        <div className="mt-1.5 pl-3.5">
                          <RecordBar wins={t.wins} losses={t.losses} draws={t.draws} height={20} />
                        </div>
                      </li>
                    )
                  })}
                </ul>

                {/* 하단 액션 버튼 2개 · 박스스코어 · 하이라이트 */}
                <div
                  className="mt-2 pt-3 grid grid-cols-2 gap-2"
                  style={{ borderTop: '1px dashed var(--mm-rule)' }}
                >
                  <Link
                    href={`${base}/boxscore/${r.date}`}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 text-sm font-black whitespace-nowrap cursor-pointer transition-colors duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-1"
                    style={{
                      background: 'var(--mm-panel-alt)',
                      color: 'var(--mm-ink)',
                      border: '1px solid var(--mm-rule)',
                      borderRadius: '4px',
                    }}
                    aria-label={`${r.weekLabel} 박스스코어 보기`}
                  >
                    <ClipboardList size={14} aria-hidden />
                    박스스코어
                  </Link>
                  {/* 영상 재생 CTA — 브랜드 옐로우(mm-yellow)로 강조 · 검정 텍스트
                      hover 밝기 · active 눌림 · focus 링 · 200ms */}
                  <Link
                    href={`${base}/highlights/${r.date}`}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 text-sm font-black whitespace-nowrap cursor-pointer transition-colors duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
                    style={{
                      background: 'var(--mm-yellow)',
                      color: 'var(--mm-black)',
                      border: '1px solid var(--mm-yellow)',
                      borderRadius: '4px',
                      boxShadow: '0 2px 8px -3px rgba(242,181,60,0.55)',
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

        {/* 전체 일정 CTA — 지난 날짜 전부는 일정 탭에 있다(2026-10-12, 종전 하이라이트로 연결) */}
        <div className="px-4 sm:px-6 lg:px-8 py-4 md:py-5 flex justify-center">
          <Link
            href={`/league/${resolvedOrgSlug}/${leagueId}/schedule`}
            className="mm-brand inline-flex items-center justify-center gap-2 font-bold min-h-[44px] px-6 sm:px-8 py-3 text-sm cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)] focus-visible:ring-offset-2 hover:brightness-95"
            style={{
              background: 'var(--mm-ink)',
              color: 'var(--mm-panel)',
              border: '2px solid var(--mm-ink)',
              borderRadius: '4px',
              boxShadow: '0 4px 0 var(--mm-yellow-strong)',
            }}
            aria-label="전체 일정 보기"
          >
            전체 일정 보기
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </SectionCard>
    </>
  )
}
