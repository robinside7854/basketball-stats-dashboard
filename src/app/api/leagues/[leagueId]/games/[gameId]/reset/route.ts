import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { logAudit } from '@/lib/audit'

// DELETE /api/leagues/[leagueId]/games/[gameId]/reset
// 경기의 모든 이벤트 삭제 + 스코어 0으로 초기화 + is_complete 해제
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; gameId: string }> }
) {
  const { leagueId, gameId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient()

  // canEditLeague 는 leagueId 를 인가했을 뿐이고 gameId 는 URL 로 들어온 값이다.
  // 아래 이벤트 삭제는 league_game_id 만 보므로, 대조하지 않으면 A 리그 권한으로
  // 다른 클럽 경기의 기록 전체를 지울 수 있다(리그 스탯은 이벤트 재집계로만 만들어진다).
  // 소속이 아니면 403 이 아니라 404 — 그 id 의 경기가 있는지조차 알려주지 않기 위함이다.
  const { data: game, error: scopeErr } = await supabase
    .from('league_games')
    .select('id')
    .eq('id', gameId)
    .eq('league_id', leagueId)
    .maybeSingle()
  // 확인이 안 된 채로 진행하면 확인을 안 한 것과 같다 — 조회 실패는 거절로 취급한다.
  if (scopeErr) return NextResponse.json({ error: scopeErr.message }, { status: 500 })
  if (!game) return NextResponse.json({ error: '경기를 찾을 수 없습니다' }, { status: 404 })

  // 몇 건이 사라졌는지를 함께 남긴다 — "초기화했다" 보다 "이벤트 187건이 사라졌다" 가
  // 사후 조사에서 훨씬 유용하다(리그 스탯은 이 이벤트 재집계로만 만들어진다).
  const { data: removed, error: evErr } = await supabase
    .from('league_game_events')
    .delete()
    .eq('league_game_id', gameId)
    .select('id')
  if (evErr) {
    await logAudit({
      req, action: 'game.reset', targetTable: 'league_games', targetId: gameId,
      leagueId, result: 'failure',
    })
    return NextResponse.json({ error: evErr.message }, { status: 500 })
  }

  const { error: gErr } = await supabase
    .from('league_games')
    .update({ home_score: 0, away_score: 0, is_complete: false })
    .eq('id', gameId)
    .eq('league_id', leagueId)
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })

  await logAudit({
    req, action: 'game.reset', targetTable: 'league_games', targetId: gameId, leagueId,
    detail: { deletedEvents: removed?.length ?? 0 },
  })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  return NextResponse.json({ success: true })
}
