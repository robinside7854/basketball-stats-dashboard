'use client'
// 대회 보드 — 대회형(mode='tournament') 경기묶음의 홈.
//   리그 홈(순위표·라운드)과 다르게, 참가한 대회별 성적(우승/준우승/N강 탈락)이 중심이다.
//   (docs/superpowers/plans/2026-08-05-team-competitions-trial.md, Task 3)
//
// 카드 어휘(패널·룰·그리드 hover)는 highlights 랜딩(하이라이트 라운드 카드 그리드)을 참고했다:
//   src/app/league/[orgSlug]/[leagueId]/highlights/page.tsx
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Trophy, ChevronRight, CalendarRange, UserCheck } from 'lucide-react'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import EmptyState from '@/components/league/EmptyState'
import TournamentRosterPanel from '@/components/league/TournamentRosterPanel'

// ── 성적 판정 규칙 — 레거시에서 그대로 옮겨왔다(새로 만들지 않음) ──────────────
//   출처: src/app/(main)/[org]/[team]/tournaments/page.tsx 의 ROUND_ORDER / getTournamentSummary
//   (import 하지 않는다 — 그 트리는 파란날개 전용이며 언젠가 사라진다. 규칙만 옮겨온다.)
//   '준결승' 은 795da50b 에서 뒤늦게 추가된 수정본이다 — 이게 빠지면 준결승까지 간 대회가
//   8강 탈락으로 표시된다(4강/준결승 모두 값 4). 같은 대회가 두 화면에서 다른 성적으로
//   읽히면 안 되므로 그 수정본을 그대로 가져온다.
const ROUND_ORDER: Record<string, number> = {
  '결승': 5, '준결승': 4, '4강': 4, '8강': 3, '16강': 2, '조별예선': 1,
}

type PlayedGame = { round_label: string | null; ourScore: number; oppScore: number }

function getTournamentSummary(games: PlayedGame[]): { record: string; placement: string } | null {
  // 레거시와 동일한 "치른 경기" 판정: 점수가 하나라도 기록된 경기만(is_complete 는 보지 않는다 —
  // 레거시 Game 타입에는 애초에 이 필드로 필터링하는 로직이 없었다).
  const played = games.filter(g => g.ourScore > 0 || g.oppScore > 0)
  if (played.length === 0) return null

  const wins = played.filter(g => g.ourScore > g.oppScore).length
  const losses = played.filter(g => g.ourScore < g.oppScore).length
  const record = `${wins}승 ${losses}패`

  const roundGames = played.filter(g => g.round_label).sort((a, b) =>
    (ROUND_ORDER[b.round_label!] ?? 0) - (ROUND_ORDER[a.round_label!] ?? 0)
  )
  if (roundGames.length === 0) return { record, placement: '' }

  const topGame = roundGames[0]
  const won = topGame.ourScore > topGame.oppScore

  let placement = ''
  if (topGame.round_label === '결승') {
    placement = won ? '🏆 우승' : '준우승'
  } else if (!won) {
    placement = `${topGame.round_label} 탈락`
  }

  return { record, placement }
}
// ── 판정 규칙 끝 ───────────────────────────────────────────────────────────

type ApiTeam = { id: string; name: string | null; color: string | null; is_external: boolean | null } | null

type ApiGame = {
  id: string
  quarter_id: string | null
  round_label: string | null
  home_score: number | null
  away_score: number | null
  home_team: ApiTeam
  away_team: ApiTeam
}

type ApiQuarter = {
  id: string
  kind: string
  name: string | null
  start_date: string | null
  end_date: string | null
}

