// GET /api/leagues/[leagueId]/columns?status=all|published|draft
//   → 목록 반환 (기본 published, admin PIN 검증 시 all)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const sp = new URL(req.url).searchParams
  const statusParam = sp.get('status') ?? 'published'
  const supabase = createClient()

  // draft/archive 요청 시 관리자 PIN 검증
  let statusFilter: string[] = ['published']
  if (statusParam === 'all') {
    if (!await verifyLeaguePin(req, leagueId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    statusFilter = ['draft', 'published', 'archived']
  } else if (statusParam === 'draft') {
    if (!await verifyLeaguePin(req, leagueId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    statusFilter = ['draft']
  }

  const { data, error } = await supabase
    .from('league_columns')
    .select('id, league_id, period_type, period_start, period_end, title, subtitle, cover_type, cover_player_id, cover_banner_url, status, published_at, created_at')
    .eq('league_id', leagueId)
    .in('status', statusFilter)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ columns: data ?? [] })
}
