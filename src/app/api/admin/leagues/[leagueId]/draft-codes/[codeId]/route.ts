// 어드민 드래프트 코드 — 개별 코드 PATCH (is_active 토글 / 레이블 / 평문 코드 재설정) / DELETE

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { isDraftManager } from '@/lib/draftManagerAuth'
import { hashDraftCode } from '@/lib/leagueDraftAuth'
import { logAudit } from '@/lib/audit'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; codeId: string }> },
) {
  const { leagueId, codeId } = await params
  if (!await isDraftManager(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null) as { is_active?: boolean; label?: string; plain_code?: string } | null
  if (!body) return NextResponse.json({ error: '본문 누락' }, { status: 400 })

  const update: { is_active?: boolean; label?: string; code_hash?: string; plain_code?: string } = {}
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active
  if (typeof body.label === 'string') {
    const trimmed = body.label.trim()
    if (trimmed.length < 1 || trimmed.length > 60) {
      return NextResponse.json({ error: '레이블은 1~60자' }, { status: 400 })
    }
    update.label = trimmed
  }
  if (typeof body.plain_code === 'string') {
    const trimmed = body.plain_code.trim()
    if (trimmed.length < 3 || trimmed.length > 32) {
      return NextResponse.json({ error: '코드는 3~32자 사이여야 합니다' }, { status: 400 })
    }
    update.code_hash = await hashDraftCode(trimmed)
    update.plain_code = trimmed
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '변경할 필드 없음' }, { status: 400 })
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_draft_codes')
    .update(update)
    .eq('id', codeId)
    .eq('league_id', leagueId)
    .select('id, quarter_id, team_id, label, is_active, last_used_at, created_at, plain_code')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // ⚠ 값이 아니라 "무엇을 바꿨는지" 만 남긴다 — plain_code 가 로그로 새면 안 된다.
  await logAudit({
    req, action: 'draft_code.update', targetTable: 'league_draft_codes', targetId: codeId,
    leagueId, detail: { fields: Object.keys(update).filter(k => k !== 'plain_code' && k !== 'code_hash')
      .concat(update.code_hash ? ['code(재설정)'] : []) },
  })
  return NextResponse.json(data)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; codeId: string }> },
) {
  const { leagueId, codeId } = await params
  if (!await isDraftManager(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createClient()
  const { error } = await supabase
    .from('league_draft_codes')
    .delete()
    .eq('id', codeId)
    .eq('league_id', leagueId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAudit({
    req, action: 'draft_code.delete', targetTable: 'league_draft_codes', targetId: codeId, leagueId,
  })
  return NextResponse.json({ ok: true })
}