type TournamentCard = {
  quarter: ApiQuarter
  gamesCount: number
  summary: { record: string; placement: string } | null
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getMonth() + 1}.${d.getDate()}`
}

function fmtPeriod(start: string | null, end: string | null): string {
  if (!start) return '기간 미정'
  if (!end || end === start) return fmtDate(start)
  return `${fmtDate(start)} ~ ${fmtDate(end)}`
}

export default function TournamentBoard({
  leagueId,
  orgSlug,
}: {
  leagueId: string
  orgSlug: string
}) {
  const { isEditMode, leagueHeaders } = useLeagueEditMode()
  const [quarters, setQuarters] = useState<ApiQuarter[] | null>(null)
  const [games, setGames] = useState<ApiGame[] | null>(null)
  // 참가 인원 등록 패널 — 편집 권한자가 특정 대회 카드에서 열면 그 quarter 를 담는다.
  const [rosterQuarter, setRosterQuarter] = useState<ApiQuarter | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [qRes, gRes] = await Promise.all([
          fetch(`/api/leagues/${leagueId}/quarters`, { headers: leagueHeaders }),
          fetch(`/api/leagues/${leagueId}/games`, { headers: leagueHeaders }),
        ])
        if (cancelled) return
        setQuarters(qRes.ok ? await qRes.json() : [])
        setGames(gRes.ok ? await gRes.json() : [])
      } catch {
        if (!cancelled) { setQuarters([]); setGames([]) }
      }
    })()
    return () => { cancelled = true }
    // isEditMode 가 바뀌면(PIN 입력·로그인) 다시 조회 — 편집 권한 안내 문구가 즉시 반영되도록.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, isEditMode])

  if (quarters === null || games === null) {
    return (
      <div className="flex justify-center py-16">
        <BasketballLoader size={32} />
      </div>
    )
  }

  // 대회(=league_quarters 중 kind='tournament')만 대상. 최근 대회가 위로 오도록 시작일 내림차순.
  const tournaments = quarters
    .filter(q => q.kind === 'tournament')
    .sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? '') || (a.name ?? '').localeCompare(b.name ?? ''))

  const cards: TournamentCard[] = tournaments.map(q => {
    const qGames = games.filter(g => g.quarter_id === q.id)
    const played: PlayedGame[] = []
    for (const g of qGames) {
      // "우리 팀" = league_teams.is_external=false 인 쪽. 홈/원정 어느 쪽이든 그 점수를 our로 삼는다.
      const homeIsOurs = g.home_team?.is_external === false
      const awayIsOurs = g.away_team?.is_external === false
      if (homeIsOurs) {
        played.push({ round_label: g.round_label, ourScore: g.home_score ?? 0, oppScore: g.away_score ?? 0 })
      } else if (awayIsOurs) {
        played.push({ round_label: g.round_label, ourScore: g.away_score ?? 0, oppScore: g.home_score ?? 0 })
      }
      // 둘 다 외부팀 표시거나 팀 정보가 없으면(데이터 정합성 문제) 집계에서 제외 — 잘못된 성적 표기보다 낫다.
    }
    return { quarter: q, gamesCount: qGames.length, summary: getTournamentSummary(played) }
  })

  if (cards.length === 0) {
    // 미라클의 대회 묶음은 지금 비어 있다 — 이 화면이 회원이 처음 보는 유일한 화면이므로
    // "데이터가 없습니다" 로 끝내지 않는다. 편집 권한자에게는 어떻게 채우는지 알려주고,
    // 일반 회원에게는 조용히 "아직 없다" 는 사실만 전한다.
    return (
      <EmptyState
        Icon={Trophy}
        title="아직 참가한 대회가 없습니다"
        description="여기에 대회를 등록하면 대회별 전적과 최종 성적(우승·준우승·N강 탈락)이 표시됩니다."
        isEditMode={isEditMode}
        editorHint="대회 등록 UI는 아직 준비 중입니다 — 온볼 운영팀에 대회명과 기간을 알려주시면 등록해 드립니다."
        size="lg"
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Trophy size={28} className="lg:w-9 lg:h-9" style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden />
        <div>
          <h1
            className="font-jersey font-black uppercase text-2xl lg:text-4xl"
            style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
          >
            대회
          </h1>
          <p
            className="text-xs lg:text-sm mt-1 font-bold uppercase"
            style={{ color: 'var(--mm-muted)', letterSpacing: '0.16em' }}
          >
            참가한 대회별 전적 · 최종 성적
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ quarter: q, gamesCount, summary }) => {
          const isChampion = summary?.placement.includes('우승') && !summary.placement.includes('준우승')
          const clickable = gamesCount > 0
          const cardStyle: React.CSSProperties = {
            background: 'var(--mm-panel)',
            border: '1px solid var(--mm-rule)',
            borderRadius: '4px',
          }

          const cardInner = (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div
                    className="font-jersey font-black uppercase text-lg break-keep"
                    style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em', lineHeight: 1.2, wordBreak: 'break-word' }}
                  >
                    {q.name ?? '이름 없는 대회'}
                  </div>
                  <div
                    className="mt-1 flex items-center gap-1 text-[11px] font-bold"
                    style={{ color: 'var(--mm-muted)' }}
                  >
                    <CalendarRange size={12} aria-hidden />
                    {fmtPeriod(q.start_date, q.end_date)}
                  </div>
                </div>
                {isChampion && (
                  <Trophy size={22} className="shrink-0" style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden />
                )}
              </div>

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {summary ? (
                  <>
                    <span
                      className="inline-flex items-center text-[11px] font-black tracking-wide px-2 py-1 rounded"
                      style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)' }}
                    >
                      {summary.record}
                    </span>
                    {summary.placement && (
                      <span
                        className="inline-flex items-center text-[11px] font-black tracking-wide px-2 py-1 rounded"
                        style={{
                          background: isChampion ? 'var(--mm-yellow)' : 'var(--mm-panel-alt)',
                          color: isChampion ? 'var(--mm-black)' : 'var(--mm-muted)',
                          border: `1px solid ${isChampion ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
                        }}
                      >
                        {summary.placement}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[11px] font-bold" style={{ color: 'var(--mm-muted)' }}>
                    {gamesCount > 0 ? '결과 대기 중' : '경기 예정'}
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                {clickable ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-yellow-strong)' }}>
                    경기 목록 <ChevronRight size={12} />
                  </span>
                ) : <span />}

                {isEditMode && (
                  <button
                    type="button"
                    onClick={(e) => {
                      // cardInner 가 Link 안에 들어갈 수 있어 클릭이 그 위로 새면 경기 목록으로
                      // 이동해버린다 — 버튼 클릭은 등록 패널만 열어야 하므로 여기서 끊는다.
                      e.preventDefault()
                      e.stopPropagation()
                      setRosterQuarter(q)
                    }}
                    className="inline-flex items-center gap-1 min-h-[36px] px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] rounded-sm cursor-pointer transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
                    style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}
                    aria-label={`${q.name ?? '대회'} 참가 인원 등록`}
                  >
                    <UserCheck size={12} aria-hidden />
                    참가 등록
                  </button>
                )}
              </div>
            </>
          )

          // 대회 → 그 대회 경기 목록(일정 화면, 대회 필터). UUID leagueId 로도 미들웨어가
          // slug 로 301 리다이렉트해 정상 동작한다 — 이 파일의 다른 전환 링크(otherLeagues)와
          // 같은 방식(page.tsx 참조). schedule 화면은 아직 quarter 쿼리스트링을 읽지 않지만,
          // 갖춰지면 바로 딥링크가 되도록 남겨둔다.
          if (clickable) {
            return (
              <Link
                key={q.id}
                href={`/league/${orgSlug}/${leagueId}/schedule?quarter=${q.id}`}
                className="group block p-4 min-h-[44px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
                style={cardStyle}
                aria-label={`${q.name ?? '대회'} 경기 목록`}
              >
                {cardInner}
              </Link>
            )
          }
          return (
            <div key={q.id} className="block p-4" style={cardStyle}>
              {cardInner}
            </div>
          )
        })}
      </div>

      {rosterQuarter && (
        <TournamentRosterPanel
          leagueId={leagueId}
          quarterId={rosterQuarter.id}
          quarterName={rosterQuarter.name ?? '대회'}
          onClose={() => setRosterQuarter(null)}
        />
      )}
    </div>
  )
}
