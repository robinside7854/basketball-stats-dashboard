// GET /api/leagues/[leagueId]/auth/dashboard
//   로그인 유저 개인 화면(/me) 데이터 — **나에게만 있는 것만** 준다 (2026-10-15 정리).
//     · 출석률 `attendance` — 내가 뛴 날 / 리그가 열린 날(이번 분기 + 전체), 분모는 내 첫 기록일부터
//     · 마일스톤 체이서 `milestoneChasers` — 통산 누적 → 다음 눈금(lib/stats/milestoneLadder.ts 정본)
//     · 베스트샷 `pinned_clips` · 최근 하이라이트 바로가기 `weekly` · 마지막 출전 `last_played`
//   하루 평균·순위·야투율·트렌드·진행 중 연속 기록은 **선수 카드**(players/[id]/detail)가 정본이다.
//     종전엔 여기서도 따로 세어(순위 자격까지 다른 식으로) 카드와 숫자가 갈렸다 — /me 는 카드를 여는 버튼만 둔다.
//   친선전은 제외(computeLeagueStats · computePerDayStats). 단 last_played 만 친선일 포함 — computeLastPlayed 머리 주석.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { getApprovedSession } from '@/lib/auth/guard'
import { getCachedLeagueStats } from '@/lib/stats/cachedLeagueStats'
import { getCachedDashboardBase } from '@/lib/stats/dashboardBase'
import { loadCurrentQuarter, gameDateRange } from '@/lib/league/currentQuarter'
import { MILESTONE_LADDER, nextMilestone } from '@/lib/stats/milestoneLadder'
import { loadClipsByEventIds } from '@/lib/highlights/loader'
import { resolveTeamId } from '@/lib/league/teamScope'
import { computeLastPlayed } from '@/lib/stats/lastPlayed'
import { pickPlayerRow } from '@/lib/stats/playerTotals'
import type { HighlightClip } from '@/lib/highlights/types'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  // 쿠키 서명만 믿지 않고 DB 에서 status='approved' 를 매 요청 재확인한다.
  //   이 프로젝트의 원칙이다 — 인증 쿠키가 30일짜리라, 승인을 취소하거나 회원을 내보내도
  //   토큰만 검사하면 그 사람이 최대 30일간 계속 들어온다. 다른 스탯 라우트는 전부
  //   이 규칙을 따르는데 이 라우트만 빠져 있었다(2026-08-05 전수 점검에서 발견).
  const session = await getApprovedSession(leagueId)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = createClient()
  const pid = session.pid

  // 1) 리그 전체 집계는 **캐시**에서 읽는다 (2026-10-14 — 「내 기록」이 열릴 때마다 수 초씩 걸리던 원인).
  //   리그 공용 집계라 캐시해도 개인 정보가 섞이지 않는다 — 여기서 내 줄(pid)만 골라낸다.
  //   시즌 스탯은 스탯 탭·선수 카드와 **같은 캐시 항목**이다. 무효화는 `league-{id}-games` 태그로 자동.
  const seasonStatsP = getCachedLeagueStats(leagueId)
  const baseP = getCachedDashboardBase(leagueId)
  const pinnedP = loadPinnedClips(sb, leagueId, pid)
  // 마지막 출전일(친선 포함) — 내 이벤트만 읽는 가벼운 조회. 실패해도 null
  const lastPlayedP = computeLastPlayed(sb, leagueId, pid)
  const q = await loadCurrentQuarter(sb, leagueId)
  const range = q ? gameDateRange(q) : null
  const [seasonStats, base, quarterDates, pinnedClips, lastPlayed] = await Promise.all([
    seasonStatsP,
    baseP,
    // 분기에 기간이 없을 때만 quarter_id 로 그 분기 경기일을 따로 읽는다(기간이 있으면 날짜로 거른다)
    q && !range ? loadQuarterDates(sb, leagueId, q.id) : Promise.resolve(null),
    pinnedP,
    lastPlayedP,
  ])
  // 게스트도 자기 줄은 있다(순위 모집단에서만 빠진다) — 선수 카드와 같은 「선수 숫자는 한 벌」
  const me = pickPlayerRow(seasonStats, pid)
  const myAtt = base.streaks.attendance.find(a => a.player_id === pid)

  // 내 「첫 기록일」 = 이 리그(정규 · 친선 제외)에서 내 이벤트가 처음 남은 경기일 (2026-10-12).
  //   중간에 들어온 회원의 출석률 분모를 이날부터 센다 — 들어오기 전 경기일을 「결장」으로 치지 않는다.
  //   판정은 computePerDayStats 의 「뛴 날」과 같다(내 이벤트 · 어시스트로 이름이 남은 날 포함).
  const myDays = new Set(Object.keys(base.days[pid] ?? {}))
  const joinedOn: string | null = [...myDays].sort()[0] ?? null
  const sinceJoin = (d: string): boolean => joinedOn != null && d >= joinedOn

  const inQuarter = (d: string): boolean =>
    range ? d >= range.from && d <= range.to : quarterDates ? quarterDates.has(d) : true
  const seasonDays = [...base.allDates].sort()
  const quarterDays = seasonDays.filter(inQuarter)

  // 출석률 — 「리그가 열린 날」 = 정규(친선 제외) 경기일(allDates)
  const attendance = {
    /** 내 첫 기록일 — 이날 이전 경기일은 분모·날짜 칸에서 뺀다 */
    joined_on: joinedOn,
    quarter: {
      attended: quarterDays.filter(d => myDays.has(d)).length,
      /** 이 분기에 리그가 연 날 전체 */
      total: quarterDays.length,
      /** 그중 내 첫 기록일 이후 — 출석률 분모 */
      since_join: quarterDays.filter(sinceJoin).length,
      /** 분기 경기일(내 첫 기록일부터) — 출석 칸 표시용(오름차순) */
      days: quarterDays.filter(sinceJoin).map(d => ({ date: d, played: myDays.has(d) })),
    },
    season: {
      attended: seasonDays.filter(d => myDays.has(d)).length,
      total: seasonDays.length,
      since_join: seasonDays.filter(sinceJoin).length,
      days: seasonDays.filter(sinceJoin).map(d => ({ date: d, played: myDays.has(d) })),
    },
    current_streak: myAtt?.current_streak ?? 0,
    longest_streak: myAtt?.longest_streak ?? 0,
  }

  // 2) "최근 하이라이트" · 이 선수가 최근 참여한 라운드로 바로 연결
  //    (2026-10-14) 마지막 출전일(computeLastPlayed)을 그대로 쓴다 — 「어시스트로만 이름이 남은 날」도 출전으로 친다.
  const weekly: { available: boolean; date?: string } = lastPlayed
    ? { available: true, date: lastPlayed.date }
    : { available: false }

  // 3) 마일스톤 체이서 · 각 지표별 다음 눈금까지 남은 수치 · 가장 가까운 것부터
  //    눈금 정본은 milestoneLadder.ts — 홈 「최근 마일스톤」·마일스톤 나무와 같은 표.
  const chasers: Array<{
    metric: 'pts' | 'reb' | 'ast' | 'stl' | 'blk'
    metricLabel: string
    current: number
    nextThreshold: number
    remaining: number
    progressPct: number
  }> = []
  const labelMap = { pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK' } as const
  for (const key of Object.keys(MILESTONE_LADDER) as Array<keyof typeof MILESTONE_LADDER>) {
    const cur = me?.[key] ?? 0
    if (cur <= 0) continue
    const step = nextMilestone(key, cur)
    if (!step) continue
    chasers.push({
      metric: key,
      metricLabel: labelMap[key],
      current: cur,
      nextThreshold: step.next,
      remaining: step.next - cur,
      progressPct: +(((cur - step.prev) / (step.next - step.prev)) * 100).toFixed(1),
    })
  }
  // 가장 도달 가능한 것 = remaining 오름차순
  chasers.sort((a, b) => a.remaining - b.remaining)

  return NextResponse.json({
    /** 출석 칸 머리 표시용 「26.4Q」 — 분기가 없으면 null */
    quarter_label: q?.label ?? null,
    attendance,
    pinned_clips: pinnedClips,
    last_played: lastPlayed,
    weekly,
    milestoneChasers: chasers,
  })
}

