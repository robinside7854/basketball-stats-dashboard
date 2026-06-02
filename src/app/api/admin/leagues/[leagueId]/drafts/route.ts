// 어드민 드래프트 세션 — 분기당 1개 세션 생성
//
// POST: body = { quarter_id, draft_order: UUID[], method? }
//   - draft_order 는 team_id 의 배열 (1라운드 픽 순서)
//   - method 기본값 'snake'
//   - status='setup' 으로 생성
//
// GET: ?quarterId=X — 해당 분기 세션 + 픽 + draft_order 조회 (어드민 화면용)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { auth } from '@/lib/auth'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leagueId } = await params
  const body = await req.json().catch(() => null) as
    | { quarter_id?: string; draft_order?: string[]; method?: 'snake'|'linear' }
    | null

  if (!body?.quarter_id || !Array.isArray(body.draft_order) || body.draft_order.length === 0) {
    return NextResponse.json({ error: 'quarter_id, draft_order 필요' }, { status: 400 })
  }
  if (body.draft_order.some(id => typeof id !== 'string' || id.length === 0)) {
    return NextResponse.json({ error: 'draft_order 는 비어있지 않은 team_id 배열' }, { status: 400 })
  }
  const method = body.method === 'linear' ? 'linear' : 'snake'

  const supabase = createClient()

  // 기존 세션 검사
  const { data: existing } = await supabase
    .from('league_drafts')
    .select('id, status')
    .eq('quarter_id', body.quarter_id)
    .maybeSingle()
  if (existing) {
    return NextResponse.json(
      { error: `이 분기에는 이미 드래프트 세션이 있습니다 (status=${existing.status}). 리셋 후 재생성하세요.` },
      { status: 409 },
    )
  }

  // draft_order 의 모든 team_id 가 이 리그의 league_teams 인지 확인
  const { data: validTeams } = await supabase
    .from('league_teams')
    .select('id')
    .eq('league_id', leagueId)
    .in('id', body.draft_order)
  const validSet = new Set((validTeams ?? []).map(t => t.id))
  if (validSet.size !== body.draft_order.length) {
    return NextResponse.json({ error: 'draft_order 에 이 리그 소속 아닌 team_id 포함' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('league_drafts')
    .insert({
      league_id: leagueId,
      quarter_id: body.quarter_id,
      status: 'setup',
      draft_order: body.draft_order,
      method,
      created_by: session.user?.email ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
  if (!quarterId) return NextResponse.json({ error: 'quarterId 필요' }, { status: 400 })

  const supabase = createClient()
  const { data: draft } = await supabase
    .from('league_drafts')
    .select('*')
    .eq('league_id', leagueId)
    .eq('quarter_id', quarterId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ draft: null, picks: [] })

  const { data: picks } = await supabase
    .from('league_draft_picks')
    .select('id, pick_number, round_number, team_id, league_player_id, picked_at')
    .eq('draft_id', (draft as { id: string }).id)
    .order('pick_number', { ascending: true })

  return NextResponse.json({ draft, picks: picks ?? [] })
}
