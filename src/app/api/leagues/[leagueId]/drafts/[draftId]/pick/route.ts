// 단장 픽 API
//
// 흐름:
//   1. verifyDraftCode 로 (quarter, team) 단장 권한 확인
//   2. draft.status='in_progress' 확인
//   3. 현재 차례의 team_id 가 본인 팀과 같은지 확인 (snake/linear 둘 다 처리)
//   4. 선수가 이 드래프트에서 이미 픽되지 않았는지 확인 (UNIQUE 제약도 보장)
//   5. league_draft_picks INSERT + league_player_quarters UPSERT
//   6. draft.current_pick_index/current_round/total_picks 갱신
//   7. 모든 선수 픽 완료 시 status='completed'
//
// 동시성: UNIQUE (draft_id, league_player_id) + UNIQUE (draft_id, pick_number) 가
//   동시 픽 충돌을 막아줌. 한쪽이 실패하면 400 반환.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { verifyDraftCode } from '@/lib/leagueDraftAuth'
import { newPickDeadline } from '@/lib/draftTimer'

interface DraftRow {
  id: string
  league_id: string
  quarter_id: string
  status: string
  draft_order: string[]
  current_pick_index: number
  current_round: number
  total_picks: number
  method: 'snake' | 'linear'
  pick_seconds: number
}

/**
 * draft_order 와 (current_round, current_pick_index) 로 다음 차례 팀 결정.
 *   linear: 매 라운드 동일 순서
 *   snake : 짝수 라운드는 역순
 */
function teamOnTurn(draft: DraftRow): string | null {
  const order = draft.draft_order
  if (!order || order.length === 0) return null
  const idx = draft.current_pick_index
  if (idx < 0 || idx >= order.length) return null
  if (draft.method === 'snake' && draft.current_round % 2 === 0) {
    return order[order.length - 1 - idx]
  }
  return order[idx]
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; draftId: string }> },
) {
  const { leagueId, draftId } = await params
  const body = await req.json().catch(() => null) as
    | { team_id?: string; league_player_id?: string }
    | null
  if (!body?.team_id || !body?.league_player_id) {
    return NextResponse.json({ error: 'team_id, league_player_id 필요' }, { status: 400 })
  }

  const supabase = createClient()

  // 드래프트 조회
  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, league_id, quarter_id, status, draft_order, current_pick_index, current_round, total_picks, method, pick_seconds')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
  const d = draft as DraftRow
  if (d.status !== 'in_progress') {
    return NextResponse.json({ error: `진행 중이 아닙니다 (status=${d.status})` }, { status: 409 })
  }

  // 단장 코드 검증
  const auth = await verifyDraftCode(req, leagueId, d.quarter_id, body.team_id)
  if (!auth.valid) {
    return NextResponse.json({ error: '단장 코드 인증 실패' }, { status: 401 })
  }

  // 본인 차례 확인
  const expectedTeamId = teamOnTurn(d)
  if (expectedTeamId !== body.team_id) {
    return NextResponse.json(
      { error: `본인 차례가 아닙니다 (현재 차례: ${expectedTeamId})` },
      { status: 403 },
    )
  }

  // 선수가 이 리그 소속인지 + 드래프트 풀 대상인지 + 이미 픽되지 않았는지
  const [{ data: player }, { data: inPool }, { data: existPick }] = await Promise.all([
    supabase
      .from('league_players')
      .select('id')
      .eq('id', body.league_player_id)
      .eq('league_id', leagueId)
      .maybeSingle(),
    supabase
      .from('league_draft_pool')
      .select('league_player_id')
      .eq('draft_id', draftId)
      .eq('league_player_id', body.league_player_id)
      .maybeSingle(),
    supabase
      .from('league_draft_picks')
      .select('id')
      .eq('draft_id', draftId)
      .eq('league_player_id', body.league_player_id)
      .maybeSingle(),
  ])
  if (!player) return NextResponse.json({ error: '해당 선수가 이 리그에 없습니다' }, { status: 400 })
  if (!inPool) return NextResponse.json({ error: '드래프트 대상(풀)에 없는 선수입니다' }, { status: 400 })
  if (existPick) return NextResponse.json({ error: '이미 픽된 선수입니다' }, { status: 409 })

  // pick_number 계산
  const pickNumber = d.total_picks + 1
  const roundNumber = d.current_round

  // 1) 픽 기록
  const { error: pickErr } = await supabase
    .from('league_draft_picks')
    .insert({
      draft_id: draftId,
      pick_number: pickNumber,
      round_number: roundNumber,
      team_id: body.team_id,
      league_player_id: body.league_player_id,
      picked_by_code_id: auth.codeId ?? null,
    })
  if (pickErr) {
    // UNIQUE 충돌 = 동시 픽
    if (pickErr.code === '23505') {
      return NextResponse.json({ error: '동시 픽 충돌 — 다시 시도하세요' }, { status: 409 })
    }
    return NextResponse.json({ error: pickErr.message }, { status: 500 })
  }

  // 2) league_player_quarters UPSERT (정규 멤버십 자동 반영)
  const { error: lpqErr } = await supabase
    .from('league_player_quarters')
    .upsert(
      {
        league_id: leagueId,
        quarter_id: d.quarter_id,
        league_player_id: body.league_player_id,
        team_id: body.team_id,
        is_regular: true,
      },
      { onConflict: 'quarter_id,league_player_id' },
    )
  if (lpqErr) {
    // 멤버십 실패 — 픽 롤백
    await supabase.from('league_draft_picks').delete().eq('draft_id', draftId).eq('pick_number', pickNumber)
    return NextResponse.json({ error: `멤버십 반영 실패: ${lpqErr.message}` }, { status: 500 })
  }

  // 3) 드래프트 진행 상태 갱신
  //    다음 인덱스 = current_pick_index + 1
  //    인덱스가 draft_order.length 도달하면 새 라운드 시작 (인덱스 0, round++)
  let nextIndex = d.current_pick_index + 1
  let nextRound = d.current_round
  if (nextIndex >= d.draft_order.length) {
    nextRound = d.current_round + 1
    nextIndex = 0
  }
  const newTotalPicks = pickNumber

  // 풀의 모든 선수가 픽되면 자동 완료
  const { count: poolCount } = await supabase
    .from('league_draft_pool')
    .select('league_player_id', { count: 'exact', head: true })
    .eq('draft_id', draftId)
  const isComplete = typeof poolCount === 'number' && newTotalPicks >= poolCount

  const { data: updated, error: updErr } = await supabase
    .from('league_drafts')
    .update({
      current_pick_index: nextIndex,
      current_round: nextRound,
      total_picks: newTotalPicks,
      ...(isComplete
        ? { status: 'completed', completed_at: new Date().toISOString(), pick_deadline: null }
        : { pick_deadline: newPickDeadline(Date.now(), d.pick_seconds) }),
    })
    .eq('id', draftId)
    .select()
    .single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    pick: { pick_number: pickNumber, round_number: roundNumber, team_id: body.team_id, league_player_id: body.league_player_id },
    next_team_id: teamOnTurn(updated as DraftRow),
    draft: updated,
  })
}
