/**
 * 클러치 스탯 (Clutch Splits) 유틸
 *
 * "클러치" 정의:
 *   - 경기 시간: 매 경기 마지막 2분 (video_timestamp 기준 game_end - 120s ~ game_end)
 *   - 점수 조건: 접전 (|home - away| ≤ 3, 원 포제션)
 *   - 최소 표본: 3게임 이상 클러치 경험한 선수만 통계 대상
 *
 * 알고리즘:
 *   1. 모든 is_started 게임 조회 + 이벤트 페이지네이션
 *   2. 게임별 이벤트를 video_timestamp 오름차순 정렬
 *   3. 게임별 max_timestamp 계산 → clutch_window_start = max_ts - 120
 *   4. 시간순 walk 하며 running_home_score / running_away_score 유지
 *   5. 각 이벤트에 대해:
 *      - is_in_clutch_time = video_timestamp >= clutch_window_start
 *      - is_in_clutch_score = |running_home - running_away| ≤ 3
 *      - is_clutch = is_in_clutch_time && is_in_clutch_score
 *   6. is_clutch=true 인 이벤트만 별도 clutchStats 로 집계
 *   7. 전체 stats 도 병렬 집계 (비교용)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const CLUTCH_TIME_WINDOW_SECONDS = 120  // 마지막 2분
const CLUTCH_MARGIN_MAX = 3              // 3점 이내
const MIN_CLUTCH_GAMES = 3               // 최소 3게임 표본

export interface StatBlock {
  pts: number
  reb: number
  oreb: number
  dreb: number
  ast: number
  stl: number
  blk: number
  tov: number
  fgm: number
  fga: number
  fg3m: number
  fg3a: number
  ftm: number
  fta: number
  // 슛 존별 made/attempted (DS=골밑, LU=레이업+드라이브, MD=미들, 3P=fg3m/fg3a)
  ds_m: number; ds_a: number
  lu_m: number; lu_a: number
  md_m: number; md_a: number
  gp: number  // 참여 게임 수 (해당 콘텍스트 내)
}

export interface PlayerClutchSplit {
  player_id: string
  name: string
  number: number | null
  regular: StatBlock  // 전체 (클러치 포함) — 비교 기준
  clutch: StatBlock   // 클러치만
  qualified: boolean  // 클러치 gp ≥ MIN_CLUTCH_GAMES
}

const emptyBlock = (): StatBlock => ({
  pts: 0, reb: 0, oreb: 0, dreb: 0,
  ast: 0, stl: 0, blk: 0, tov: 0,
  fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
  ds_m: 0, ds_a: 0, lu_m: 0, lu_a: 0, md_m: 0, md_a: 0,
  gp: 0,
})

const FIELD_SHOTS = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive']
const SCORING_EVENTS = ['shot_3p', 'shot_post', 'shot_layup', 'shot_2p_drive', 'shot_2p_mid', 'and_one', 'ft_2pt', 'ft_3pt_1', 'ft_3pt_2', 'free_throw']

export async function computeClutchStats(
  supabase: SupabaseClient,
  leagueId: string,
  opts: { quarterId?: string | null } = {},
): Promise<PlayerClutchSplit[]> {
  // 1) 게임 조회
  let gQuery = supabase
    .from('league_games')
    .select('id, home_team_id, away_team_id, plus_one_player_id, is_exhibition')
    .eq('league_id', leagueId)
    .eq('is_started', true)
    .eq('is_exhibition', false)  // 친선전 제외
  if (opts.quarterId) gQuery = gQuery.eq('quarter_id', opts.quarterId)

  const { data: games } = await gQuery
  const gameRows = (games ?? []) as Array<{
    id: string
    home_team_id: string | null
    away_team_id: string | null
    plus_one_player_id: string | null
    is_exhibition: boolean | null
  }>
  if (gameRows.length === 0) return []

  const gameById = new Map(gameRows.map(g => [g.id, g]))
  const gameIds = gameRows.map(g => g.id)

  // 2) 이벤트 페이지네이션 (video_timestamp 포함)
  type EvRow = {
    id: number
    league_game_id: string
    league_player_id: string | null
    related_player_id: string | null
    team_id: string | null
    type: string
    result: string | null
    points: number | null
    video_timestamp: number | null
  }
  const events: EvRow[] = []
  const PAGE = 1000
  for (let p = 0; ; p++) {
    const { data: chunk } = await supabase
      .from('league_game_events')
      .select('id, league_game_id, league_player_id, related_player_id, team_id, type, result, points, video_timestamp')
      .in('league_game_id', gameIds)
      .order('id', { ascending: true })
      .range(p * PAGE, (p + 1) * PAGE - 1)
    if (!chunk || chunk.length === 0) break
    events.push(...(chunk as EvRow[]))
    if (chunk.length < PAGE) break
  }

  // 3) 게임별 이벤트 그룹핑 + max_timestamp 계산
  const gameEvents = new Map<string, EvRow[]>()
  const gameMaxTs = new Map<string, number>()
  for (const e of events) {
    const gid = e.league_game_id
    if (!gameEvents.has(gid)) gameEvents.set(gid, [])
    gameEvents.get(gid)!.push(e)
    if (e.video_timestamp != null) {
      const cur = gameMaxTs.get(gid) ?? -1
      if (e.video_timestamp > cur) gameMaxTs.set(gid, e.video_timestamp)
    }
  }

  // 4) 게임별 walk — 클러치 이벤트 판정
  //    선수별 stat block 을 (regular, clutch) 두 벌 유지
  const playerRegular = new Map<string, StatBlock>()
  const playerClutch = new Map<string, StatBlock>()
  const playerRegularGames = new Map<string, Set<string>>()
  const playerClutchGames = new Map<string, Set<string>>()

  const ensure = (map: Map<string, StatBlock>, pid: string) => {
    let b = map.get(pid); if (!b) { b = emptyBlock(); map.set(pid, b) }
    return b
  }
  const ensureSet = (map: Map<string, Set<string>>, pid: string) => {
    let s = map.get(pid); if (!s) { s = new Set(); map.set(pid, s) }
    return s
  }

  for (const [gid, evs] of gameEvents) {
    const game = gameById.get(gid)
    if (!game) continue

    // video_timestamp 기준 시간순 정렬 (null 은 뒤로)
    evs.sort((a, b) => {
      const ta = a.video_timestamp ?? Number.MAX_SAFE_INTEGER
      const tb = b.video_timestamp ?? Number.MAX_SAFE_INTEGER
      if (ta !== tb) return ta - tb
      return a.id - b.id
    })

    const maxTs = gameMaxTs.get(gid)
    const clutchStart = maxTs != null ? maxTs - CLUTCH_TIME_WINDOW_SECONDS : null

    let homeScore = 0
    let awayScore = 0

    for (const e of evs) {
      const pid = e.league_player_id
      const tid = e.team_id
      const made = e.result === 'made'

      // 이 이벤트가 발생한 시점의 스코어차로 clutch 여부 판정
      // (이벤트 자체는 아직 반영 전 — "이 슛 던지기 직전"이 접전 상황이었는지 판단)
      const inClutchTime = clutchStart != null && e.video_timestamp != null && e.video_timestamp >= clutchStart
      const inClutchScore = Math.abs(homeScore - awayScore) <= CLUTCH_MARGIN_MAX
      const isClutch = inClutchTime && inClutchScore

      // stat block 적용 함수 (regular + clutch 병렬)
      const applyToStat = (b: StatBlock) => {
        switch (e.type) {
          case 'shot_3p':
            b.fg3a++; b.fga++
            if (made) { b.fg3m++; b.fgm++; b.pts += e.points ?? 3 }
            break
          case 'shot_post':
            b.fga++; b.ds_a++
            if (made) { b.fgm++; b.ds_m++; b.pts += e.points ?? 2 }
            break
          case 'shot_layup':
          case 'shot_2p_drive':
            b.fga++; b.lu_a++
            if (made) { b.fgm++; b.lu_m++; b.pts += e.points ?? 2 }
            break
          case 'shot_2p_mid':
            b.fga++; b.md_a++
            if (made) { b.fgm++; b.md_m++; b.pts += e.points ?? 2 }
            break
          case 'and_one':
            if (made) b.pts += 1
            break
          case 'ft_2pt':
            b.fta++; if (made) { b.ftm++; b.pts += 2 }
            break
          case 'ft_3pt_1':
            b.fta++; if (made) { b.ftm++; b.pts += 2 }
            break
          case 'free_throw':
          case 'ft_3pt_2':
            b.fta++; if (made) { b.ftm++; b.pts += 1 }
            break
          case 'oreb': b.oreb++; b.reb++; break
          case 'dreb': b.dreb++; b.reb++; break
          case 'steal': b.stl++; break
          case 'block': b.blk++; break
          case 'turnover': b.tov++; break
        }
      }

      // 선수별 stat 집계
      if (pid) {
        applyToStat(ensure(playerRegular, pid))
        ensureSet(playerRegularGames, pid).add(gid)
        if (isClutch) {
          applyToStat(ensure(playerClutch, pid))
          ensureSet(playerClutchGames, pid).add(gid)
        }
      }
      // 어시스트 (assister 는 related_player_id)
      if (made && FIELD_SHOTS.includes(e.type) && e.related_player_id) {
        const assisterId = e.related_player_id
        ensure(playerRegular, assisterId).ast++
        ensureSet(playerRegularGames, assisterId).add(gid)
        if (isClutch) {
          ensure(playerClutch, assisterId).ast++
          ensureSet(playerClutchGames, assisterId).add(gid)
        }
      }

      // 스코어 업데이트 — 이벤트 처리 후 반영
      // (이 슛의 결과가 다음 이벤트의 clutch 판정에 영향을 줌)
      if (made && SCORING_EVENTS.includes(e.type) && tid && e.points != null) {
        if (tid === game.home_team_id) homeScore += e.points
        else if (tid === game.away_team_id) awayScore += e.points
      }
    }
  }

  // 5) gp 채우기 (Set size)
  for (const [pid, block] of playerRegular) {
    block.gp = playerRegularGames.get(pid)?.size ?? 0
  }
  for (const [pid, block] of playerClutch) {
    block.gp = playerClutchGames.get(pid)?.size ?? 0
  }

  // 6) 선수 메타 조인 + 결과 조립
  const { data: playerRows } = await supabase
    .from('league_players')
    .select('id, name, number')
    .eq('league_id', leagueId)
  const playerMeta = new Map<string, { name: string; number: number | null }>()
  for (const p of (playerRows ?? []) as Array<{ id: string; name: string; number: number | null }>) {
    playerMeta.set(p.id, { name: p.name, number: p.number })
  }

  const results: PlayerClutchSplit[] = []
  const allPids = new Set([...playerRegular.keys(), ...playerClutch.keys()])
  for (const pid of allPids) {
    const meta = playerMeta.get(pid)
    if (!meta) continue
    const regular = playerRegular.get(pid) ?? emptyBlock()
    const clutch = playerClutch.get(pid) ?? emptyBlock()
    results.push({
      player_id: pid,
      name: meta.name,
      number: meta.number,
      regular,
      clutch,
      qualified: clutch.gp >= MIN_CLUTCH_GAMES,
    })
  }

  return results
}

// ── 파생 지표 헬퍼 ────────────────────────────────────
export function ppg(b: StatBlock): number {
  return b.gp > 0 ? +(b.pts / b.gp).toFixed(1) : 0
}
export function fgPct(b: StatBlock): number {
  return b.fga > 0 ? +(b.fgm / b.fga * 100).toFixed(1) : 0
}
export function fg3Pct(b: StatBlock): number {
  return b.fg3a > 0 ? +(b.fg3m / b.fg3a * 100).toFixed(1) : 0
}
export function ftPct(b: StatBlock): number {
  return b.fta > 0 ? +(b.ftm / b.fta * 100).toFixed(1) : 0
}
export function efgPct(b: StatBlock): number {
  return b.fga > 0 ? +((b.fgm + 0.5 * b.fg3m) / b.fga * 100).toFixed(1) : 0
}
export function tsPct(b: StatBlock): number {
  const denom = 2 * (b.fga + 0.44 * b.fta)
  return denom > 0 ? +(b.pts / denom * 100).toFixed(1) : 0
}

export const CLUTCH_CONFIG = {
  timeWindowSeconds: CLUTCH_TIME_WINDOW_SECONDS,
  marginMax: CLUTCH_MARGIN_MAX,
  minGames: MIN_CLUTCH_GAMES,
}