/** 기간 없는 분기의 경기일 — quarter_id 기준(정규 · 기록 시작된 경기만) */
async function loadQuarterDates(
  sb: ReturnType<typeof createClient>, leagueId: string, quarterId: string,
): Promise<Set<string>> {
  const { data } = await sb
    .from('league_games')
    .select('date')
    .eq('league_id', leagueId)
    .eq('quarter_id', quarterId)
    .eq('is_started', true)
    .eq('is_exhibition', false)
  return new Set(((data ?? []) as Array<{ date: string }>).map(r => r.date))
}

/** 내 베스트샷 핀(최대 3) → 재생 가능한 클립. 실패해도 대시보드 전체를 막지 않는다. */
async function loadPinnedClips(
  sb: ReturnType<typeof createClient>, leagueId: string, pid: string,
): Promise<HighlightClip[]> {
  try {
    // 선수는 팀 소유(087) — league_id 가 아니라 team_id 로 찾는다
    const { data } = await sb
      .from('league_players')
      .select('pinned_event_ids')
      .eq('id', pid)
      .eq('team_id', await resolveTeamId(leagueId))
      .maybeSingle()
    const ids = ((data as { pinned_event_ids: string[] | null } | null)?.pinned_event_ids ?? []).slice(0, 3)
    if (ids.length === 0) return []
    const clips = await loadClipsByEventIds(sb, leagueId, ids)
    const byId = new Map(clips.map(c => [c.event_id, c]))
    // 핀 슬롯 순서(1→3) 유지
    return ids.map(id => byId.get(id)).filter((c): c is HighlightClip => !!c)
  } catch {
    return []
  }
}
