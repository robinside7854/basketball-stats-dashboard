// 경기일별 부문 리더 카운트 (POTM 뱃지)
//
// 각 경기 날짜(YYYY-MM-DD) 별로 다음 6개 부문의 1등 선수(들)를 결정하고,
// 시즌 전체에 걸쳐 각 선수가 각 부문 1등에 몇 번 등극했는지 카운트.
//
// 6개 부문:
//   pts    — 득점 (이벤트 points 합)
//   reb    — 리바운드 (type='rebound')
//   ast    — 어시스트 (made shot 의 related_player_id — assister)
//   blk    — 블락 (type='block')
//   stl    — 스틸 (type='steal')
//   tp     — 3점 (type='shot_3p' AND result='made')
//
// 규칙:
//   - is_started=true 게임만 대상
//   - 하루에 여러 게임이 있어도 그날 총합 기준으로 리더 결정
//   - 동점 시 모두 카운트 (POTM 은 아니지만 리더는 여러 명 인정)
//   - 값이 0인 부문은 리더 없음 (아무도 카운트 안 함)
//
// GET /api/leagues/[id]/leader-badges
//   → Record<playerId, { pts, reb, ast, blk, stl, tp }>
//
// GET /api/leagues/[id]/leader-badges?playerId=X
//   → 동일 응답이지만 결과 크기 줄이려고 클라가 필터 (백엔드는 전체 순회)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'

const FIELD_SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive']

type LeaderBadgeCounts = { pts: number; reb: number; ast: number; blk: number; stl: number; tp: number }

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const supabase = createClient()

  // 1) 시작된 게임 (id, date)
  const { data: games } = await supabase
    .from('league_games')
    .select('id, date')
    .eq('league_id', leagueId)
    .eq('is_started', true)
    .limit(200000)
  const gameRows = (games ?? []) as { id: string; date: string }[]
  if (gameRows.length === 0) return NextResponse.json({})

  const gameDateMap = new Map<string, string>()
  for (const g of gameRows) gameDateMap.set(g.id, g.date)
  const gameIds = gameRows.map(g => g.id)

  // 2) 이 게임들의 모든 이벤트 (필요한 필드만)
  const { data: events } = await supabase
    .from('league_game_events')
    .select('league_game_id, league_player_id, related_player_id, type, result, points')
    .in('league_game_id', gameIds)
    .limit(200000)
  const evs = (events ?? []) as {
    league_game_id: string
    league_player_id: string | null
    related_player_id: string | null
    type: string
    result: string | null
    points: number | null
  }[]

  // 3) date × playerId → 스탯 누적
  type DayStats = Map<string, { pts: number; reb: number; ast: number; blk: number; stl: number; tp: number }>
  const byDate = new Map<string, DayStats>()

  function ensureDay(date: string): DayStats {
    let d = byDate.get(date)
    if (!d) { d = new Map(); byDate.set(date, d) }
    return d
  }
  function ensurePlayer(day: DayStats, pid: string) {
    let s = day.get(pid)
    if (!s) { s = { pts: 0, reb: 0, ast: 0, blk: 0, stl: 0, tp: 0 }; day.set(pid, s) }
    return s
  }

  for (const e of evs) {
    const date = gameDateMap.get(e.league_game_id)
    if (!date) continue
    const day = ensureDay(date)

    const pid = e.league_player_id
    if (!pid) continue

    // 득점
    if (typeof e.points === 'number' && e.points > 0) {
      ensurePlayer(day, pid).pts += e.points
    }

    // 3점
    if (e.type === 'shot_3p' && e.result === 'made') {
      ensurePlayer(day, pid).tp += 1
    }

    // 리바운드
    if (e.type === 'rebound') {
      ensurePlayer(day, pid).reb += 1
    }

    // 블락
    if (e.type === 'block') {
      ensurePlayer(day, pid).blk += 1
    }

    // 스틸
    if (e.type === 'steal') {
      ensurePlayer(day, pid).stl += 1
    }

    // 어시스트 — made field shot 의 related_player_id 가 assister
    if (
      FIELD_SHOT_TYPES.includes(e.type)
      && e.result === 'made'
      && e.related_player_id
    ) {
      ensurePlayer(day, e.related_player_id).ast += 1
    }
  }

  // 4) 각 날짜의 부문별 리더 결정 → 선수별 카운트 누적
  const badgeCounts = new Map<string, LeaderBadgeCounts>()
  const categories: (keyof LeaderBadgeCounts)[] = ['pts', 'reb', 'ast', 'blk', 'stl', 'tp']

  for (const [, day] of byDate) {
    for (const cat of categories) {
      let maxVal = 0
      for (const [, s] of day) {
        if (s[cat] > maxVal) maxVal = s[cat]
      }
      if (maxVal === 0) continue
      for (const [pid, s] of day) {
        if (s[cat] === maxVal) {
          let bc = badgeCounts.get(pid)
          if (!bc) {
            bc = { pts: 0, reb: 0, ast: 0, blk: 0, stl: 0, tp: 0 }
            badgeCounts.set(pid, bc)
          }
          bc[cat] += 1
        }
      }
    }
  }

  // 5) 응답
  const result: Record<string, LeaderBadgeCounts> = {}
  for (const [pid, bc] of badgeCounts) result[pid] = bc
  return NextResponse.json(result)
}
