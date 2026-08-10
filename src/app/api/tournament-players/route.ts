import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { resolveTeamIdForTournament, verifyTeamPinForTeam } from '@/lib/teamPinAuth'

export async function GET(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const tournamentId = searchParams.get('tournamentId')
  if (!tournamentId) return NextResponse.json({ error: 'tournamentId required' }, { status: 400 })
  const { data, error } = await supabase
    .from('tournament_players')
    .select('player_id')
    .eq('tournament_id', tournamentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ player_ids: data.map(r => r.player_id) })
}

// 대회 선수 일괄 저장 (기존 삭제 후 재등록)
export async function POST(req: Request) {
  const { tournament_id, player_ids } = await req.json()
  if (!tournament_id) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

  const teamId = await resolveTeamIdForTournament(tournament_id)
  if (!(await verifyTeamPinForTeam(req, teamId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createClient()

  // 기존 삭제
  await supabase.from('tournament_players').delete().eq('tournament_id', tournament_id)

  if (!player_ids || player_ids.length === 0) return NextResponse.json({ success: true })

  const rows = player_ids.map((pid: string) => ({ tournament_id, player_id: pid }))
  const { error } = await supabase.from('tournament_players').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
