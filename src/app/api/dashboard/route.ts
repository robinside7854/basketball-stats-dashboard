import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'
import { calculateBoxScore, calculateTeamTotals } from '@/lib/stats/calculator'
import type { PlayerBoxScore } from '@/types/database'

// 라운드 우선순위 (숫자 클수록 나중 라운드 → 우측 배치)
const ROUND_KEYWORDS: [string, number][] = [
  ['결승', 100], ['final', 100],
  ['3위', 90], ['3-4위', 90],
  ['준결승', 80], ['4강', 80], ['semi', 80],
  ['8강', 70], ['준준결승', 70], ['quarter', 70],
  ['16강', 60],
  ['조별', 20], ['예선', 10], ['group', 10],
]
function roundPriority(round?: string | null): number {
  if (!round) return 50
  const lower = round.toLowerCase()
  for (const [key, val] of ROUND_KEYWORDS) {
    if (lower.includes(key.toLowerCase())) return val
  }
  return 50
}

export async function GET(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const team = searchParams.get('team')

  // If team filter requested, scope to that team's tournament IDs
  let tournamentIds: string[] | null = null
  let scopedTeamId: string | null = null
  if (team) {
    const { getTeamId } = await import('@/lib/supabase/get-team-id')
    const org = new URL(req.url).searchParams.get('org') ?? 'paranalgae'
    scopedTeamId = await getTeamId(org, team)
    if (!scopedTeamId) return NextResponse.json({ recentGames: [], seasonRecord: { wins: 0, losses: 0, total: 0 }, leaders: null, teamAvg: null, teamRecords: null })
    const { data: teamTournaments } = await supabase.from('tournaments').select('id').eq('team_id', scopedTeamId)
    tournamentIds = (teamTournaments ?? []).map(t => t.id)
  }

  let gamesQuery = supabase.from('games').select('*, tournament:tournaments(id, name)').order('date', { ascending: false })
  if (tournamentIds !== null) {
    if (tournamentIds.length === 0) {
      return NextResponse.json({ recentGames: [], seasonRecord: { wins: 0, losses: 0, total: 0 }, leaders: null, teamAvg: null, teamRecords: null })
    }
    gamesQuery = gamesQuery.in('tournament_id', tournamentIds)
  }
  const { data: allGamesRaw, error: gamesError } = await gamesQuery

  if (gamesError) {
    return NextResponse.json({ error: gamesError.message }, { status: 500 })
  }

  if (!allGamesRaw || allGamesRaw.length === 0) {
    return NextResponse.json({
      recentGames: [],
      seasonRecord: { wins: 0, losses: 0, total: 0 },
      leaders: null,
      teamAvg: null,
      teamRecords: null,
    })
  }

  // 날짜 내림차순, 같은 날짜면 라운드 우선순위 내림차순 (결승 > 4강 > 8강 ...)
  type RawGame = Record<string, unknown>
  const allGames: RawGame[] = [...allGamesRaw].sort((a, b) => {
    const dateDiff = (b.date as string).localeCompare(a.date as string)
    if (dateDiff !== 0) return dateDiff
    return roundPriority(b.round as string) - roundPriority(a.round as string)
  })

  // 최근 5경기 → reverse로 좌=오래된(예선), 우=최신(결승) 배치
  const recentGames = allGames.slice(0, 5).reverse()

  const wins = allGames.filter(g => (g.our_score as number) > (g.opponent_score as number)).length
  const losses = allGames.filter(g => (g.our_score as number) < (g.opponent_score as number)).length

  const gameIds = allGames.map(g => g.id as string)

  // 게임별 개별 조회로 Supabase max_rows(1000) 우회
  let playersQuery = supabase.from('players').select('*').eq('is_active', true).order('number')
  if (scopedTeamId) playersQuery = playersQuery.eq('team_id', scopedTeamId)
  const [playersRes, ...gameResults] = await Promise.all([
    playersQuery,
    ...gameIds.map(gid => Promise.all([
      supabase.from('game_events').select('*').eq('game_id', gid),
      supabase.from('player_minutes').select('*').eq('game_id', gid),
    ]))
  ])

  if (playersRes.error) {
    return NextResponse.json({
      recentGames,
      seasonRecord: { wins, losses, total: allGames.length },
      leaders: null,
      teamAvg: null,
      teamRecords: null,
    })
  }

  type EventRow = Record<string, unknown>
  type MinuteRow = Record<string, unknown>
  const allEvents: EventRow[] = []
  const allMinutes: MinuteRow[] = []
  for (const [evRes, minRes] of gameResults as Array<[{ data: EventRow[] | null }, { data: MinuteRow[] | null }]>) {
    if (evRes.data) allEvents.push(...evRes.data)
    if (minRes.data) allMinutes.push(...minRes.data)
  }

  const boxScores = calculateBoxScore(allEvents as never, allMinutes as never, playersRes.data)
  const teamTotals = calculateTeamTotals(boxScores)

  const recordedGameIds = new Set(allMinutes.map((m) => (m as { game_id: string }).game_id))
  const recordedGamesCount = recordedGameIds.size

  // 선수별 평균
  const withAverages = boxScores.map((s: PlayerBoxScore) => {
    const gp = new Set(
      allMinutes.filter((m) => (m as { player_id: string }).player_id === s.player_id).map((m) => (m as { game_id: string }).game_id)
    ).size
    return {
      ...s,
      games_played: gp,
      pts_avg: gp > 0 ? Math.round((s.pts / gp) * 10) / 10 : 0,
      reb_avg: gp > 0 ? Math.round((s.reb / gp) * 10) / 10 : 0,
      ast_avg: gp > 0 ? Math.round((s.ast / gp) * 10) / 10 : 0,
    }
  })

  const top = (key: string) =>
    [...withAverages].sort((a, b) => (Number((b as Record<string, unknown>)[key]) || 0) - (Number((a as Record<string, unknown>)[key]) || 0))[0]

  // 평균 득점/실점 — 둘 다 games 테이블 점수 기준으로 통일 (분모 일치)
  const totalOurScore = allGames.reduce((sum, g) => sum + (g.our_score as number), 0)
  const totalOppScore = allGames.reduce((sum, g) => sum + (g.opponent_score as number), 0)
  const pts_avg_from_games = Math.round((totalOurScore / allGames.length) * 10) / 10
  const opp_avg = Math.round((totalOppScore / allGames.length) * 10) / 10

  const teamAvg = recordedGamesCount > 0 ? {
    pts_avg: pts_avg_from_games,
    opp_avg,
    fg_pct: (teamTotals.fga ?? 0) > 0
      ? Math.round(((teamTotals.fgm ?? 0) / (teamTotals.fga ?? 1)) * 1000) / 10 : 0,
    fg3_pct: (teamTotals.fg3a ?? 0) > 0
      ? Math.round(((teamTotals.fg3m ?? 0) / (teamTotals.fg3a ?? 1)) * 1000) / 10 : 0,
    ft_pct: (teamTotals.fta ?? 0) > 0
      ? Math.round(((teamTotals.ftm ?? 0) / (teamTotals.fta ?? 1)) * 1000) / 10 : 0,
  } : null

  // ── 팀 기록 (경기별 집계) ─────────────────────────────────────
  const gameEventsMap = new Map<string, { fg3m: number; tov: number }>()
  for (const e of allEvents) {
    const gid = e.game_id as string
    if (!gameEventsMap.has(gid)) gameEventsMap.set(gid, { fg3m: 0, tov: 0 })
    const gm = gameEventsMap.get(gid)!
    if (e.type === 'shot_3p' && e.result === 'made') gm.fg3m++
    if (e.type === 'turnover') gm.tov++
  }

  function gameRecord(g: RawGame) {
    const t = g.tournament as { name: string } | null
    return {
      game_id: g.id as string,
      date: g.date as string,
      opponent: g.opponent as string,
      round: (g.round as string | null) ?? null,
      our_score: g.our_score as number,
      opponent_score: g.opponent_score as number,
      tournament_name: t?.name ?? null,
    }
  }

  const maxScoreGame = allGames.reduce((best, g) => (g.our_score as number) > (best.our_score as number) ? g : best)
  const maxOppScoreGame = allGames.reduce((best, g) => (g.opponent_score as number) > (best.opponent_score as number) ? g : best)

  // 최대 점수차 승리 (승리한 경기 중에서만)
  const winGames = allGames.filter(g => (g.our_score as number) > (g.opponent_score as number))
  const maxMarginGame = winGames.length > 0
    ? winGames.reduce((best, g) => {
        const margin = (g.our_score as number) - (g.opponent_score as number)
        const bestMargin = (best.our_score as number) - (best.opponent_score as number)
        return margin > bestMargin ? g : best
      })
    : null

  let max3Game = allGames[0], max3 = 0
  let maxTovGame = allGames[0], maxTov = 0
  for (const g of allGames) {
    const cnt3 = gameEventsMap.get(g.id as string)?.fg3m ?? 0
    if (cnt3 > max3) { max3 = cnt3; max3Game = g }
    const tov = gameEventsMap.get(g.id as string)?.tov ?? 0
    if (tov > maxTov) { maxTov = tov; maxTovGame = g }
  }

  const teamRecords = {
    maxScore:    { ...gameRecord(maxScoreGame),    value: maxScoreGame.our_score as number },
    maxOppScore: { ...gameRecord(maxOppScoreGame), value: maxOppScoreGame.opponent_score as number },
    max3pm:      { ...gameRecord(max3Game),         value: max3 },
    maxTov:      { ...gameRecord(maxTovGame),       value: maxTov },
    maxMargin:   maxMarginGame
      ? { ...gameRecord(maxMarginGame), value: (maxMarginGame.our_score as number) - (maxMarginGame.opponent_score as number) }
      : null,
  }

  // 현재 연승/연패 스트릭 계산 (날짜 내림차순 allGames 기준)
  let streak = 0
  let streakType: 'win' | 'loss' | null = null
  for (const g of allGames) {
    const isW = (g.our_score as number) > (g.opponent_score as number)
    const isL = (g.our_score as number) < (g.opponent_score as number)
    if (streakType === null) {
      if (isW) { streakType = 'win'; streak = 1 }
      else if (isL) { streakType = 'loss'; streak = 1 }
      else continue // 무 → skip
    } else {
      if (streakType === 'win' && isW) streak++
      else if (streakType === 'loss' && isL) streak++
      else break
    }
  }

  return NextResponse.json({
    recentGames,
    seasonRecord: { wins, losses, total: allGames.length },
    streak: { count: streak, type: streakType },
    leaders: (() => {
      function makeLeader(key: string, valKey: string) {
        const p = top(key); if (!p) return null
        return { player_id: p.player_id, player_name: p.player_name, player_number: p.player_number, value: Number((p as Record<string, unknown>)[valKey]) }
      }
      // 3P%·TS%는 최소 시도 수 필터 (노이즈 방지: 3PA≥5, FGA≥10)
      const fg3Leaders = withAverages.filter(p => (p.fg3a ?? 0) >= 5)
      const tsLeaders  = withAverages.filter(p => (p.fga  ?? 0) >= 10)
      const topFg3 = fg3Leaders.length > 0
        ? fg3Leaders.reduce((best, p) => (p.fg3_pct ?? 0) > (best.fg3_pct ?? 0) ? p : best)
        : null
      const topTs = tsLeaders.length > 0
        ? tsLeaders.reduce((best, p) => (p.ts_pct ?? 0) > (best.ts_pct ?? 0) ? p : best)
        : null
      return {
        ppg: makeLeader('pts_avg', 'pts_avg'),
        rpg: makeLeader('reb_avg', 'reb_avg'),
        apg: makeLeader('ast_avg', 'ast_avg'),
        fg3_pct: topFg3 ? { player_id: topFg3.player_id, player_name: topFg3.player_name, player_number: topFg3.player_number, value: topFg3.fg3_pct ?? 0 } : null,
        ts_pct:  topTs  ? { player_id: topTs.player_id,  player_name: topTs.player_name,  player_number: topTs.player_number,  value: topTs.ts_pct  ?? 0 } : null,
      }
    })(),
    teamAvg,
    teamRecords,
  })
}
