/**
 * 리그 선수 종합 스탯 계산 유틸.
 *
 * 배경:
 *   기존 `/api/leagues/[leagueId]/stats` route 의 계산 로직을 서버 컴포넌트에서도
 *   직접 호출할 수 있도록 helper 로 추출. (B1: 홈 SSR 프리페치용)
 *
 * 룰:
 *   - `is_started=true` 게임만 대상 (마감 안 된 경기도 포함)
 *   - `unit='round'` 는 하루(YYYY-MM-DD) 단위 gp 카운트, `unit='game'` 은 game id 단위
 *   - Supabase 서버 max-rows(1000) 제한을 피해 이벤트 페이지네이션
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/admin'
import type { PlayerStat } from '@/types/league'
import { scorePoints, fetchScoringRules, type ScoringRules } from './scoring'
import { fetchExternalTeamIds } from '@/lib/league/externalPlayers'

export type LeagueStatsUnit = 'round' | 'game'

export interface LeagueStatsOpts {
  quarterId?: string | null
  /** 정체성 그룹 스탯 집계용 다중 분기 필터 */
  quarterIds?: string[] | null
  teamId?: string | null
  playerId?: string | null
  from?: string | null
  to?: string | null
  unit?: LeagueStatsUnit
}

export interface LeagueStatsResult {
  players: PlayerStat[]
  games_count?: number
  /** 해당 기간(필터 적용 후)에 실제로 열린 라운드(경기일) 수 — 최소 출전 자격 계산의 분모 */
  total_rounds?: number
  unit?: LeagueStatsUnit
}

/**
 * 리그 전체(또는 필터된) 선수 종합 스탯 계산.
 *
 * @param supabase supabase 클라이언트 (미지정 시 admin 클라이언트 자동 생성)
 * @param leagueId 리그 ID
 * @param opts 필터/단위 옵션
 */
