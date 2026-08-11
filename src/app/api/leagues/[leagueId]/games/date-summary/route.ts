// GET /api/leagues/[leagueId]/games/date-summary
//
// 날짜별 경기 집계만 돌려준다 — 슬롯 하나하나가 아니라 "그날 몇 경기 / 몇 개 영상 / 몇 개 마감".
//
// 왜 만들었나: 기록·일정 화면이 집계를 만들려고 `/games` 를 통째로 받아가고 있었다.
//   그 라우트는 `select('*')` 에 홈·어웨이 팀 조인까지 붙어 있어, 지금 303행 × 전 컬럼이
//   브라우저까지 내려온 뒤 클라이언트에서 날짜별로 세어졌다. 화면에 실제로 쓰이는 건
//   날짜당 숫자 네 개뿐이다.
//
// ⚠ 더 급한 이유는 성능이 아니라 정확도다. PostgREST 는 기본 max-rows 1000 에서 조용히 잘린다.
//   시즌이 쌓이면 뒷부분 경기가 통째로 빠진 채 "집계가 맞아 보이는" 화면이 나온다.
//   이 저장소에서 같은 방식으로 이미 당한 적이 있어, 여기서는 처음부터 페이지네이션한다.

import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canViewLeague } from '@/lib/auth/guard'

export interface DateSummary {
  date: string
  total: number
  started: number
  complete: number
  yt: number
  /** 그 날짜가 속한 분기. 화면의 '날짜 → 분기' 맵이 이것 하나 때문에 전 경기를 받아가고 있었다. */
  quarter_id: string | null
}

const PAGE = 1000

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  // 화면만 막으면 API 로 뚫린다 — 비공개 리그는 데이터 계층에서 재확인한다.
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }

  const supabase = createClient()
  const byDate = new Map<string, DateSummary>()

  let page = 0
  for (;;) {
    const { data, error } = await supabase
      .from('league_games')
      // 필요한 4개 컬럼만. 팀 조인은 집계에 쓰이지 않는다.
      .select('date, is_started, is_complete, youtube_url, quarter_id')
      .eq('league_id', leagueId)
      // ⚠ ORDER BY 없이 range 를 쓰면 페이지 경계에서 행이 중복·누락된다.
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1)

    // 조용히 빈 결과로 삼키지 않는다 — 화면은 멀쩡한데 숫자만 틀린 사고가 이 코드베이스에서 반복됐다.
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = (data ?? []) as Array<{ date: string; is_started: boolean | null; is_complete: boolean | null; youtube_url: string | null; quarter_id: string | null }>
    for (const g of rows) {
      let s = byDate.get(g.date)
      if (!s) { s = { date: g.date, total: 0, started: 0, complete: 0, yt: 0, quarter_id: null }; byDate.set(g.date, s) }
      s.total++
      if (g.is_started) s.started++
      if (g.is_complete) s.complete++
      if (g.youtube_url) s.yt++
      // 한 날짜의 경기는 같은 분기다. 처음 만난 값을 쓰고, 빈 값에 덮어쓰지 않는다.
      if (!s.quarter_id && g.quarter_id) s.quarter_id = g.quarter_id
    }

    if (rows.length < PAGE) break
    page++
  }

  // 날짜 오름차순 — 호출부가 다시 정렬하지 않아도 되게 여기서 확정한다.
  const summaries = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  return NextResponse.json(summaries)
}
