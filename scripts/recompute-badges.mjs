// 자동 배지 초기 재계산 (mjs 인라인 로직)
//
// 4종 배지:
//   perfect_game / winning_shot : 게임 단위 (player_badges.game_id = 게임 UUID)
//   double_double / triple_double : 라운드(=날짜) 단위 (game_id = NULL, 그 날 리그 스탯 합산)
//
// 로직은 src/lib/badges/computeBadges.ts 와 동일.
//
// 사용:
//   node scripts/recompute-badges.mjs            # 전 리그 재계산
//   node scripts/recompute-badges.mjs <leagueId> # 특정 리그만

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const targetLeagueId = process.argv[2] ?? null

const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
const env = Object.fromEntries(
  envText.split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const SHOT_TYPES = new Set(['shot_layup', 'shot_2p_drive', 'shot_2p_mid', 'shot_post', 'shot_3p'])

function eventPointValue(type, isPlusOne) {
  switch (type) {
    case 'shot_3p':      return isPlusOne ? 4 : 3
    case 'shot_post':
    case 'shot_layup':
    case 'shot_2p_drive':
    case 'shot_2p_mid':  return isPlusOne ? 3 : 2
    case 'ft_2pt':
    case 'ft_3pt_1':     return 2
    case 'free_throw':
    case 'ft_3pt_2':     return 1
    case 'and_one':      return 1
    default:             return 0
  }
}

function emptyStats() {
  return { fgm: 0, fga: 0, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0 }
}

async function fetchEvents(gameId) {
  const events = []
  const PAGE = 1000
  for (let pg = 0; ; pg++) {
    const { data: chunk, error } = await supabase
      .from('league_game_events')
      .select('id, league_game_id, league_player_id, related_player_id, team_id, type, result, points')
      .eq('league_game_id', gameId)
      .order('id', { ascending: true })
      .range(pg * PAGE, (pg + 1) * PAGE - 1)
    if (error) throw new Error(`events fetch: ${error.message}`)
    if (chunk && chunk.length > 0) events.push(...chunk)
    if (!chunk || chunk.length < PAGE) break
  }
  return events
}

function accumulateStats(events, gamePlusOne, leaguePlusOneSet, ps) {
  const ensure = pid => {
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

    if (SHOT_TYPES.has(e.type)) {
      s.fga++
      if (made) s.fgm++
    }
    if (made) s.pts += eventPointValue(e.type, isP1)

    switch (e.type) {
      case 'oreb': s.oreb++; s.reb++; break
      case 'dreb': s.dreb++; s.reb++; break
      case 'steal': s.stl++; break
      case 'block': s.blk++; break
    }
    if (made && SHOT_TYPES.has(e.type) && e.related_player_id) {
      ensure(e.related_player_id).ast++
    }
  }
}

// 게임 단위 배지 (perfect_game + winning_shot)
function computePerGameBadges(game, events, leaguePlusOneSet) {
  const gamePlusOne = game.plus_one_player_id ?? null
  const ps = {}
  accumulateStats(events, gamePlusOne, leaguePlusOneSet, ps)

  const badges = []
  const dateStr = game.date

  // perfect_game
  for (const [pid, s] of Object.entries(ps)) {
    if (s.fga >= 3 && s.fgm === s.fga) {
      badges.push({
        league_id: game.league_id, player_id: pid, game_id: game.id,
        badge_type: 'perfect_game', earned_at_date: dateStr,
        meta: { fgm: s.fgm, fga: s.fga, pts: s.pts },
      })
    }
  }

  // winning_shot — 마지막 득점 이벤트의 선수 팀이 승자면 부여
  const homeScore = game.home_score ?? 0
  const awayScore = game.away_score ?? 0
  let winnerTeamId = null
  if (homeScore > awayScore) winnerTeamId = game.home_team_id
  else if (awayScore > homeScore) winnerTeamId = game.away_team_id

  if (winnerTeamId) {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (e.result !== 'made') continue
      const pid = e.league_player_id
      if (!pid || !e.team_id) continue
      const isP1 = gamePlusOne !== null ? pid === gamePlusOne : leaguePlusOneSet.has(pid)
      const pts = eventPointValue(e.type, isP1)
      if (pts <= 0) continue
      if (e.team_id === winnerTeamId) {
        const winnerFinal = winnerTeamId === game.home_team_id ? homeScore : awayScore
        const loserFinal  = winnerTeamId === game.home_team_id ? awayScore : homeScore
        const margin = winnerFinal - loserFinal
        // 결정타 조건: margin <= pts (그 득점 없이는 승리 못했어야 함)
        if (margin <= pts) {
          badges.push({
            league_id: game.league_id, player_id: pid, game_id: game.id,
            badge_type: 'winning_shot', earned_at_date: dateStr,
            meta: {
              final_score_home: homeScore,
              final_score_away: awayScore,
              points_scored: pts,
              winning_margin: margin,
              event_type: e.type,
              event_id: e.id,
            },
          })
        }
      }
      break // 마지막 득점이 패자 팀이거나 결정타 아니면 아무도 부여 안 됨
    }
  }

  return badges
}

