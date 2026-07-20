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
      recentGames: [],
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

  // 2) 이번 주 하이라이트 활성 여부 · 직전 라운드에 참여 여부
  //    최근 라운드 (league_games date desc 첫날) 에 이 선수 이벤트가 있으면 true
  const { data: recentDateRows } = await sb
    .from('league_games')
    .select('date')
    .eq('league_id', leagueId)
    .eq('is_started', true)
    .order('date', { ascending: false })
    .limit(50)
  const uniqueDatesDesc = Array.from(new Set(((recentDateRows ?? []) as Array<{ date: string }>).map(r => r.date)))
  const latestDate = uniqueDatesDesc[0] ?? null
  let weekly: { available: boolean; date?: string } = { available: false }
  if (latestDate) {
    // 이 선수의 latestDate 참여 여부: league_games 로 게임 id 확보 → events 로 참여 확인
    const { data: latestGames } = await sb
      .from('league_games')
      .select('id')
      .eq('league_id', leagueId)
      .eq('is_started', true)
      .eq('date', latestDate)
    const latestGameIds = ((latestGames ?? []) as Array<{ id: string }>).map(g => g.id)
    if (latestGameIds.length > 0) {
      const { count } = await sb
        .from('league_game_events')
        .select('id', { count: 'exact', head: true })
        .in('league_game_id', latestGameIds)
        .eq('league_player_id', pid)
      if ((count ?? 0) > 0) weekly = { available: true, date: latestDate }
      else weekly = { available: false, date: latestDate }
    }
  }

  // 3) 최근 5경기(=최근 5개 참여 라운드) 트렌드
  //    참여한 date desc 5개 · 각 date 의 PTS/REB/AST/STL/BLK 합
  const recentGames: Array<{
    date: string
    pts: number; reb: number; ast: number; stl: number; blk: number
  }> = []

  // 이 선수가 참여한 date 집합을 얻기 위해 event 스캔 (최근순)
  //   최적화: 최근 30일 게임만
  const scopeDates = uniqueDatesDesc.slice(0, 30)  // 최근 30개 라운드 후보
  if (scopeDates.length > 0) {
    const { data: scopedGames } = await sb
      .from('league_games')
      .select('id, date')
      .eq('league_id', leagueId)
      .eq('is_started', true)
      .in('date', scopeDates)
    const gidToDate = new Map(((scopedGames ?? []) as Array<{ id: string; date: string }>).map(g => [g.id, g.date]))
    const gameIds = [...gidToDate.keys()]
    // 이 선수 관련 이벤트만
    const { data: myEvents } = await sb
      .from('league_game_events')
      .select('league_game_id, related_player_id, type, result, points')
      .in('league_game_id', gameIds)
      .or(`league_player_id.eq.${pid},and(related_player_id.eq.${pid},result.eq.made,type.in.(shot_3p,shot_2p_mid,shot_layup,shot_post))`)
      // ↑ 본인이 액션 or 어시스트받은 슛의 어시스터

    // date 별 집계 · 본인 액션 이벤트 or 어시스트만 반영
    type PerDate = { pts: number; reb: number; ast: number; stl: number; blk: number }
    const byDate = new Map<string, PerDate>()
    const ensure = (d: string): PerDate => {
      let v = byDate.get(d)
      if (!v) { v = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 }; byDate.set(d, v) }
      return v
    }
    // 최근 이벤트만 별도 재쿼리 (본인 액션)
    const { data: myOwn } = await sb
      .from('league_game_events')
      .select('league_game_id, type, result, points')
      .in('league_game_id', gameIds)
      .eq('league_player_id', pid)
    const myOwnEvs = (myOwn ?? []) as Array<{ league_game_id: string; type: string; result: string | null; points: number | null }>
    const isShot = (t: string) => t === 'shot_3p' || t === 'shot_2p_mid' || t === 'shot_layup' || t === 'shot_post'
    const isFt = (t: string) => t === 'ft_2pt' || t === 'ft_3pt_1' || t === 'ft_3pt_2' || t === 'free_throw'
    for (const e of myOwnEvs) {
      const d = gidToDate.get(e.league_game_id)
      if (!d) continue
      const v = ensure(d)
      const pts = e.points ?? 0
      const made = e.result === 'made'
      if (made && (isShot(e.type) || e.type === 'and_one' || isFt(e.type))) v.pts += pts
      else if (e.type === 'oreb' || e.type === 'dreb') v.reb++
      else if (e.type === 'steal') v.stl++
      else if (e.type === 'block') v.blk++
    }
    // 어시스트: 다른 선수의 슛 made 중 related_player_id = pid 인 것
    for (const e of ((myEvents ?? []) as Array<{ league_game_id: string; related_player_id: string | null; type: string; result: string | null }>)) {
      if (e.related_player_id !== pid) continue
      if (e.result !== 'made') continue
      if (!isShot(e.type)) continue
      const d = gidToDate.get(e.league_game_id)
      if (!d) continue
      ensure(d).ast++
    }
    // 5개 (date desc)
    const sorted = [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 5)
    for (const [date, v] of sorted) recentGames.push({ date, ...v })
  }

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
    recentGames,
    milestoneChasers: chasers,
  })
}
