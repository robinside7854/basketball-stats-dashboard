import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const team = searchParams.get('team')
  const org = searchParams.get('org') ?? 'paranalgae'

  let playerIds: string[] | null = null
  if (team) {
    const { getTeamId } = await import('@/lib/supabase/get-team-id')
    const teamId = await getTeamId(org, team)
    if (!teamId) return NextResponse.json({})
    const { data: players } = await supabase.from('players').select('id').eq('team_id', teamId).eq('is_active', true)
    playerIds = (players ?? []).map(p => p.id)
    if (playerIds.length === 0) return NextResponse.json({})
  }

  let q = supabase.from('player_minutes').select('player_id, game_id')
  if (playerIds) q = q.in('player_id', playerIds)
  const { data, error } = await q

  if (error) return NextResponse.json({}, { status: 500 })

  const map: Record<string, Set<string>> = {}
  for (const row of data ?? []) {
    if (!map[row.player_id]) map[row.player_id] = new Set()
    map[row.player_id].add(row.game_id)
  }

  const result: Record<string, number> = {}
  for (const [pid, games] of Object.entries(map)) {
    result[pid] = games.size
  }

  return NextResponse.json(result)
}