async function main() {
  console.log('▶ 배지 재계산 시작', targetLeagueId ? `(league=${targetLeagueId})` : '(전 리그)')

  let gamesQuery = supabase
    .from('league_games')
    .select('id, league_id, date, home_team_id, away_team_id, home_score, away_score, is_started, is_complete, plus_one_player_id')
    .eq('is_complete', true)
    .not('date', 'is', null)
    .not('home_team_id', 'is', null)
    .not('away_team_id', 'is', null)
  if (targetLeagueId) gamesQuery = gamesQuery.eq('league_id', targetLeagueId)
  const { data: games, error: gErr } = await gamesQuery
  if (gErr) throw new Error(`games fetch: ${gErr.message}`)
  console.log(`✔ 대상 게임 ${games?.length ?? 0}건`)
  if (!games || games.length === 0) return

  // 리그별 plus_one 캐시
  const plusOneCacheByLeague = new Map()
  async function getPlusOneSet(leagueId) {
    if (plusOneCacheByLeague.has(leagueId)) return plusOneCacheByLeague.get(leagueId)
    const { data } = await supabase
      .from('league_players')
      .select('id, plus_one')
      .eq('league_id', leagueId)
    const set = new Set((data ?? []).filter(p => p.plus_one).map(p => p.id))
    plusOneCacheByLeague.set(leagueId, set)
    return set
  }

  // ── STEP 1: 게임 단위 배지 재계산 (perfect_game + winning_shot) ──
  console.log('\n▶ STEP 1: 게임 단위 배지 (perfect_game + winning_shot)')
  const eventsCache = new Map() // gameId -> events (재사용)

  let totalCreatedGame = 0, totalRemovedGame = 0, processedGame = 0, failedGame = 0
  for (const game of games) {
    try {
      const plusOneSet = await getPlusOneSet(game.league_id)
      const events = await fetchEvents(game.id)
      eventsCache.set(game.id, events)
      const payloads = computePerGameBadges(game, events, plusOneSet)

      // 기존 게임 단위 배지 삭제 (game_id 매치)
      const { data: existing } = await supabase
        .from('player_badges')
        .select('id')
        .eq('game_id', game.id)
      const removed = existing?.length ?? 0
      if (removed > 0) {
        await supabase.from('player_badges').delete().eq('game_id', game.id)
      }
      if (payloads.length > 0) {
        const { error: insErr } = await supabase.from('player_badges').insert(payloads)
        if (insErr) throw new Error(insErr.message)
      }
      totalCreatedGame += payloads.length
      totalRemovedGame += removed
      processedGame++
      if (payloads.length > 0) {
        console.log(`  ${game.date} · ${game.id.slice(0, 8)} → +${payloads.length} (- ${removed})`)
      }
    } catch (err) {
      failedGame++
      console.error(`  ✗ ${game.id}: ${err.message}`)
    }
  }
  console.log(`  → 처리 ${processedGame} · 신규 ${totalCreatedGame} · 삭제 ${totalRemovedGame} · 실패 ${failedGame}`)

  // ── STEP 2: 라운드 단위 배지 재계산 (DD + TD, game_id=null) ──
  console.log('\n▶ STEP 2: 라운드 단위 배지 (double_double + triple_double)')

  // (leagueId, date) 유일 쌍 목록
  const roundMap = new Map() // key: `${league}|${date}` → { leagueId, date, games: [] }
  for (const g of games) {
    const key = `${g.league_id}|${g.date}`
    if (!roundMap.has(key)) roundMap.set(key, { leagueId: g.league_id, date: g.date, games: [] })
    roundMap.get(key).games.push(g)
  }
  console.log(`✔ 대상 라운드 ${roundMap.size}개`)

  let totalCreatedRound = 0, totalRemovedRound = 0, processedRound = 0, failedRound = 0
  for (const { leagueId, date, games: gamesOfDate } of roundMap.values()) {
    try {
      const plusOneSet = await getPlusOneSet(leagueId)

      // 캐시된 이벤트 재사용 (STEP1 에서 미리 로드했음)
      // computeRoundBadges 는 자체적으로 fetchEvents 를 호출하므로,
      // 캐시가 있는 경우를 위해 인라인 처리
      const ps = {}
      const gameIdsByPlayer = {}
      for (const g of gamesOfDate) {
        const events = eventsCache.get(g.id) ?? await fetchEvents(g.id)
        const gamePlusOne = g.plus_one_player_id ?? null
        accumulateStats(events, gamePlusOne, plusOneSet, ps)
        for (const e of events) {
          const pid = e.league_player_id
          if (!pid) continue
          if (!gameIdsByPlayer[pid]) gameIdsByPlayer[pid] = new Set()
          gameIdsByPlayer[pid].add(g.id)
        }
      }

      const payloads = []
      for (const [pid, s] of Object.entries(ps)) {
        const cats = [
          ['pts', s.pts], ['reb', s.reb], ['ast', s.ast], ['stl', s.stl], ['blk', s.blk],
        ]
        const hitCats = cats.filter(([, v]) => v >= 10).map(([k]) => k)
        const gameIds = Array.from(gameIdsByPlayer[pid] ?? [])
        const gameCount = gameIds.length
        if (hitCats.length >= 3) {
          payloads.push({
            league_id: leagueId, player_id: pid, game_id: null,
            badge_type: 'triple_double', earned_at_date: date,
            meta: { pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, categories: hitCats, game_count: gameCount, game_ids: gameIds },
          })
        } else if (hitCats.length === 2) {
          payloads.push({
            league_id: leagueId, player_id: pid, game_id: null,
            badge_type: 'double_double', earned_at_date: date,
            meta: { pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, categories: hitCats, game_count: gameCount, game_ids: gameIds },
          })
        }
      }

      // 기존 라운드 배지 삭제 (game_id IS NULL 인 rows)
      const { data: existing } = await supabase
        .from('player_badges')
        .select('id')
        .eq('league_id', leagueId)
        .eq('earned_at_date', date)
        .is('game_id', null)
      const removed = existing?.length ?? 0
      if (removed > 0) {
        await supabase
          .from('player_badges')
          .delete()
          .eq('league_id', leagueId)
          .eq('earned_at_date', date)
          .is('game_id', null)
      }
      if (payloads.length > 0) {
        const { error: insErr } = await supabase.from('player_badges').insert(payloads)
        if (insErr) throw new Error(insErr.message)
      }
      totalCreatedRound += payloads.length
      totalRemovedRound += removed
      processedRound++
      if (payloads.length > 0) {
        console.log(`  ${date} · league=${leagueId.slice(0, 8)} → +${payloads.length} (- ${removed})`)
      }
    } catch (err) {
      failedRound++
      console.error(`  ✗ round ${leagueId.slice(0, 8)}·${date}: ${err.message}`)
    }
  }
  console.log(`  → 처리 ${processedRound} · 신규 ${totalCreatedRound} · 삭제 ${totalRemovedRound} · 실패 ${failedRound}`)

  console.log()
  console.log(`▶ 완료`)
  console.log(`   게임배지: 신규 ${totalCreatedGame} / 삭제 ${totalRemovedGame}`)
  console.log(`   라운드배지: 신규 ${totalCreatedRound} / 삭제 ${totalRemovedRound}`)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
