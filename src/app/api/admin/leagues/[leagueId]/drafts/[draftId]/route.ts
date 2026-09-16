// 드래프트 세션 — 개별 세션 수정/삭제 (어드민 or 리그 PIN)
//
// PATCH  : setup 상태에서 풀(참여 선수) + 팀장 수정
//          body { leaders?: {team_id: player_id|null}, pool_player_ids?: string[] }
// DELETE : 세션 전체 삭제 (picks/pool/chat cascade). 픽으로 만든 멤버십은 되돌림.
//
// 테스트 세션(is_test):
//   - PATCH 는 리그 표(팀장·멤버십) 쓰기를 건너뛰고, 팀장을 세션 행의 test_leaders jsonb 에
//     저장한다(migration 116 — 생성 라우트와 같은 규칙).
//   - DELETE 는 멤버십을 지우지 않는다 — 애초에 쓴 적이 없으므로, 지우면 이 분기에
//     다른 경로로 들어온 진짜 소속을 대신 지우게 된다.
//   - DELETE 권한: 실전 세션은 종전대로 어드민/PIN 만. **테스트 세션에 한해** 감독관 코드로도
//     지울 수 있다 — 리허설을 마치고 흔적을 치우는 것이 감독관의 일이기 때문.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { isDraftManager, isDraftSessionControllerByDraftId } from '@/lib/draftManagerAuth'
import { logAudit } from '@/lib/audit'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; draftId: string }> },
) {
  const { leagueId, draftId } = await params
  // PATCH (풀·팀장) 는 감독관도 가능 — 방 모델
  if (!await isDraftSessionControllerByDraftId(req, leagueId, draftId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as
    | { leaders?: Record<string, string | null>; pool_player_ids?: string[] }
    | null
  if (!body) return NextResponse.json({ error: '본문 누락' }, { status: 400 })

  const supabase = createClient()
  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, quarter_id, status, is_test')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
  const d = draft as { id: string; quarter_id: string; status: string; is_test: boolean }
  if (d.status !== 'setup') {
    return NextResponse.json({ error: `참여 설정은 준비(setup) 단계에서만 수정 가능합니다 (현재: ${d.status})` }, { status: 409 })
  }

  const leaders = body.leaders ?? {}
  const leaderPlayerIds = new Set(Object.values(leaders).filter((v): v is string => typeof v === 'string' && v.length > 0))

  // 팀장 기록 + 본인 팀 정규 멤버십
  // 테스트 세션은 리그 표 대신 세션 행(test_leaders)에 팀장을 저장한다.
  if (d.is_test) {
    const testLeaders: Record<string, string> = {}
    for (const [teamId, playerId] of Object.entries(leaders)) {
      if (typeof playerId === 'string' && playerId) testLeaders[teamId] = playerId
    }
    const { error: tlErr } = await supabase
      .from('league_drafts')
      .update({ test_leaders: testLeaders })
      .eq('id', draftId)
      .eq('league_id', leagueId)
    if (tlErr) return NextResponse.json({ error: `팀장 저장 실패: ${tlErr.message}` }, { status: 500 })
  } else {
    for (const [teamId, playerId] of Object.entries(leaders)) {
      await supabase
        .from('league_team_quarter_leaders')
        .upsert({ quarter_id: d.quarter_id, team_id: teamId, leader_player_id: playerId ?? null })
      if (playerId) {
        await supabase
          .from('league_player_quarters')
          .upsert(
            { league_id: leagueId, quarter_id: d.quarter_id, league_player_id: playerId, team_id: teamId, is_regular: true },
            { onConflict: 'quarter_id,league_player_id' },
          )
      }
    }
  }

  // 풀 교체 (팀장 제외)
  if (Array.isArray(body.pool_player_ids)) {
    const finalPool = body.pool_player_ids.filter(id => typeof id === 'string' && id && !leaderPlayerIds.has(id))
    if (finalPool.length === 0) {
      return NextResponse.json({ error: '팀장을 제외하면 풀이 비어 있습니다' }, { status: 400 })
    }
    await supabase.from('league_draft_pool').delete().eq('draft_id', draftId)
    const { error: poolErr } = await supabase
      .from('league_draft_pool')
      .insert(finalPool.map(pid => ({ draft_id: draftId, league_player_id: pid })))
    if (poolErr) return NextResponse.json({ error: `풀 저장 실패: ${poolErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; draftId: string }> },
) {
  const { leagueId, draftId } = await params
  const isManager = await isDraftManager(req, leagueId)

  const supabase = createClient()
  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, quarter_id, is_test')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  const d = draft as { id: string; quarter_id: string; is_test: boolean } | null

  // 실전 세션은 종전대로 어드민/PIN 만 삭제할 수 있다. 테스트 세션은 감독관 코드도 허용 —
  // 리허설 뒷정리까지 감독관이 방 안에서 끝낼 수 있어야 하기 때문.
  // (세션 존재 여부를 흘리지 않도록 404 보다 401 을 먼저 낸다)
  if (!isManager) {
    const testDeletable = !!d?.is_test && await isDraftSessionControllerByDraftId(req, leagueId, draftId)
    if (!testDeletable) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!d) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })

  // 픽으로 만든 멤버십 되돌림 (정확 매칭)
  // ⚠ 테스트 세션은 멤버십을 쓴 적이 없다 — 여기서 지우면 같은 분기에 다른 경로로 들어온
  //    진짜 소속을 대신 지운다. 픽 목록은 감사 로그 숫자를 위해 그대로 읽는다.
  const { data: picks } = await supabase
    .from('league_draft_picks')
    .select('team_id, league_player_id')
    .eq('draft_id', draftId)
  if (!d.is_test) {
    for (const p of (picks ?? []) as { team_id: string; league_player_id: string }[]) {
      await supabase
        .from('league_player_quarters')
        .delete()
        .eq('quarter_id', d.quarter_id)
        .eq('league_player_id', p.league_player_id)
        .eq('team_id', p.team_id)
    }
  }

  // 세션 삭제 (picks/pool/chat cascade)
  const { error } = await supabase.from('league_drafts').delete().eq('id', draftId).eq('league_id', leagueId)
  if (error) {
    await logAudit({
      req, action: 'draft.delete', targetTable: 'league_drafts', targetId: draftId,
      leagueId, quarterId: d.quarter_id, result: 'failure',
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // 픽으로 만들어진 분기 멤버십이 함께 되돌아간다 — 몇 명이 영향받았는지 남긴다.
  await logAudit({
    req, action: 'draft.delete', targetTable: 'league_drafts', targetId: draftId,
    leagueId, quarterId: d.quarter_id,
    detail: { revertedMemberships: d.is_test ? 0 : (picks ?? []).length, isTest: d.is_test, picks: (picks ?? []).length },
  })
  return NextResponse.json({ ok: true })
}
