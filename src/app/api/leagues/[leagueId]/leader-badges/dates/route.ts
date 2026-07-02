// 특정 선수가 특정 카테고리에서 리더였던 날짜 목록
//
// leader-badges 는 카운트만 반환하므로, 클릭 시 실제 날짜 목록을 별도로 조회.
//
// GET /api/leagues/[id]/leader-badges/dates?playerId=X&category=pts
//   → { dates: string[] }   // YYYY-MM-DD, 최신순
//
// 6개 카테고리:
//   pts    — 득점 (points 합)
//   reb    — 리바운드 (type='rebound')
//   ast    — 어시스트 (made shot 의 assister)
//   blk    — 블락 (type='block')
//   stl    — 스틸 (type='steal')
//   tp     — 3점 (shot_3p 성공)
//
// 규칙:
//   - is_started=true 게임만 대상
//   - 하루에 여러 게임이 있으면 그날 총합 기준으로 리더 결정
//   - 동점 시 모두 리더 인정 (사용자 playerId 가 tied 리더면 포함)
//   - 값이 0인 부문은 리더 없음

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'

const FIELD_SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive']
type Category = 'pts' | 'reb' | 'ast' | 'blk' | 'stl' | 'tp'
const VALID_CATS: Category[] = ['pts', 'reb', 'ast', 'blk', 'stl', 'tp']

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const sp = new URL(req.url).searchParams
  const playerId = sp.get('playerId')
  const category = sp.get('category') as Category | null

  if (!playerId) return NextResponse.json({ error: 'playerId 필수' }, { status: 400 })
  if (!category || !VALID_CATS.includes(category)) return NextResponse.json({ error: 'category 유효하지 않음' }, { status: 400 })

  const supabase = createClient()

  // 1) 시작된 게임 (id, date)
  const { data: games } = await supabase
    .from('league_games')
    .select('id, date')
    .eq('league_id', leagueId)
    .eq('is_started', true)
    .limit(200000)
  const gameRows = (games ?? []) as { id: string; date: string }[]
  if (gameRows.length === 0) return NextResponse.json({ dates: [] })

  const gameDateMap = new Map<string, string>()
  for (const g of gameRows) gameDateMap.set(g.id, g.date)
  const gameIds = gameRows.map(g => g.id)

  // 2) 이벤트 페이지네이션 조회
  const PAGE = 1000
  const evs: {
    league_game_id: string
    league_player_id: string | null
    related_player_id: string | null
    type: string
    result: string | null
    points: number | null
  }[] = []
  for (let p = 0; ; p++) {
    const { data: chunk } = await supabase
      .from('league_game_events')
      .select('league_game_id, league_player_id, related_player_id, type, result, points')
      .in('league_game_id', gameIds)
      .order('id', { ascending: true })
      .range(p * PAGE, (p + 1) * PAGE - 1)
    if (!chunk || chunk.length === 0) break
    evs.push(...(chunk as typeof evs))
    if (chunk.length < PAGE) break
  }

  // 3) date × playerId → 해당 카테고리 값만 누적
  const byDate = new Map<string, Map<string, number>>()
  function bump(date: string, pid: string, delta: number) {
    let day = byDate.get(date)
    if (!day) { day = new Map(); byDate.set(date, day) }
    day.set(pid, (day.get(pid) ?? 0) + delta)
  }

  for (const e of evs) {
    const date = gameDateMap.get(e.league_game_id)
    if (!date) continue
    const pid = e.league_player_id
    if (!pid && category !== 'ast') continue

    switch (category) {
      case 'pts':
        if (pid && typeof e.points === 'number' && e.points > 0) bump(date, pid, e.points)
        break
      case 'tp':
        if (pid && e.type === 'shot_3p' && e.result === 'made') bump(date, pid, 1)
        break
      case 'reb':
        if (pid && e.type === 'rebound') bump(date, pid, 1)
        break
      case 'blk':
        if (pid && e.type === 'block') bump(date, pid, 1)
        break
      case 'stl':
        if (pid && e.type === 'steal') bump(date, pid, 1)
        break
      case 'ast':
        // made field shot 의 related_player_id 가 assister
        if (FIELD_SHOT_TYPES.includes(e.type) && e.result === 'made' && e.related_player_id) {
          bump(date, e.related_player_id, 1)
        }
        break
    }
  }

  // 4) 각 날짜에서 리더 결정 → playerId 가 리더인 날짜만 수집
  const leaderDates: string[] = []
  for (const [date, day] of byDate) {
    let maxVal = 0
    for (const [, v] of day) {
      if (v > maxVal) maxVal = v
    }
    if (maxVal === 0) continue
    const myVal = day.get(playerId) ?? 0
    if (myVal === maxVal) leaderDates.push(date)
  }

  leaderDates.sort((a, b) => b.localeCompare(a))  // 최신순

  return NextResponse.json({ dates: leaderDates })
}
