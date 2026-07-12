// 자동 배지 계산 — 게임 단위
//
// 4종 배지:
//  1) perfect_game    — FGM/FGA=100% (FGA>=3, 자유투 제외)
//  2) double_double   — pts/reb/ast/stl/blk 중 정확히 2개 >= 10
//  3) triple_double   — 정확히 3개 이상 >= 10 (배타적)
//  4) winning_shot    — 승자 팀이 마지막으로 리드를 뒤집은 그 득점 이벤트의 선수
//                       (승자가 처음부터 리드했다면 위닝샷 없음)
//
// league_game_events 는 페이지네이션(1000 단위) 필수 — leagueStats.ts 패턴 참고.

import type { SupabaseClient } from '@supabase/supabase-js'

export type BadgeType = 'perfect_game' | 'double_double' | 'triple_double' | 'winning_shot'

export interface BadgePayload {
  league_id: string
  player_id: string
  game_id: string
  badge_type: BadgeType
  earned_at_date: string   // YYYY-MM-DD
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
}

// 슛 유형 (야투)
const SHOT_TYPES = ['shot_layup', 'shot_2p_drive', 'shot_2p_mid', 'shot_post', 'shot_3p'] as const

// 득점 이벤트 → 득점량 (isPlusOne 반영)
function eventPointValue(type: string, isPlusOne: boolean): number {
  switch (type) {
    case 'shot_3p':    return isPlusOne ? 4 : 3
    case 'shot_post':
    case 'shot_layup':
    case 'shot_2p_drive':
    case 'shot_2p_mid': return isPlusOne ? 3 : 2
    case 'ft_2pt':
    case 'ft_3pt_1':   return 2
    case 'free_throw':
    case 'ft_3pt_2':   return 1
    case 'and_one':    return 1
    default:           return 0
  }
}

/**
 * 특정 게임의 배지 계산.
 * 반환값은 DB에 그대로 upsert 할 payload 배열.
 * 게임이 마감(is_complete=true)되지 않았거나 존재하지 않으면 [] 반환.
 */
