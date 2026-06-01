// 어드민 드래프트 코드 API
//   POST   — 단장 코드 발급 (평문 입력 → bcrypt 해시 저장)
//   GET    — 발급된 코드 목록 (해시는 미반환)
//
// 모두 NextAuth 어드민 세션 필요.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { auth } from '@/lib/auth'
import { hashDraftCode } from '@/lib/leagueDraftAuth'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leagueId } = await params
  const body = await req.json().catch(() => null) as
    | { quarter_id?: string; team_id?: string; plain_code?: string; label?: string }
    | null
  if (!body?.quarter_id || !body?.team_id || !body?.plain_code || !body?.label) {
    return NextResponse.json({ error: 'quarter_id, team_id, plain_code, label 필요' }, { status: 400 })
  }
  const plainCode = body.plain_code.trim()
  const label = body.label.trim()
  if (plainCode.length < 4 || plainCode.length > 32) {
    return NextResponse.json({ error: '코드는 4~32자 사이여야 합니다' }, { status: 400 })
  }
  if (label.length < 1 || label.length > 60) {
    return NextResponse.json({ error: '레이블은 1~60자 사이여야 합니다' }, { status: 400 })
  }

  const supabase = createClient()

  // 기존 코드 (quarter_id, team_id) 가 있으면 충돌
  const { data: existing } = await supabase
    .from('league_draft_codes')
    .select('id')
    .eq('league_id', leagueId)
    .eq('quarter_id', body.quarter_id)
    .eq('team_id', body.team_id)
    .maybeSingle()
  if (existing) {
    return NextResponse.json(
      { error: '이미 이 분기·팀에 코드가 발급되어 있습니다. 기존 코드를 삭제 후 다시 발급하세요.' },
      { status: 409 },
    )
  }

  const code_hash = await hashDraftCode(plainCode)
  const { data, error } = await supabase
    .from('league_draft_codes')
    .insert({
      league_id: leagueId,
      quarter_id: body.quarter_id,
      team_id: body.team_id,
      code_hash,
      label,
      is_active: true,
    })
    .select('id, league_id, quarter_id, team_id, label, is_active, last_used_at, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 같은 (분기, 팀) 코드가 있습니다' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leagueId } = await params
  const { searchParams } = new URL(req.url)
  const quarterId = searchParams.get('quarterId')

  const supabase = createClient()
  let q = supabase
    .from('league_draft_codes')
    .select('id, quarter_id, team_id, label, is_active, last_used_at, created_at')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })
  if (quarterId) q = q.eq('quarter_id', quarterId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
