import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'

type Ctx = { params: Promise<{ leagueId: string; gameId: string }> }

// POST /api/leagues/[leagueId]/games/[gameId]/irregular-players
// 비정규 선수를 이 경기 하나에만 배정
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

  // 게임 존재 확인 (날짜/홈·어웨이 팀은 더 이상 쓰지 않는다 — 같은 날짜 전파 로직 제거로 불필요해짐)
  const { data: game, error: gErr } = await supabase
    .from('league_games')
    .select('id')
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

  // 이 경기에만 배정.
  //   (2026-08-08 사고: 여기서 "같은 날짜·같은 팀의 다른 경기에도 자동 배정"하는 로직이
  //    있었다. league_game_players 는 "이 경기 한정" 배정이 정의이고 league_player_quarters
  //    (정규 소속)보다 우선 적용되는데, 이 자동 전파 때문에 한 경기 게스트 출전이 그날
  //    전체 경기의 소속을 덮어썼다 — 정규 선수(김로빈)가 다른 팀(빅현욱) 게스트로 한 경기
  //    뛰었을 뿐인데 그날 6경기 전부 그 팀 소속으로 보이는 사고로 이어졌다. 여러 경기에
  //    게스트로 뛰면 기록원이 각 경기 화면에서 그때그때 지정한다 — 편의 기능처럼 보이지만
  //    되살리면 같은 사고가 재발한다.)
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

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  return NextResponse.json({ ok: true })
}
