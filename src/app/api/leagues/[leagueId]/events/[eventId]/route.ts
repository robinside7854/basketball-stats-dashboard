import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { scorePoints, fetchScoringRules, type ScoringRules } from '@/lib/stats/scoring'

// PATCH · 이벤트 부분 수정
//
// 방어: 편집 대상이 type / result / league_player_id 어느 하나이고 points 를 명시적으로 안 보냈다면
//       서버에서 재계산 (missed→made 편집 시 points 0 잔존 버그 대응 · 2026-07-18)
//   · 득점 계산은 공용 scorePoints() 에 위임 — 이 파일에 룰을 다시 적지 않는다
//   · plus_one 판정: game.plus_one_player_id 있으면 그것 우선, 없으면 league_players.plus_one
function calcPointsFor(type: string, result: string | null, isPlusOne: boolean, rules: ScoringRules): number {
  return scorePoints(type, result, isPlusOne, rules)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; eventId: string }> }
) {
  const { leagueId, eventId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { type, result, points, league_player_id, related_player_id, team_id } = body
  const payload: Record<string, unknown> = {}
  if (type !== undefined) payload.type = type
  if (result !== undefined) payload.result = result ?? null
  if (points !== undefined) payload.points = points ?? 0
  if (league_player_id !== undefined) payload.league_player_id = league_player_id ?? null
  if (related_player_id !== undefined) payload.related_player_id = related_player_id ?? null
  if (team_id !== undefined) payload.team_id = team_id ?? null
  if (Object.keys(payload).length === 0) return NextResponse.json({ error: '수정할 값이 없습니다' }, { status: 400 })
  const supabase = createClient()

  // 방어: type/result/player 가 편집됐고 points 는 명시 안 보냈으면 → 서버에서 재계산
  const needsRecompute =
    points === undefined &&
    (type !== undefined || result !== undefined || league_player_id !== undefined)
  if (needsRecompute) {
    // 현재 저장돼있는 이벤트를 먼저 읽어 최종 값 조합 (editable 필드만 부분 병합)
    const { data: current } = await supabase
      .from('league_game_events')
      .select('type, result, league_player_id, league_game_id')
      .eq('id', eventId)
      .single()
    if (current) {
      const finalType   = type              !== undefined ? type              : current.type
      const finalResult = result            !== undefined ? (result ?? null)  : current.result
      const finalPid    = league_player_id  !== undefined ? (league_player_id ?? null) : current.league_player_id
      // plus_one 조회 (game override 우선 · 없으면 player.plus_one)
      let isPlusOne = false
      if (finalPid && current.league_game_id) {
        const [{ data: g }, { data: lp }] = await Promise.all([
          supabase.from('league_games').select('plus_one_player_id').eq('id', current.league_game_id).single(),
          supabase.from('league_players').select('plus_one').eq('id', finalPid).single(),
        ])
        if (g?.plus_one_player_id) isPlusOne = g.plus_one_player_id === finalPid
        else isPlusOne = !!lp?.plus_one
      }
      // leagueId 는 이 라우트의 params 에 이미 있어 게임을 거쳐 조회할 필요가 없다
      const scoringRules = await fetchScoringRules(supabase, leagueId)
      payload.points = calcPointsFor(finalType as string, finalResult as string | null, isPlusOne, scoringRules)
    }
  }

  const { data, error } = await supabase
    .from('league_game_events')
    .update(payload)
    .eq('id', eventId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그) + 하이라이트 이벤트 태그
  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')
  revalidateTag(`league-${leagueId}-events`, 'max')

  return NextResponse.json(data)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; eventId: string }> }
) {
  const { leagueId, eventId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createClient()
  const { error } = await supabase
    .from('league_game_events')
    .delete()
    .eq('id', eventId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그) + 하이라이트 이벤트 태그
  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')
  revalidateTag(`league-${leagueId}-events`, 'max')

  return NextResponse.json({ success: true })
}
