import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { canViewLeague } from '@/lib/auth/guard'
import { scorePoints, fetchScoringRules, isPlusOneFor, type GamePlusOne } from '@/lib/stats/scoring'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  // 팀 비공개 전환 시 화면만 막으면 API 로 뚫린다 — 데이터 계층에서 재확인
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_game_events')
    .select('*')
    .eq('league_game_id', gameId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const supabase = createClient()

  // 득점은 클라이언트가 아니라 서버가 시즌 rules 로 계산한다.
  // 클라이언트가 보낸 body.points 는 신뢰 경계 밖의 값이라 완전히 무시한다.
  const scoringRules = await fetchScoringRules(supabase, leagueId)
  // league_id 로 스코프해 다른 클럽의 게임에 이 리그의 룰을 적용하는 사고를 막는다
  // (canEditLeague 는 leagueId 를 인가했을 뿐, body.league_game_id 가 실제로 이 리그
  // 소속인지는 여기서 확인해야 한다).
  const { data: g, error: gErr } = await supabase
    .from('league_games')
    .select('plus_one_player_id, plus_one_extra_ids')
    .eq('id', body.league_game_id)
    .eq('league_id', leagueId)
    .maybeSingle()
  // 쿼리 자체가 실패했는데도 조용히 "플러스원 아님"으로 넘어가면 마이그레이션 079 가
  // 고친 것과 같은 종류의 저장값 불일치가 다시 생긴다 — 그래서 삼키지 않고 던진다.
  if (gErr) {
    throw new Error(`league_games: league_game_id=${body.league_game_id} 조회 실패 — ${gErr.message}`)
  }
  if (!g) {
    return NextResponse.json(
      { error: `league_game_id=${body.league_game_id} 를 이 리그(${leagueId})에서 찾을 수 없습니다` },
      { status: 400 },
    )
  }
  // ⚠ 선수 없는 이벤트가 있다 — 대회의 **상대 득점**은 선수 없이 팀에만 붙는다
  //   (우리는 상대 선수를 기록하지 않는다). 예전에는 그대로 `.eq('id', null)` 을 태워
  //   `invalid input syntax for type uuid: "null"` 로 500 이 났다.
  //   선수가 없으면 플러스원도 없으므로 조회 자체를 건너뛴다.
  let plusOneFlag = false
  if (body.league_player_id) {
    const { data: pl, error: plErr } = await supabase
      .from('league_players').select('plus_one').eq('id', body.league_player_id).maybeSingle()
    if (plErr) {
      throw new Error(`league_players: league_player_id=${body.league_player_id} 조회 실패 — ${plErr.message}`)
    }
    plusOneFlag = !!pl?.plus_one
  }
  // 캐노니컬 플러스원 판정 — scoring.ts 의 isPlusOneFor() 하나로만 푼다.
  //   (경기 한정 추가 → 게임별 배타 지정 → 선수 전역 플래그)
  const isPlusOne = isPlusOneFor(
    body.league_player_id,
    g as GamePlusOne,
    plusOneFlag ? new Set([body.league_player_id as string]) : new Set<string>(),
  )
  const points = scorePoints(body.type, body.result, isPlusOne, scoringRules)

  const { data, error } = await supabase
    .from('league_game_events')
    .insert({
      league_game_id: body.league_game_id,
      quarter: body.quarter,
      video_timestamp: body.video_timestamp ?? null,
      type: body.type,
      league_player_id: body.league_player_id ?? null,
      team_id: body.team_id ?? null,
      result: body.result ?? null,
      related_player_id: body.related_player_id ?? null,
      points,
      shot_zone: body.shot_zone ?? null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')
  // 하이라이트 캐시 무효화 — 새 성공 슛 이벤트가 즉시 하이라이트에 반영되도록
  revalidateTag(`league-${leagueId}-events`, 'max')

  return NextResponse.json(data, { status: 201 })
}
