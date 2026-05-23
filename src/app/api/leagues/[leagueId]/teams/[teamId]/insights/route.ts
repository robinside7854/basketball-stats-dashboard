import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// GET /api/leagues/[leagueId]/teams/[teamId]/insights?quarterId=xxx
// 팀의 단일 일자 기록 + Four Factors + Advanced Metrics (자기 팀 + 상대 비교)
// 친선전(is_exhibition=true)은 제외

const SHOT_TYPES = new Set(['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive'])

type Agg = {
  pts: number
  fgm: number; fga: number; fg3m: number; fg3a: number
  ftm: number; fta: number
  oreb: number; dreb: number; reb: number
  ast: number; stl: number; blk: number; tov: number; pf: number
}
const emptyAgg = (): Agg => ({
  pts:0, fgm:0, fga:0, fg3m:0, fg3a:0,
  ftm:0, fta:0, oreb:0, dreb:0, reb:0,
  ast:0, stl:0, blk:0, tov:0, pf:0,
})

function addToAgg(agg: Agg, e: { type: string; result: string | null; points: number | null }) {
  const made = e.result === 'made'
  const pts = e.points ?? 0
  switch (e.type) {
    case 'shot_3p':
      agg.fga++; agg.fg3a++; if (made) { agg.fgm++; agg.fg3m++; agg.pts += pts }
      break
    case 'shot_2p_mid': case 'shot_layup': case 'shot_post': case 'shot_2p_drive':
      agg.fga++; if (made) { agg.fgm++; agg.pts += pts }
      break
    case 'and_one':
      if (made) agg.pts += pts; break
    case 'ft_2pt': case 'ft_3pt_1':
      agg.fta++; if (made) { agg.ftm++; agg.pts += pts }; break
    case 'ft_3pt_2': case 'free_throw':
      agg.fta++; if (made) { agg.ftm++; agg.pts += pts }; break
    case 'oreb': agg.oreb++; agg.reb++; break
    case 'dreb': agg.dreb++; agg.reb++; break
    case 'steal': agg.stl++; break
    case 'block': agg.blk++; break
    case 'turnover': agg.tov++; break
    case 'foul': agg.pf++; break
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; teamId: string }> }
) {
  const { leagueId, teamId } = await params
  const { searchParams } = new URL(req.url)
  const quarterId = searchParams.get('quarterId')

  const supabase = createClient()

  // 1) 이 팀이 출전한 완료 경기 (친선전 제외)
  let gamesQuery = supabase
    .from('league_games')
    .select('id, date, home_team_id, away_team_id, home_score, away_score, quarter_id, is_exhibition, is_complete')
    .eq('league_id', leagueId)
    .eq('is_complete', true)
    .eq('is_exhibition', false)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
  if (quarterId && quarterId !== 'all') {
    gamesQuery = gamesQuery.eq('quarter_id', quarterId)
  }
  const { data: games } = await gamesQuery

  if (!games || games.length === 0) {
    return NextResponse.json({
      team_total: emptyAgg(),
      opp_total: emptyAgg(),
      game_count: 0,
      day_count: 0,
      records: {},
      advanced: null,
      four_factors: null,
    })
  }

  // 팀 메타 (상대팀 이름 조회용)
  const { data: teams } = await supabase
    .from('league_teams')
    .select('id, name, color')
    .eq('league_id', leagueId)
  const teamMap = Object.fromEntries((teams ?? []).map(t => [t.id, t]))

  // 2) 해당 경기들의 모든 이벤트
  const gameIds = games.map(g => g.id)
  type EvRow = { league_game_id: string; team_id: string | null; type: string; result: string | null; points: number | null }
  const events: EvRow[] = []
  const PAGE = 1000
  let page = 0
  while (true) {
    const { data: chunk } = await supabase
      .from('league_game_events')
      .select('league_game_id, team_id, type, result, points')
      .in('league_game_id', gameIds)
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (chunk && chunk.length > 0) events.push(...(chunk as EvRow[]))
    if (!chunk || chunk.length < PAGE) break
    page++
  }

  // 3) 일자별 + 경기별 + 팀/상대 분리 집계
  type DayAgg = { date: string; team: Agg; opp: Agg; oppName: string; gameIds: string[]; teamScore: number; oppScore: number }
  const byDate: Record<string, DayAgg> = {}
  const byGame: Record<string, { team: Agg; opp: Agg; date: string; oppName: string; teamScore: number; oppScore: number }> = {}

  // 게임별 메타 초기화
  for (const g of games) {
    const isHome = g.home_team_id === teamId
    const oppId = isHome ? g.away_team_id : g.home_team_id
    const oppName = oppId ? (teamMap[oppId]?.name ?? '상대') : '상대'
    const teamScore = isHome ? g.home_score : g.away_score
    const oppScore  = isHome ? g.away_score : g.home_score
    byGame[g.id] = { team: emptyAgg(), opp: emptyAgg(), date: g.date, oppName, teamScore, oppScore }
    if (!byDate[g.date]) byDate[g.date] = { date: g.date, team: emptyAgg(), opp: emptyAgg(), oppName, gameIds: [], teamScore: 0, oppScore: 0 }
    byDate[g.date].gameIds.push(g.id)
    byDate[g.date].teamScore += teamScore
    byDate[g.date].oppScore  += oppScore
    // 같은 날 상대가 여러 명일 수 있음 → 여러 상대명 누적
    if (!byDate[g.date].oppName.includes(oppName)) {
      byDate[g.date].oppName = byDate[g.date].oppName === '상대' ? oppName : `${byDate[g.date].oppName}, ${oppName}`
    }
  }

  // 이벤트를 팀 vs 상대로 분배
  for (const e of events) {
    const g = byGame[e.league_game_id]
    if (!g) continue
    const target = e.team_id === teamId ? g.team : (e.team_id ? g.opp : null)
    if (!target) continue
    addToAgg(target, e)
    // 일자 누적도 동시에
    const day = byDate[g.date]
    if (day) {
      const dayTarget = e.team_id === teamId ? day.team : day.opp
      addToAgg(dayTarget, e)
    }
  }

  // 4) 누적 합산
  const teamTotal = emptyAgg()
  const oppTotal  = emptyAgg()
  for (const g of Object.values(byGame)) {
    for (const k of Object.keys(teamTotal) as (keyof Agg)[]) {
      teamTotal[k] += g.team[k]
      oppTotal[k]  += g.opp[k]
    }
  }

  // 5) 단일 일자 기록
  const days = Object.values(byDate)
  const findBest = (cmp: (d: DayAgg) => number) => {
    if (days.length === 0) return null
    let best = days[0]
    for (const d of days.slice(1)) if (cmp(d) > cmp(best)) best = d
    return best
  }

  type DayRecord = { date: string; value: number; vs: string; score: string }
  const toRecord = (d: DayAgg | null, value: number): DayRecord | null =>
    d ? { date: d.date, value, vs: d.oppName, score: `${d.teamScore}-${d.oppScore}` } : null

  const mostPointsDay   = findBest(d => d.teamScore)
  const fewestAllowed   = days.length > 0 ? days.reduce((b, d) => d.oppScore < b.oppScore ? d : b, days[0]) : null
  const biggestWin      = findBest(d => d.teamScore - d.oppScore)
  const mostAst         = findBest(d => d.team.ast)
  const most3pm         = findBest(d => d.team.fg3m)
  const mostStlBlk      = findBest(d => d.team.stl + d.team.blk)
  const mostReb         = findBest(d => d.team.reb)

  const records = {
    most_points_day:   toRecord(mostPointsDay, mostPointsDay?.teamScore ?? 0),
    fewest_allowed:    toRecord(fewestAllowed, fewestAllowed?.oppScore ?? 0),
    biggest_win:       biggestWin && (biggestWin.teamScore > biggestWin.oppScore)
                         ? toRecord(biggestWin, biggestWin.teamScore - biggestWin.oppScore) : null,
    most_ast_day:      toRecord(mostAst, mostAst?.team.ast ?? 0),
    most_3pm_day:      toRecord(most3pm, most3pm?.team.fg3m ?? 0),
    most_stl_blk_day:  toRecord(mostStlBlk, mostStlBlk ? mostStlBlk.team.stl + mostStlBlk.team.blk : 0),
    most_reb_day:      toRecord(mostReb, mostReb?.team.reb ?? 0),
  }

  // 6) Advanced + Four Factors
  // 포제션 추정: FGA + 0.44*FTA + TOV (Dean Oliver)
  const teamPoss = teamTotal.fga + 0.44 * teamTotal.fta + teamTotal.tov
  const oppPoss  = oppTotal.fga + 0.44 * oppTotal.fta + oppTotal.tov
  const gameCount = games.length
  const dayCount  = days.length

  const ortg = teamPoss > 0 ? +(teamTotal.pts / teamPoss * 100).toFixed(1) : 0
  const drtg = oppPoss > 0 ? +(oppTotal.pts  / oppPoss * 100).toFixed(1) : 0
  const netRtg = +(ortg - drtg).toFixed(1)
  const pace = gameCount > 0 ? +((teamPoss + oppPoss) / 2 / gameCount).toFixed(1) : 0

  const efgTeam = teamTotal.fga > 0 ? +((teamTotal.fgm + 0.5 * teamTotal.fg3m) / teamTotal.fga * 100).toFixed(1) : 0
  const efgOpp  = oppTotal.fga > 0 ? +((oppTotal.fgm + 0.5 * oppTotal.fg3m) / oppTotal.fga * 100).toFixed(1) : 0
  const tovTeam = teamPoss > 0 ? +(teamTotal.tov / teamPoss * 100).toFixed(1) : 0
  const tovOpp  = oppPoss > 0 ? +(oppTotal.tov / oppPoss * 100).toFixed(1) : 0
  // ORB% = ORB / (ORB + opp DRB)
  const orbTeam = (teamTotal.oreb + oppTotal.dreb) > 0 ? +(teamTotal.oreb / (teamTotal.oreb + oppTotal.dreb) * 100).toFixed(1) : 0
  const orbOpp  = (oppTotal.oreb + teamTotal.dreb) > 0 ? +(oppTotal.oreb / (oppTotal.oreb + teamTotal.dreb) * 100).toFixed(1) : 0
  // FT/FGA
  const ftrTeam = teamTotal.fga > 0 ? +(teamTotal.fta / teamTotal.fga * 100).toFixed(1) : 0
  const ftrOpp  = oppTotal.fga > 0 ? +(oppTotal.fta / oppTotal.fga * 100).toFixed(1) : 0

  return NextResponse.json({
    team_total: teamTotal,
    opp_total: oppTotal,
    game_count: gameCount,
    day_count: dayCount,
    records,
    four_factors: {
      efg:  { team: efgTeam,  opp: efgOpp  },
      tov:  { team: tovTeam,  opp: tovOpp  },
      orb:  { team: orbTeam,  opp: orbOpp  },
      ftr:  { team: ftrTeam,  opp: ftrOpp  },
    },
    advanced: {
      ortg, drtg, net_rtg: netRtg, pace,
      team_poss: +teamPoss.toFixed(1),
      opp_poss:  +oppPoss.toFixed(1),
    },
  })
}
// SHOT_TYPES referenced in agent doc comments only; unused at runtime
void SHOT_TYPES
