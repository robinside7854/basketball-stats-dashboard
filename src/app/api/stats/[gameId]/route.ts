import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'
import { calculateBoxScore, calculateTeamTotals, calculateQuarterPoints } from '@/lib/stats/calculator'

export async function GET(_: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params
  const supabase = createClient()

  const [eventsRes, minutesRes, playersRes] = await Promise.all([
    supabase.from('game_events').select('*').eq('game_id', gameId).order('created_at'),
    supabase.from('player_minutes').select('*').eq('game_id', gameId),
    supabase.from('players').select('*').eq('is_active', true).order('number'),
  ])

  if (eventsRes.error || minutesRes.error || playersRes.error) {
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }

  const boxScores = calculateBoxScore(eventsRes.data, minutesRes.data, playersRes.data)
  const teamTotals = calculateTeamTotals(boxScores)
  const quarterPts = calculateQuarterPoints(eventsRes.data)

  return NextResponse.json({ boxScores, teamTotals, quarterPts })
}
