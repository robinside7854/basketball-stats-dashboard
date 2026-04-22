import type { GameEvent, PlayerMinutes, Player, PlayerBoxScore } from '@/types/database'

function pct(made: number, attempted: number): number {
  if (attempted === 0) return 0
  return Math.round((made / attempted) * 1000) / 10
}

// Hollinger Game Score: 한 경기의 종합 퍼포먼스 점수
export function calcGameScore(s: {
  pts: number; fgm: number; fga: number; ftm: number; fta: number
  oreb: number; dreb: number; stl: number; ast: number; blk: number; pf: number; tov: number
}): number {
  const raw =
    s.pts
    + 0.4 * s.fgm
    - 0.7 * s.fga
    - 0.4 * (s.fta - s.ftm)
    + 0.7 * s.oreb
    + 0.3 * s.dreb
    + s.stl
    + 0.7 * s.ast
    + 0.7 * s.blk
    - 0.4 * s.pf
    - s.tov
  return Math.round(raw * 10) / 10
}

// Dean Oliver Four Factors (우리 팀 자체 효율)
export function calcFourFactors(t: Partial<PlayerBoxScore>) {
  const fgm = t.fgm ?? 0, fga = t.fga ?? 0, fg3m = t.fg3m ?? 0
  const fta = t.fta ?? 0, tov = t.tov ?? 0
  const oreb = t.oreb ?? 0, dreb = t.dreb ?? 0
  const efg_pct = fga > 0 ? Math.round(((fgm + 0.5 * fg3m) / fga) * 1000) / 10 : 0
  const poss = fga + 0.44 * fta + tov
  const tov_pct = poss > 0 ? Math.round((tov / poss) * 1000) / 10 : 0
  const totalReb = oreb + dreb
  const orb_pct = totalReb > 0 ? Math.round((oreb / totalReb) * 1000) / 10 : 0
  const ft_rate = fga > 0 ? Math.round((fta / fga) * 1000) / 1000 : 0
  return { efg_pct, tov_pct, orb_pct, ft_rate }
}

function calcTotalMinutes(intervals: PlayerMinutes[], currentTime?: number): number {
  return intervals.reduce((total, interval) => {
    const out = interval.out_time ?? currentTime ?? interval.in_time
    return total + Math.max(0, out - interval.in_time) / 60
  }, 0)
}

// 특정 시점에 출전 중인 선수 목록 반환
function getPlayersOnCourt(minutes: PlayerMinutes[], timestamp: number, quarter: number): string[] {
  return minutes
    .filter(m => m.quarter === quarter && m.in_time <= timestamp && (m.out_time == null || m.out_time > timestamp))
    .map(m => m.player_id)
}

