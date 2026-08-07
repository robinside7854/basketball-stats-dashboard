// 미라클모닝 브랜드 — 팀 승률 요약 (현재 분기 기준)
// 홈 랜딩에서 최근 라운드 카드 위에 배치.
// v3 (2026-07-19): W-L-D 뱃지 → WIN/LOSE/DRAW 컬러 라벨 · 득실차 → 득점/실점/마진 미니테이블
// 서버 컴포넌트 — 계산은 홈 페이지에서 넘겨받음.

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ResultChips, ScoreTable } from './RecordDisplay'
import SectionCard from '@/components/league/ui/SectionCard'

export type StandingRow = {
  key: string
  name: string
  color: string
  wins: number
  losses: number
  draws: number
  ptsFor: number
  ptsAgainst: number
  winRate: number  // 0~100 소수 첫째자리
}

type Props = {
  standings: StandingRow[]
  quarterLabel: string  // "26.1Q" 또는 "시즌 전체"
  gamesCount: number
  // 라커룸 진입점(Task 4-D) — 라커룸이 탭에서 빠지면서 팀 이야기를 하는 이 카드가 대체 진입점.
  // 둘 다 있어야 링크가 뜬다(없으면 조용히 생략 — 이 컴포넌트를 다른 곳에서 재사용해도 안전).
  orgSlug?: string
  leagueId?: string
}

export default function NbaTeamStandings({ standings, quarterLabel, gamesCount, orgSlug, leagueId }: Props) {
  if (standings.length === 0) return null

  return (
    <SectionCard variant="stack" dataTour="standings">
      <header
        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5 px-4 sm:px-6 md:px-10 py-4 md:py-5"
        style={{ borderBottom: '1px solid var(--mm-rule)' }}
      >
        <h3
          className="font-bold break-keep"
          style={{ color: 'var(--mm-ink)', fontSize: 'clamp(22px, 6vw, 28px)', letterSpacing: '-0.005em', lineHeight: 1.1 }}
        >
          팀 승률
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-[11px] sm:text-[12px] tracking-[0.14em] sm:tracking-[0.18em] uppercase font-bold break-keep" style={{ color: 'var(--mm-muted)' }}>
            {quarterLabel} · {gamesCount}경기
          </span>
          {orgSlug && leagueId && (
            <Link
              href={`/league/${orgSlug}/${leagueId}/roster`}
              className="inline-flex items-center gap-0.5 min-h-[44px] py-1.5 text-[11px] sm:text-[12px] font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors hover:brightness-90"
              style={{ color: 'var(--mm-ink-soft)' }}
            >
              팀 명단
              <ChevronRight size={13} aria-hidden />
            </Link>
          )}
        </div>
      </header>

      <div className="grid gap-0">
        {standings.map((t, idx) => {
          const isTop = idx === 0
          const rateColor = t.winRate >= 60 ? 'var(--mm-positive)' : t.winRate >= 40 ? 'var(--mm-ink-soft)' : 'var(--mm-negative)'
          return (
            <div
              key={t.key}
              className="px-4 sm:px-6 md:px-8 py-3 sm:py-3.5"
              style={{
                background: isTop ? 'var(--mm-yellow-soft)' : 'transparent',
                borderLeft: isTop ? '3px solid var(--mm-yellow-strong)' : '3px solid transparent',
                borderBottom: idx < standings.length - 1 ? '1px solid var(--mm-rule)' : 'none',
                color: 'var(--mm-ink)',
              }}
            >
              {/* 상단 행 · 순위 + 팀 컬러 바 + 팀 이름 + 승률 */}
              <div className="grid items-center gap-2 sm:gap-3 grid-cols-[24px_4px_minmax(0,1fr)_auto] sm:grid-cols-[32px_6px_minmax(0,1fr)_auto]">
                <span
                  className="font-jersey font-black tabular-nums text-right leading-none"
                  style={{
                    fontSize: isTop ? 'clamp(20px, 5.5vw, 26px)' : 'clamp(18px, 5vw, 22px)',
                    color: isTop ? 'var(--mm-ink)' : 'var(--mm-muted)',
                  }}
                >
                  {idx + 1}
                </span>
                <span
                  aria-hidden
                  className="block h-6 rounded-sm"
                  style={{ background: t.color, opacity: isTop ? 0.85 : 1 }}
                />
                <span
                  className="font-jersey uppercase min-w-0 break-keep"
                  style={{
                    fontSize: isTop ? 'clamp(16px, 4.6vw, 22px)' : 'clamp(14px, 3.8vw, 18px)',
                    fontWeight: 900,
                    letterSpacing: '-0.005em',
                    color: 'var(--mm-ink)',
                    lineHeight: 1.15,
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {t.name}
                </span>
                <span
                  className="font-jersey font-black tabular-nums leading-none"
                  style={{
                    fontSize: isTop ? 'clamp(18px, 5.2vw, 24px)' : 'clamp(16px, 4.6vw, 20px)',
                    color: rateColor,
                    minWidth: '64px',
                    textAlign: 'right',
                    letterSpacing: '-0.01em',
                  }}
                  aria-label={`승률 ${t.winRate.toFixed(1)} 퍼센트`}
                >
                  {t.winRate.toFixed(1)}
                  <span
                    className="text-[13px] font-bold ml-0.5 align-baseline"
                    style={{ color: 'var(--mm-muted)' }}
                  >
                    %
                  </span>
                </span>
              </div>

              {/* 하단 · WIN/LOSE/DRAW 컬러 라벨 + 득점/실점/마진 미니테이블
                  · 모바일: 아래로 접힘 (칩 라인 + 표 라인)
                  · sm+: 한 줄에 배치 (칩 + 표) */}
              <div
                className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3"
                style={{ paddingLeft: '32px' }}
              >
                <ResultChips wins={t.wins} losses={t.losses} draws={t.draws} isTop={isTop} />
                <div className="sm:min-w-[220px] sm:max-w-[280px]">
                  <ScoreTable ptsFor={t.ptsFor} ptsAgainst={t.ptsAgainst} isTop={isTop} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}
