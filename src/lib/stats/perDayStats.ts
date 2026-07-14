/**
 * 경기일(round) 단위 · 선수별 스탯 집계 유틸.
 * Streak/Milestone API 가 공유 사용.
 *
 * 룰:
 *   - is_started=true 게임만 대상 (친선전 포함하되 W/L 계산은 제외)
 *   - 하루(YYYY-MM-DD)에 여러 게임/슬롯이 있어도 그날 통합 스탯으로 취급
 *   - 어시스트: 성공한 야투의 related_player_id
 *   - team_id 이벤트 다수결로 그날 선수의 소속팀 결정 (W/L 판정용)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface PerDayStats {
  pts: number
  reb: number; oreb: number; dreb: number
  ast: number; stl: number; blk: number; tov: number
  fgm: number; fga: number
  fg3m: number; fg3a: number
  ftm: number; fta: number
  and_one: number
}

export interface PerDayWL {
  wins: number
  losses: number
}

export interface PerDayResult {
  /** playerId → Map<date, per-day 스탯> */
  dayStats: Map<string, Map<string, PerDayStats>>
  /** playerId → Map<date, {wins, losses}> — 친선전 제외 */
  dayWL: Map<string, Map<string, PerDayWL>>
  /** 모든 선수의 전체 참여 날짜 (sorted asc) */
  allDates: string[]
}

const emptyStats = (): PerDayStats => ({
  pts: 0, reb: 0, oreb: 0, dreb: 0,
  ast: 0, stl: 0, blk: 0, tov: 0,
  fgm: 0, fga: 0, fg3m: 0, fg3a: 0,
  ftm: 0, fta: 0, and_one: 0,
})

const FIELD_SHOTS = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post']

/**
 * 리그 전체 경기의 선수별 경기일 스탯을 집계.
 * quarterId 를 넘기면 그 분기만.
 */
