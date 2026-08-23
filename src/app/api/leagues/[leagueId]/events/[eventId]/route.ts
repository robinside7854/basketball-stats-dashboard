import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { scorePoints, fetchScoringRules, type ScoringRules, isPlusOneFor, type GamePlusOne } from '@/lib/stats/scoring'
import { logAudit } from '@/lib/audit'

// PATCH · 이벤트 부분 수정
//
// type / result / league_player_id 가 편집되면 서버가 득점을 다시 계산한다.
//   · 득점 계산은 공용 scorePoints() 에 위임 — 이 파일에 룰을 다시 적지 않는다
//   · plus_one 판정: game.plus_one_player_id 있으면 그것 우선, 없으면 league_players.plus_one
function calcPointsFor(type: string, result: string | null, isPlusOne: boolean, rules: ScoringRules): number {
  return scorePoints(type, result, isPlusOne, rules)
}

// canEditLeague 는 leagueId 를 인가했을 뿐이고 eventId 는 URL 로 들어온 값이다.
// 아래 update/delete 는 id 만 보므로, 대조하지 않으면 A 리그 권한으로 다른 클럽의
// 경기 기록을 고치거나 지울 수 있다 — 그 리그의 시즌 스탯이 그만큼 어긋난다.
// league_game_events 에는 league_id 가 없어(021) 걸려 있는 경기를 거쳐 확인한다.
// 확인된 league_game_id 를 돌려주어 실제 쓰기에도 같은 조건을 한 번 더 건다.
async function findEventGameInLeague(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  leagueId: string,
): Promise<string | null> {
  const { data: ev, error: evErr } = await supabase
    .from('league_game_events')
    .select('league_game_id')
    .eq('id', eventId)
    .maybeSingle()
  // 확인이 안 된 채로 통과시키면 확인을 안 한 것과 같다 — 조회 실패는 삼키지 않는다.
  if (evErr) {
    throw new Error(`league_game_events: eventId=${eventId} 소속 확인 실패 — ${evErr.message}`)
  }
  if (!ev) return null
  const { data: g, error: gErr } = await supabase
    .from('league_games')
    .select('id')
    .eq('id', ev.league_game_id)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (gErr) {
    throw new Error(`league_games: league_game_id=${ev.league_game_id} 소속 확인 실패 — ${gErr.message}`)
  }
  return g ? (ev.league_game_id as string) : null
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; eventId: string }> }
) {
  const { leagueId, eventId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createClient()
  // 소속이 아니면 403 이 아니라 404 — 그 id 의 이벤트가 있는지조차 알려주지 않는다.
  const gameId = await findEventGameInLeague(supabase, eventId, leagueId)
  if (!gameId) return NextResponse.json({ error: '이벤트를 찾을 수 없습니다' }, { status: 404 })
  const body = await req.json()
  // ⚠️ body.points 는 받지 않는다.
  //    득점은 시즌 rules 로 서버가 정한다 — 생성(POST)과 같은 원칙이다.
  //    예전엔 클라이언트가 보낸 points 를 그대로 저장하고 안 보낸 경우에만 재계산했는데,
  //    게임 로그 편집기가 항상 points 를 보내고 있어 사실상 룰 엔진을 우회하고 있었다.
  //    저장값 6건이 룰과 어긋났던 원인이 이 계통이다.
  const { type, result, league_player_id, related_player_id, team_id } = body
  const payload: Record<string, unknown> = {}
  if (type !== undefined) payload.type = type
  if (result !== undefined) payload.result = result ?? null
  if (league_player_id !== undefined) payload.league_player_id = league_player_id ?? null
  if (related_player_id !== undefined) payload.related_player_id = related_player_id ?? null
  if (team_id !== undefined) payload.team_id = team_id ?? null
  if (Object.keys(payload).length === 0) return NextResponse.json({ error: '수정할 값이 없습니다' }, { status: 400 })

  // 득점에 영향을 주는 필드가 편집됐으면 서버가 다시 계산한다.
  const needsRecompute =
    type !== undefined || result !== undefined || league_player_id !== undefined
  if (needsRecompute) {
    // 현재 저장돼있는 이벤트를 먼저 읽어 최종 값 조합 (editable 필드만 부분 병합)
    const { data: current, error: currentErr } = await supabase
      .from('league_game_events')
      .select('type, result, league_player_id, league_game_id')
      .eq('id', eventId)
      .single()
    // 이 읽기가 조용히 실패하면 아래 if(current) 가 그냥 건너뛰어져 payload.points 가
    // 끝내 안 채워진다 — missed→made 편집인데 points 는 0 그대로 저장되는, 조용한 오점수의
    // 가장 나쁜 경우다. 그래서 실패는 삼키지 않고 던진다.
    if (currentErr) {
      throw new Error(`league_game_events: eventId=${eventId} 조회 실패 — ${currentErr.message}`)
    }
    if (current) {
      const finalType   = type              !== undefined ? type              : current.type
      const finalResult = result            !== undefined ? (result ?? null)  : current.result
      const finalPid    = league_player_id  !== undefined ? (league_player_id ?? null) : current.league_player_id
      // plus_one 조회 (game override 우선 · 없으면 player.plus_one)
      let isPlusOne = false
      if (finalPid && current.league_game_id) {
        const [{ data: g, error: gErr }, { data: lp, error: lpErr }] = await Promise.all([
          supabase.from('league_games').select('plus_one_player_id, plus_one_extra_ids').eq('id', current.league_game_id).single(),
          supabase.from('league_players').select('plus_one').eq('id', finalPid).single(),
        ])
        // 여기서 삼키면 플러스원 선수의 3점슛이 3점(4점이어야 함)으로 영구 저장된다 —
        // 마이그레이션 079 가 고친 저장값 불일치를 편집 경로에서 다시 만드는 것과 같다.
        if (gErr) {
          throw new Error(`league_games: league_game_id=${current.league_game_id} 조회 실패 — ${gErr.message}`)
        }
        if (lpErr) {
          throw new Error(`league_players: league_player_id=${finalPid} 조회 실패 — ${lpErr.message}`)
        }
        // scoring.ts 단일 진실 — 경기 한정 추가(110) → 게임별 배타 지정 → 선수 전역 플래그
        isPlusOne = isPlusOneFor(
          finalPid as string,
          (g ?? null) as GamePlusOne | null,
          lp?.plus_one ? new Set([finalPid as string]) : new Set<string>(),
        )
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
    // 위에서 확인한 경기로 한 번 더 스코프 — 확인과 쓰기 사이의 틈을 남기지 않는다
    .eq('league_game_id', gameId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 개별 이벤트 수정은 조용히 시즌 스탯을 바꾼다 — 어느 경기의 무엇을 건드렸는지 남긴다.
  await logAudit({
    req, action: 'event.update', targetTable: 'league_game_events', targetId: eventId,
    leagueId, detail: { gameId, fields: Object.keys(payload) },
  })

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
  // 소속이 아니면 403 이 아니라 404 — 그 id 의 이벤트가 있는지조차 알려주지 않는다.
  const gameId = await findEventGameInLeague(supabase, eventId, leagueId)
  if (!gameId) return NextResponse.json({ error: '이벤트를 찾을 수 없습니다' }, { status: 404 })
  const { error } = await supabase
    .from('league_game_events')
    .delete()
    .eq('id', eventId)
    // 위에서 확인한 경기로 한 번 더 스코프 — 확인과 쓰기 사이의 틈을 남기지 않는다
    .eq('league_game_id', gameId)
  if (error) {
    await logAudit({
      req, action: 'event.delete', targetTable: 'league_game_events', targetId: eventId,
      leagueId, result: 'failure', detail: { gameId },
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAudit({
    req, action: 'event.delete', targetTable: 'league_game_events', targetId: eventId,
    leagueId, detail: { gameId },
  })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그) + 하이라이트 이벤트 태그
  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')
  revalidateTag(`league-${leagueId}-events`, 'max')

  return NextResponse.json({ success: true })
}