export async function computeBadgesForGame(
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

  // 리그 전체 plus_one 선수 (fallback — game.plus_one_player_id 가 없을 때만)
  const { data: leaguePlayers } = await supabase
    .from('league_players')
    .select('id, plus_one')
    .eq('league_id', g.league_id)
  const plusOneSet = new Set((leaguePlayers ?? []).filter(p => p.plus_one).map(p => p.id as string))
  const gamePlusOne = g.plus_one_player_id ?? null

  // 이벤트 페이지네이션 (id 오름차순 = 시간순)
  const events: EventRow[] = []
  const PAGE = 1000
  for (let pg = 0; ; pg++) {
    const { data: chunk } = await supabase
      .from('league_game_events')
      .select('id, league_game_id, league_player_id, related_player_id, team_id, type, result, points')
      .eq('league_game_id', gameId)
      .order('id', { ascending: true })
      .range(pg * PAGE, (pg + 1) * PAGE - 1)
    if (chunk && chunk.length > 0) events.push(...(chunk as EventRow[]))
    if (!chunk || chunk.length < PAGE) break
  }

  // ── 참여 선수별 박스스코어 (perfect/DD/TD 계산용) ──
  type PS = {
    fgm: number; fga: number
    pts: number
    reb: number; oreb: number; dreb: number
    ast: number; stl: number; blk: number
  }
  const ps: Record<string, PS> = {}
  const ensure = (pid: string): PS => {
    if (!ps[pid]) ps[pid] = { fgm: 0, fga: 0, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0 }
    return ps[pid]
  }

  for (const e of events) {
    const pid = e.league_player_id
    if (!pid) continue
    if (e.type === 'sub_in' || e.type === 'sub_out') continue
    const s = ensure(pid)
    const made = e.result === 'made'
    const isP1 = gamePlusOne !== null ? pid === gamePlusOne : plusOneSet.has(pid)

    // FGA/FGM — 자유투 제외 (perfect_game 조건)
    if ((SHOT_TYPES as readonly string[]).includes(e.type)) {
      s.fga++
      if (made) s.fgm++
    }
    // 득점
    if (made) s.pts += eventPointValue(e.type, isP1)

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

  const badges: BadgePayload[] = []
  const dateStr = g.date

  // ── perfect_game / double_double / triple_double ──
  for (const [pid, s] of Object.entries(ps)) {
    // perfect_game: FGA >= 3, FGM/FGA = 100%
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

    // DD/TD — 5개 카테고리 중 >=10 개수
    const cats: Array<['pts'|'reb'|'ast'|'stl'|'blk', number]> = [
      ['pts', s.pts], ['reb', s.reb], ['ast', s.ast], ['stl', s.stl], ['blk', s.blk],
    ]
    const hitCats = cats.filter(([, v]) => v >= 10).map(([k]) => k)
    if (hitCats.length >= 3) {
      badges.push({
        league_id: g.league_id,
        player_id: pid,
        game_id: g.id,
        badge_type: 'triple_double',
        earned_at_date: dateStr,
        meta: { pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, categories: hitCats },
      })
      // TD 부여 시 DD 는 배타적으로 미부여 (기획 규칙)
    } else if (hitCats.length === 2) {
      badges.push({
        league_id: g.league_id,
        player_id: pid,
        game_id: g.id,
        badge_type: 'double_double',
        earned_at_date: dateStr,
        meta: { pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, categories: hitCats },
      })
    }
  }

  // ── winning_shot ──
  // 알고리즘:
  //  1) 이벤트 시간순으로 running (homeScore, awayScore) 계산
  //  2) 최종 승자 결정 — 무승부이거나 결정 못하면 위닝샷 없음
  //  3) 이벤트 뒤에서 앞으로 순회하며 "그 이벤트 직후 시점에 승자가 리드하지 않았던(뒤지거나 동점)"
  //     가장 마지막 시점 idx 를 찾음. 그 다음 득점 이벤트(승자 팀 득점)가 위닝샷.
  //  4) 승자가 게임 내내 리드/동점 시작만 있었다면 (never trailed after any moment)
  //     위닝샷 없음.
  const homeScore = g.home_score ?? 0
  const awayScore = g.away_score ?? 0
  let winnerTeamId: string | null = null
  if (homeScore > awayScore) winnerTeamId = g.home_team_id
  else if (awayScore > homeScore) winnerTeamId = g.away_team_id

  if (winnerTeamId) {
    // running score 배열
    let rh = 0, ra = 0
    type Snapshot = { evtIdx: number; home: number; away: number; scored: boolean; scorer: string | null; scorerTeam: string | null; points: number; type: string }
    const snapshots: Snapshot[] = []
    for (let i = 0; i < events.length; i++) {
      const e = events[i]
      let pts = 0
      let scored = false
      const made = e.result === 'made'
      if (made) {
        const pid = e.league_player_id
        const isP1 = pid && (gamePlusOne !== null ? pid === gamePlusOne : plusOneSet.has(pid))
        pts = eventPointValue(e.type, !!isP1)
        if (pts > 0 && e.team_id) {
          scored = true
          if (e.team_id === g.home_team_id) rh += pts
          else if (e.team_id === g.away_team_id) ra += pts
        }
      }
      snapshots.push({
        evtIdx: i, home: rh, away: ra, scored,
        scorer: e.league_player_id, scorerTeam: e.team_id,
        points: pts, type: e.type,
      })
    }

    // 승자가 리드하지 않은 마지막 시점의 다음 득점 이벤트를 위닝샷으로 정의.
    // 뒤에서 앞으로 순회:
    // 마지막 "not-leading" moment 찾기 → 그 이후 첫 winner-team scored event.
    let lastNotLeadingIdx = -1
    for (let i = snapshots.length - 1; i >= 0; i--) {
      const s = snapshots[i]
      const winnerLeadNow = winnerTeamId === g.home_team_id ? s.home > s.away : s.away > s.home
      if (!winnerLeadNow) {
        lastNotLeadingIdx = i
        break
      }
    }

    if (lastNotLeadingIdx >= 0) {
      // 그 다음 승자팀 득점 이벤트 (같은 시점 다음)
      for (let i = lastNotLeadingIdx + 1; i < snapshots.length; i++) {
        const s = snapshots[i]
        if (s.scored && s.scorerTeam === winnerTeamId && s.scorer) {
          // 리드 확정 여부 확인 — 이 이벤트로 승자 리드로 전환됐는지
          const winnerLeadAfter = winnerTeamId === g.home_team_id ? s.home > s.away : s.away > s.home
          if (!winnerLeadAfter) continue  // 이 득점으로도 리드 안 됐다면 계속
          badges.push({
            league_id: g.league_id,
            player_id: s.scorer,
            game_id: g.id,
            badge_type: 'winning_shot',
            earned_at_date: dateStr,
            meta: {
              before_score_home: winnerTeamId === g.home_team_id ? s.home - s.points : s.home,
              before_score_away: winnerTeamId === g.away_team_id ? s.away - s.points : s.away,
              after_score_home: s.home,
              after_score_away: s.away,
              points_scored: s.points,
              event_type: s.type,
              event_seq: s.evtIdx,
            },
          })
          break
        }
      }
    }
    // else: 승자가 처음부터(또는 first scoring moment 부터) 계속 리드 — 위닝샷 없음
  }

  return badges
}

/**
 * 게임 배지 재계산 → DB 반영 (idempotent).
 * 기존 배지 삭제 후 신규 insert.
 * 반환: { created, removed }
 */
export async function syncBadgesForGame(
  supabase: SupabaseClient,
  gameId: string,
): Promise<{ created: number; removed: number }> {
  // 기존 삭제
  const { data: existing } = await supabase
    .from('player_badges')
    .select('id')
    .eq('game_id', gameId)
  const removed = existing?.length ?? 0
  if (removed > 0) {
    await supabase.from('player_badges').delete().eq('game_id', gameId)
  }

  const payloads = await computeBadgesForGame(supabase, gameId)
  if (payloads.length === 0) return { created: 0, removed }

  const { error } = await supabase.from('player_badges').insert(payloads)
  if (error) {
    // 삽입 실패 시 삭제만 반영된 상태 — 에러 전파
    throw new Error(`player_badges insert failed: ${error.message}`)
  }
  return { created: payloads.length, removed }
}
