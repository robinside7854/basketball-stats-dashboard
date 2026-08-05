import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'

type Ctx = { params: Promise<{ leagueId: string; gameId: string }> }

// POST /api/leagues/[leagueId]/games/[gameId]/irregular-players
// 비정규 선수를 이 경기(및 같은 날짜·같은 팀 경기)에 배정
export async function POST(req: Request, { params }: Ctx) {
  const { leagueId, gameId } = await params
  if (!await canEditLeague(req, leagueId)) {
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
    // maybeSingle: single() 은 "행 없음" 도 에러로 돌려줘서, 없는 경기와 DB 장애가
    //   같은 응답이 된다. 둘을 구분해야 아래 404/500 분기가 의미를 갖는다.
    .maybeSingle()

  // 쿼리 실패를 404 로 뭉개지 않는다 — "경기가 없다" 와 "DB 가 응답하지 않았다" 는
  //   기록원이 취할 행동이 다르다(전자는 일정 확인, 후자는 재시도).
  if (gErr) {
    return NextResponse.json({ error: `경기 조회 실패 — ${gErr.message}` }, { status: 500 })
  }
  if (!game) {
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
  const { data: sameDate, error: sdErr } = await supabase
    .from('league_games')
    .select('id, home_team_id, away_team_id')
    .eq('league_id', leagueId)
    .eq('date', game.date)
    .neq('id', gameId)
  // 실패를 빈 배열로 넘기면 같은 날 나머지 경기에 배정이 안 된 채로 끝난다. 이 경기에는
  //   이미 배정됐으므로 기록원은 성공했다고 믿고, 다음 경기에서 선수가 없는 걸 뒤늦게 본다.
  if (sdErr) {
    return NextResponse.json(
      { error: `같은 날짜 경기 조회 실패 — ${sdErr.message}` },
      { status: 500 },
    )
  }

  const autoInserts: { league_id: string; league_game_id: string; league_player_id: string; team_id: string }[] = []
  for (const g of sameDate ?? []) {
    if (g.home_team_id === team_id || g.away_team_id === team_id) {
      autoInserts.push({ league_id: leagueId, league_game_id: g.id, league_player_id, team_id })
    }
  }

  if (autoInserts.length > 0) {
    // 이미 배정된 경기는 무시 (onConflict do nothing)
    const { error: autoErr } = await supabase
      .from('league_game_players')
      .upsert(autoInserts, { onConflict: 'league_game_id,league_player_id', ignoreDuplicates: true })
    // 이걸 삼키면 아래에서 auto_assigned: N 을 그대로 돌려준다 — 저장되지 않은 배정을
    //   "N경기에 배정했다" 고 보고하는 셈이다. 안 된 일을 됐다고 말하지 않는다.
    if (autoErr) {
      return NextResponse.json(
        { error: `같은 날짜 자동 배정 실패 — ${autoErr.message}` },
        { status: 500 },
      )
    }
  }

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  return NextResponse.json({ ok: true, auto_assigned: autoInserts.length })
}