export async function computePerDayStats(
  supabase: SupabaseClient,
  leagueId: string,
  opts: { quarterId?: string | null } = {},
): Promise<PerDayResult> {
  // 1) 게임 목록 (id, date, home/away team, 스코어, exhibition 여부)
  let gQuery = supabase
    .from('league_games')
    .select('id, date, home_team_id, away_team_id, home_score, away_score, is_exhibition, plus_one_player_id')
    .eq('league_id', leagueId)
    .eq('is_started', true)
  if (opts.quarterId) gQuery = gQuery.eq('quarter_id', opts.quarterId)

  const { data: games } = await gQuery
  const gameRows = (games ?? []) as Array<{
    id: string; date: string
    home_team_id: string | null; away_team_id: string | null
    home_score: number; away_score: number
    is_exhibition: boolean | null
    plus_one_player_id: string | null
  }>
  if (gameRows.length === 0) {
    return { dayStats: new Map(), dayWL: new Map(), allDates: [] }
  }

  const gameById = new Map(gameRows.map(g => [g.id, g]))
  const gameIds = gameRows.map(g => g.id)

  // 2) 이벤트 페이지네이션 조회
  const PAGE = 1000
  type EvRow = {
    league_game_id: string
    league_player_id: string | null
    related_player_id: string | null
    team_id: string | null
    type: string
    result: string | null
    points: number | null
  }
  const events: EvRow[] = []
  for (let p = 0; ; p++) {
    const { data: chunk } = await supabase
      .from('league_game_events')
      .select('league_game_id, league_player_id, related_player_id, team_id, type, result, points')
      .in('league_game_id', gameIds)
      .order('id', { ascending: true })
      .range(p * PAGE, (p + 1) * PAGE - 1)
    if (!chunk || chunk.length === 0) break
    events.push(...(chunk as EvRow[]))
    if (chunk.length < PAGE) break
  }

  // 3) 이벤트 → (player, date) 별 스탯 누적 + 팀 결정용 카운트
  const dayStats = new Map<string, Map<string, PerDayStats>>()
  // playerId × date → teamId → count (다수결로 그날 선수의 소속팀 결정)
  const teamCountByPlayerDay = new Map<string, Map<string, Map<string, number>>>()

  const ensurePlayerDay = (pid: string, date: string): PerDayStats => {
    let byDate = dayStats.get(pid)
    if (!byDate) { byDate = new Map(); dayStats.set(pid, byDate) }
    let s = byDate.get(date)
    if (!s) { s = emptyStats(); byDate.set(date, s) }
    return s
  }
  const bumpTeamCount = (pid: string, date: string, tid: string) => {
    let byDate = teamCountByPlayerDay.get(pid)
    if (!byDate) { byDate = new Map(); teamCountByPlayerDay.set(pid, byDate) }
    let byTeam = byDate.get(date)
    if (!byTeam) { byTeam = new Map(); byDate.set(date, byTeam) }
    byTeam.set(tid, (byTeam.get(tid) ?? 0) + 1)
  }

  for (const e of events) {
    const g = gameById.get(e.league_game_id)
    if (!g) continue
    const date = g.date
    const pid = e.league_player_id
    // 슛/카운팅 스탯
    if (pid) {
      const s = ensurePlayerDay(pid, date)
      const made = e.result === 'made'
      // plus_one 감안한 득점 계산은 세부 룰이 있어 이 유틸은 points 컬럼 그대로 사용
      // (points 필드가 없으면 아래 switch 로 fallback)
      const pts = e.points ?? null

      switch (e.type) {
        case 'shot_3p':
          s.fg3a++; s.fga++
          if (made) { s.fg3m++; s.fgm++; s.pts += pts ?? 3 }
          break
        case 'shot_post':
        case 'shot_layup':
        case 'shot_2p_mid':
          s.fga++
          if (made) { s.fgm++; s.pts += pts ?? 2 }
          break
        case 'and_one':
          if (made) { s.pts += 1; s.and_one++ }
          break
        case 'ft_2pt':
          s.fta++; if (made) { s.ftm++; s.pts += 2 }; break
        case 'ft_3pt_1':
          s.fta++; if (made) { s.ftm++; s.pts += 2 }; break
        case 'free_throw':
        case 'ft_3pt_2':
          s.fta++; if (made) { s.ftm++; s.pts += 1 }; break
        case 'oreb': s.oreb++; s.reb++; break
        case 'dreb': s.dreb++; s.reb++; break
        case 'steal': s.stl++; break
        case 'block': s.blk++; break
        case 'turnover': s.tov++; break
      }

      // 어시스트 (assister 는 related_player_id)
      if (made && FIELD_SHOTS.includes(e.type) && e.related_player_id) {
        const as = ensurePlayerDay(e.related_player_id, date)
        as.ast++
        if (e.team_id) bumpTeamCount(e.related_player_id, date, e.team_id)
      }

      // team 다수결
      if (e.team_id && e.type !== 'sub_in' && e.type !== 'sub_out') {
        bumpTeamCount(pid, date, e.team_id)
      }
    }
  }

  // 4) 선수 × 날짜 → 승/패 판정
  //   그 날짜의 게임 중 본인이 뛴 게임을 찾고, 팀 다수결로 판정된 소속팀 기준 W/L 카운트
  const dayWL = new Map<string, Map<string, PerDayWL>>()
  for (const [pid, byDate] of teamCountByPlayerDay) {
    for (const [date, teamCounts] of byDate) {
      const topEntry = [...teamCounts.entries()].sort((a, b) => b[1] - a[1])[0]
      if (!topEntry) continue
      const myTeamId = topEntry[0]
      let wins = 0, losses = 0
      for (const g of gameRows) {
        if (g.date !== date) continue
        if (g.is_exhibition) continue
        if (g.home_team_id !== myTeamId && g.away_team_id !== myTeamId) continue
        const isHome = g.home_team_id === myTeamId
        const my = isHome ? g.home_score : g.away_score
        const opp = isHome ? g.away_score : g.home_score
        if (my > opp) wins++
        else if (my < opp) losses++
      }
      if (wins > 0 || losses > 0) {
        let m = dayWL.get(pid)
        if (!m) { m = new Map(); dayWL.set(pid, m) }
        m.set(date, { wins, losses })
      }
    }
  }

  // 5) 전체 날짜 리스트 (asc)
  const allDatesSet = new Set<string>()
  for (const g of gameRows) allDatesSet.add(g.date)
  const allDates = [...allDatesSet].sort()

  return { dayStats, dayWL, allDates }
}

/** 더블더블: pts, reb, ast 중 2개 이상이 10+ (아마추어 리그는 stl/blk 제외 – 단축 게임이라 도달 희소) */
export function isDoubleDouble(s: PerDayStats): boolean {
  const tens = [s.pts, s.reb, s.ast].filter(v => v >= 10)
  return tens.length >= 2
}

/** 선수 메타 조회 (name, number) — Streak/Milestone 응답 조인용 */
export async function fetchPlayerMeta(
  supabase: SupabaseClient,
  leagueId: string,
): Promise<Record<string, { name: string; number: number | null }>> {
  const { data } = await supabase
    .from('league_players')
    .select('id, name, number')
    .eq('league_id', leagueId)
  const map: Record<string, { name: string; number: number | null }> = {}
  for (const p of (data ?? []) as { id: string; name: string; number: number | null }[]) {
    map[p.id] = { name: p.name, number: p.number }
  }
  return map
}
