import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { scorePoints, fetchScoringRules } from '@/lib/stats/scoring'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
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
  const { data: g } = await supabase
    .from('league_games').select('plus_one_player_id').eq('id', body.league_game_id).maybeSingle()
  const { data: pl } = await supabase
    .from('league_players').select('plus_one').eq('id', body.league_player_id).maybeSingle()
  // 캐노니컬 플러스원 판정: 게임별 override(plus_one_player_id)가 있으면 그것으로,
  // 없으면 선수 플래그로 폴백 — computeBadges/highlights loader 와 동일 규칙.
  const isPlusOne = g?.plus_one_player_id != null
    ? body.league_player_id === g.plus_one_player_id
    : Boolean(pl?.plus_one)
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
