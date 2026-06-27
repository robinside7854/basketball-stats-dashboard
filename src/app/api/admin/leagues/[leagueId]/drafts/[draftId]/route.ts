// 드래프트 세션 — 개별 세션 수정/삭제 (어드민 or 리그 PIN)
//
// PATCH  : setup 상태에서 풀(참여 선수) + 팀장 수정
//          body { leaders?: {team_id: player_id|null}, pool_player_ids?: string[] }
// DELETE : 세션 전체 삭제 (picks/pool/chat cascade). 픽으로 만든 멤버십은 되돌림.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { isDraftManager, isDraftSessionControllerByDraftId } from '@/lib/draftManagerAuth'

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
    .select('id, quarter_id, status')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
  const d = draft as { id: string; quarter_id: string; status: string }
  if (d.status !== 'setup') {
    return NextResponse.json({ error: `참여 설정은 준비(setup) 단계에서만 수정 가능합니다 (현재: ${d.status})` }, { status: 409 })
  }

  const leaders = body.leaders ?? {}
  const leaderPlayerIds = new Set(Object.values(leaders).filter((v): v is string => typeof v === 'string' && v.length > 0))

  // 팀장 기록 + 본인 팀 정규 멤버십
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
  if (!await isDraftManager(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient()
  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, quarter_id')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
  const d = draft as { id: string; quarter_id: string }

  // 픽으로 만든 멤버십 되돌림 (정확 매칭)
  const { data: picks } = await supabase
    .from('league_draft_picks')
    .select('team_id, league_player_id')
    .eq('draft_id', draftId)
  for (const p of (picks ?? []) as { team_id: string; league_player_id: string }[]) {
    await supabase
      .from('league_player_quarters')
      .delete()
      .eq('quarter_id', d.quarter_id)
      .eq('league_player_id', p.league_player_id)
      .eq('team_id', p.team_id)
  }

  // 세션 삭제 (picks/pool/chat cascade)
  const { error } = await supabase.from('league_drafts').delete().eq('id', draftId).eq('league_id', leagueId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