export async function computeLeagueStats(
  supabase: SupabaseClient | null,
  leagueId: string,
  opts: LeagueStatsOpts = {},
): Promise<LeagueStatsResult> {
  const sb = supabase ?? createClient()
  const {
    quarterId = null,
    quarterIds = null,
    teamId = null,
    playerId = null,
    from = null,
    to = null,
    unit = 'round',
  } = opts

  // 1) 선수 메타 + plus_one 플래그
  const { data: allLeaguePlayers } = await sb
    .from('league_players')
    .select('id, name, number, position, plus_one, photo_url')
    .eq('league_id', leagueId)

  const plusOneSet = new Set((allLeaguePlayers ?? []).filter(p => p.plus_one).map(p => p.id))
  const metaMap = Object.fromEntries((allLeaguePlayers ?? []).map(p => [p.id, p]))

  // 채점 룰 — 동호회마다 다르다(미라클은 plus_one +1, 자유투 ft_2pt 2점).
  // 이벤트 루프 밖에서 한 번만 읽는다.
  const scoringRules: ScoringRules = await fetchScoringRules(sb, leagueId)

  // 외부(상대) 팀 이벤트는 우리 팀 통계가 아니다. 이벤트가 team_id 를 직접 들고 있으므로
  // 선수 단위가 아니라 이벤트 단위로 거른다 — 같은 선수가 다른 경기에서 우리 팀으로
  // 뛰는 경우까지 정확히 처리된다.
  const externalTeamIds = await fetchExternalTeamIds(sb, leagueId)

  // 2) 대상 게임 ID 추출
  let gQuery = sb
    .from('league_games')
    .select('id, plus_one_player_id, date, round_num')
    .eq('league_id', leagueId)
    .eq('is_started', true)

  if (quarterId) gQuery = gQuery.eq('quarter_id', quarterId)
  else if (quarterIds && quarterIds.length > 0) gQuery = gQuery.in('quarter_id', quarterIds)
  if (from) gQuery = gQuery.gte('date', from)
  if (to)   gQuery = gQuery.lte('date', to)

  const { data: games, error: gErr } = await gQuery
  if (gErr) throw new Error(gErr.message)

  const gameIds = (games ?? []).map(g => g.id)
  if (gameIds.length === 0) return { players: [], total_rounds: 0 }

  const gamePlusOneMap: Record<string, string | null> = {}
  const gameToDate: Record<string, string> = {}
  for (const g of (games ?? [])) {
    gamePlusOneMap[g.id] = (g as Record<string, unknown>).plus_one_player_id as string | null ?? null
    gameToDate[g.id] = (g as Record<string, unknown>).date as string ?? g.id
  }
  // 기간 내 열린 라운드 수 = 경기일(date) 유니크 카운트.
  // 최소 출전 자격을 "리그 최다 출전자 대비"가 아니라 "실제 열린 라운드 대비"로 계산하기 위함.
  const totalRounds = new Set(Object.values(gameToDate)).size

  // 3) 이벤트 페이지네이션
  type EventRow = {
    league_player_id: string | null
    related_player_id: string | null
    team_id: string | null
    type: string
    result: string | null
    points: number | null
    league_game_id: string
  }
  const events: EventRow[] = []
  const PAGE = 1000
  let page = 0
  while (true) {
    let q = sb
      .from('league_game_events')
      .select('league_player_id, related_player_id, team_id, type, result, points, league_game_id')
      .in('league_game_id', gameIds)
      .not('league_player_id', 'is', null)
      // ⚠ ORDER BY 없으면 페이지네이션 중복/누락 발생
      .order('id', { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (teamId)   q = q.eq('team_id', teamId)
    if (playerId) q = q.eq('league_player_id', playerId)
    const { data: chunk, error: eErr } = await q
    if (eErr) throw new Error(eErr.message)
    if (chunk && chunk.length > 0) events.push(...(chunk as EventRow[]))
    if (!chunk || chunk.length < PAGE) break
    page++
  }

  // 4) 선수별 집계
  type PlayerStats = {
    player_id: string
    gp: number
    pts: number
    fgm: number; fga: number
    fg3m: number; fg3a: number
    ftm: number;  fta: number
    oreb: number; dreb: number; reb: number
    ast: number; stl: number; blk: number
    tov: number; pf: number
    and_one: number
    ds_a: number; ds_m: number
    lu_a: number; lu_m: number
    md_a: number; md_m: number
    team_reb_in_games: number
    team_poss_in_games: number
    minutes_played: number
    // PIE 재료 · 본인 numerator (PTS+FGM+FTM−FGA−FTA+DREB+ORB/2+AST+STL+BLK/2−PF−TO)
    // 분모는 게임 총합에서 별도 산출 → pie_denom
    pie_num: number
    pie_denom: number
  }

  const statsMap: Record<string, PlayerStats> = {}
  const gpMap: Record<string, Set<string>> = {}
  const teamRebByGame: Record<string, Record<string, number>> = {}
  const teamPossByGame: Record<string, Record<string, { fga: number; fta: number; tov: number }>> = {}
  const playerTeamGameCount: Record<string, Record<string, Record<string, number>>> = {}
  // 게임별 리그 전체 이벤트 합계 (PIE 분모 재료) · 양팀 통합
  type GameTot = {
    pts: number; fgm: number; ftm: number; fga: number; fta: number
    dreb: number; oreb: number; ast: number; stl: number; blk: number
    pf: number; tov: number
  }
  const gameTotals: Record<string, GameTot> = {}
  const ensureGameTot = (gid: string): GameTot => {
    if (!gameTotals[gid]) {
      gameTotals[gid] = { pts: 0, fgm: 0, ftm: 0, fga: 0, fta: 0, dreb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, pf: 0, tov: 0 }
    }
    return gameTotals[gid]
  }

  const ensure = (pid: string): PlayerStats => {
    if (!statsMap[pid]) {
      statsMap[pid] = {
        player_id: pid, gp: 0,
        pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
        oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
        and_one: 0,
        ds_a: 0, ds_m: 0, lu_a: 0, lu_m: 0, md_a: 0, md_m: 0,
        team_reb_in_games: 0,
        team_poss_in_games: 0,
        minutes_played: 0,
        pie_num: 0,
        pie_denom: 0,
      }
    }
    return statsMap[pid]
  }
  const ensureTeamPoss = (tid: string, gid: string) => {
    if (!teamPossByGame[tid]) teamPossByGame[tid] = {}
    if (!teamPossByGame[tid][gid]) teamPossByGame[tid][gid] = { fga: 0, fta: 0, tov: 0 }
    return teamPossByGame[tid][gid]
  }

  for (const e of events ?? []) {
    if (!e.league_player_id) continue
    if (e.team_id && externalTeamIds.has(e.team_id)) continue
    const pid = e.league_player_id
    const s = ensure(pid)
    const gId = e.league_game_id

    if (e.type !== 'sub_in' && e.type !== 'sub_out') {
      if (!gpMap[pid]) gpMap[pid] = new Set()
      gpMap[pid].add(unit === 'round' ? (gameToDate[gId] ?? gId) : gId)
    }

    if (e.team_id && e.type !== 'sub_in' && e.type !== 'sub_out') {
      if (!playerTeamGameCount[pid]) playerTeamGameCount[pid] = {}
      if (!playerTeamGameCount[pid][gId]) playerTeamGameCount[pid][gId] = {}
      playerTeamGameCount[pid][gId][e.team_id] = (playerTeamGameCount[pid][gId][e.team_id] ?? 0) + 1
    }

    const made = e.result === 'made'
    const gamePlusOneOverride = gamePlusOneMap[e.league_game_id]
    const isPlusOne = gamePlusOneOverride !== null
      ? pid === gamePlusOneOverride
      : plusOneSet.has(pid)

    const pts = scorePoints(e.type, e.result, isPlusOne, scoringRules)
    switch (e.type) {
      case 'shot_3p':
        s.fg3a++; s.fga++
        if (made) { s.fg3m++; s.fgm++; s.pts += pts }
        break
      case 'shot_post':
        s.fga++; s.ds_a++
        if (made) { s.fgm++; s.ds_m++; s.pts += pts }
        break
      case 'shot_layup':
        s.fga++; s.lu_a++
        if (made) { s.fgm++; s.lu_m++; s.pts += pts }
        break
      case 'shot_2p_mid':
        s.fga++; s.md_a++
        if (made) { s.fgm++; s.md_m++; s.pts += pts }
        break
      case 'and_one':
        if (made) { s.pts += pts; s.and_one++ }
        break
      case 'ft_2pt':
        s.fta++; if (made) { s.ftm++; s.pts += pts }; break
      case 'ft_3pt_1':
        s.fta++; if (made) { s.ftm++; s.pts += pts }; break
      case 'free_throw': case 'ft_3pt_2':
        s.fta++; if (made) { s.ftm++; s.pts += pts }; break
      case 'oreb': s.oreb++; s.reb++; break
      case 'dreb': s.dreb++; s.reb++; break
      case 'steal': s.stl++; break
      case 'block': s.blk++; break
      case 'turnover': s.tov++; break
      case 'foul': s.pf++; break
    }

    // 게임 총합(양팀 통합) 누적 · PIE 분모 재료
    // 같은 룰: 슛 attempt/made · pts 는 위 switch 와 정확히 일치하게 반영
    {
      const g = ensureGameTot(gId)
      switch (e.type) {
        case 'shot_3p':
          g.fga++
          if (made) { g.fgm++; g.pts += pts }
          break
        case 'shot_post':
        case 'shot_layup':
        case 'shot_2p_mid':
          g.fga++
          if (made) { g.fgm++; g.pts += pts }
          break
        case 'and_one':
          if (made) g.pts += pts
          break
        case 'ft_2pt':
        case 'ft_3pt_1':
          g.fta++; if (made) { g.ftm++; g.pts += pts }; break
        case 'free_throw':
        case 'ft_3pt_2':
          g.fta++; if (made) { g.ftm++; g.pts += pts }; break
        case 'oreb': g.oreb++; break
        case 'dreb': g.dreb++; break
        case 'steal': g.stl++; break
        case 'block': g.blk++; break
        case 'turnover': g.tov++; break
        case 'foul': g.pf++; break
      }
    }

    if ((e.type === 'oreb' || e.type === 'dreb') && e.team_id) {
      if (!teamRebByGame[e.team_id]) teamRebByGame[e.team_id] = {}
      teamRebByGame[e.team_id][gId] = (teamRebByGame[e.team_id][gId] ?? 0) + 1
    }

    if (e.team_id) {
      const tp = ensureTeamPoss(e.team_id, gId)
      if (['shot_3p', 'shot_post', 'shot_layup', 'shot_2p_mid'].includes(e.type)) tp.fga++
      else if (['ft_2pt', 'ft_3pt_1', 'free_throw', 'ft_3pt_2'].includes(e.type)) tp.fta++
      else if (e.type === 'turnover') tp.tov++
    }

    if (made &&
        ['shot_3p','shot_2p_mid','shot_layup','shot_post'].includes(e.type) &&
        e.related_player_id) {
      const as = ensure(e.related_player_id)
      as.ast++
      if (!gpMap[e.related_player_id]) gpMap[e.related_player_id] = new Set()
      gpMap[e.related_player_id].add(unit === 'round' ? (gameToDate[gId] ?? gId) : gId)
      if (e.team_id) {
        if (!playerTeamGameCount[e.related_player_id]) playerTeamGameCount[e.related_player_id] = {}
        if (!playerTeamGameCount[e.related_player_id][gId]) playerTeamGameCount[e.related_player_id][gId] = {}
        playerTeamGameCount[e.related_player_id][gId][e.team_id] = (playerTeamGameCount[e.related_player_id][gId][e.team_id] ?? 0) + 1
      }
      // 게임 총합 · 어시스트도 증분 (PIE 재료)
      ensureGameTot(gId).ast++
    }
  }

  for (const pid of Object.keys(statsMap)) {
    statsMap[pid].gp = gpMap[pid]?.size ?? 0

    let teamRebSum = 0
    let teamPossSum = 0
    const gameTeams = playerTeamGameCount[pid] ?? {}
    for (const gid of Object.keys(gameTeams)) {
      const teams = gameTeams[gid]
      const top = Object.entries(teams).sort((a, b) => b[1] - a[1])[0]
      if (top) {
        const teamIdKey = top[0]
        teamRebSum += teamRebByGame[teamIdKey]?.[gid] ?? 0
        const tp = teamPossByGame[teamIdKey]?.[gid]
        if (tp) teamPossSum += tp.fga + 0.44 * tp.fta + tp.tov
      }
    }
    statsMap[pid].team_reb_in_games = teamRebSum
    statsMap[pid].team_poss_in_games = Math.round(teamPossSum)

    // PIE 재료 · 본인 numerator 와 본인 출전 게임의 총합 denom
    // 공식: PTS + FGM + FTM − FGA − FTA + DREB + ORB/2 + AST + STL + BLK/2 − PF − TO
    const pieOf = (x: {
      pts: number; fgm: number; ftm: number; fga: number; fta: number
      dreb: number; oreb: number; ast: number; stl: number; blk: number
      pf: number; tov: number
    }): number =>
      x.pts + x.fgm + x.ftm - x.fga - x.fta
      + x.dreb + x.oreb * 0.5
      + x.ast + x.stl + x.blk * 0.5
      - x.pf - x.tov

    const own = statsMap[pid]
    statsMap[pid].pie_num = pieOf(own)
    let denom = 0
    // 이 선수가 뛴 게임 집합 · playerTeamGameCount 로 이미 트래킹됨
    for (const gid of Object.keys(gameTeams)) {
      const gt = gameTotals[gid]
      if (gt) denom += pieOf(gt)
    }
    statsMap[pid].pie_denom = denom
  }

  // Minutes 조회 · 총 출전 시간만 합산
  {
    const { data: minutesRows } = await sb
      .from('league_player_minutes')
      .select('league_player_id, in_time, out_time')
      .in('league_game_id', gameIds)
    for (const m of (minutesRows ?? []) as { league_player_id: string | null; in_time: number | null; out_time: number | null }[]) {
      if (!m.league_player_id) continue
      if (m.in_time == null || m.out_time == null) continue
      const secs = Math.max(0, m.out_time - m.in_time)
      const s = statsMap[m.league_player_id]
      if (s) s.minutes_played += secs / 60
    }
    for (const pid of Object.keys(statsMap)) {
      statsMap[pid].minutes_played = Math.round(statsMap[pid].minutes_played * 10) / 10
    }
  }

  // 5) 평균/퍼센트
  if (Object.keys(statsMap).length === 0) return { players: [], total_rounds: totalRounds }
  const result: PlayerStat[] = Object.values(statsMap)
    .filter(s => s.gp > 0)
    .map(s => {
      const meta = metaMap[s.player_id] ?? {}
      return {
        ...s,
        name:     ((meta as Record<string,unknown>).name as string) ?? '알 수 없음',
        number:   ((meta as Record<string,unknown>).number as number | null) ?? null,
        position: ((meta as Record<string,unknown>).position as string | null) ?? null,
        photo_url: ((meta as Record<string,unknown>).photo_url as string | null) ?? null,
        ppg:  s.gp > 0 ? +(s.pts  / s.gp).toFixed(1) : 0,
        rpg:  s.gp > 0 ? +(s.reb  / s.gp).toFixed(1) : 0,
        orp:  s.gp > 0 ? +(s.oreb / s.gp).toFixed(1) : 0,
        drp:  s.gp > 0 ? +(s.dreb / s.gp).toFixed(1) : 0,
        apg:  s.gp > 0 ? +(s.ast  / s.gp).toFixed(1) : 0,
        spg:  s.gp > 0 ? +(s.stl  / s.gp).toFixed(1) : 0,
        bpg:  s.gp > 0 ? +(s.blk  / s.gp).toFixed(1) : 0,
        topg: s.gp > 0 ? +(s.tov  / s.gp).toFixed(1) : 0,
        fg_pct:  s.fga  > 0 ? +(s.fgm  / s.fga  * 100).toFixed(1) : 0,
        fg3_pct: s.fg3a > 0 ? +(s.fg3m / s.fg3a * 100).toFixed(1) : 0,
        ft_pct:  s.fta  > 0 ? +(s.ftm  / s.fta  * 100).toFixed(1) : 0,
        efg_pct: s.fga  > 0 ? +((s.fgm + 0.5 * s.fg3m) / s.fga * 100).toFixed(1) : 0,
        fg2m: s.fgm - s.fg3m,
        fg2a: s.fga - s.fg3a,
        fg2_pct: (s.fga - s.fg3a) > 0 ? +((s.fgm - s.fg3m) / (s.fga - s.fg3a) * 100).toFixed(1) : 0,
      }
    })
    .sort((a, b) => b.pts - a.pts)

  return { players: result, games_count: gameIds.length, total_rounds: totalRounds, unit }
}
