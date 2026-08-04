// 자동 배지 계산
//
// 4종 배지:
//  1) perfect_game    — 게임 단위. FGM/FGA=100% (FGA>=3, 자유투 제외)
//  2) double_double   — 라운드(=날짜) 단위. 그 날 리그 내 모든 게임 스탯 합산.
//                       pts/reb/ast/stl/blk 중 정확히 2개 카테고리 >=10
//  3) triple_double   — 라운드(=날짜) 단위. 3개 이상 카테고리 >=10 (DD와 배타적)
//  4) winning_shot    — 게임 단위. "본인의 득점을 마지막으로 승리"
//                       → 게임 마지막 득점(result='made', points>0) 이벤트의 선수 팀 == 최종 승리 팀
//
// 저장 규칙:
//   perfect_game / winning_shot : player_badges.game_id = 해당 게임 UUID
//   double_double / triple_double : player_badges.game_id = NULL
//
// league_game_events 는 페이지네이션(1000 단위) 필수 — leagueStats.ts 패턴 참고.

import type { SupabaseClient } from '@supabase/supabase-js'
import { scorePoints, fetchScoringRules, type ScoringRules } from '../stats/scoring'
import { fetchExternalTeamIds } from '../league/externalPlayers'

export type BadgeType = 'perfect_game' | 'double_double' | 'triple_double' | 'winning_shot'

export interface BadgePayload {
  league_id: string
  player_id: string
  game_id: string | null      // 라운드 배지(DD/TD)는 null
  badge_type: BadgeType
  earned_at_date: string      // YYYY-MM-DD
  meta: Record<string, unknown> | null
}

interface GameRow {
  id: string
  league_id: string
  date: string
  home_team_id: string | null
  away_team_id: string | null
  home_score: number | null
  away_score: number | null
  is_started: boolean | null
  is_complete: boolean | null
  plus_one_player_id: string | null
}

