import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'
import { calculateBoxScore, calculateTeamTotals, calculateQuarterPoints, calcFourFactors } from '@/lib/stats/calculator'

export async function GET(_: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params
  const supabase = createClient()

  const [eventsRes, minutesRes, playersRes, gameRes] = await Promise.all([
    supabase.from('game_events').select('*').eq('game_id', gameId).order('quarter').order('video_timestamp', { nullsFirst: false }).order('created_at'),
    supabase.from('player_minutes').select('*').eq('game_id', gameId),
    supabase.from('players').select('*').eq('is_active', true).order('number'),
    supabase.from('games').select('youtube_url, youtube_start_offset').eq('id', gameId).single(),
  ])

  if (eventsRes.error || minutesRes.error || playersRes.error) {
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }

  const boxScores = calculateBoxScore(eventsRes.data, minutesRes.data, playersRes.data)
  const teamTotals = calculateTeamTotals(boxScores)
  const quarterPts = calculateQuarterPoints(eventsRes.data)
  const fourFactors = calcFourFactors(teamTotals)

  const playerMap = new Map(
    (playersRes.data ?? []).map(p => [p.id, { name: p.name, number: p.number }])
  )

  const events = (eventsRes.data ?? []).map(e => {
    const p = e.player_id ? playerMap.get(e.player_id) : null
    const rp = e.related_player_id ? playerMap.get(e.related_player_id) : null
    return {
      id: e.id,
      quarter: e.quarter,
      video_timestamp: e.video_timestamp,
      type: e.type,
      result: e.result,
      points: e.points,
      player_id: e.player_id,
      player_name: p?.name ?? null,
      player_number: p?.number ?? null,
      related_player_id: e.related_player_id,
      related_player_name: rp?.name ?? null,
    }
  })

  return NextResponse.json({
    boxScores,
    teamTotals,
    quarterPts,
    fourFactors,
    events,
    game: gameRes.data ?? null,
  })
}
