import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tournamentId = searchParams.get('tournamentId')

  const supabase = createClient()

  const { data: players } = await supabase
    .from('players')
    .select('id, name, number')
    .eq('is_active', true)
    .order('number')

  let gameIds: string[] | null = null
  if (tournamentId) {
    const { data: games } = await supabase
      .from('games')
      .select('id')
      .eq('tournament_id', tournamentId)
    if (!games || games.length === 0) {
      return NextResponse.json({ players: [], matrix: {}, topPairs: [] })
    }
    gameIds = games.map(g => g.id)
  }

  let query = supabase
    .from('game_events')
    .select('player_id, related_player_id')
    .not('related_player_id', 'is', null)
    .eq('result', 'made')

  if (gameIds) {
    query = query.in('game_id', gameIds)
  }

  const { data: events } = await query

  if (!events || !players) {
    return NextResponse.json({ players: [], matrix: {}, topPairs: [] })
  }

  // matrix[assisterId][scorerId] = count
  const matrix: Record<string, Record<string, number>> = {}
  for (const e of events) {
    if (!e.related_player_id || !e.player_id) continue
    if (!matrix[e.related_player_id]) matrix[e.related_player_id] = {}
    matrix[e.related_player_id][e.player_id] = (matrix[e.related_player_id][e.player_id] || 0) + 1
  }

  const pairs: { assisterId: string; scorerId: string; count: number }[] = []
  for (const [assisterId, scorers] of Object.entries(matrix)) {
    for (const [scorerId, count] of Object.entries(scorers)) {
      pairs.push({ assisterId, scorerId, count })
    }
  }
  pairs.sort((a, b) => b.count - a.count)

  const playerMap = new Map(players.map(p => [p.id, p]))

  const topPairs = pairs.slice(0, 8).map(p => ({
    assister: playerMap.get(p.assisterId),
    scorer: playerMap.get(p.scorerId),
    count: p.count,
  })).filter(p => p.assister && p.scorer)

  // Only return players who appear in the network
  const relevantIds = new Set([
    ...Object.keys(matrix),
    ...Object.values(matrix).flatMap(v => Object.keys(v)),
  ])
  const relevantPlayers = players.filter(p => relevantIds.has(p.id))

  return NextResponse.json({ players: relevantPlayers, matrix, topPairs })
}
