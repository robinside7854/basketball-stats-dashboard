import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

type Ctx = { params: Promise<{ leagueId: string; quarterId: string }> }

// GET /api/leagues/[leagueId]/quarters/[quarterId]/players
// Returns all players with team affiliation for this quarter:
//   1) league_player_quarters (정규/분기 멤버십) — 있으면 우선
//   2) league_game_players (게임별 비정규/타팀 임시 출전) — 폴백, 가장 자주 뛴 팀 사용
export async function GET(
  _req: Request,
  { params }: Ctx
) {
  const { leagueId, quarterId } = await params
  const supabase = createClient()

  const [{ data: players, error: pErr }, { data: memberships }, { data: quarterGames }] = await Promise.all([
    supabase
      .from('league_players')
      .select('id, name, number, position, birth_date')
      .eq('league_id', leagueId)
      .order('name'),
    supabase
      .from('league_player_quarters')
      .select('league_player_id, team_id, is_regular')
      .eq('quarter_id', quarterId),
    supabase
      .from('league_games')
      .select('id')
      .eq('league_id', leagueId)
      .eq('quarter_id', quarterId),
  ])

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  const membershipMap = Object.fromEntries(
    (memberships ?? []).map(m => [m.league_player_id, m])
  )

  // 분기에 속한 게임들의 league_game_players 조회 → 플레이어별 팀 출전 횟수 집계
  const gameIds = (quarterGames ?? []).map(g => g.id)
  const playerGameTeams: Record<string, Record<string, number>> = {}
  if (gameIds.length > 0) {
    const { data: gameAssigns } = await supabase
      .from('league_game_players')
      .select('league_player_id, team_id')
      .in('league_game_id', gameIds)
    for (const a of gameAssigns ?? []) {
      if (!a.league_player_id || !a.team_id) continue
      if (!playerGameTeams[a.league_player_id]) playerGameTeams[a.league_player_id] = {}
      playerGameTeams[a.league_player_id][a.team_id] = (playerGameTeams[a.league_player_id][a.team_id] ?? 0) + 1
    }
  }

  function mostCommonTeam(playerId: string): string | null {
    const teams = playerGameTeams[playerId]
    if (!teams) return null
    let best: string | null = null
    let bestCount = 0
    for (const [t, c] of Object.entries(teams)) {
      if (c > bestCount) { best = t; bestCount = c }
    }
    return best
  }

  const result = (players ?? []).map(p => {
    const m = membershipMap[p.id]
    // 1순위: 분기 정규 멤버십
    if (m?.team_id) {
      return { ...p, team_id: m.team_id, is_regular: m.is_regular ?? false }
    }
    // 2순위: 게임별 비정규 출전 (가장 자주 뛴 팀)
    const gameTeam = mostCommonTeam(p.id)
    if (gameTeam) {
      return { ...p, team_id: gameTeam, is_regular: false }
    }
    return { ...p, team_id: null, is_regular: null }
  })

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
