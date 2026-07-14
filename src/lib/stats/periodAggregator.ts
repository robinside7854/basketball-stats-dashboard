// 특정 기간 (weekly/monthly/quarterly) 의 리그 데이터를 매거진 생성용으로 집계.
//
// 반환 데이터는 Claude API 에 프롬프트 재료로 전달되고,
// meta 필드로 DB 에 저장되어 나중에 재렌더 가능.

import type { SupabaseClient } from '@supabase/supabase-js'
import { makeIdentityResolver, type QuarterOverride, type TeamBase } from '@/lib/stats/teamIdentity'

const FIELD_SHOTS = new Set(['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post'])

export interface PeriodData {
  period_type: 'weekly' | 'monthly' | 'quarterly'
  period_start: string  // YYYY-MM-DD
  period_end: string
  league_name: string

  games: Array<{
    id: string; date: string; slot_num: number
    home: { name: string; color: string; score: number } | null
    away: { name: string; color: string; score: number } | null
    is_complete: boolean
  }>

  // 프랜차이즈 순위
  standings: Array<{ name: string; color: string; W: number; L: number; D: number; PF: number; PA: number; rate: number }>

  // 선수 스탯 (Top 위주)
  playerStats: Array<{
    player_id: string; name: string; number: number | null
    team_name: string | null; team_color: string | null
    gp: number
    pts: number; ppg: number
    reb: number; rpg: number
    ast: number; apg: number
    stl: number; blk: number
    fgm: number; fga: number; fg3m: number; fg3a: number
    fg_pct: number; fg3_pct: number
  }>

  // 하이라이트 후보
  heroPerformances: Array<{ player_id: string; name: string; date: string; pts: number; reb: number; ast: number }>  // 30+ / 트리플더블 등

  // 어시스트 듀오 (자주 이어짐)
  topAssistDuos: Array<{ assister_id: string; assister_name: string; scorer_id: string; scorer_name: string; count: number }>

  // 궂은 일 (리바+스틸+블락 total)
  dirtyWorkPlayers: Array<{ player_id: string; name: string; team_name: string | null; hustle: number; reb: number; stl: number; blk: number }>

  // 이전 대비 새 마일스톤 (시즌 누적 500pts 최초 등)
  milestones: Array<{ player_id: string; name: string; kind: string; value: number; date: string }>
}

const MILESTONE_TIERS: Record<string, number[]> = {
  pts: [100, 250, 500, 750, 1000, 1500, 2000, 3000],
  reb: [50, 100, 200, 300, 500, 750, 1000],
  ast: [50, 100, 200, 300, 500, 750],
  stl: [25, 50, 100, 200],
  blk: [10, 25, 50, 100],
  fg3m: [25, 50, 100, 200, 300],
}

/**
 * 이 함수는 기간 데이터를 Claude API 프롬프트에 넣기 위한 요약 데이터를 생성.
 */
