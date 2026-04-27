import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

// DELETE /api/leagues/[leagueId]/games/[gameId]/reset
// 경기의 모든 이벤트 삭제 + 스코어 0으로 초기화 + is_complete 해제
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; gameId: string }> }
) {
  const { leagueId, gameId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient()

  const { error: evErr } = await supabase
    .from('league_game_events')
    .delete()
    .eq('league_game_id', gameId)
  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 })

  const { error: gErr } = await supabase
    .from('league_games')
    .update({ home_score: 0, away_score: 0, is_complete: false })
    .eq('id', gameId)
    .eq('league_id', leagueId)
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
