// 공개 드래프트 포털 — 토큰으로 드래프트 위치 정보 lookup.
// 인증 불필요. 토큰 자체가 진입 권한.
//
// GET /api/draft-portal/[token]
// 반환: { draft_id, league_id, quarter_id, league_name, org_slug, year, quarter }
// 토큰이 없거나 매칭 없으면 404.
//
// 이후 페이지는 이 정보를 받아 기존
//   GET /api/leagues/[league_id]/drafts/current?quarterId=...
// 로 보드 데이터를 폴링한다.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 8) {
    return NextResponse.json({ error: 'invalid token' }, { status: 404 })
  }
  const supabase = createClient()
  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, league_id, quarter_id')
    .eq('share_token', token)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // 보너스 메타 — 페이지 헤더에 표시할 리그명·org_slug·분기 표기
  const [{ data: league }, { data: quarter }] = await Promise.all([
    supabase
      .from('leagues')
      .select('name, org_slug')
      .eq('id', draft.league_id)
      .maybeSingle(),
    supabase
      .from('league_quarters')
      .select('year, quarter')
      .eq('id', draft.quarter_id)
      .maybeSingle(),
  ])

  return NextResponse.json({
    draft_id: draft.id,
    league_id: draft.league_id,
    quarter_id: draft.quarter_id,
    league_name: league?.name ?? '',
    org_slug: league?.org_slug ?? '',
    year: quarter?.year ?? null,
    quarter: quarter?.quarter ?? null,
  })
}
