// 어드민 드래프트 코드 — 개별 코드 PATCH (is_active 토글 / 레이블 / 평문 코드 재설정) / DELETE

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { isDraftManager } from '@/lib/draftManagerAuth'
import { hashDraftCode } from '@/lib/leagueDraftAuth'
import { logAudit } from '@/lib/audit'
import { resolveTeamId } from '@/lib/league/teamScope'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; codeId: string }> },
) {
  const { leagueId, codeId } = await params
  if (!await isDraftManager(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // uuid 가 아니면 PostgREST 가 500 을 낸다(2026-09-16 실측) — 없는 코드로 취급한다
  if (!/^[0-9a-f-]{36}$/i.test(codeId)) return NextResponse.json({ error: '코드를 찾을 수 없습니다' }, { status: 404 })
  const body = await req.json().catch(() => null) as { is_active?: boolean; label?: string; plain_code?: string; league_player_id?: string | null } | null
  if (!body) return NextResponse.json({ error: '본문 누락' }, { status: 400 })

  const supabase = createClient()

  const update: { is_active?: boolean; label?: string; code_hash?: string; plain_code?: string; league_player_id?: string | null } = {}
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
  // 옛 코드(117 이전 발급)에 선수를 뒤늦게 연결할 수 있게 한다. null 은 연결 해제.
  if (body.league_player_id !== undefined) {
    if (body.league_player_id === null || body.league_player_id === '') {
      update.league_player_id = null
    } else {
      // 남의 팀 선수를 연결하면 세션 생성 시 팀장이 엉뚱한 사람으로 자동 지정된다 → 입구에서 차단
      const teamId = await resolveTeamId(leagueId)
      const { data: player } = await supabase
        .from('league_players')
        .select('id, team_id')
        .eq('id', body.league_player_id)
        .maybeSingle()
      if (!player || player.team_id !== teamId) {
        return NextResponse.json({ error: '이 팀 명단에 없는 선수입니다' }, { status: 400 })
      }
      update.league_player_id = body.league_player_id
    }
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '변경할 필드 없음' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('league_draft_codes')
    .update(update)
    .eq('id', codeId)
    .eq('league_id', leagueId)
    .select('id, quarter_id, team_id, label, league_player_id, is_active, last_used_at, created_at, plain_code')
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
