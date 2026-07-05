// POST /api/leagues/[leagueId]/columns/[columnId]/publish
// 상태를 published 로 전환 + published_at 기록.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; columnId: string }> },
) {
  const { leagueId, columnId } = await params
  if (!await verifyLeaguePin(req, leagueId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_columns')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', columnId)
    .eq('league_id', leagueId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ column: data })
}
