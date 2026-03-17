import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

// 임시 진단용 API — 특정 선수의 특정 대회 이벤트 전체 조회
// 사용: GET /api/debug/player-events?playerId=UUID&tournamentId=UUID
export async function GET(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const playerId = searchParams.get('playerId')
  const tournamentId = searchParams.get('tournamentId')

  if (!playerId || !tournamentId) {
    return NextResponse.json({ error: 'playerId and tournamentId required' }, { status: 400 })
  }

  // 해당 대회의 경기 ID 목록
  const { data: games } = await supabase
    .from('games')
    .select('id, date, opponent, our_score, opponent_score')
    .eq('tournament_id', tournamentId)
    .order('date')

  const gameIds = (games || []).map((g: { id: string }) => g.id)
  if (gameIds.length === 0) return NextResponse.json({ games: [], events: [] })

  // 해당 선수의 출전 기록
  const { data: minutes } = await supabase
    .from('player_minutes')
    .select('*')
    .eq('player_id', playerId)
    .in('game_id', gameIds)

  // 해당 선수의 이벤트 (player_id 기준)
  const { data: myEvents } = await supabase
    .from('game_events')
    .select('*')
    .eq('player_id', playerId)
    .in('game_id', gameIds)
    .order('video_timestamp')

  // 전체 이벤트 수 (대회 전체)
  const { count: totalCount } = await supabase
    .from('game_events')
    .select('*', { count: 'exact', head: true })
    .in('game_id', gameIds)

  return NextResponse.json({
    player_id: playerId,
    tournament_id: tournamentId,
    games,
    player_minutes: minutes,
    player_events: myEvents,
    total_events_in_tournament: totalCount,
    player_event_count: (myEvents || []).length,
  })
}
