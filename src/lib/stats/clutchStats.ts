/**
 * 클러치 스탯 (Clutch Splits) 유틸
 *
 * 클러치 정의 (2026-07-15 개편 · 하이라이트 필터와 통일):
 *   ─ 시간: 매 경기 "마지막 이벤트"(무엇이든) 로부터 -120초 이내
 *   ─ 결정타 슛(made scoring): 슛 직전 |margin| ≤ 6점 (2포제션) AND 슛 직후 |margin| ≤ 3점 (1포제션)
 *       예) 6점차에서 3점(3점슛/앤드원) 성공 → 3점차로 좁혀지면 클러치 ✓
 *       예) 6점차에서 2점 성공 → 4점차 (여전히 2포제션) → 클러치 X
 *   ─ 클러치 컨텍스트(그 외 이벤트: miss / reb / ast / stl / blk / tov):
 *       슛 직전 |margin| ≤ 6점 (2포제션 접전 상황에서의 액션)
 *   ─ 최소 표본: 3게임 이상 클러치 경험한 선수만 통계 대상
 *
 * 알고리즘:
 *   1. 모든 is_started 게임 조회 + 이벤트 페이지네이션 (친선전 제외)
 *   2. 게임별 이벤트를 video_timestamp 오름차순 정렬
 *   3. 게임별 max_timestamp 계산 (전체 이벤트 기준) → clutch_window_start = max_ts - 120
 *   4. 시간순 walk 하며 running_home_score / running_away_score 유지
 *   5. 각 이벤트에 대해 결정타 슛 또는 클러치 컨텍스트 판정 후 집계
 *   6. 전체 stats 도 병렬 집계 (비교용)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { scorePoints, fetchScoringRules, isPlusOneFor, type ScoringRules, type GamePlusOne } from './scoring'
import { fetchExternalTeamIds } from '@/lib/league/externalPlayers'
import { resolveTeamId } from '@/lib/league/teamScope'

const CLUTCH_TIME_WINDOW_SECONDS = 120
const CLUTCH_MARGIN_BEFORE_MAX = 6    // 슛 직전 (2포제션)
const CLUTCH_MARGIN_AFTER_MAX = 3     // 슛 직후 (1포제션) — made scoring 만 검사
const MIN_CLUTCH_GAMES = 3

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
  // 슛 존별 made/attempted (DS=골밑, LU=레이업, MD=미들, 3P=fg3m/fg3a)
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

const FIELD_SHOTS = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post']
const SCORING_EVENTS = ['shot_3p', 'shot_post', 'shot_layup', 'shot_2p_mid', 'and_one', 'ft_2pt', 'ft_3pt_1', 'ft_3pt_2', 'free_throw']

export async function computeClutchStats(
  supabase: SupabaseClient,
  leagueId: string,
  opts: { quarterId?: string | null } = {},
): Promise<PlayerClutchSplit[]> {
  // 1) 게임 조회
  let gQuery = supabase
    .from('league_games')
    .select('id, home_team_id, away_team_id, plus_one_player_id, plus_one_extra_ids, plus_one_quarters, is_exhibition')
    .eq('league_id', leagueId)
    .eq('is_started', true)
    .eq('is_exhibition', false)  // 친선전 제외
  if (opts.quarterId) gQuery = gQuery.eq('quarter_id', opts.quarterId)

  const { data: games, error: gErr } = await gQuery
  // 쿼리 실패를 빈 배열로 넘기면 "경기 없음"과 구분이 안 돼 클러치 스탯이 조용히 0으로 보인다.
  if (gErr) throw new Error(`computeClutchStats: leagueId=${leagueId} league_games 조회 실패 — ${gErr.message}`)
  const gameRows = (games ?? []) as Array<{
    id: string
    home_team_id: string | null
    away_team_id: string | null
    plus_one_player_id: string | null
    plus_one_extra_ids: string[] | null; plus_one_quarters: Record<string, number[]> | null
    is_exhibition: boolean | null
  }>
  if (gameRows.length === 0) return []

  const gameById = new Map(gameRows.map(g => [g.id, g]))
  const gameIds = gameRows.map(g => g.id)

  // 채점 룰 + plus_one 선수 집합 — 이벤트 walk 안에서 매 이벤트마다 판정해야 하므로 미리 읽어둔다.
  // 선수 메타(name/number)도 여기서 같이 읽어 뒤(6번)의 중복 조회를 없앤다.
  const rules: ScoringRules = await fetchScoringRules(supabase, leagueId)
  // 외부(상대) 팀 이벤트는 클러치 스탯 대상이 아니다 — leagueStats.ts 와 동일하게 이벤트 단위로 거른다.
  const externalTeamIds = await fetchExternalTeamIds(supabase, leagueId)
  const { data: playerRows, error: plErr } = await supabase
    .from('league_players')
    .select('id, name, number, plus_one')
    // 선수는 팀에 매달려 있다(087) — league_id 로 찾으면 **대회 묶음에서 0명**이 나와
    //   이름이 '알 수 없음' 으로, plus_one 이 꺼진 것으로 조용히 계산된다(2026-08-31 실측).
    .eq('team_id', await resolveTeamId(leagueId))
  // 조용히 넘기면 plusOneSet 이 비어 모든 플러스원 선수가 일반 선수로 채점된다 (scoring.ts 와 동일 이유로 throw).
  if (plErr) throw new Error(`computeClutchStats: leagueId=${leagueId} league_players 조회 실패 — ${plErr.message}`)
  const playerMeta = new Map<string, { name: string; number: number | null }>()
  const plusOneSet = new Set<string>()
  for (const p of (playerRows ?? []) as Array<{ id: string; name: string; number: number | null; plus_one: boolean | null }>) {
    playerMeta.set(p.id, { name: p.name, number: p.number })
    if (p.plus_one) plusOneSet.add(p.id)
  }

  // 2) 이벤트 페이지네이션 (video_timestamp 포함)
  type EvRow = {
  /** 쿼터별 +1(113) 판정용. */
  quarter: number | null
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
    const { data: chunk, error: evErr } = await supabase
      .from('league_game_events')
      .select('id, league_game_id, league_player_id, related_player_id, team_id, type, result, points, video_timestamp, quarter')
      .in('league_game_id', gameIds)
      .order('id', { ascending: true })
      .range(p * PAGE, (p + 1) * PAGE - 1)
    // 페이지 중간 실패를 "더 이상 없음"과 같은 걸로 취급하면 클러치 판정이 일부 경기만으로 계산된다.
    if (evErr) throw new Error(`computeClutchStats: leagueId=${leagueId} league_game_events 페이지네이션(p=${p}) 실패 — ${evErr.message}`)
    if (!chunk || chunk.length === 0) break
    for (const e of chunk as EvRow[]) {
      if (e.team_id && externalTeamIds.has(e.team_id)) continue
      events.push(e)
    }
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
      // 플러스원 판정은 scoring.ts 의 isPlusOneFor() 하나로만 푼다(단일 진실).
      const isP1 = isPlusOneFor(pid, game as GamePlusOne, plusOneSet, e.quarter ?? null)
      const pts = scorePoints(e.type, e.result, isP1, rules)

      const inClutchTime = clutchStart != null && e.video_timestamp != null && e.video_timestamp >= clutchStart
      const marginBefore = Math.abs(homeScore - awayScore)

      // 이 이벤트가 made scoring 이면 반영 후 margin 미리 계산 (marginAfter 판정용)
      const isMadeScoring = made && SCORING_EVENTS.includes(e.type) && tid != null && pts > 0
      let projectedHome = homeScore
      let projectedAway = awayScore
      if (isMadeScoring) {
        if (tid === game.home_team_id) projectedHome += pts
        else if (tid === game.away_team_id) projectedAway += pts
      }
      const marginAfter = isMadeScoring ? Math.abs(projectedHome - projectedAway) : marginBefore

      // 판정: made scoring 은 결정타 슛 (before ≤ 6 AND after ≤ 3)
      //       나머지(miss/reb/ast/stl/blk/tov) 는 클러치 컨텍스트 (before ≤ 6)
      const inClutchContext = inClutchTime && marginBefore <= CLUTCH_MARGIN_BEFORE_MAX
      const isDecisiveShot = isMadeScoring && inClutchContext && marginAfter <= CLUTCH_MARGIN_AFTER_MAX
      const isClutch = isMadeScoring ? isDecisiveShot : inClutchContext

      // stat block 적용 함수 (regular + clutch 병렬)
      const applyToStat = (b: StatBlock) => {
        switch (e.type) {
          case 'shot_3p':
            b.fg3a++; b.fga++
            if (made) { b.fg3m++; b.fgm++; b.pts += pts }
            break
          case 'shot_post':
            b.fga++; b.ds_a++
            if (made) { b.fgm++; b.ds_m++; b.pts += pts }
            break
          case 'shot_layup':
            b.fga++; b.lu_a++
            if (made) { b.fgm++; b.lu_m++; b.pts += pts }
            break
          case 'shot_2p_mid':
            b.fga++; b.md_a++
            if (made) { b.fgm++; b.md_m++; b.pts += pts }
            break
          case 'and_one':
            if (made) b.pts += pts
            break
          case 'ft_2pt':
            b.fta++; if (made) { b.ftm++; b.pts += pts }
            break
          case 'ft_3pt_1':
            b.fta++; if (made) { b.ftm++; b.pts += pts }
            break
          case 'free_throw':
          case 'ft_3pt_2':
            b.fta++; if (made) { b.ftm++; b.pts += pts }
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
      if (made && SCORING_EVENTS.includes(e.type) && tid) {
        if (tid === game.home_team_id) homeScore += pts
        else if (tid === game.away_team_id) awayScore += pts
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

  // 6) 선수 메타 조인 + 결과 조립 (playerMeta 는 위에서 이미 조회함)
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
  marginBeforeMax: CLUTCH_MARGIN_BEFORE_MAX,
  marginAfterMax: CLUTCH_MARGIN_AFTER_MAX,
  minGames: MIN_CLUTCH_GAMES,
}
