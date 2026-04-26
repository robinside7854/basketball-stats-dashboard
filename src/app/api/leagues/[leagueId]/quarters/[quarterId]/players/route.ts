import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

type Ctx = { params: Promise<{ leagueId: string; quarterId: string }> }

// GET /api/leagues/[leagueId]/quarters/[quarterId]/players
// Returns all players with their quarter membership (team + is_regular)
export async function GET(
  _req: Request,
  { params }: Ctx
) {
  const { leagueId, quarterId } = await params
  const supabase = createClient()

  const { data: players, error: pErr } = await supabase
    .from('league_players')
    .select('id, name, number, position, birth_date')
    .eq('league_id', leagueId)
    .order('name')

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  const { data: memberships } = await supabase
    .from('league_player_quarters')
    .select('league_player_id, team_id, is_regular')
    .eq('quarter_id', quarterId)

  const membershipMap = Object.fromEntries(
    (memberships ?? []).map(m => [m.league_player_id, m])
  )

  const result = (players ?? []).map(p => ({
    ...p,
    team_id: membershipMap[p.id]?.team_id ?? null,
    is_regular: membershipMap[p.id]?.is_regular ?? null,
  }))

  return NextResponse.json(result)
}

// PUT /api/leagues/[leagueId]/quarters/[quarterId]/players
// Bulk upsert player memberships: [{ league_player_id, team_id, is_regular }]
export async function PUT(
  req: Request,
  { params }: Ctx
) {
  const { leagueId, quarterId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { players } = await req.json() as {
    players: { league_player_id: string; team_id: string | null; is_regular: boolean }[]
  }
  if (!Array.isArray(players)) return NextResponse.json({ error: 'players 배열 필수' }, { status: 400 })

  const supabase = createClient()
  const rows = players.map(p => ({
    league_id: leagueId,
    quarter_id: quarterId,
    league_player_id: p.league_player_id,
    team_id: p.team_id,
    is_regular: p.is_regular,
  }))

  const { error } = await supabase
    .from('league_player_quarters')
    .upsert(rows, { onConflict: 'quarter_id,league_player_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH /api/leagues/[leagueId]/quarters/[quarterId]/players
// Single player membership update: { league_player_id, team_id, is_regular }
export async function PATCH(
  req: Request,
  { params }: Ctx
) {
  const { leagueId, quarterId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { league_player_id, team_id, is_regular } = await req.json()
  if (!league_player_id) return NextResponse.json({ error: 'league_player_id 필수' }, { status: 400 })

  const supabase = createClient()
  const { error } = await supabase
    .from('league_player_quarters')
    .upsert({
      league_id: leagueId,
      quarter_id: quarterId,
      league_player_id,
      team_id: team_id ?? null,
      is_regular: is_regular ?? true,
    }, { onConflict: 'quarter_id,league_player_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
