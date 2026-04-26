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

  // 게임 정보 조회
  const { data: game, error: gErr } = await supabase
    .from('league_games')
    .select('home_team_id, away_team_id, quarter_id')
    .eq('id', gameId)
    .eq('league_id', leagueId)
    .single()

  if (gErr || !game) return NextResponse.json({ error: '게임을 찾을 수 없습니다' }, { status: 404 })

  // 이벤트 집계: team_id가 있으면 직접, 없으면 quarter 기반 역추적
  let homeScore = 0
  let awayScore = 0

  if (game.quarter_id && game.home_team_id && game.away_team_id) {
    // team_id 컬럼이 있는 경우 (024 마이그레이션 적용 후)
    const { data: events } = await supabase
      .from('league_game_events')
      .select('team_id, points, league_player_id')
      .eq('league_game_id', gameId)
      .gt('points', 0)

    if (events) {
      // team_id가 있는 이벤트는 직접 집계
      const eventsWithTeam = events.filter(e => e.team_id)
      const eventsWithoutTeam = events.filter(e => !e.team_id)

      for (const e of eventsWithTeam) {
        if (e.team_id === game.home_team_id) homeScore += e.points
        else if (e.team_id === game.away_team_id) awayScore += e.points
      }

      // team_id 없는 이벤트는 분기 배정으로 역추적
      if (eventsWithoutTeam.length > 0) {
        const playerIds = [...new Set(eventsWithoutTeam.map(e => e.league_player_id).filter(Boolean))]
        const { data: memberships } = await supabase
          .from('league_player_quarters')
          .select('league_player_id, team_id')
          .eq('quarter_id', game.quarter_id)
          .in('league_player_id', playerIds as string[])

        const playerTeamMap = Object.fromEntries(
          (memberships ?? []).map(m => [m.league_player_id, m.team_id])
        )

        for (const e of eventsWithoutTeam) {
          const teamId = playerTeamMap[e.league_player_id ?? '']
          if (teamId === game.home_team_id) homeScore += e.points
          else if (teamId === game.away_team_id) awayScore += e.points
        }
      }
    }
  } else {
    // 분기 미설정: team_id만으로 집계 (team_id 없으면 점수 0)
    const { data: events } = await supabase
      .from('league_game_events')
      .select('team_id, points')
      .eq('league_game_id', gameId)
      .gt('points', 0)

    for (const e of events ?? []) {
      if (e.team_id === game.home_team_id) homeScore += e.points
      else if (e.team_id === game.away_team_id) awayScore += e.points
    }
  }

  // 점수 업데이트
  const { error: updateErr } = await supabase
    .from('league_games')
    .update({ home_score: homeScore, away_score: awayScore })
    .eq('id', gameId)
    .eq('league_id', leagueId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ home_score: homeScore, away_score: awayScore })
}
