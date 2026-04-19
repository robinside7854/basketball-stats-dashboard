import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'
import { calculateBoxScore, calculateTeamTotals, calculateQuarterPoints } from '@/lib/stats/calculator'
import type { PlayerBoxScore, GameEvent, PlayerMinutes } from '@/types/database'

export async function GET(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const tournamentId = searchParams.get('tournamentId')
  const team = searchParams.get('team')

  let gamesQuery = supabase.from('games').select('id, date, opponent, our_score, opponent_score, round')
  if (tournamentId) gamesQuery = gamesQuery.eq('tournament_id', tournamentId)
  const { data: games, error: gamesError } = await gamesQuery.order('date', { ascending: true })
  if (gamesError) return NextResponse.json({ error: gamesError.message }, { status: 500 })

  const gameIds = games.map((g) => g.id)
  if (gameIds.length === 0) return NextResponse.json({ players: [], teamTotals: {}, total_games: 0, game_summaries: [] })

  // 게임별 개별 조회로 Supabase max_rows(1000) 우회
  let playersQuery = supabase.from('players').select('*').eq('is_active', true).order('number')
  if (team) {
    const { getTeamId } = await import('@/lib/supabase/get-team-id')
    const org = new URL(req.url).searchParams.get('org') ?? 'paranalgae'
    const teamId = await getTeamId(org)
    if (teamId) playersQuery = playersQuery.eq('team_id', teamId).eq('team_type', team)
  }
  const [playersRes, ...gameResults] = await Promise.all([
    playersQuery,
    ...gameIds.map(gid => Promise.all([
      supabase.from('game_events').select('*').eq('game_id', gid),
      supabase.from('player_minutes').select('*').eq('game_id', gid),
    ]))
  ])

  if (playersRes.error) return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 })

  const allEvents: GameEvent[] = []
  const allMinutes: PlayerMinutes[] = []
  for (const [evRes, minRes] of gameResults as Array<[{ data: GameEvent[] | null }, { data: PlayerMinutes[] | null }]>) {
    if (evRes.data) allEvents.push(...evRes.data)
    if (minRes.data) allMinutes.push(...minRes.data)
  }

  const boxScores = calculateBoxScore(allEvents, allMinutes, playersRes.data)
  const teamTotals = calculateTeamTotals(boxScores)

  // 실제 기록된 경기 수 (player_minutes 존재하는 게임만)
  const recordedGameIds = new Set(allMinutes.map(m => m.game_id))
  const totalGames = recordedGameIds.size

  // 선수별 실제 출전 경기 수 (player_minutes 기준)
  const withAverages = boxScores.map((s: PlayerBoxScore) => {
    const playerGames = new Set(
      allMinutes.filter(m => m.player_id === s.player_id).map(m => m.game_id)
    ).size
    return {
      ...s,
      pts_avg: playerGames > 0 ? Math.round((s.pts / playerGames) * 10) / 10 : 0,
      reb_avg: playerGames > 0 ? Math.round((s.reb / playerGames) * 10) / 10 : 0,
      ast_avg: playerGames > 0 ? Math.round((s.ast / playerGames) * 10) / 10 : 0,
      games_played: playerGames,
    }
  })

  // 상대별 팀 스탯 요약 (기록된 경기만)
  const game_summaries = games
    .filter(g => recordedGameIds.has(g.id))
    .map(g => {
      const gameEvents = allEvents.filter(e => e.game_id === g.id)
      const gameMinutes = allMinutes.filter(m => m.game_id === g.id)
      const gameBoxScores = calculateBoxScore(gameEvents, gameMinutes, playersRes.data)
      const totals = calculateTeamTotals(gameBoxScores)
      const qPts = calculateQuarterPoints(gameEvents)
      const teamQPts: Record<number, number> = {}
      Object.values(qPts).forEach((qmap) => {
        Object.entries(qmap).forEach(([q, p]) => {
          teamQPts[Number(q)] = (teamQPts[Number(q)] || 0) + p
        })
      })
      return {
        game_id: g.id,
        date: g.date,
        opponent: g.opponent,
        our_score: g.our_score,
        opponent_score: g.opponent_score,
        round: g.round ?? null,
        totals,
        team_quarter_pts: teamQPts,
      }
    })

  return NextResponse.json({ players: withAverages, teamTotals, total_games: totalGames, game_summaries })
}
