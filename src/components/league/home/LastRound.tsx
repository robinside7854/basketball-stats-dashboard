'use client'
// 홈 「지난 토요일」 (리뉴얼 2단계, 2026-10-12) — 기록이 있는 최근 경기일 하루.
//   · LastRoundTeams    : 그날 팀 성적 요약(승패 막대 · 마진) — PC 왼쪽(요약) 칸
//   · LastRoundTimeline : 그날 경기를 슬롯 1→N 타일 격자로(모바일 2열 · sm+ 3열, 2026-10-13) — PC 오른쪽(상세) 칸
// 데이터는 홈 「최근 라운드」와 같은 서버 캐시(computeRecentRounds)의 첫 라운드다 — 새 요청이 없다.
// 로그인 회원이면 내가 뛴 경기를 노랑으로 표시한다(HomeMeContext — 브라우저에서 받은 개인 데이터).
import Link from 'next/link'
import { ClipboardList, PlayCircle, Trophy } from 'lucide-react'
import SectionCard from '@/components/league/ui/SectionCard'
import { RecordBar, MarginFigure } from '@/components/league/ui/viz'
import { accentOrInk } from '@/lib/util/contrastColor'
import type { RoundSummary, RoundGame } from '@/components/league/nba/NbaRoundsSummary'
import { useHomeMe } from './HomeMeContext'

function dayEyebrow(date: string): string {
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
  if (date === today) return '오늘'
  const d = new Date(date + 'T00:00:00')
  const ageDays = (Date.parse(today) - Date.parse(date)) / 86_400_000
  return d.getDay() === 6 && ageDays <= 7 ? '지난 토요일' : '최근 경기일'
}

function videoHref(g: RoundGame): string | null {
  if (!g.youtube_url) return null
  if (!g.youtube_start_offset) return g.youtube_url
  return `${g.youtube_url}${g.youtube_url.includes('?') ? '&' : '?'}t=${Math.floor(g.youtube_start_offset)}s`
}