interface EventRow {
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

// 슛 유형 (야투)
const SHOT_TYPES = ['shot_layup', 'shot_2p_mid', 'shot_post', 'shot_3p'] as const

type PlayerStats = {
  fgm: number; fga: number
  pts: number
  reb: number; oreb: number; dreb: number
  ast: number; stl: number; blk: number
}

function emptyStats(): PlayerStats {
  return { fgm: 0, fga: 0, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0 }
}

// 이벤트 페이지네이션 조회
// winning_shot 판정용으로 video_timestamp 도 함께 select (실제 게임 시간 순서 · created_at/id 는 기록 순서라 부적합)
// 외부(상대) 팀 이벤트는 배지 대상이 아니다 — leagueStats.ts 와 동일하게 이벤트 단위로 거른다.
async function fetchEvents(supabase: SupabaseClient, gameId: string, externalTeamIds: Set<string>): Promise<EventRow[]> {
  const events: EventRow[] = []
  const PAGE = 1000
  for (let pg = 0; ; pg++) {
    const { data: chunk } = await supabase
      .from('league_game_events')
      .select('id, league_game_id, league_player_id, related_player_id, team_id, type, result, points, video_timestamp')
      .eq('league_game_id', gameId)
      .order('id', { ascending: true })
      .range(pg * PAGE, (pg + 1) * PAGE - 1)
    if (chunk && chunk.length > 0) {
      for (const e of chunk as EventRow[]) {
        if (e.team_id && externalTeamIds.has(e.team_id)) continue
        events.push(e)
      }
    }
    if (!chunk || chunk.length < PAGE) break
  }
  return events
}

// 리그 전체 plus_one 선수 fallback (game.plus_one_player_id 미지정 시)
async function fetchLeaguePlusOneSet(supabase: SupabaseClient, leagueId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('league_players')
    .select('id, plus_one')
    .eq('league_id', leagueId)
  return new Set((data ?? []).filter(p => p.plus_one).map(p => p.id as string))
}

// 이벤트 배열 → 선수별 박스스코어 누적 (기존 stats 를 mutate)
function accumulateStats(
  events: EventRow[],
  gamePlusOne: string | null,
  leaguePlusOneSet: Set<string>,
  ps: Record<string, PlayerStats>,
  rules: ScoringRules,
): void {
  const ensure = (pid: string): PlayerStats => {
    if (!ps[pid]) ps[pid] = emptyStats()
    return ps[pid]
  }
  for (const e of events) {
    const pid = e.league_player_id
    if (!pid) continue
    if (e.type === 'sub_in' || e.type === 'sub_out') continue
    const s = ensure(pid)
    const made = e.result === 'made'
    const isP1 = gamePlusOne !== null ? pid === gamePlusOne : leaguePlusOneSet.has(pid)

    // FGA/FGM — 자유투 제외 (perfect_game 조건)
    if ((SHOT_TYPES as readonly string[]).includes(e.type)) {
      s.fga++
      if (made) s.fgm++
    }
    // 득점
    if (made) s.pts += scorePoints(e.type, e.result, isP1, rules)

    switch (e.type) {
      case 'oreb': s.oreb++; s.reb++; break
      case 'dreb': s.dreb++; s.reb++; break
      case 'steal': s.stl++; break
      case 'block': s.blk++; break
    }

    // 어시스트: 슛 성공 이벤트의 related_player_id
    if (made && (SHOT_TYPES as readonly string[]).includes(e.type) && e.related_player_id) {
      ensure(e.related_player_id).ast++
    }
  }
}

/**
 * 게임 단위 배지 계산 (perfect_game + winning_shot).
 * 게임이 마감(is_complete=true)되지 않았거나 존재하지 않으면 [] 반환.
 */
export async function computePerGameBadges(
  supabase: SupabaseClient,
  gameId: string,
): Promise<BadgePayload[]> {
  const { data: game } = await supabase
    .from('league_games')
    .select('id, league_id, date, home_team_id, away_team_id, home_score, away_score, is_started, is_complete, plus_one_player_id')
    .eq('id', gameId)
    .maybeSingle()

  if (!game) return []
  const g = game as GameRow
  if (!g.is_complete) return []
  if (!g.date) return []
  if (!g.home_team_id || !g.away_team_id) return []

  const leaguePlusOneSet = await fetchLeaguePlusOneSet(supabase, g.league_id)
  const rules: ScoringRules = await fetchScoringRules(supabase, g.league_id)
  const externalTeamIds = await fetchExternalTeamIds(supabase, g.league_id)
  const gamePlusOne = g.plus_one_player_id ?? null
  const events = await fetchEvents(supabase, gameId, externalTeamIds)

  const ps: Record<string, PlayerStats> = {}
  accumulateStats(events, gamePlusOne, leaguePlusOneSet, ps, rules)

  const badges: BadgePayload[] = []
  const dateStr = g.date

  // ── perfect_game ──
  for (const [pid, s] of Object.entries(ps)) {
    if (s.fga >= 3 && s.fgm === s.fga) {
      badges.push({
        league_id: g.league_id,
        player_id: pid,
        game_id: g.id,
        badge_type: 'perfect_game',
        earned_at_date: dateStr,
        meta: { fgm: s.fgm, fga: s.fga, pts: s.pts },
      })
    }
  }

  // ── winning_shot ──
  // 정의: "본인의 결정적 득점으로 승리를 확정지음"
  //   1) 게임의 최종 승자 결정 (동점이면 위닝샷 없음)
  //   2) video_timestamp 최대인 득점 이벤트 = 실제 경기의 마지막 득점
  //      (created_at/id 는 기록자 입력 순서라 실제 게임 시간 순서와 다를 수 있음 · 2026-07-15 버그 수정)
  //   3) 그 이벤트의 선수 팀 == 승자 팀 이어야 함 (마지막 득점이 패자면 no badge)
  //   4) **결정타 검사** — 그 득점 없었으면 승리 못했어야 함
  //      승리 마진(winnerScore - loserScore) <= 그 득점(points_scored)
  //      · 24-10 (마진 14) 에서 마지막 득점 +2 → 마진 > 득점 → 결정타 아님 (no badge)
  //      · 15-14 (마진 1) 에서 마지막 득점 +3 → 마진 <= 득점 → 결정타 ✓
  const homeScore = g.home_score ?? 0
  const awayScore = g.away_score ?? 0
  let winnerTeamId: string | null = null
  if (homeScore > awayScore) winnerTeamId = g.home_team_id
  else if (awayScore > homeScore) winnerTeamId = g.away_team_id

  if (winnerTeamId) {
    // video_timestamp 있는 실제 득점 이벤트만 후보 · timestamp desc 정렬 후 첫 번째가 게임 마지막 슛
    const scoringEvents = events
      .filter(e => e.result === 'made' && e.league_player_id && e.team_id && e.video_timestamp !== null)
      .filter(e => {
        const isP1 = gamePlusOne !== null ? e.league_player_id === gamePlusOne : leaguePlusOneSet.has(e.league_player_id!)
        return scorePoints(e.type, e.result, isP1, rules) > 0
      })
      .sort((a, b) => (b.video_timestamp ?? 0) - (a.video_timestamp ?? 0))

    const lastShot = scoringEvents[0]
    if (lastShot && lastShot.team_id === winnerTeamId) {
      const pid = lastShot.league_player_id!
      const isP1 = gamePlusOne !== null ? pid === gamePlusOne : leaguePlusOneSet.has(pid)
      const pts = scorePoints(lastShot.type, lastShot.result, isP1, rules)
      const winnerFinal = winnerTeamId === g.home_team_id ? homeScore : awayScore
      const loserFinal  = winnerTeamId === g.home_team_id ? awayScore : homeScore
      const margin = winnerFinal - loserFinal
      // 결정타 조건: 그 득점 없으면 승리 못 함 (margin <= pts)
      if (margin <= pts) {
        badges.push({
          league_id: g.league_id,
          player_id: pid,
          game_id: g.id,
          badge_type: 'winning_shot',
          earned_at_date: dateStr,
          meta: {
            final_score_home: homeScore,
            final_score_away: awayScore,
            points_scored: pts,
            winning_margin: margin,
            event_type: lastShot.type,
            event_id: lastShot.id,
          },
        })
      }
    }
  }

  return badges
}

/**
 * 라운드 단위 배지 계산 (double_double + triple_double).
 * 해당 리그·해당 날짜의 모든 is_complete 게임 스탯을 선수별로 합산 후 판정.
 * game_id 는 항상 null.
 */
export async function computeRoundBadges(
  supabase: SupabaseClient,
  leagueId: string,
  date: string,
): Promise<BadgePayload[]> {
  if (!leagueId || !date) return []

  const { data: games } = await supabase
    .from('league_games')
    .select('id, league_id, date, home_team_id, away_team_id, home_score, away_score, is_started, is_complete, plus_one_player_id')
    .eq('league_id', leagueId)
    .eq('date', date)
    .eq('is_complete', true)
    .not('home_team_id', 'is', null)
    .not('away_team_id', 'is', null)

  const gameRows = (games ?? []) as GameRow[]
  if (gameRows.length === 0) return []

  const leaguePlusOneSet = await fetchLeaguePlusOneSet(supabase, leagueId)
  const rules: ScoringRules = await fetchScoringRules(supabase, leagueId)
  const externalTeamIds = await fetchExternalTeamIds(supabase, leagueId)

  // 라운드 전체를 순회하며 선수별 스탯 누적
  const ps: Record<string, PlayerStats> = {}
  const gameIdsByPlayer: Record<string, Set<string>> = {}

  for (const g of gameRows) {
    const events = await fetchEvents(supabase, g.id, externalTeamIds)
    const gamePlusOne = g.plus_one_player_id ?? null
    const beforePids = new Set(Object.keys(ps))
    accumulateStats(events, gamePlusOne, leaguePlusOneSet, ps, rules)
    // 이 게임에 참여한 선수 목록 = 스탯이 새로 잡힌 pid ∪ 이벤트에 등장한 pid
    for (const e of events) {
      const pid = e.league_player_id
      if (!pid) continue
      if (!gameIdsByPlayer[pid]) gameIdsByPlayer[pid] = new Set()
      gameIdsByPlayer[pid].add(g.id)
    }
    // 어시스트 related 도 참여로 인정 (스탯 누적된 어시스터)
    for (const pid of Object.keys(ps)) {
      if (!beforePids.has(pid) && !gameIdsByPlayer[pid]) {
        gameIdsByPlayer[pid] = new Set([g.id])
      }
    }
  }

  const badges: BadgePayload[] = []

  for (const [pid, s] of Object.entries(ps)) {
    const cats: Array<['pts'|'reb'|'ast'|'stl'|'blk', number]> = [
      ['pts', s.pts], ['reb', s.reb], ['ast', s.ast], ['stl', s.stl], ['blk', s.blk],
    ]
    const hitCats = cats.filter(([, v]) => v >= 10).map(([k]) => k)
    const gameIds = Array.from(gameIdsByPlayer[pid] ?? [])
    const gameCount = gameIds.length

    if (hitCats.length >= 3) {
      badges.push({
        league_id: leagueId,
        player_id: pid,
        game_id: null,
        badge_type: 'triple_double',
        earned_at_date: date,
        meta: {
          pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk,
          categories: hitCats,
          game_count: gameCount,
          game_ids: gameIds,
        },
      })
      // TD 부여 시 DD 는 배타적으로 미부여
    } else if (hitCats.length === 2) {
      badges.push({
        league_id: leagueId,
        player_id: pid,
        game_id: null,
        badge_type: 'double_double',
        earned_at_date: date,
        meta: {
          pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk,
          categories: hitCats,
          game_count: gameCount,
          game_ids: gameIds,
        },
      })
    }
  }

  return badges
}

/**
 * 게임 배지 재계산 → DB 반영 (idempotent).
 *   1) 게임 배지(perfect_game, winning_shot): game_id 매치 rows 삭제 후 재삽입.
 *   2) 라운드 배지(DD, TD): 그 게임 날짜의 라운드 배지 전체(같은 리그·같은 날짜·game_id=null)를
 *      삭제 후 재삽입 — 다른 게임이 같은 날 열렸을 때도 합산이 바뀌기 때문에 통째로 재계산.
 */
export async function syncBadgesForGame(
  supabase: SupabaseClient,
  gameId: string,
): Promise<{ created: number; removed: number }> {
  const { data: game } = await supabase
    .from('league_games')
    .select('id, league_id, date')
    .eq('id', gameId)
    .maybeSingle()
  if (!game) return { created: 0, removed: 0 }
  const leagueId = game.league_id as string
  const date = (game as { date: string | null }).date

  let removed = 0
  let created = 0

  // ── (1) 게임 단위 배지 ──
  const { data: existingGame } = await supabase
    .from('player_badges')
    .select('id')
    .eq('game_id', gameId)
  const removedGame = existingGame?.length ?? 0
  if (removedGame > 0) {
    await supabase.from('player_badges').delete().eq('game_id', gameId)
  }
  removed += removedGame

  const perGame = await computePerGameBadges(supabase, gameId)
  if (perGame.length > 0) {
    const { error } = await supabase.from('player_badges').insert(perGame)
    if (error) throw new Error(`player_badges (per-game) insert failed: ${error.message}`)
    created += perGame.length
  }

  // ── (2) 라운드 배지 — 그 날짜의 라운드 배지 전체 재계산 ──
  if (date) {
    const { data: existingRound } = await supabase
      .from('player_badges')
      .select('id')
      .eq('league_id', leagueId)
      .eq('earned_at_date', date)
      .is('game_id', null)
    const removedRound = existingRound?.length ?? 0
    if (removedRound > 0) {
      await supabase
        .from('player_badges')
        .delete()
        .eq('league_id', leagueId)
        .eq('earned_at_date', date)
        .is('game_id', null)
    }
    removed += removedRound

    const round = await computeRoundBadges(supabase, leagueId, date)
    if (round.length > 0) {
      const { error } = await supabase.from('player_badges').insert(round)
      if (error) throw new Error(`player_badges (round) insert failed: ${error.message}`)
      created += round.length
    }
  }

  return { created, removed }
}
