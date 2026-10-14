// GET /api/leagues/[leagueId]/auth/dashboard
//   로그인 유저 개인화 대시보드 데이터
//     a. **이번 분기 · 하루 평균** PTS/REB/AST/STL/BLK + 각 항목 리그 순위 (2026-10-12)
//        — 홈 「리그 리더」와 같은 기준(분기 = loadCurrentQuarter/gameDateRange, 하루 평균,
//          최소 출전 = leaderMinRounds). 종전엔 시즌 누적 합계 순위라 홈 리더와 숫자가 안 맞았다.
//     a'. 시즌 누적 합계(보조 줄) — 마일스톤 체이서도 이 누적값 기준
//     b. "이번 주 하이라이트" 활성 여부 (직전 라운드 참여 시 true + href)
//     c. 마일스톤 체이서 · 진행 중 스트릭
//     d. (2026-10-12 · /me 확장) 출석률 `attendance` · 하루별 트렌드 `trend` · 베스트샷 `pinned_clips`
//        — 모두 **추가 필드**다. 홈(내 카드)이 quarter/season/milestoneChasers 를 읽으므로 기존 모양은 건드리지 않는다.
//        트렌드·출석의 하루 단위 집계는 computePerDayStats(친선 제외 · scorePoints/isPlusOneFor 판정) 재사용.
//     e. (2026-10-12 · 기간 선택) `career` — quarter 와 같은 모양의 「전체(이 리그 시즌 첫 경기일부터)」 블록.
//        두 블록·attendance 에 내 「첫 기록일」(joined_on)과 그 이후 경기일 수(my_total_rounds · since_join) 추가 —
//        중간 합류 회원의 출석률 분모를 첫 기록일부터 센다. 순위 자격은 리그 공통 규칙 그대로.
//     f. (2026-10-13) 두 기간 블록에 `shooting`(야투·3점 성공/시도/성공률) 추가 — 순위 없음.
//     g. (2026-10-14) `last_played: { date, missed_game_days } | null` — 마지막 출전일 + 그 뒤 결장 경기일.
//        ⚠ 이 값만 친선일을 포함한다(출석 지표) — computeLastPlayed 머리 주석.
//   친선전은 computeLeagueStats 가 제외한다. 게스트도 거기서 순위 모집단에서 빠진다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { getApprovedSession } from '@/lib/auth/guard'
import { computeLeagueStats } from '@/lib/stats/leagueStats'
import { computeStreaks, type StreakCategory } from '@/lib/stats/streaks'
import { loadCurrentQuarter, gameDateRange } from '@/lib/league/currentQuarter'
import { leaderMinRounds } from '@/lib/stats/eligibility'
import { computePerDayStats } from '@/lib/stats/perDayStats'
import { loadClipsByEventIds } from '@/lib/highlights/loader'
import { resolveTeamId } from '@/lib/league/teamScope'
import { computeLastPlayed } from '@/lib/stats/lastPlayed'
import type { HighlightClip } from '@/lib/highlights/types'
import type { PlayerStat } from '@/types/league'

// 진행 중 스트릭 라벨 (개인 대시보드 표기용)
const STREAK_LABEL: Record<StreakCategory, string> = {
  pts10: '두 자릿수 득점', pts20: '20+ 득점', tp1: '3점 성공',
  dd: '더블더블', wins: '연승', stlblk3: '스틸+블록 3+',
}

// 마일스톤 사다리 (playerMilestoneChart 와 동일 규칙)
const MILESTONE_LADDER: Record<'pts' | 'reb' | 'ast' | 'stl' | 'blk', number[]> = {
  pts: [100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000],
  reb: [50, 100, 200, 300, 500, 750, 1000, 1500, 2000],
  ast: [25, 50, 100, 150, 250, 400, 500, 750, 1000],
  stl: [25, 50, 100, 150, 250, 400, 500, 750, 1000],
  blk: [10, 25, 50, 100, 150, 250, 400, 500],
}

