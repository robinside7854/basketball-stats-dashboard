import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { logAudit } from '@/lib/audit'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; teamId: string }> }
) {
  const { leagueId, teamId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { league_player_id } = body
  if (!league_player_id) return NextResponse.json({ error: 'league_player_id is required' }, { status: 400 })
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_team_players')
    .insert({ league_team_id: teamId, league_player_id })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')

  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; teamId: string }> }
) {
  const { leagueId, teamId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const league_player_id = searchParams.get('league_player_id')
  if (!league_player_id) return NextResponse.json({ error: 'league_player_id is required' }, { status: 400 })
  const supabase = createClient()
  const { error } = await supabase
    .from('league_team_players')
    .delete()
    .eq('league_team_id', teamId)
    .eq('league_player_id', league_player_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit({
    req, action: 'league_team_player.delete', targetTable: 'league_team_players',
    targetId: league_player_id, leagueId, detail: { leagueTeamId: teamId },
  })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')

  return NextResponse.json({ success: true })
}
