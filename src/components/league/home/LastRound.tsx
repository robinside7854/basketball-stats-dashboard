'use client'
// 홈 「지난 토요일」 (리뉴얼 2단계, 2026-10-12) — 기록이 있는 최근 경기일 하루.
//   (2026-10-14 홈 통합 개편) 종전엔 「그날 팀 성적」(승패 막대) 카드와 「경기 목록」 카드가 따로 있었고,
//   아래 「최근 라운드」 첫 카드가 같은 날 팀 성적을 한 번 더 보였다 → 카드 하나로 합쳤다.
//   · 팀 성적은 한 팀 한 줄(승·패·무 글자 + 득실) — 큰 막대 3줄이 세로를 가장 많이 먹었다.
//   · 경기 타일은 처음엔 **모두 접어 둔다**(2026-10-14 사용자 요청 — 9경기면 타일만 두 화면이었다).
//     「N경기 보기」로 펴고 「접기」로 다시 접는다. 팀 성적 한 줄씩은 늘 보인다.
// 데이터는 홈 「최근 라운드」와 같은 서버 캐시(computeRecentRounds)의 첫 라운드다 — 새 요청이 없다.
// 로그인 회원이면 내가 뛴 경기를 노랑으로 표시한다(HomeMeContext — 브라우저에서 받은 개인 데이터).
// (2026-10-15) 그날 내가 뛰었으면 머리에 「내 하이라이트 ▶」(→ 박스스코어 ?hl=mine — 범위 「내 기록」이 골라진 채
//   하이라이트 보기가 펼쳐진다), 카드 맨 아래 「전체 일정 보기 →」(홈 탭 「지난 경기일」을 대신한다).
import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight, ChevronDown, ClipboardList, PlayCircle, Trophy } from 'lucide-react'
import SectionCard from '@/components/league/ui/SectionCard'
import { accentOrInk } from '@/lib/util/contrastColor'
import type { RoundSummary, RoundGame } from './roundTypes'
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

/** 그날 팀 성적 — 한 팀 한 줄: [색][🏆 팀명] …… [4승 2패 1무] [+15] */
function DayTeams({ teams }: { teams: RoundSummary['teams'] }) {
  if (teams.length === 0) return null
  return (
    <ul aria-label="그날 팀 성적" className="px-4 lg:px-5 py-1.5" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
      {teams.map((t, i) => {
        const diff = t.ptsFor - t.ptsAgainst
        return (
          <li key={t.key} className="flex items-center gap-2 min-h-[36px]" style={{ borderTop: i > 0 ? '1px dashed var(--mm-rule)' : 'none' }}>
            <span aria-hidden className="block h-4 w-1.5 rounded-sm shrink-0" style={{ background: t.color, border: '1px solid var(--mm-rule)' }} />
            <span className="min-w-0 flex-1 truncate font-black text-sm" style={{ color: accentOrInk(t.color) }} title={t.name}>
              {i === 0 && <Trophy size={13} aria-label="그날 1위" className="inline -mt-0.5 mr-1" style={{ color: 'var(--mm-yellow-strong)' }} />}
              {t.name}
            </span>
            <span className="shrink-0 text-sm font-black tabular-nums whitespace-nowrap">
              <span style={{ color: 'var(--mm-positive)' }}>{t.wins}승</span>{' '}
              <span style={{ color: 'var(--mm-negative)' }}>{t.losses}패</span>
              {t.draws > 0 && <span style={{ color: 'var(--mm-ink-soft)' }}> {t.draws}무</span>}
            </span>
            <span
              className="shrink-0 w-10 text-right text-sm font-black tabular-nums"
              style={{ color: diff > 0 ? 'var(--mm-positive)' : diff < 0 ? 'var(--mm-negative)' : 'var(--mm-ink-soft)' }}
              title={`득점 ${t.ptsFor} · 실점 ${t.ptsAgainst}`}
            >
              {diff > 0 ? `+${diff}` : diff}
            </span>
          </li>
        )
      })}
    </ul>
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
  const [open, setOpen] = useState(false)

  return (
    <SectionCard variant="stack" pad="none" ariaLabel={`${round.weekLabel} 경기 목록`}>
      <header className="px-4 lg:px-5 pt-3.5 pb-3" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
        <div className="flex items-center justify-between gap-2 min-h-[28px]">
          <p className="t-label" style={{ color: 'var(--mm-yellow-strong)' }}>{dayEyebrow(round.date)}</p>
          {myCount > 0 && (
            // 재생은 박스스코어에서 한 번 더 눌러야 시작된다(iPhone 은 사용자 탭 안에서만 재생 — DayHighlightsLauncher)
            <Link
              href={`${base}/boxscore/${round.date}?hl=mine`}
              className="inline-flex items-center gap-1 min-h-[44px] -my-2 px-2 -mr-2 text-xs font-black whitespace-nowrap hover:brightness-90"
              style={{ color: 'var(--mm-ink)' }}
            >
              내 하이라이트
              <PlayCircle size={14} aria-hidden style={{ color: 'var(--mm-yellow-strong)' }} />
            </Link>
          )}
        </div>
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

      <DayTeams teams={round.teams} />

      {games.length === 0 ? (
        <p className="px-4 lg:px-5 py-6 text-sm text-center" style={{ color: 'var(--mm-muted)' }}>경기별 기록은 박스스코어에서 볼 수 있어요.</p>
      ) : (
        // 경기 타일 격자 (2026-10-13 사용자 요청) — 종전 세로 타임라인은 9경기면 모바일에서 두 화면을 넘겼다.
        //   모바일 2열 · sm+ 3열. 타일 하나 ≈ 76px 이라 9경기 = 5줄 ≈ 410px(머리 포함 한 화면 안).
        //   타일 전체가 박스스코어 링크(::after 로 덮는 stretched link) · 영상은 타일 머리의 작은 아이콘(별도 링크).
        <>
        <div className={`px-3 pt-3 lg:px-4 lg:pt-4 ${open ? '' : 'pb-3 lg:pb-4'}`}>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-controls={`day-games-${round.date}`}
            className="w-full inline-flex items-center justify-center gap-1 min-h-[44px] text-sm font-black hover:brightness-95"
            style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}
          >
            {open ? '경기별 결과 접기' : `경기별 결과 ${games.length}경기 보기${myCount > 0 ? ` · 내 경기 ${myCount}` : ''}`}
            <ChevronDown size={16} aria-hidden style={{ transform: open ? 'rotate(180deg)' : undefined }} />
          </button>
        </div>
        <ol id={`day-games-${round.date}`} className={`${open ? 'grid' : 'hidden'} grid-cols-2 sm:grid-cols-3 gap-2 p-3 lg:p-4`} aria-label="경기 순서">
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
        </>
      )}

      {/* 지난 날짜 전부는 일정 탭 — 홈 탭 「지난 경기일」(그 앞 3일)을 2026-10-15 이 링크로 대신했다 */}
      <div className="px-4 lg:px-5 pb-3" style={{ borderTop: games.length > 0 && open ? '1px solid var(--mm-rule)' : 'none' }}>
        <Link
          href={`${base}/schedule`}
          className="flex items-center justify-center gap-1 min-h-[44px] text-sm font-black hover:brightness-90"
          style={{ color: 'var(--mm-ink-soft)' }}
        >
          전체 일정 보기
          <ArrowRight size={15} aria-hidden />
        </Link>
      </div>
    </SectionCard>
  )
}
