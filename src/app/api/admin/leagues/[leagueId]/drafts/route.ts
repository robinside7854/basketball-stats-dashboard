// 어드민 드래프트 세션 — 분기당 1개 세션 생성 (Phase 3)
//
// POST: body = {
//   quarter_id,
//   method?: 'snake'|'linear',           // 기본 snake
//   leaders?: { [team_id]: league_player_id },  // 팀장(단장) 지정 — 풀에서 자동 제외
//   pool_player_ids: string[],           // 드래프트 대상(정규선수) 풀
// }
//   - draft_order 는 빈 배열로 생성 (이후 승률 가중 추첨으로 확정)
//   - status='setup' 으로 생성
//   - 팀장은 league_team_quarter_leaders 에 기록 + 본인 팀 정규 멤버십 자동 반영
//   - 풀은 league_draft_pool 에 저장 (팀장 id 는 방어적으로 제외)
//
// GET: ?quarterId=X — 해당 분기 세션 + 픽 + 풀 + 팀장 조회 (어드민 화면용)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { auth } from '@/lib/auth'
import { isDraftManager } from '@/lib/draftManagerAuth'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!await isDraftManager(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const session = await auth()
  const body = await req.json().catch(() => null) as
    | { quarter_id?: string; method?: 'snake'|'linear'; leaders?: Record<string, string | null>; pool_player_ids?: string[] }
    | null

  if (!body?.quarter_id) {
    return NextResponse.json({ error: 'quarter_id 필요' }, { status: 400 })
  }
  const poolIds = Array.isArray(body.pool_player_ids) ? body.pool_player_ids.filter(id => typeof id === 'string' && id) : []
  if (poolIds.length === 0) {
    return NextResponse.json({ error: '드래프트 대상 선수(풀)를 1명 이상 선택하세요' }, { status: 400 })
  }
  const method = body.method === 'linear' ? 'linear' : 'snake'
  const leaders = body.leaders ?? {}

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

  // 팀장 id 집합 (풀에서 제외)
  const leaderPlayerIds = new Set(
    Object.values(leaders).filter((v): v is string => typeof v === 'string' && v.length > 0),
  )
  const finalPool = poolIds.filter(id => !leaderPlayerIds.has(id))
  if (finalPool.length === 0) {
    return NextResponse.json({ error: '팀장을 제외하면 풀이 비어 있습니다' }, { status: 400 })
  }

  // 세션 생성 (draft_order 는 추첨 전까지 빈 배열)
  const { data: draft, error } = await supabase
    .from('league_drafts')
    .insert({
      league_id: leagueId,
      quarter_id: body.quarter_id,
      status: 'setup',
      draft_order: [],
      method,
      created_by: session?.user?.email ?? null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const draftId = (draft as { id: string }).id

  // 팀장 기록 + 본인 팀 정규 멤버십 반영
  for (const [teamId, playerId] of Object.entries(leaders)) {
    await supabase
      .from('league_team_quarter_leaders')
      .upsert({ quarter_id: body.quarter_id, team_id: teamId, leader_player_id: playerId ?? null })
    if (playerId) {
      await supabase
        .from('league_player_quarters')
        .upsert(
          { league_id: leagueId, quarter_id: body.quarter_id, league_player_id: playerId, team_id: teamId, is_regular: true },
          { onConflict: 'quarter_id,league_player_id' },
        )
    }
  }

  // 풀 저장
  const poolRows = finalPool.map(pid => ({ draft_id: draftId, league_player_id: pid }))
  const { error: poolErr } = await supabase.from('league_draft_pool').insert(poolRows)
  if (poolErr) {
    await supabase.from('league_drafts').delete().eq('id', draftId)
    return NextResponse.json({ error: `풀 저장 실패: ${poolErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ ...draft, pool_count: finalPool.length }, { status: 201 })
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!await isDraftManager(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  // 팀장은 세션 유무와 무관하게 반환 (세션 생성 전 화면에서도 사용)
  const { data: leaders } = await supabase
    .from('league_team_quarter_leaders')
    .select('team_id, leader_player_id')
    .eq('quarter_id', quarterId)

  if (!draft) return NextResponse.json({ draft: null, picks: [], pool: [], leaders: leaders ?? [] })

  const draftId = (draft as { id: string }).id
  const [{ data: picks }, { data: pool }] = await Promise.all([
    supabase
      .from('league_draft_picks')
      .select('id, pick_number, round_number, team_id, league_player_id, picked_at')
      .eq('draft_id', draftId)
      .order('pick_number', { ascending: true }),
    supabase
      .from('league_draft_pool')
      .select('league_player_id')
      .eq('draft_id', draftId),
  ])

  return NextResponse.json({
    draft,
    picks: picks ?? [],
    pool: (pool ?? []).map(p => p.league_player_id),
    leaders: leaders ?? [],
  })
}
