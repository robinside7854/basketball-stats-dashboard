// 미라클모닝 브랜드 — 팀 승률 요약 (현재 분기 기준)
// 홈 랜딩에서 최근 라운드 카드 위에 배치.
// v3 (2026-07-19): W-L-D 뱃지 → WIN/LOSE/DRAW 컬러 라벨 · 득실차 → 득점/실점/마진 미니테이블
// 서버 컴포넌트 — 계산은 홈 페이지에서 넘겨받음.

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { HeadToHead } from './RecordDisplay'
import { RecordBar } from '@/components/league/ui/viz'
import SectionCard from '@/components/league/ui/SectionCard'
import { accentOrInk } from '@/lib/util/contrastColor'

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
  // 상대전적 — 이 분기에 실제로 맞붙은 팀만. 한 번도 안 만난 팀은 항목 자체가 없다
  // (0-0 을 보여주면 "졌다"로 읽히거나 표만 길어진다). 승수 많은 상대 순.
  //
  // ⚠ optional 인 이유: 이 데이터는 unstable_cache(60초)를 거쳐 온다. 배포 직후에는
  //   h2h 필드가 없던 시절의 캐시가 그대로 돌아올 수 있고, 필수로 두면 그동안 홈 화면이
  //   TypeError 로 죽는다. 캐시가 만료될 때까지의 몇십 초를 위해 optional 로 둔다.
  h2h?: Array<{ key: string; name: string; wins: number; losses: number; draws: number }>
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
    <SectionCard variant="stack" pad="none">
      <header
        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5 px-4 sm:px-6 md:px-10 py-4 md:py-5"
        style={{ borderBottom: '1px solid var(--mm-rule)' }}
      >
        <h3
          className="font-black break-keep"
          style={{ color: 'var(--mm-ink)', fontSize: 'clamp(22px, 6vw, 28px)', letterSpacing: '-0.005em', lineHeight: 1.1 }}
        >
          팀 승률
        </h3>
        <div className="flex items-center gap-3">
          {/* 한글 메타라 uppercase·자간 벌림이 무의미 → t-label 로 통일 */}
          <span className="t-label break-keep">
            {quarterLabel} · {gamesCount}경기
          </span>
          {orgSlug && leagueId && (
            <Link
              href={`/league/${orgSlug}/${leagueId}/teams`}
              className="t-label inline-flex items-center gap-0.5 min-h-[44px] py-1.5 whitespace-nowrap cursor-pointer transition-colors hover:brightness-90"
            >
              팀별 기록
              <ChevronRight size={14} aria-hidden />
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
              {/* 한 줄 구성 (2026-10-12 재배치) — PC 에서 팀명은 왼쪽 끝, 숫자 상자는 오른쪽 끝이라
                  가운데가 텅 비었다(사용자 지적). 그 빈자리를 **승·패 막대**로 채운다:
                  숫자 칩 3개 + 득점/실점/마진 표 → 막대 하나 + 마진 숫자 하나.
                  · PC(lg): [순위·팀명] [승패 막대 ────] [마진] [승률] 한 줄
                  · 모바일: 1줄 [순위·팀명 … 승률], 2줄 [승패 막대 … 마진] */}
              <div className="flex flex-wrap lg:flex-nowrap items-center gap-x-3 gap-y-2">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 lg:flex-none lg:w-[230px]">
                  <span
                    className="font-jersey font-black tabular-nums text-right leading-none shrink-0 w-6 sm:w-8"
                    style={{
                      fontSize: isTop ? 'clamp(20px, 5.5vw, 26px)' : 'clamp(18px, 5vw, 22px)',
                      color: isTop ? 'var(--mm-ink)' : 'var(--mm-muted)',
                    }}
                  >
                    {idx + 1}
                  </span>
                  <span
                    aria-hidden
                    className="block h-6 w-1 sm:w-1.5 rounded-sm shrink-0"
                    style={{ background: t.color, opacity: isTop ? 0.85 : 1, border: '1px solid var(--mm-rule)' }}
                  />
                  <span
                    className="font-black min-w-0 break-keep truncate"
                    style={{
                      fontSize: isTop ? 'clamp(18px, 4.6vw, 22px)' : 'clamp(16px, 3.8vw, 18px)',
                      letterSpacing: '-0.005em',
                      color: accentOrInk(t.color),
                      lineHeight: 1.15,
                    }}
                  >
                    {t.name}
                  </span>
                </div>

                <div className="order-last basis-full lg:order-none lg:basis-auto lg:flex-1 min-w-0 pl-8 sm:pl-11 lg:pl-0">
                  <RecordBar wins={t.wins} losses={t.losses} draws={t.draws} />
                </div>

                <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                  <MarginFigure ptsFor={t.ptsFor} ptsAgainst={t.ptsAgainst} />
                  <span
                    className="font-jersey font-black tabular-nums leading-none text-right"
                    style={{
                      fontSize: isTop ? 'clamp(18px, 5.2vw, 24px)' : 'clamp(18px, 4.6vw, 20px)',
                      color: rateColor,
                      minWidth: '64px',
                      letterSpacing: '-0.01em',
                    }}
                    aria-label={`승률 ${t.winRate.toFixed(1)} 퍼센트`}
                  >
                    {t.winRate.toFixed(1)}
                    <span className="text-sm font-bold ml-0.5 align-baseline" style={{ color: 'var(--mm-muted)' }}>%</span>
                  </span>
                </div>
              </div>

              {/* 상대전적 — 전체 전적 아래 한 줄. 위 칩(전체)과 같은 줄에 두면 어디까지가
                  전체이고 어디부터가 상대별인지 구분이 안 된다. 줄을 나누고 라벨을 붙인다.
                  맞붙은 상대가 없으면(첫 경기 전) 컴포넌트가 스스로 아무것도 그리지 않는다. */}
              {(t.h2h?.length ?? 0) > 0 && (
                <div className="mt-2 pl-8 sm:pl-11 lg:pl-[242px]">
                  <HeadToHead records={t.h2h!} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

// 득실 마진 하나만 크게, 득점·실점은 그 아래 작게 — 3칸 표를 숫자 하나로 줄였다.
function MarginFigure({ ptsFor, ptsAgainst }: { ptsFor: number; ptsAgainst: number }) {
  const diff = ptsFor - ptsAgainst
  const color = diff > 0 ? 'var(--mm-positive)' : diff < 0 ? 'var(--mm-negative)' : 'var(--mm-ink-soft)'
  return (
    <div className="flex flex-col items-end leading-none" aria-label={`득점 ${ptsFor} 실점 ${ptsAgainst} 마진 ${diff}`}>
      <span className="font-black tabular-nums text-base sm:text-lg" style={{ color }}>
        {diff > 0 ? `+${diff}` : diff}
      </span>
      <span className="text-[11px] tabular-nums mt-1" style={{ color: 'var(--mm-muted)' }} title="득점-실점">
        {ptsFor}-{ptsAgainst}
      </span>
    </div>
  )
}