export function calculateBoxScore(
  events: GameEvent[],
  minutes: PlayerMinutes[],
  players: Player[]
): PlayerBoxScore[] {
  const statsMap = new Map<string, PlayerBoxScore>()

  // 초기화
  for (const player of players) {
    statsMap.set(player.id, {
      player_id: player.id,
      player_name: player.name,
      player_number: player.number,
      min: 0, pts: 0,
      fgm: 0, fga: 0, fg_pct: 0,
      fg3m: 0, fg3a: 0, fg3_pct: 0,
      ftm: 0, fta: 0, ft_pct: 0,
      oreb: 0, dreb: 0, reb: 0,
      ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
      plus_minus: 0,
      efg_pct: 0, ts_pct: 0, ast_tov: 0,
      double_double: false, triple_double: false,
    })
  }

  // 출전 시간 계산
  for (const player of players) {
    const playerMinutes = minutes.filter(m => m.player_id === player.id)
    const totalMin = Math.round(calcTotalMinutes(playerMinutes) * 10) / 10
    const stat = statsMap.get(player.id)!
    stat.min = totalMin
  }

  // 이벤트 집계
  for (const event of events) {
    if (!event.player_id) continue
    const stat = statsMap.get(event.player_id)
    if (!stat) continue

    switch (event.type) {
      case 'shot_3p':
        stat.fg3a++; stat.fga++
        if (event.result === 'made') { stat.fg3m++; stat.fgm++; stat.pts += 3 }
        break
      case 'shot_2p_mid':
      case 'shot_2p_drive':
      case 'shot_layup':
      case 'shot_post':
        stat.fga++
        if (event.result === 'made') { stat.fgm++; stat.pts += 2 }
        break
      case 'free_throw':
        stat.fta++
        if (event.result === 'made') { stat.ftm++; stat.pts++ }
        break
      case 'oreb': stat.oreb++; break
      case 'dreb': stat.dreb++; break
      case 'steal': stat.stl++; break
      case 'block': stat.blk++; break
      case 'turnover': stat.tov++; break
      case 'foul': stat.pf++; break
    }

    // 어시스트: related_player_id가 어시스트한 선수
    if (['shot_3p', 'shot_2p_mid', 'shot_2p_drive', 'shot_layup', 'shot_post'].includes(event.type)) {
      if (event.result === 'made' && event.related_player_id) {
        const assistStat = statsMap.get(event.related_player_id)
        if (assistStat) assistStat.ast++
      }
    }
  }

  // +/- 계산
  const scoringEvents = events.filter(e =>
    ['shot_3p', 'shot_2p_mid', 'shot_2p_drive', 'shot_layup', 'shot_post', 'free_throw', 'opp_score'].includes(e.type)
    && (e.result === 'made' || e.type === 'opp_score')
    && e.video_timestamp != null
  )

  for (const event of scoringEvents) {
    const pts = event.type === 'opp_score' ? -(event.points || 2) : event.points
    const onCourt = getPlayersOnCourt(minutes, event.video_timestamp!, event.quarter)
    for (const pid of onCourt) {
      const stat = statsMap.get(pid)
      if (stat) stat.plus_minus += pts
    }
  }

  // 효율 지표 계산
  for (const stat of statsMap.values()) {
    stat.reb = stat.oreb + stat.dreb
    stat.fg_pct = pct(stat.fgm, stat.fga)
    stat.fg3_pct = pct(stat.fg3m, stat.fg3a)
    stat.ft_pct = pct(stat.ftm, stat.fta)
    stat.efg_pct = stat.fga > 0
      ? Math.round(((stat.fgm + 0.5 * stat.fg3m) / stat.fga) * 1000) / 10
      : 0
    stat.ts_pct = (stat.fga + 0.44 * stat.fta) > 0
      ? Math.round((stat.pts / (2 * (stat.fga + 0.44 * stat.fta))) * 1000) / 10
      : 0
    stat.ast_tov = stat.tov > 0 ? Math.round((stat.ast / stat.tov) * 10) / 10 : stat.ast
    stat.double_double = isDoubleDouble(stat)
    stat.triple_double = isTripleDouble(stat)
    stat.game_score = calcGameScore(stat)
  }

  // PER / USG% — 팀 합계가 필요하므로 2차 패스
  let tFGA = 0, tFTA = 0, tTOV = 0
  for (const s of statsMap.values()) { tFGA += s.fga; tFTA += s.fta; tTOV += s.tov }
  const teamPoss = tFGA + 0.44 * tFTA + tTOV

  for (const stat of statsMap.values()) {
    // USG%: 선수 점유 / 팀 점유 × 100
    if (teamPoss > 0) {
      const playerPoss = stat.fga + 0.44 * stat.fta + stat.tov
      stat.usg_pct = Math.round((playerPoss / teamPoss) * 1000) / 10
    }
  }

  return Array.from(statsMap.values())
    .filter(s => s.min > 0 || s.pts > 0 || s.reb > 0 || s.ast > 0)
    .sort((a, b) => b.pts - a.pts)
}

function isDoubleDouble(s: PlayerBoxScore): boolean {
  const tens = [s.pts, s.reb, s.ast, s.stl, s.blk].filter(v => v >= 10)
  return tens.length >= 2
}

function isTripleDouble(s: PlayerBoxScore): boolean {
  const tens = [s.pts, s.reb, s.ast, s.stl, s.blk].filter(v => v >= 10)
  return tens.length >= 3
}

// 선수별 쿼터별 득점
export function calculateQuarterPoints(events: GameEvent[]): Record<string, Record<number, number>> {
  const result: Record<string, Record<number, number>> = {}
  const SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_2p_drive', 'shot_layup', 'shot_post']
  for (const event of events) {
    if (!event.player_id || event.result !== 'made') continue
    let pts = 0
    if (event.type === 'shot_3p') pts = 3
    else if (SHOT_TYPES.includes(event.type)) pts = 2
    else if (event.type === 'free_throw') pts = 1
    else continue
    if (!result[event.player_id]) result[event.player_id] = {}
    result[event.player_id][event.quarter] = (result[event.player_id][event.quarter] || 0) + pts
  }
  return result
}

// 팀 합계
export function calculateTeamTotals(boxScores: PlayerBoxScore[]): Partial<PlayerBoxScore> {
  return boxScores.reduce((acc, s) => ({
    pts: (acc.pts || 0) + s.pts,
    fgm: (acc.fgm || 0) + s.fgm,
    fga: (acc.fga || 0) + s.fga,
    fg3m: (acc.fg3m || 0) + s.fg3m,
    fg3a: (acc.fg3a || 0) + s.fg3a,
    ftm: (acc.ftm || 0) + s.ftm,
    fta: (acc.fta || 0) + s.fta,
    oreb: (acc.oreb || 0) + s.oreb,
    dreb: (acc.dreb || 0) + s.dreb,
    reb: (acc.reb || 0) + s.reb,
    ast: (acc.ast || 0) + s.ast,
    stl: (acc.stl || 0) + s.stl,
    blk: (acc.blk || 0) + s.blk,
    tov: (acc.tov || 0) + s.tov,
    pf: (acc.pf || 0) + s.pf,
  }), {} as Partial<PlayerBoxScore>)
}
