import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

type Ctx = { params: Promise<{ leagueId: string; gameId: string }> }

// GET /api/leagues/[leagueId]/games/[gameId]/roster
// 해당 게임의 분기 기준 홈/어웨이 팀별 선수 명단 반환
// 분기 배정이 없으면 리그 전체 선수를 unassigned로 반환 (하위 호환)
export async function GET(
  _req: Request,
  { params }: Ctx
) {
  const { leagueId, gameId } = await params
  const supabase = createClient()

  // 게임 정보 조회
  const { data: game, error: gErr } = await supabase
    .from('league_games')
    .select('quarter_id, home_team_id, away_team_id')
    .eq('id', gameId)
    .eq('league_id', leagueId)
    .single()

  if (gErr || !game) return NextResponse.json({ error: '게임을 찾을 수 없습니다' }, { status: 404 })

  // 분기 배정이 없는 경우: 전체 선수를 unassigned로 반환
  if (!game.quarter_id || (!game.home_team_id && !game.away_team_id)) {
    const { data: players } = await supabase
      .from('league_players')
      .select('id, name, number, position')
      .eq('league_id', leagueId)
      .order('name')
    return NextResponse.json({
      home: [],
      away: [],
      unassigned: players ?? [],
      quarter_id: null,
    })
  }

  // 분기별 팀 배정 선수 조회
  const teamIds = [game.home_team_id, game.away_team_id].filter(Boolean) as string[]

  const { data: memberships, error: mErr } = await supabase
    .from('league_player_quarters')
    .select(`
      team_id,
      is_regular,
      league_player_id,
      league_players!inner(id, name, number, position, birth_date, plus_one)
    `)
    .eq('league_id', leagueId)
    .eq('quarter_id', game.quarter_id)
    .in('team_id', teamIds)

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  type PlayerRow = {
    id: string
    name: string
    number: number | null
    position: string | null
    birth_date: string | null
    plus_one: boolean
    is_regular: boolean
    team_id: string
  }
  const home: PlayerRow[] = []
  const away: PlayerRow[] = []
  const includedIds = new Set<string>()

  // 정규 선수: league_player_quarters (is_regular=true or null)
  for (const m of memberships ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (Array.isArray(m.league_players) ? m.league_players[0] : m.league_players) as any
    if (!p) continue
    // 비정규이고 team_id 없는 경우는 스킵 (league_game_players로 처리)
    if (m.is_regular === false && !m.team_id) continue
    const row: PlayerRow = {
      id: p.id,
      name: p.name,
      number: p.number,
      position: p.position,
      birth_date: p.birth_date ?? null,
      plus_one: p.plus_one ?? false,
      is_regular: m.is_regular,
      team_id: m.team_id,
    }
    if (m.team_id === game.home_team_id) { home.push(row); includedIds.add(p.id) }
    else if (m.team_id === game.away_team_id) { away.push(row); includedIds.add(p.id) }
  }

  // 비정규 선수: league_game_players (이 경기에만 유효한 per-game 배정)
  const { data: gamePlayers } = await supabase
    .from('league_game_players')
    .select('league_player_id, team_id, league_players!inner(id, name, number, position, birth_date, plus_one)')
    .eq('league_game_id', gameId)

  for (const gp of gamePlayers ?? []) {
    if (includedIds.has(gp.league_player_id)) continue // 이미 포함된 경우 스킵
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (Array.isArray(gp.league_players) ? gp.league_players[0] : gp.league_players) as any
    if (!p) continue
    const row: PlayerRow = {
      id: p.id,
      name: p.name,
      number: p.number,
      position: p.position,
      birth_date: p.birth_date ?? null,
      plus_one: p.plus_one ?? false,
      is_regular: false,
      team_id: gp.team_id,
    }
    if (gp.team_id === game.home_team_id) { home.push(row); includedIds.add(p.id) }
    else if (gp.team_id === game.away_team_id) { away.push(row); includedIds.add(p.id) }
  }

  // 이 경기에 이미 배정된 비정규 선수 ID 목록 (picker 필터용)
  const assignedIrregularIds = (gamePlayers ?? []).map(gp => gp.league_player_id)

  // 이름 정렬
  home.sort((a, b) => a.name.localeCompare(b.name))
  away.sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({
    home,
    away,
    unassigned: [],
    quarter_id: game.quarter_id,
    assigned_irregular_ids: assignedIrregularIds,
  })
}