type Metric = 'pts' | 'reb' | 'ast' | 'stl' | 'blk'
// 하루 평균 필드 — 홈 리더(NbaLeaders)와 같은 값(computeLeagueStats 가 소수 첫째 자리로 반올림)
const PER_DAY_KEY: Record<Metric, 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg'> = {
  pts: 'ppg', reb: 'rpg', ast: 'apg', stl: 'spg', blk: 'bpg',
}
const METRICS: Metric[] = ['pts', 'reb', 'ast', 'stl', 'blk']

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

  // 1) 이번 분기(홈 리더와 같은 판정) · 시즌 누적 · 스트릭 — 독립 → 병렬
  const q = await loadCurrentQuarter(sb, leagueId)
  const range = q ? gameDateRange(q) : null
  const [quarterStats, seasonStats, streaksResult, perDay, quarterDates, pinnedClips, lastPlayed] = await Promise.all([
    computeLeagueStats(sb, leagueId, {
      unit: 'round',
      ...(range ? { from: range.from, to: range.to } : q ? { quarterId: q.id } : {}),
    }),
    computeLeagueStats(sb, leagueId),
    computeStreaks(sb, leagueId, { minStreak: 2 }),
    // 하루별 스탯(시즌 · 친선 제외) — 트렌드·출석 점 표시용
    computePerDayStats(sb, leagueId),
    // 분기에 기간이 없을 때만 quarter_id 로 그 분기 경기일을 따로 읽는다(기간이 있으면 날짜로 거른다)
    q && !range ? loadQuarterDates(sb, leagueId, q.id) : Promise.resolve(null),
    loadPinnedClips(sb, leagueId, pid),
    // 마지막 출전일(친선 포함) — 실패해도 null
    computeLastPlayed(sb, leagueId, pid),
  ])
  const me = seasonStats.players.find(p => p.player_id === pid)

  // 진행 중 스트릭 (이 선수) — 연속 참석 먼저, 이후 지표 스트릭 count 내림차순
  const myAtt = streaksResult.attendance.find(a => a.player_id === pid)
  const streaks: Array<{ key: string; label: string; count: number; unit: string }> = []
  if (myAtt && myAtt.current_streak >= 2) {
    streaks.push({ key: 'attend', label: '연속 참석', count: myAtt.current_streak, unit: '라운드' })
  }
  streaks.push(
    ...streaksResult.streaks
      .filter(s => s.player_id === pid)
      .sort((a, b) => b.count - a.count)
      .map(s => ({ key: s.category, label: STREAK_LABEL[s.category] ?? s.category, count: s.count, unit: '경기' })),
  )

  // 내 「첫 기록일」 = 이 리그(정규 · 친선 제외)에서 내 이벤트가 처음 남은 경기일 (2026-10-12).
  //   중간에 들어온 회원의 출석률 분모를 이날부터 센다 — 들어오기 전 경기일을 「결장」으로 치지 않는다.
  //   판정은 computePerDayStats 의 「뛴 날」과 같다(내 이벤트 · 어시스트로 이름이 남은 날 포함).
  //   ⚠ 순위 자격(leaderMinRounds)은 리그 공통 규칙 그대로다 — 홈 리그 리더와 갈라지면 안 된다.
  const myDays = perDay.dayStats.get(pid) ?? new Map()
  const joinedOn: string | null = [...myDays.keys()].sort()[0] ?? null
  const sinceJoin = (d: string): boolean => joinedOn != null && d >= joinedOn

  const inQuarter = (d: string): boolean =>
    range ? d >= range.from && d <= range.to : quarterDates ? quarterDates.has(d) : true
  const seasonDays = [...perDay.allDates].sort()
  const quarterDays = seasonDays.filter(inQuarter)

  // 기간 블록(이번 분기 · 전체) — 같은 모양. 순위 모집단 = 홈 리더와 같은 「최소 출전」 충족자
  const buildPeriod = (stats: { players: PlayerStat[]; total_rounds?: number }, label: string | null, days: string[]) => {
    const players = stats.players
    const minRounds = leaderMinRounds(players)
    const eligible = players.filter(p => p.gp >= minRounds)
    const mine = players.find(p => p.player_id === pid)
    const isEligible = !!mine && mine.gp >= minRounds
    const rankOf = (m: PlayerStat, key: Metric): { rank: number; total: number } => {
      const f = PER_DAY_KEY[key]
      return { rank: eligible.filter(p => p[f] > m[f]).length + 1, total: eligible.length }
    }
    const attended = mine?.gp ?? 0
    return {
      label,
      attended_rounds: attended,
      total_rounds: stats.total_rounds ?? 0,
      /** (추가) 이 기간 경기일 중 내 첫 기록일 이후 — 출석 분모. 출전일이 이보다 클 수 없게 맞춘다 */
      my_total_rounds: Math.max(attended, days.filter(sinceJoin).length),
      /** (추가) 내 첫 기록일 — 기간과 무관하게 리그 전체 기준 */
      joined_on: joinedOn,
      min_rounds: minRounds,
      eligible: isEligible,
      per_day: Object.fromEntries(METRICS.map(k => [k, mine ? mine[PER_DAY_KEY[k]] : 0])) as Record<Metric, number>,
      /** (추가 2026-10-13) 야투율·3점 야투율 — computeLeagueStats 선수 행의 값을 그대로(다시 계산하지 않는다).
       *  순위는 없다: 홈 리그 리더에 야투율 자격 규칙(최소 시도)이 없어서 등수를 매기면 기준이 갈라진다. */
      shooting: {
        fgm: mine?.fgm ?? 0, fga: mine?.fga ?? 0, fg_pct: mine?.fg_pct ?? 0,
        fg3m: mine?.fg3m ?? 0, fg3a: mine?.fg3a ?? 0, fg3_pct: mine?.fg3_pct ?? 0,
      },
      ranks: (mine && isEligible
        ? Object.fromEntries(METRICS.map(k => [k, rankOf(mine, k)]))
        : {}) as Partial<Record<Metric, { rank: number; total: number }>>,
    }
  }
  const quarter = buildPeriod(quarterStats, q?.label ?? null, quarterDays)
  // 「전체」 = 이 리그 시즌의 기록 전부(첫 경기일부터). 미라클은 리그 시즌이 하나(2026)라 곧 「기록 시작 이후 전부」다.
  //   시즌 누적(seasonStats)을 그대로 쓴다 — 요청 수를 늘리지 않는다.
  const career = { ...buildPeriod(seasonStats, '전체', seasonDays), from: seasonDays[0] ?? null }

  // 출석률 · 트렌드 — 「리그가 열린 날」 = 정규(친선 제외) 경기일(allDates)
  const toPoint = (d: string) => {
    const s = myDays.get(d)!
    return { date: d, pts: s.pts, reb: s.reb, ast: s.ast }
  }
  const mySeasonDays = seasonDays.filter(d => myDays.has(d))
  const myQuarterDays = quarterDays.filter(d => myDays.has(d))
  const attendance = {
    /** (추가) 내 첫 기록일 — 이날 이전 경기일은 분모·날짜 칸에서 뺀다 */
    joined_on: joinedOn,
    quarter: {
      attended: myQuarterDays.length,
      /** 이 분기에 리그가 연 날 전체 */
      total: quarterDays.length,
      /** (추가) 그중 내 첫 기록일 이후 — 출석률 분모 */
      since_join: quarterDays.filter(sinceJoin).length,
      /** 분기 경기일(내 첫 기록일부터) — 출석 칸 표시용(오름차순) */
      days: quarterDays.filter(sinceJoin).map(d => ({ date: d, played: myDays.has(d) })),
    },
    season: {
      attended: mySeasonDays.length,
      total: seasonDays.length,
      since_join: seasonDays.filter(sinceJoin).length,
      /** (추가) 시즌 경기일(내 첫 기록일부터) — 「전체」 출석 칸 */
      days: seasonDays.filter(sinceJoin).map(d => ({ date: d, played: myDays.has(d) })),
    },
    current_streak: myAtt?.current_streak ?? 0,
    longest_streak: myAtt?.longest_streak ?? 0,
  }
  const trend = {
    quarter: myQuarterDays.map(toPoint),
    season: mySeasonDays.map(toPoint),
  }

  if (!me) {
    return NextResponse.json({
      quarter,
      career,
      attendance,
      trend,
      pinned_clips: pinnedClips,
      last_played: lastPlayed,
      season: { attended_rounds: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
      weekly: { available: false },
      milestoneChasers: [],
      streaks,
    })
  }

  // 시즌 누적 합계 — 보조 줄 · 마일스톤 체이서 기준
  const season = {
    attended_rounds: me.gp,
    pts: me.pts,
    reb: me.reb,
    ast: me.ast,
    stl: me.stl,
    blk: me.blk,
  }

  // 2) "이번 주 하이라이트" · 이 선수가 최근 참여한 라운드로 바로 연결
  //    · 이 선수 이벤트의 game_id 를 모두 모아 → games 에서 date desc 로 정렬 → 최댓값
  //    · 이전엔 events order-by-id (UUID 정렬) 이라 임의 이벤트가 반환됨 · 2026-07-21 버그 픽스
  let weekly: { available: boolean; date?: string } = { available: false }
  {
    const gids = new Set<string>()
    const PAGE = 1000
    for (let p = 0; ; p++) {
      const { data: chunk } = await sb
        .from('league_game_events')
        .select('league_game_id')
        .eq('league_player_id', pid)
        // ⚠ 정렬 없이 나눠 읽으면 페이지 사이에서 줄이 빠지거나 겹친다
        .order('id', { ascending: true })
        .range(p * PAGE, (p + 1) * PAGE - 1)
      if (!chunk || chunk.length === 0) break
      for (const r of chunk as Array<{ league_game_id: string }>) gids.add(r.league_game_id)
      if (chunk.length < PAGE) break
    }
    if (gids.size > 0) {
      const { data: latest } = await sb
        .from('league_games')
        .select('date')
        .in('id', [...gids])
        .eq('league_id', leagueId)
        .eq('is_started', true)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (latest?.date) weekly = { available: true, date: latest.date }
    }
  }

  // 3) (삭제) 최근 5경기 트렌드 · 유저 피드백으로 제거 · 2026-07-21

  // 4) 마일스톤 체이서 · 각 지표별 다음 임계값까지 남은 수치 · 가장 가까운 것부터
  const chasers: Array<{
    metric: 'pts' | 'reb' | 'ast' | 'stl' | 'blk'
    metricLabel: string
    current: number
    nextThreshold: number
    remaining: number
    progressPct: number
  }> = []
  const labelMap = { pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK' } as const
  for (const key of ['pts', 'reb', 'ast', 'stl', 'blk'] as const) {
    const cur = me[key]
    if (cur <= 0) continue
    const ladder = MILESTONE_LADDER[key]
    const next = ladder.find(t => t > cur)
    if (!next) continue
    const prev = [...ladder].reverse().find(t => t <= cur) ?? 0
    const remaining = next - cur
    const progressPct = +(((cur - prev) / (next - prev)) * 100).toFixed(1)
    chasers.push({
      metric: key,
      metricLabel: labelMap[key],
      current: cur,
      nextThreshold: next,
      remaining,
      progressPct,
    })
  }
  // 가장 도달 가능한 것 = remaining 오름차순
  chasers.sort((a, b) => a.remaining - b.remaining)

  return NextResponse.json({
    quarter,
    career,
    attendance,
    trend,
    pinned_clips: pinnedClips,
    last_played: lastPlayed,
    season,
    weekly,
    milestoneChasers: chasers,
    streaks,
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