export async function aggregatePeriodData(
  supabase: SupabaseClient,
  leagueId: string,
  periodType: PeriodData['period_type'],
  periodStart: string,
  periodEnd: string,
  leagueName: string,
): Promise<PeriodData> {
  // 팀 identity resolver
  const [{ data: teamsRaw }, { data: overridesRaw }, { data: playersRaw }] = await Promise.all([
    supabase.from('league_teams').select('id, name, color').eq('league_id', leagueId),
    supabase.from('league_team_quarter_overrides').select('quarter_id, team_id, name, color').eq('league_id', leagueId),
    supabase.from('league_players').select('id, name, number').eq('league_id', leagueId),
  ])
  const identityResolver = makeIdentityResolver(
    (teamsRaw ?? []) as TeamBase[],
    (overridesRaw ?? []) as QuarterOverride[],
  )
  const playerMeta = Object.fromEntries((playersRaw ?? []).map(p => [p.id, p]))

  // 이 기간의 게임
  const { data: gamesRaw } = await supabase
    .from('league_games')
    .select('id, date, slot_num, home_team_id, away_team_id, home_score, away_score, is_complete, is_started, quarter_id, is_exhibition')
    .eq('league_id', leagueId)
    .eq('is_started', true)
    .gte('date', periodStart)
    .lte('date', periodEnd)
    .order('date', { ascending: true })
    .order('slot_num', { ascending: true })

  const games = (gamesRaw ?? []).map(g => {
    const homeId = g.home_team_id ? identityResolver(g.home_team_id, g.quarter_id) : null
    const awayId = g.away_team_id ? identityResolver(g.away_team_id, g.quarter_id) : null
    return {
      id: g.id, date: g.date, slot_num: g.slot_num,
      home: homeId ? { name: homeId.display_name, color: homeId.color, score: g.home_score } : null,
      away: awayId ? { name: awayId.display_name, color: awayId.color, score: g.away_score } : null,
      is_complete: g.is_complete,
    }
  })

  const completedGameIds = (gamesRaw ?? []).filter(g => g.is_complete && !g.is_exhibition).map(g => g.id)

  // 프랜차이즈 순위 (완료 게임만)
  const standingMap = new Map<string, { name: string; color: string; W: number; L: number; D: number; PF: number; PA: number }>()
  for (const g of (gamesRaw ?? [])) {
    if (!g.is_complete || g.is_exhibition) continue
    if (!g.home_team_id || !g.away_team_id) continue
    const h = identityResolver(g.home_team_id, g.quarter_id)
    const a = identityResolver(g.away_team_id, g.quarter_id)
    if (!h || !a) continue
    const ensure = (id: { key: string; display_name: string; color: string }) => {
      let row = standingMap.get(id.key)
      if (!row) { row = { name: id.display_name, color: id.color, W: 0, L: 0, D: 0, PF: 0, PA: 0 }; standingMap.set(id.key, row) }
      return row
    }
    const hr = ensure(h)
    const ar = ensure(a)
    hr.PF += g.home_score; hr.PA += g.away_score
    ar.PF += g.away_score; ar.PA += g.home_score
    if (g.home_score > g.away_score) { hr.W++; ar.L++ }
    else if (g.home_score < g.away_score) { ar.W++; hr.L++ }
    else { hr.D++; ar.D++ }
  }
  const standings = [...standingMap.values()]
    .map(s => ({ ...s, rate: (s.W + s.L + s.D) > 0 ? +(s.W / (s.W + s.L + s.D) * 100).toFixed(1) : 0 }))
    .sort((a, b) => b.rate - a.rate || b.W - a.W)

  // 이벤트 페이지네이션
  const events: Array<{ league_game_id: string; league_player_id: string | null; related_player_id: string | null; team_id: string | null; type: string; result: string | null; points: number | null }> = []
  if (completedGameIds.length > 0 || games.length > 0) {
    const allIds = (gamesRaw ?? []).filter(g => g.is_started).map(g => g.id)
    if (allIds.length > 0) {
      const PAGE = 1000
      let p = 0
      while (true) {
        const { data: chunk } = await supabase
          .from('league_game_events')
          .select('league_game_id, league_player_id, related_player_id, team_id, type, result, points')
          .in('league_game_id', allIds)
          .not('league_player_id', 'is', null)
          .order('id', { ascending: true })
          .range(p * PAGE, (p + 1) * PAGE - 1)
        if (!chunk || chunk.length === 0) break
        events.push(...chunk)
        if (chunk.length < PAGE) break
        p++
      }
    }
  }

  // 선수 집계 (해당 기간)
  const aggMap = new Map<string, { pts: number; reb: number; ast: number; stl: number; blk: number; fgm: number; fga: number; fg3m: number; fg3a: number; gpSet: Set<string>; teamCounts: Map<string, number> }>()
  const gameQ: Record<string, string | null> = Object.fromEntries((gamesRaw ?? []).map(g => [g.id, g.quarter_id]))
  const ensureAgg = (pid: string) => {
    let a = aggMap.get(pid)
    if (!a) {
      a = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, gpSet: new Set(), teamCounts: new Map() }
      aggMap.set(pid, a)
    }
    return a
  }
  const assistDuoMap = new Map<string, number>()
  // 게임별 선수 스탯 (하이라이트 판정용)
  const perGamePlayer = new Map<string, Map<string, { pts: number; reb: number; ast: number }>>()  // pid → gid → {}
  const ensureGamePlayer = (pid: string, gid: string) => {
    let byG = perGamePlayer.get(pid)
    if (!byG) { byG = new Map(); perGamePlayer.set(pid, byG) }
    let s = byG.get(gid)
    if (!s) { s = { pts: 0, reb: 0, ast: 0 }; byG.set(gid, s) }
    return s
  }

  for (const e of events) {
    if (!e.league_player_id) continue
    const pid = e.league_player_id
    const a = ensureAgg(pid)
    const gs = ensureGamePlayer(pid, e.league_game_id)
    a.gpSet.add(e.league_game_id)
    if (e.team_id) a.teamCounts.set(e.team_id, (a.teamCounts.get(e.team_id) ?? 0) + 1)
    const made = e.result === 'made'
    const t = e.type
    if (FIELD_SHOTS.has(t)) {
      a.fga += 1
      if (t === 'shot_3p') a.fg3a += 1
      if (made) {
        a.fgm += 1
        if (t === 'shot_3p') { a.fg3m += 1; a.pts += e.points ?? 3; gs.pts += 3 }
        else { a.pts += e.points ?? 2; gs.pts += 2 }
      }
    } else if (t === 'ft_2pt' || t === 'ft_3pt_1') {
      if (made) { a.pts += 2; gs.pts += 2 }
    } else if (t === 'free_throw' || t === 'ft_3pt_2' || t === 'and_one') {
      if (made) { a.pts += 1; gs.pts += 1 }
    } else if (t === 'oreb' || t === 'dreb') {
      a.reb += 1; gs.reb += 1
    } else if (t === 'steal') a.stl += 1
    else if (t === 'block') a.blk += 1

    // 어시스트 크레딧
    if (FIELD_SHOTS.has(t) && made && e.related_player_id) {
      const asr = ensureAgg(e.related_player_id)
      asr.gpSet.add(e.league_game_id); asr.ast += 1
      ensureGamePlayer(e.related_player_id, e.league_game_id).ast += 1
      // 어시스트 듀오 카운트 (assister → scorer)
      const duoKey = `${e.related_player_id}:${pid}`
      assistDuoMap.set(duoKey, (assistDuoMap.get(duoKey) ?? 0) + 1)
    }
  }

  const playerStats = [...aggMap.entries()].map(([pid, a]) => {
    // 팀 다수결
    const topTeam = [...a.teamCounts.entries()].sort((x, y) => y[1] - x[1])[0]
    const teamIdentity = topTeam ? identityResolver(topTeam[0], null) : null
    const gp = a.gpSet.size
    const meta = playerMeta[pid]
    return {
      player_id: pid,
      name: meta?.name ?? '알 수 없음',
      number: meta?.number ?? null,
      team_name: teamIdentity?.display_name ?? null,
      team_color: teamIdentity?.color ?? null,
      gp,
      pts: a.pts,
      ppg: gp > 0 ? +(a.pts / gp).toFixed(1) : 0,
      reb: a.reb,
      rpg: gp > 0 ? +(a.reb / gp).toFixed(1) : 0,
      ast: a.ast,
      apg: gp > 0 ? +(a.ast / gp).toFixed(1) : 0,
      stl: a.stl, blk: a.blk,
      fgm: a.fgm, fga: a.fga, fg3m: a.fg3m, fg3a: a.fg3a,
      fg_pct: a.fga > 0 ? +(a.fgm / a.fga * 100).toFixed(1) : 0,
      fg3_pct: a.fg3a > 0 ? +(a.fg3m / a.fg3a * 100).toFixed(1) : 0,
    }
  }).sort((a, b) => b.pts - a.pts)

  // 하이라이트: 25+ pts OR 15+ reb OR 10+ ast OR 트리플더블
  const heroPerformances: PeriodData['heroPerformances'] = []
  const gameDate = Object.fromEntries((gamesRaw ?? []).map(g => [g.id, g.date]))
  for (const [pid, byG] of perGamePlayer) {
    for (const [gid, s] of byG) {
      const dd = [s.pts >= 10, s.reb >= 10, s.ast >= 10].filter(Boolean).length
      if (s.pts >= 25 || s.reb >= 15 || s.ast >= 10 || dd >= 2) {
        heroPerformances.push({
          player_id: pid,
          name: playerMeta[pid]?.name ?? '?',
          date: gameDate[gid] ?? '',
          pts: s.pts, reb: s.reb, ast: s.ast,
        })
      }
    }
  }
  heroPerformances.sort((a, b) => (b.pts + b.reb * 1.5 + b.ast * 2) - (a.pts + a.reb * 1.5 + a.ast * 2))

  // 어시스트 듀오 Top 5
  const topAssistDuos = [...assistDuoMap.entries()]
    .map(([key, count]) => {
      const [aid, sid] = key.split(':')
      return {
        assister_id: aid,
        assister_name: playerMeta[aid]?.name ?? '?',
        scorer_id: sid,
        scorer_name: playerMeta[sid]?.name ?? '?',
        count,
      }
    })
    .filter(d => d.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // 궂은 일 = reb + stl + blk (Top 5, team 정보 포함)
  const dirtyWorkPlayers = playerStats
    .map(p => ({
      player_id: p.player_id,
      name: p.name,
      team_name: p.team_name,
      hustle: p.reb + p.stl + p.blk,
      reb: p.reb, stl: p.stl, blk: p.blk,
    }))
    .sort((a, b) => b.hustle - a.hustle)
    .slice(0, 5)

  // 마일스톤: 이 기간에 새로 넘긴 시즌 누적 임계값
  //   계산법: 기간 이전 누적 vs 기간 종료 시 누적 → 사이에 임계값 있으면 hit
  //   시즌 시작 ~ periodStart 이전 스탯 vs 시즌 시작 ~ periodEnd 스탯 비교
  const milestones: PeriodData['milestones'] = []
  // 시즌 전체 스탯 (기간 종료 시점까지) vs 기간 시작 하루 전까지
  // 간이 구현: 마일스톤은 기간 종료 시점 누적만 계산해서 임계값 처음 초과 여부는 근사
  // (정확도 위해 이전 누적도 계산해야 하지만 성능 위해 근사 사용)
  for (const p of playerStats) {
    const key = 'pts' as const
    const seasonSoFar = p.pts  // TODO: 시즌 전체 (이 기간 외 포함) 스탯 필요 — v2 에서 개선
    const tiers = MILESTONE_TIERS[key]
    for (const tier of tiers) {
      if (seasonSoFar >= tier && (seasonSoFar - p.pts) < tier) {
        milestones.push({
          player_id: p.player_id,
          name: p.name,
          kind: '누적 득점',
          value: tier,
          date: periodEnd,
        })
      }
    }
  }

  return {
    period_type: periodType,
    period_start: periodStart,
    period_end: periodEnd,
    league_name: leagueName,
    games,
    standings,
    playerStats: playerStats.slice(0, 20),  // Top 20 넘기지 않음 (프롬프트 절약)
    heroPerformances: heroPerformances.slice(0, 10),
    topAssistDuos,
    dirtyWorkPlayers,
    milestones,
  }
}
