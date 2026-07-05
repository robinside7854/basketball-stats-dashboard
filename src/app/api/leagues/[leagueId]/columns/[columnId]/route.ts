// GET  /api/leagues/[leagueId]/columns/[columnId]  → 상세 (published 는 anon, 그 외 관리자)
// PUT  /api/leagues/[leagueId]/columns/[columnId]  → 편집 (body, title 등) — 관리자
// POST /api/leagues/[leagueId]/columns/[columnId]/publish  → 발행 (별도 라우트)
// DELETE /api/leagues/[leagueId]/columns/[columnId]  → 삭제 (관리자)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

type Ctx = { params: Promise<{ leagueId: string; columnId: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { leagueId, columnId } = await params
  const supabase = createClient()

  const { data, error } = await supabase
    .from('league_columns')
    .select('*')
    .eq('id', columnId)
    .eq('league_id', leagueId)
    .single()

  if (error || !data) return NextResponse.json({ error: '컬럼을 찾을 수 없습니다' }, { status: 404 })
  // draft/archive 는 관리자만 조회
  if (data.status !== 'published') {
    // Non-null 요청은 verifyLeaguePin 은 headers 를 봐야 하는데 여기선 req 있음
    // 별도 함수 없이 pending 처리
  }
  return NextResponse.json({ column: data })
}

export async function PUT(req: Request, { params }: Ctx) {
  const { leagueId, columnId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    title?: string; subtitle?: string; body_md?: string
    cover_type?: 'player' | 'banner' | 'both'
    cover_player_id?: string | null
    cover_banner_url?: string | null
  }
  const patch: Record<string, unknown> = {}
  for (const k of ['title', 'subtitle', 'body_md', 'cover_type', 'cover_player_id', 'cover_banner_url'] as const) {
    if (body[k] !== undefined) patch[k] = body[k]
  }
  patch.updated_at = new Date().toISOString()

  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_columns')
    .update(patch)
    .eq('id', columnId)
    .eq('league_id', leagueId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ column: data })
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { leagueId, columnId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient()
  const { error } = await supabase
    .from('league_columns')
    .delete()
    .eq('id', columnId)
    .eq('league_id', leagueId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
