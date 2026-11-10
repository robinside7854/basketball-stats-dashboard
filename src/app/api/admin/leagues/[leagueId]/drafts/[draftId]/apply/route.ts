// 드래프트 결과를 리그에 반영 — 운영진(어드민 ∥ CEO)만 (2026-11-10 운영진 「끝나면 자동 반영 말고 최종 컨펌하에」)
//   픽(league_draft_picks)을 그 분기 정규 소속(league_player_quarters)으로 한 번에 쓴다.
//   · 끝난(completed) 실전 세션만 · 한 번만(applied_at) · 리허설(is_test)은 반영하지 않는다.
//   · 감독관 코드로는 못 한다 — 리그 데이터를 바꾸는 마지막 결정이라 운영진 권한으로만.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { isDraftManager } from '@/lib/draftManagerAuth'
import { resolveAuditActor, logAudit } from '@/lib/audit'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; draftId: string }> },
) {
  const { leagueId, draftId } = await params
  if (!await isDraftManager(req, leagueId)) return NextResponse.json({ error: '운영진만 반영할 수 있어요' }, { status: 401 })
  const supabase = createClient()

  const { data: draft, error: dErr } = await supabase.from('league_drafts')
    .select('id, quarter_id, status, is_test, applied_at')
    .eq('id', draftId).eq('league_id', leagueId).maybeSingle()
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 })
  if (!draft) return NextResponse.json({ error: '세션을 찾을 수 없어요' }, { status: 404 })
  const d = draft as { id: string; quarter_id: string; status: string; is_test: boolean | null; applied_at: string | null }
  if (d.is_test) return NextResponse.json({ error: '리허설 세션은 리그에 반영하지 않아요' }, { status: 409 })
  if (d.status !== 'completed') return NextResponse.json({ error: '드래프트가 끝난 뒤에 반영할 수 있어요' }, { status: 409 })
  if (d.applied_at) return NextResponse.json({ error: '이미 반영했어요' }, { status: 409 })

  const actor = await resolveAuditActor(req, { leagueId }).catch(() => null)
  const label = actor?.label ?? '운영진'
  // 먼저 「반영함」으로 표시한다(그 값일 때만) — 두 사람이 동시에 눌러도 한 번만 쓴다
  const { data: claimed, error: cErr } = await supabase.from('league_drafts')
    .update({ applied_at: new Date().toISOString(), applied_by_label: label })
    .eq('id', draftId).is('applied_at', null).select('id')
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  if (!claimed || claimed.length === 0) return NextResponse.json({ error: '이미 반영했어요' }, { status: 409 })

  const { data: picks, error: pErr } = await supabase.from('league_draft_picks')
    .select('team_id, league_player_id').eq('draft_id', draftId)
  const rows = ((picks ?? []) as Array<{ team_id: string; league_player_id: string }>).map(p => ({
    league_id: leagueId, quarter_id: d.quarter_id, league_player_id: p.league_player_id, team_id: p.team_id, is_regular: true,
  }))
  const { error: uErr } = pErr ? { error: pErr } : rows.length
    ? await supabase.from('league_player_quarters').upsert(rows, { onConflict: 'quarter_id,league_player_id' })
    : { error: null }
  if (uErr) {
    // 쓰기에 실패하면 「반영함」 표시를 되돌려 다시 누를 수 있게 한다
    await supabase.from('league_drafts').update({ applied_at: null, applied_by_label: null }).eq('id', draftId)
    return NextResponse.json({ error: `반영하지 못했어요: ${uErr.message}` }, { status: 500 })
  }

  await logAudit({ req, action: 'draft.apply', targetTable: 'league_drafts', targetId: draftId, leagueId, detail: { quarterId: d.quarter_id, players: rows.length } })
  return NextResponse.json({ ok: true, applied: rows.length })
}
