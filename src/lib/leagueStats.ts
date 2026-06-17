// 리그 분기 스탯 집계 (서버 전용) — 드래프트 자동픽/추천에 사용
// stats API(route)의 핵심 이벤트 집계 로직을 함수로 제공한다.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface PlayerAgg {
  player_id: string
  gp: number
  pts: number
  fgm: number; fga: number
  fg3m: number; fg3a: number
  ftm: number; fta: number
  oreb: number; dreb: number; reb: number
  ast: number; stl: number; blk: number; tov: number; pf: number
}

interface EventRow {
  league_player_id: string | null
  related_player_id: string | null
  team_id: string | null
  type: string
  result: string | null
  points: number | null
  league_game_id: string
}

/** 분기별 선수 누적 스탯 (gp = 출전 경기 수). league_game_events 기반. */
export async function aggregateQuarterStats(
  supabase: SupabaseClient,
  leagueId: string,
  quarterId: string,
): Promise<Record<string, PlayerAgg>> {
  const { data: leaguePlayers } = await supabase
    .from('league_players')
    .select('id, plus_one')
    .eq('league_id', leagueId)
  const plusOneSet = new Set((leaguePlayers ?? []).filter(p => p.plus_one).map(p => p.id))

  const { data: games } = await supabase
    .from('league_games')
    .select('id, plus_one_player_id, date')
    .eq('league_id', leagueId)
    .eq('quarter_id', quarterId)
    .eq('is_started', true)
  const gameIds = (games ?? []).map(g => g.id)
  if (gameIds.length === 0) return {}
  const gamePlusOneMap: Record<string, string | null> = {}
  const gameToDate: Record<string, string> = {}
  for (const g of games ?? []) {
    const gg = g as { id: string; plus_one_player_id: string | null; date: string | null }
    gamePlusOneMap[gg.id] = gg.plus_one_player_id ?? null
    gameToDate[gg.id] = gg.date ?? gg.id
  }

  const events: EventRow[] = []
  const PAGE = 1000
  let page = 0
  while (true) {
    const { data: chunk } = await supabase
      .from('league_game_events')
      .select('league_player_id, related_player_id, team_id, type, result, points, league_game_id')
      .in('league_game_id', gameIds)
      .not('league_player_id', 'is', null)
      .order('id', { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (chunk && chunk.length > 0) events.push(...(chunk as EventRow[]))
    if (!chunk || chunk.length < PAGE) break
    page++
  }

  const statsMap: Record<string, PlayerAgg> = {}
  const gpMap: Record<string, Set<string>> = {}
  const ensure = (pid: string): PlayerAgg => {
    if (!statsMap[pid]) statsMap[pid] = { player_id: pid, gp: 0, pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 }
    return statsMap[pid]
  }

  for (const e of events) {
    if (!e.league_player_id) continue
    const pid = e.league_player_id
    const s = ensure(pid)
    const gId = e.league_game_id
    if (e.type !== 'sub_in' && e.type !== 'sub_out') {
      if (!gpMap[pid]) gpMap[pid] = new Set()
      gpMap[pid].add(gameToDate[gId] ?? gId)  // 날짜 기준 (날짜 평균)
    }
    const made = e.result === 'made'
    const override = gamePlusOneMap[gId]
    const isPlusOne = override !== null ? pid === override : plusOneSet.has(pid)
    switch (e.type) {
      case 'shot_3p': s.fg3a++; s.fga++; if (made) { s.fg3m++; s.fgm++; s.pts += isPlusOne ? 4 : 3 } break
      case 'shot_post': s.fga++; if (made) { s.fgm++; s.pts += isPlusOne ? 3 : 2 } break
      case 'shot_layup': case 'shot_2p_drive': s.fga++; if (made) { s.fgm++; s.pts += isPlusOne ? 3 : 2 } break
      case 'shot_2p_mid': s.fga++; if (made) { s.fgm++; s.pts += isPlusOne ? 3 : 2 } break
      case 'and_one': if (made) s.pts += 1; break
      case 'ft_2pt': s.fta++; if (made) { s.ftm++; s.pts += 2 } break
      case 'ft_3pt_1': s.fta++; if (made) { s.ftm++; s.pts += 2 } break
      case 'free_throw': case 'ft_3pt_2': s.fta++; if (made) { s.ftm++; s.pts += 1 } break
      case 'oreb': s.oreb++; s.reb++; break
      case 'dreb': s.dreb++; s.reb++; break
      case 'steal': s.stl++; break
      case 'block': s.blk++; break
      case 'turnover': s.tov++; break
      case 'foul': s.pf++; break
    }
    if (made && ['shot_3p','shot_2p_mid','shot_layup','shot_post','shot_2p_drive'].includes(e.type) && e.related_player_id) {
      const as = ensure(e.related_player_id)
      as.ast++
      if (!gpMap[e.related_player_id]) gpMap[e.related_player_id] = new Set()
      gpMap[e.related_player_id].add(gameToDate[gId] ?? gId)
    }
  }
  for (const pid of Object.keys(statsMap)) statsMap[pid].gp = gpMap[pid]?.size ?? 0
  return statsMap
}

/** 종합 점수 (경기당) — 드래프트 자동픽/추천 일관 기준. 클라이언트와 동일 공식. */
export function overallScorePerGame(v: { ppg: number; rpg: number; apg: number; spg: number; bpg: number; topg: number }): number {
  return v.ppg + v.rpg * 1.2 + v.apg * 1.5 + v.spg * 2 + v.bpg * 2 - v.topg
}

/** 누적 → 경기당 + 종합 점수 */
export function aggToScore(a: PlayerAgg): number {
  if (a.gp <= 0) return 0
  return overallScorePerGame({
    ppg: a.pts / a.gp, rpg: a.reb / a.gp, apg: a.ast / a.gp,
    spg: a.stl / a.gp, bpg: a.blk / a.gp, topg: a.tov / a.gp,
  })
}

/** 이전 분기 id (year, quarter 정렬 기준 직전). 없으면 null. */
export async function getPreviousQuarterId(
  supabase: SupabaseClient,
  leagueId: string,
  quarterId: string,
): Promise<string | null> {
  const { data: quarters } = await supabase
    .from('league_quarters')
    .select('id, year, quarter')
    .eq('league_id', leagueId)
    .order('year', { ascending: true })
    .order('quarter', { ascending: true })
  const ordered = (quarters ?? []) as { id: string; year: number; quarter: number }[]
  const idx = ordered.findIndex(q => q.id === quarterId)
  return idx > 0 ? ordered[idx - 1].id : null
}
