import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'
import { calculateBoxScore, calculateTeamTotals, calculateQuarterPoints } from '@/lib/stats/calculator'
import type { PlayerBoxScore } from '@/types/database'

export async function GET(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const tournamentId = searchParams.get('tournamentId')

  let gamesQuery = supabase.from('games').select('id, date, opponent, our_score, opponent_score, round')
  if (tournamentId) gamesQuery = gamesQuery.eq('tournament_id', tournamentId)
  const { data: games, error: gamesError } = await gamesQuery.order('date', { ascending: true })
  if (gamesError) return NextResponse.json({ error: gamesError.message }, { status: 500 })

  const gameIds = games.map((g) => g.id)
  if (gameIds.length === 0) return NextResponse.json({ players: [], teamTotals: {}, total_games: 0, game_summaries: [] })

  const [eventsRes, minutesRes, playersRes] = await Promise.all([
    supabase.from('game_events').select('*').in('game_id', gameIds),
    supabase.from('player_minutes').select('*').in('game_id', gameIds),
    supabase.from('players').select('*').eq('is_active', true).order('number'),
  ])

  if (eventsRes.error || minutesRes.error || playersRes.error) {
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }

  const boxScores = calculateBoxScore(eventsRes.data, minutesRes.data, playersRes.data)
  const teamTotals = calculateTeamTotals(boxScores)

  // 실제 기록된 경기 수 (player_minutes 존재하는 게임만)
  const recordedGameIds = new Set(minutesRes.data.map((m: { game_id: string }) => m.game_id))
  const totalGames = recordedGameIds.size

  // 선수별 실제 출전 경기 수 (player_minutes 기준)
  const withAverages = boxScores.map((s: PlayerBoxScore) => {
    const playerGames = new Set(
      minutesRes.data.filter((m: { player_id: string }) => m.player_id === s.player_id).map((m: { game_id: string }) => m.game_id)
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
      const gameEvents = eventsRes.data.filter((e: { game_id: string }) => e.game_id === g.id)
      const gameMinutes = minutesRes.data.filter((m: { game_id: string }) => m.game_id === g.id)
      const gameBoxScores = calculateBoxScore(gameEvents, gameMinutes, playersRes.data)
      const totals = calculateTeamTotals(gameBoxScores)
      // 쿼터별 팀 득점
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
