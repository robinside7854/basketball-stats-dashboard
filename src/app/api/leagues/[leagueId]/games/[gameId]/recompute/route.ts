import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

type Ctx = { params: Promise<{ leagueId: string; gameId: string }> }

// POST /api/leagues/[leagueId]/games/[gameId]/recompute
// 이벤트 기반으로 home_score/away_score 강제 재계산
export async function POST(
  req: Request,
  { params }: Ctx
) {
  const { leagueId, gameId } = await params
  if (!await verifyLeaguePin(req, leagueId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient()

  const [{ data: game, error: gErr }, { data: leaguePlayers }] = await Promise.all([
    supabase.from('league_games').select('home_team_id, away_team_id, quarter_id, plus_one_player_id').eq('id', gameId).eq('league_id', leagueId).single(),
    supabase.from('league_players').select('id, plus_one').eq('league_id', leagueId),
  ])

  if (gErr || !game) return NextResponse.json({ error: '게임을 찾을 수 없습니다' }, { status: 404 })

  // plus_one 플래그 맵 (stats API와 동일한 방식으로 득점 계산)
  // game.plus_one_player_id가 설정된 경우 해당 선수만 +1 (충돌 해결 결과)
  const plusOneSet = (game as { plus_one_player_id?: string | null }).plus_one_player_id
    ? new Set([(game as { plus_one_player_id: string }).plus_one_player_id])
    : new Set((leaguePlayers ?? []).filter(p => p.plus_one).map(p => p.id))

  const SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive']
  function calcPts(type: string, result: string, playerId: string): number {
    if (result !== 'made') return 0
    const isP1 = plusOneSet.has(playerId)
    if (type === 'shot_3p') return isP1 ? 4 : 3
    if (SHOT_TYPES.includes(type)) return isP1 ? 3 : 2
    if (type === 'and_one')   return 1   // 득점인정반칙 추가 1점
    if (type === 'ft_2pt')    return 2   // 2점파울 FT: 1회 시도 2점
    if (type === 'ft_3pt_1')  return 2
    if (type === 'ft_3pt_2')  return 1
    if (type === 'free_throw') return 1
    return 0
  }

  // 이벤트 조회 (team_id + 이벤트 타입/결과)
  const { data: events } = await supabase
    .from('league_game_events')
    .select('team_id, type, result, league_player_id')
    .eq('league_game_id', gameId)
    .not('league_player_id', 'is', null)

  let homeScore = 0
  let awayScore = 0

  // team_id 없는 이벤트를 위한 팀 역추적
  const eventsWithoutTeam = (events ?? []).filter(e => !e.team_id)
  const playerTeamMap: Record<string, string> = {}

  if (eventsWithoutTeam.length > 0) {
    const playerIds = [...new Set(eventsWithoutTeam.map(e => e.league_player_id).filter(Boolean))] as string[]

    // 1차: league_game_players (이 경기 전용 배정 — 비정규/타팀 임시 출전)
    // 비정규 출전 선수가 정규 팀으로 잘못 잡히지 않도록 게임별 배정을 먼저 확인
    const { data: gameMemberships } = await supabase
      .from('league_game_players')
      .select('league_player_id, team_id')
      .eq('league_game_id', gameId)
      .in('league_player_id', playerIds)
    for (const m of gameMemberships ?? []) {
      if (m.team_id) playerTeamMap[m.league_player_id] = m.team_id
    }

    // 2차: league_player_quarters (정규 분기 소속 — 1차에서 못 찾은 경우만)
    const stillMissing = playerIds.filter(id => !playerTeamMap[id])
    if (stillMissing.length > 0 && game.quarter_id) {
      const { data: memberships } = await supabase
        .from('league_player_quarters')
        .select('league_player_id, team_id')
        .eq('quarter_id', game.quarter_id)
        .in('league_player_id', stillMissing)
      for (const m of memberships ?? []) {
        if (m.team_id) playerTeamMap[m.league_player_id] = m.team_id
      }
    }
  }

  for (const e of events ?? []) {
    if (!e.league_player_id) continue
    const pts = calcPts(e.type, e.result ?? '', e.league_player_id)
    if (pts === 0) continue
    const teamId = e.team_id ?? playerTeamMap[e.league_player_id] ?? null
    if (teamId === game.home_team_id) homeScore += pts
    else if (teamId === game.away_team_id) awayScore += pts
  }

  // DB 점수 업데이트
  const { error: updateErr } = await supabase
    .from('league_games')
    .update({ home_score: homeScore, away_score: awayScore })
    .eq('id', gameId)
    .eq('league_id', leagueId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ home_score: homeScore, away_score: awayScore })
}
