// GET /api/leagues/[leagueId]/auth/dashboard
//   로그인 유저 개인화 대시보드 데이터
//     a. **이번 분기 · 하루 평균** PTS/REB/AST/STL/BLK + 각 항목 리그 순위 (2026-10-12)
//        — 홈 「리그 리더」와 같은 기준(분기 = loadCurrentQuarter/gameDateRange, 하루 평균,
//          최소 출전 = leaderMinRounds). 종전엔 시즌 누적 합계 순위라 홈 리더와 숫자가 안 맞았다.
//     a'. 시즌 누적 합계(보조 줄) — 마일스톤 체이서도 이 누적값 기준
//     b. "이번 주 하이라이트" 활성 여부 (직전 라운드 참여 시 true + href)
//     c. 마일스톤 체이서 · 진행 중 스트릭
//   친선전은 computeLeagueStats 가 제외한다. 게스트도 거기서 순위 모집단에서 빠진다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { getApprovedSession } from '@/lib/auth/guard'
import { computeLeagueStats } from '@/lib/stats/leagueStats'
import { computeStreaks, type StreakCategory } from '@/lib/stats/streaks'
import { loadCurrentQuarter, gameDateRange } from '@/lib/league/currentQuarter'
import { leaderMinRounds } from '@/lib/stats/eligibility'
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
  const [quarterStats, seasonStats, streaksResult] = await Promise.all([
    computeLeagueStats(sb, leagueId, {
      unit: 'round',
      ...(range ? { from: range.from, to: range.to } : q ? { quarterId: q.id } : {}),
    }),
    computeLeagueStats(sb, leagueId),
    computeStreaks(sb, leagueId, { minStreak: 2 }),
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

  // 이번 분기 · 하루 평균 + 순위 — 순위 모집단 = 홈 리더와 같은 「최소 출전」 충족자
  const qPlayers = quarterStats.players
  const minRounds = leaderMinRounds(qPlayers)
  const eligible = qPlayers.filter(p => p.gp >= minRounds)
  const qMe = qPlayers.find(p => p.player_id === pid)
  const isEligible = !!qMe && qMe.gp >= minRounds
  const rankOf = (mine: PlayerStat, key: Metric): { rank: number; total: number } => {
    const f = PER_DAY_KEY[key]
    const higher = eligible.filter(p => p[f] > mine[f]).length
    return { rank: higher + 1, total: eligible.length }
  }
  const quarter = {
    label: q?.label ?? null,
    attended_rounds: qMe?.gp ?? 0,
    total_rounds: quarterStats.total_rounds ?? 0,
    min_rounds: minRounds,
    eligible: isEligible,
    per_day: Object.fromEntries(METRICS.map(k => [k, qMe ? qMe[PER_DAY_KEY[k]] : 0])) as Record<Metric, number>,
    ranks: (qMe && isEligible
      ? Object.fromEntries(METRICS.map(k => [k, rankOf(qMe, k)]))
      : {}) as Partial<Record<Metric, { rank: number; total: number }>>,
  }

  if (!me) {
    return NextResponse.json({
      quarter,
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
    season,
    weekly,
    milestoneChasers: chasers,
    streaks,
  })
}
