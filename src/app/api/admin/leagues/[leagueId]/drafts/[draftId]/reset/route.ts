// 드래프트 세션 리셋 — 어드민 전용
//   1) 이 세션의 모든 픽 삭제 (league_draft_picks)
//   2) 이 분기의 league_player_quarters 중 이 픽으로 만들어진 멤버십 되돌리기
//      — 픽 기록을 기반으로 (team_id, league_player_id, quarter_id) 매칭해서 삭제
//   3) league_drafts.status='setup', current_pick_index=0, current_round=1, total_picks=0
//
// ⚠ 픽이 멤버십에 자동 반영된 경우, 그 멤버십이 리셋과 함께 사라진다.
//    리그에서 이 분기에 정규 멤버십이 추가로 있던 경우(드래프트 외 수동 추가)는
//    영향받지 않도록 league_draft_picks 의 행만 보고 그 정확한 매칭만 삭제.
//
// body (optional): { delete_picks?: boolean }  default true
//   false 이면 status·인덱스만 setup 으로 되돌리고 픽은 보존 (잘 사용 안 됨)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { isDraftSessionControllerByDraftId } from '@/lib/draftManagerAuth'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; draftId: string }> },
) {
  const { leagueId, draftId } = await params
  if (!await isDraftSessionControllerByDraftId(req, leagueId, draftId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { delete_picks?: boolean }
  const deletePicks = body.delete_picks !== false  // 기본 true

  const supabase = createClient()

  // 드래프트 + 분기 조회
  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, quarter_id')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
  const d = draft as { id: string; quarter_id: string }

  if (deletePicks) {
    // 픽 기록 조회 (멤버십 정리용)
    const { data: picks } = await supabase
      .from('league_draft_picks')
      .select('team_id, league_player_id')
      .eq('draft_id', draftId)

    // 멤버십 되돌림 — 같은 (quarter_id, league_player_id) AND team_id 정확히 일치
    for (const p of (picks ?? []) as { team_id: string; league_player_id: string }[]) {
      await supabase
        .from('league_player_quarters')
        .delete()
        .eq('quarter_id', d.quarter_id)
        .eq('league_player_id', p.league_player_id)
        .eq('team_id', p.team_id)
    }

    // 픽 삭제
    await supabase
      .from('league_draft_picks')
      .delete()
      .eq('draft_id', draftId)
  }

  // 채팅 메시지 삭제 — 리셋과 함께 이전 세션의 대화는 모두 클리어
  // (TEST 메시지나 잘못된 발언이 새 세션에 보이지 않도록)
  // 채팅 테이블이 아직 없는 환경에서는 에러를 흘려보냄 (idempotent)
  await supabase
    .from('league_draft_chat')
    .delete()
    .eq('draft_id', draftId)
    .then(() => null, () => null)

  // 세션 상태 리셋
  const { data: updated, error } = await supabase
    .from('league_drafts')
    .update({
      status: 'setup',
      current_pick_index: 0,
      current_round: 1,
      total_picks: 0,
      started_at: null,
      completed_at: null,
      draft_order: [],
      ready_state: {},
      lottery_odds: null,
      lottery_done: false,
      pick_deadline: null,
      extensions_used: {},
    })
    .eq('id', draftId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ draft: updated, deleted_picks: deletePicks })
}
