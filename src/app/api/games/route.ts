import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { resolveTeamIdForTournament, verifyTeamPinForTeam } from '@/lib/teamPinAuth'

export async function GET(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const tournamentId = searchParams.get('tournamentId')
  let query = supabase.from('games').select('*, tournament:tournaments(*)').order('date', { ascending: false })
  if (tournamentId) query = query.eq('tournament_id', tournamentId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const body = await req.json()
  const teamId = await resolveTeamIdForTournament(body.tournament_id)
  if (!(await verifyTeamPinForTeam(req, teamId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createClient()
  const { data, error } = await supabase.from('games').insert(body).select('*, tournament:tournaments(*)').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
