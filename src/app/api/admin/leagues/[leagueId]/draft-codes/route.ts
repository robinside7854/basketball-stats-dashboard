// 어드민 드래프트 코드 API
//   POST   — 단장 코드 발급 (평문 입력 → bcrypt 해시 저장)
//   GET    — 발급된 코드 목록 (해시는 미반환)
//
// 모두 NextAuth 어드민 세션 필요.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { isDraftManager } from '@/lib/draftManagerAuth'
import { hashDraftCode } from '@/lib/leagueDraftAuth'
import { logAudit } from '@/lib/audit'
import { resolveTeamId } from '@/lib/league/teamScope'

/**
 * 단장 코드에 연결할 선수가 이 경기묶음의 팀 명단에 속하는지 확인하고 이름을 돌려준다.
 * 남의 팀 선수 id 를 넣으면 세션 생성 때 팀장이 그 사람으로 자동 지정되므로 입구에서 막는다.
 */
async function resolveLinkedPlayer(
  leagueId: string,
  playerId: string,
): Promise<{ ok: true; name: string } | { ok: false }> {
  const supabase = createClient()
  const teamId = await resolveTeamId(leagueId)
  const { data } = await supabase
    .from('league_players')
    .select('id, name, team_id')
    .eq('id', playerId)
    .maybeSingle()
  if (!data || data.team_id !== teamId) return { ok: false }
  return { ok: true, name: data.name as string }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!await isDraftManager(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null) as
    | { quarter_id?: string; team_id?: string; plain_code?: string; label?: string; role?: 'manager' | 'supervisor'; league_player_id?: string }
    | null
  const role = body?.role === 'supervisor' ? 'supervisor' : 'manager'
  // 단장 코드는 선수를 연결할 수 있다(migration 117). 감독관 코드는 사람 1:1 대응이 아니라 항상 NULL.
  const linkedPlayerId = role === 'manager' && typeof body?.league_player_id === 'string' && body.league_player_id.length > 0
    ? body.league_player_id
    : null
  let linkedPlayerName: string | null = null
  if (linkedPlayerId) {
    const r = await resolveLinkedPlayer(leagueId, linkedPlayerId)
    if (!r.ok) return NextResponse.json({ error: '이 팀 명단에 없는 선수입니다' }, { status: 400 })
    linkedPlayerName = r.name
  }
  // 단장(manager) 은 team_id 필수, 감독관(supervisor) 은 team_id 불필요.
  // 레이블은 선수를 연결했으면 그 이름으로 대신한다 — 발급 화면에서 이름을 두 번 적게 하지 않는다.
  const rawLabel = typeof body?.label === 'string' && body.label.trim().length > 0
    ? body.label.trim()
    : (linkedPlayerName ?? '')
  if (!body?.quarter_id || !body?.plain_code || !rawLabel || (role === 'manager' && !body?.team_id)) {
    return NextResponse.json({ error: 'quarter_id, plain_code, label (manager 는 team_id) 필요' }, { status: 400 })
  }
  const plainCode = body.plain_code.trim()
  const label = rawLabel
  if (plainCode.length < 3 || plainCode.length > 32) {
    return NextResponse.json({ error: '코드는 3~32자 사이여야 합니다' }, { status: 400 })
  }
  if (label.length < 1 || label.length > 60) {
    return NextResponse.json({ error: '레이블은 1~60자 사이여야 합니다' }, { status: 400 })
  }
  const teamId = role === 'supervisor' ? null : body.team_id!

  const supabase = createClient()

  // 단장(manager)은 (quarter, team) 당 1개. 감독관(supervisor)은 무제한 발급 가능.
  if (role === 'manager') {
    const { data: existing } = await supabase
      .from('league_draft_codes')
      .select('id')
      .eq('league_id', leagueId)
      .eq('quarter_id', body.quarter_id)
      .eq('role', 'manager')
      .eq('team_id', teamId!)
      .maybeSingle()
    if (existing) {
      return NextResponse.json(
        { error: '이미 이 분기·팀에 코드가 발급되어 있습니다. 기존 코드를 삭제 후 다시 발급하세요.' },
        { status: 409 },
      )
    }
  }

  const code_hash = await hashDraftCode(plainCode)
  const { data, error } = await supabase
    .from('league_draft_codes')
    .insert({
      league_id: leagueId,
      quarter_id: body.quarter_id,
      team_id: teamId,
      role,
      code_hash,
      plain_code: plainCode,
      label,
      league_player_id: linkedPlayerId,
      is_active: true,
    })
    .select('id, league_id, quarter_id, team_id, role, label, league_player_id, is_active, last_used_at, created_at, plain_code')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 같은 (분기, 팀) 코드가 있습니다' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // 코드 발급은 "권한을 하나 더 만드는" 행위다 — 감독관 코드는 드래프트 삭제·초기화까지 연다.
  // ⚠ plain_code 는 절대 로그에 넣지 않는다. 레이블·역할·분기만 남긴다.
  await logAudit({
    req, action: 'draft_code.create', targetTable: 'league_draft_codes', targetId: data.id,
    leagueId, teamId, quarterId: body.quarter_id, detail: { role, label, league_player_id: linkedPlayerId },
  })
  return NextResponse.json(data, { status: 201 })
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!await isDraftManager(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const quarterId = searchParams.get('quarterId')

  const supabase = createClient()
  let q = supabase
    .from('league_draft_codes')
    .select('id, quarter_id, team_id, role, label, league_player_id, is_active, last_used_at, created_at, plain_code')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })
  if (quarterId) q = q.eq('quarter_id', quarterId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