export function LastRoundTeams({ round }: { round: RoundSummary }) {
  if (round.teams.length === 0) return null
  return (
    <SectionCard variant="stack" pad="none" ariaLabel="그날 팀 성적">
      <header className="flex items-baseline justify-between gap-2 px-4 lg:px-5 pt-3.5 pb-2.5" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
        <h3 className="text-base font-black break-keep" style={{ color: 'var(--mm-ink)' }}>{round.weekLabel} 팀 성적</h3>
        <span className="t-label">{round.gamesCount}경기</span>
      </header>
      <ul>
        {round.teams.map((t, i) => (
          <li
            key={t.key}
            className="px-4 lg:px-5 py-2.5"
            style={{ borderBottom: i < round.teams.length - 1 ? '1px dashed var(--mm-rule)' : 'none' }}
          >
            <div className="flex items-center gap-2">
              <span aria-hidden className="block h-4 w-1.5 rounded-sm shrink-0" style={{ background: t.color, border: '1px solid var(--mm-rule)' }} />
              <span className="min-w-0 flex-1 truncate font-black text-sm" style={{ color: accentOrInk(t.color) }} title={t.name}>
                {i === 0 && <Trophy size={13} aria-label="그날 1위" className="inline -mt-0.5 mr-1" style={{ color: 'var(--mm-yellow-strong)' }} />}
                {t.name}
              </span>
              <MarginFigure ptsFor={t.ptsFor} ptsAgainst={t.ptsAgainst} size="sm" />
            </div>
            <div className="mt-1.5 pl-3.5">
              <RecordBar wins={t.wins} losses={t.losses} draws={t.draws} height={20} />
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

// 한 팀 한 줄 — [색 막대][팀명 …… 점수]. 타일이 좁아(360px 2열 ≈ 140px) 글자를 한 단계 줄였다.
function TeamLine({ team, score, won }: { team: RoundGame['home']; score: number; won: boolean }) {
  const name = team?.name ?? '미정'
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span aria-hidden className="block h-3.5 w-1 rounded-sm shrink-0" style={{ background: team?.color ?? 'var(--mm-rule)', border: '1px solid var(--mm-rule)' }} />
      <span
        className={`min-w-0 flex-1 truncate text-[13px] sm:text-sm ${won ? 'font-black' : 'font-semibold'}`}
        style={{ color: won ? accentOrInk(team?.color) : 'var(--mm-muted)', lineHeight: 1.25 }}
        title={name}
      >
        {name}
      </span>
      <span
        className="font-jersey font-black tabular-nums leading-none shrink-0 text-right"
        style={{ fontSize: 18, minWidth: 22, color: won ? 'var(--mm-ink)' : 'var(--mm-muted)' }}
      >
        {score}
      </span>
    </div>
  )
}

export function LastRoundTimeline({ round, orgSlug, leagueId }: { round: RoundSummary; orgSlug: string; leagueId: string }) {
  const { day } = useHomeMe()
  const games = round.games ?? []
  const base = `/league/${orgSlug}/${leagueId}`
  // 개인 데이터가 같은 날짜일 때만 표시 — 다른 날 기록으로 엉뚱한 칸을 칠하지 않는다
  const mine = day && day.date === round.date ? day.gameIds : null
  const myCount = mine ? games.filter(g => mine.has(g.id)).length : 0

  return (
    <SectionCard variant="stack" pad="none" ariaLabel={`${round.weekLabel} 경기 목록`}>
      <header className="px-4 lg:px-5 pt-3.5 pb-3" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
        <p className="t-label" style={{ color: 'var(--mm-yellow-strong)' }}>{dayEyebrow(round.date)}</p>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mt-0.5">
          <h2 className="font-black break-keep" style={{ color: 'var(--mm-ink)', fontSize: 'clamp(22px, 6vw, 26px)', lineHeight: 1.15 }}>
            {round.weekLabel}
          </h2>
          <span className="t-label">
            {round.gamesCount}경기{myCount > 0 ? ` · 내 경기 ${myCount}` : ''}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            href={`${base}/boxscore/${round.date}`}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 text-sm font-black whitespace-nowrap hover:brightness-95"
            style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}
          >
            <ClipboardList size={14} aria-hidden />
            박스스코어
          </Link>
          <Link
            href={`${base}/highlights/${round.date}`}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 text-sm font-black whitespace-nowrap hover:brightness-95"
            style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-yellow)', borderRadius: 'var(--mm-radius-ctl)' }}
          >
            <PlayCircle size={14} aria-hidden />
            하이라이트
          </Link>
        </div>
      </header>

      {games.length === 0 ? (
        <p className="px-4 lg:px-5 py-6 text-sm text-center" style={{ color: 'var(--mm-muted)' }}>경기별 기록은 박스스코어에서 볼 수 있어요.</p>
      ) : (
        // 경기 타일 격자 (2026-10-13 사용자 요청) — 종전 세로 타임라인은 9경기면 모바일에서 두 화면을 넘겼다.
        //   모바일 2열 · sm+ 3열. 타일 하나 ≈ 76px 이라 9경기 = 5줄 ≈ 410px(머리 포함 한 화면 안).
        //   타일 전체가 박스스코어 링크(::after 로 덮는 stretched link) · 영상은 타일 머리의 작은 아이콘(별도 링크).
        <ol className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 lg:p-4" aria-label="경기 순서">
          {games.map((g, i) => {
            const homeWon = g.home_score > g.away_score
            const awayWon = g.away_score > g.home_score
            const isMine = !!mine?.has(g.id)
            const video = videoHref(g)
            const num = g.slot_num ?? i + 1
            return (
              <li
                key={g.id}
                className="relative min-w-0 flex flex-col px-2.5 pt-1.5 pb-2 hover:brightness-95"
                style={{
                  background: isMine ? 'var(--mm-yellow-soft)' : 'var(--mm-panel-alt)',
                  border: `1px solid ${isMine ? 'var(--mm-yellow-strong)' : 'var(--mm-rule)'}`,
                  borderRadius: 'var(--mm-radius-ctl)',
                }}
              >
                {/* 머리 — [N경기 · 내 경기] …… [▶] */}
                <div className="flex items-center justify-between gap-1 min-h-[28px]">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-black tabular-nums whitespace-nowrap" style={{ color: isMine ? 'var(--mm-ink)' : 'var(--mm-ink-soft)' }}>
                      {num}경기
                    </span>
                    {isMine && (
                      <span
                        aria-hidden
                        className="text-[10px] font-black px-1.5 leading-[16px] whitespace-nowrap"
                        style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: 'var(--mm-radius-chip)' }}
                      >
                        내 경기
                      </span>
                    )}
                  </span>
                  {video && (
                    // 박스스코어 링크(::after)보다 위에 — z-index 로 따로 눌린다
                    <a
                      href={video}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative z-[2] shrink-0 inline-flex items-center justify-center w-9 h-8 -mr-1.5 hover:brightness-90"
                      style={{ color: 'var(--mm-ink-soft)', borderRadius: 'var(--mm-radius-ctl)' }}
                      aria-label={`${num}경기 영상 보기 (새 창)`}
                      title="영상 보기"
                    >
                      <PlayCircle size={18} aria-hidden />
                    </a>
                  )}
                </div>
                <Link
                  href={`${base}/boxscore/${round.date}?game=${g.id}`}
                  className="block space-y-1 mt-0.5 after:content-[''] after:absolute after:inset-0 after:z-[1] after:rounded-[var(--mm-radius-ctl)] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[color:var(--mm-yellow-strong)]"
                  aria-label={`${num}경기 ${g.home?.name ?? '미정'} ${g.home_score} 대 ${g.away_score} ${g.away?.name ?? '미정'}${isMine ? ' · 내 경기' : ''} 박스스코어`}
                >
                  <TeamLine team={g.home} score={g.home_score} won={homeWon} />
                  <TeamLine team={g.away} score={g.away_score} won={awayWon} />
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </SectionCard>
  )
}
