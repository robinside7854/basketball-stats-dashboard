import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

type Ctx = { params: Promise<{ leagueId: string; gameId: string }> }

// POST /api/leagues/[leagueId]/games/[gameId]/irregular-players
// 비정규 선수를 이 경기(및 같은 날짜·같은 팀 경기)에 배정
export async function POST(req: Request, { params }: Ctx) {
  const { leagueId, gameId } = await params
  if (!await verifyLeaguePin(req, leagueId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { league_player_id, team_id } = await req.json()
  if (!league_player_id || !team_id) {
    return NextResponse.json({ error: 'league_player_id, team_id 필수' }, { status: 400 })
  }

  const supabase = createClient()

  // 현재 게임의 날짜 조회
  const { data: game, error: gErr } = await supabase
    .from('league_games')
    .select('date, home_team_id, away_team_id')
    .eq('id', gameId)
    .eq('league_id', leagueId)
    .single()

  if (gErr || !game) {
    return NextResponse.json({ error: '게임을 찾을 수 없습니다' }, { status: 404 })
  }

  // 이 경기에 배정
  const { error: insErr } = await supabase
    .from('league_game_players')
    .upsert({
      league_id: leagueId,
      league_game_id: gameId,
      league_player_id,
      team_id,
    }, { onConflict: 'league_game_id,league_player_id' })

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  // 같은 날짜의 다른 경기들에서 같은 팀이 뛰는 경우 자동 배정
  const { data: sameDate } = await supabase
    .from('league_games')
    .select('id, home_team_id, away_team_id')
    .eq('league_id', leagueId)
    .eq('date', game.date)
    .neq('id', gameId)

  const autoInserts: { league_id: string; league_game_id: string; league_player_id: string; team_id: string }[] = []
  for (const g of sameDate ?? []) {
    if (g.home_team_id === team_id || g.away_team_id === team_id) {
      autoInserts.push({ league_id: leagueId, league_game_id: g.id, league_player_id, team_id })
    }
  }

  if (autoInserts.length > 0) {
    // 이미 배정된 경기는 무시 (onConflict do nothing)
    await supabase
      .from('league_game_players')
      .upsert(autoInserts, { onConflict: 'league_game_id,league_player_id', ignoreDuplicates: true })
  }

  return NextResponse.json({ ok: true, auto_assigned: autoInserts.length })
}
