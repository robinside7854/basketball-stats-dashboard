// 기록 화면의 후보 버튼을 "실제로 자주 일어난 순서"로 정렬하기 위한 집계.
//
// 왜 필요한가: 어시스트 피커는 3초 뒤 자동으로 "없음" 처리된다. 실측(2026-08-10)에서
// 어시스트 기록률이 3P 87.4% 인데 골밑슛은 60.2% 로 떨어지는데, 골밑은 연속 동작이 빨라
// 3초 안에 후보를 눈으로 찾는 것 자체가 병목이라는 뜻이다. 그래서 누른 적 있는 조합을
// 앞으로 당긴다 — 자동 입력이 아니라 순서만 바꾸므로 틀려도 손해가 없다.
//
// 반환값은 "선수 id 순위 목록"이고, 화면은 이 순서를 힌트로만 쓴다(없는 선수는 뒤로).
import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canViewLeague } from '@/lib/auth/guard'

const SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post']

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const supabase = createClient()

  const { data: games, error: gErr } = await supabase
    .from('league_games')
    .select('id')
    .eq('league_id', leagueId)
  if (gErr) throw new Error(`tendencies: leagueId=${leagueId} 경기 조회 실패 — ${gErr.message}`)
  const gameIds = (games ?? []).map(g => g.id as string)
  if (gameIds.length === 0) return NextResponse.json({ assist: {}, rebound: [] })

  // ⚠ PostgREST 는 1000행에서 잘린다 — 리그 이벤트는 그보다 훨씬 많으므로 반드시 페이지네이션.
  type Row = { type: string; result: string | null; league_player_id: string | null; related_player_id: string | null }
  const rows: Row[] = []
  const PAGE = 1000
  for (let page = 0; ; page++) {
    const { data: chunk, error } = await supabase
      .from('league_game_events')
      .select('type, result, league_player_id, related_player_id')
      .in('league_game_id', gameIds)
      .order('id', { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (error) throw new Error(`tendencies: 이벤트 조회 실패 — ${error.message}`)
    if (chunk?.length) rows.push(...(chunk as Row[]))
    if (!chunk || chunk.length < PAGE) break
  }

  // 슈터별 어시스트 제공자 빈도
  const assistCount: Record<string, Record<string, number>> = {}
  const rebCount: Record<string, number> = {}
  for (const e of rows) {
    if (e.type === 'oreb' || e.type === 'dreb') {
      if (e.league_player_id) rebCount[e.league_player_id] = (rebCount[e.league_player_id] ?? 0) + 1
      continue
    }
    if (e.result !== 'made' || !SHOT_TYPES.includes(e.type)) continue
    if (!e.league_player_id || !e.related_player_id) continue
    if (!assistCount[e.league_player_id]) assistCount[e.league_player_id] = {}
    assistCount[e.league_player_id][e.related_player_id] =
      (assistCount[e.league_player_id][e.related_player_id] ?? 0) + 1
  }

  const assist: Record<string, string[]> = {}
  for (const shooter of Object.keys(assistCount)) {
    assist[shooter] = Object.entries(assistCount[shooter])
      .sort((a, b) => b[1] - a[1])
      .map(([pid]) => pid)
  }
  const rebound = Object.entries(rebCount).sort((a, b) => b[1] - a[1]).map(([pid]) => pid)

  return NextResponse.json({ assist, rebound })
}
