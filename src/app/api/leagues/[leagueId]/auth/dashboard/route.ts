// GET /api/leagues/[leagueId]/auth/dashboard
//   로그인 유저 개인화 대시보드 데이터
//     a. 이번 시즌 참석 라운드 · 누적 PTS/REB/AST/STL/BLK + 각 항목별 리그 랭킹
//     b. "이번 주 하이라이트" 활성 여부 (직전 라운드 참여 시 true + href)
//     c. 최근 5경기(=최근 5개 참여 라운드) 스탯 트렌드 + 마일스톤 체이서
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/admin'
import { AUTH_COOKIE, verifySession } from '@/lib/auth/session'
import { computeLeagueStats } from '@/lib/stats/leagueStats'

// 마일스톤 사다리 (playerMilestoneChart 와 동일 규칙)
const MILESTONE_LADDER: Record<'pts' | 'reb' | 'ast' | 'stl' | 'blk', number[]> = {
  pts: [100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000],
  reb: [50, 100, 200, 300, 500, 750, 1000, 1500, 2000],
  ast: [25, 50, 100, 150, 250, 400, 500, 750, 1000],
  stl: [25, 50, 100, 150, 250, 400, 500, 750, 1000],
  blk: [10, 25, 50, 100, 150, 250, 400, 500],
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const jar = await cookies()
  const session = verifySession(jar.get(AUTH_COOKIE)?.value)
  if (!session || session.lid !== leagueId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = createClient()
  const pid = session.pid

  // 1) 시즌 통계 (전체 리그)
  const { players } = await computeLeagueStats(sb, leagueId)
  const me = players.find(p => p.player_id === pid)
  if (!me) {
    return NextResponse.json({
      season: { attended_rounds: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, ranks: {} },
      weekly: { available: false },
      milestoneChasers: [],
    })
  }

  // 게스트 제외한 랭킹
  const { data: nonGuestRows } = await sb
    .from('league_players')
    .select('id, is_guest')
    .eq('league_id', leagueId)
  const guestIds = new Set(((nonGuestRows ?? []) as Array<{ id: string; is_guest: boolean | null }>).filter(r => r.is_guest).map(r => r.id))
  const nonGuestPlayers = players.filter(p => !guestIds.has(p.player_id))

  const rankOf = (key: 'pts' | 'reb' | 'ast' | 'stl' | 'blk'): { rank: number; total: number } => {
    const myVal = me[key]
    const total = nonGuestPlayers.filter(p => p[key] > 0).length
    const higher = nonGuestPlayers.filter(p => p[key] > myVal).length
    return { rank: higher + 1, total }
  }

  const season = {
    attended_rounds: me.gp,
    pts: me.pts,
    reb: me.reb,
    ast: me.ast,
    stl: me.stl,
    blk: me.blk,
    ranks: {
      pts: rankOf('pts'),
      reb: rankOf('reb'),
      ast: rankOf('ast'),
      stl: rankOf('stl'),
      blk: rankOf('blk'),
    },
  }

  // 2) "이번 주 하이라이트" · 이 선수가 최근 참여한 라운드로 바로 연결
  //    최신 이벤트 검색 → 그 이벤트의 game 의 date 사용 (참여한 가장 최근 날짜)
  //    (이전엔 직전 라운드 참여 여부만 체크했으나 · 참여 못한 주는 비활성이라 아쉬움 · 2026-07-21)
  const { data: recentEvent } = await sb
    .from('league_game_events')
    .select('league_game_id')
    .eq('league_player_id', pid)
    .not('video_timestamp', 'is', null)  // 하이라이트 재생 가능한 이벤트로 좁힘
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  let weekly: { available: boolean; date?: string } = { available: false }
  if (recentEvent?.league_game_id) {
    const { data: gameRow } = await sb
      .from('league_games')
      .select('date, league_id')
      .eq('id', recentEvent.league_game_id)
      .maybeSingle()
    if (gameRow && gameRow.league_id === leagueId) {
      weekly = { available: true, date: gameRow.date }
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
    season,
    weekly,
    milestoneChasers: chasers,
  })
}
