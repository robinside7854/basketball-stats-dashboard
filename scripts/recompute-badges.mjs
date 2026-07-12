// 자동 배지 초기 재계산 — is_complete=true 전 게임 대상
//
// 4종 배지 (perfect_game / double_double / triple_double / winning_shot)
// 로직은 src/lib/badges/computeBadges.ts 와 동일 (mjs 로 인라인).
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

async function fetchEventsForGame(gameId) {
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

async function computeBadgesForGame(game, leaguePlusOneSet) {
  const events = await fetchEventsForGame(game.id)
  const gamePlusOne = game.plus_one_player_id ?? null

  const ps = {}
  const ensure = pid => {
    if (!ps[pid]) ps[pid] = { fgm: 0, fga: 0, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0 }
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

  const badges = []
  const dateStr = game.date

  // perfect / DD / TD
  for (const [pid, s] of Object.entries(ps)) {
    if (s.fga >= 3 && s.fgm === s.fga) {
      badges.push({
        league_id: game.league_id, player_id: pid, game_id: game.id,
        badge_type: 'perfect_game', earned_at_date: dateStr,
        meta: { fgm: s.fgm, fga: s.fga, pts: s.pts },
      })
    }
    const cats = [
      ['pts', s.pts], ['reb', s.reb], ['ast', s.ast], ['stl', s.stl], ['blk', s.blk],
    ]
    const hitCats = cats.filter(([, v]) => v >= 10).map(([k]) => k)
    if (hitCats.length >= 3) {
      badges.push({
        league_id: game.league_id, player_id: pid, game_id: game.id,
        badge_type: 'triple_double', earned_at_date: dateStr,
        meta: { pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, categories: hitCats },
      })
    } else if (hitCats.length === 2) {
      badges.push({
        league_id: game.league_id, player_id: pid, game_id: game.id,
        badge_type: 'double_double', earned_at_date: dateStr,
        meta: { pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, categories: hitCats },
      })
    }
  }

  // winning_shot
  const homeScore = game.home_score ?? 0
  const awayScore = game.away_score ?? 0
  let winnerTeamId = null
  if (homeScore > awayScore) winnerTeamId = game.home_team_id
  else if (awayScore > homeScore) winnerTeamId = game.away_team_id

  if (winnerTeamId) {
    let rh = 0, ra = 0
    const snapshots = []
    for (let i = 0; i < events.length; i++) {
      const e = events[i]
      let pts = 0
      let scored = false
      const made = e.result === 'made'
      if (made) {
        const pid = e.league_player_id
        const isP1 = pid && (gamePlusOne !== null ? pid === gamePlusOne : leaguePlusOneSet.has(pid))
        pts = eventPointValue(e.type, !!isP1)
        if (pts > 0 && e.team_id) {
          scored = true
          if (e.team_id === game.home_team_id) rh += pts
          else if (e.team_id === game.away_team_id) ra += pts
        }
      }
      snapshots.push({
        evtIdx: i, home: rh, away: ra, scored,
        scorer: e.league_player_id, scorerTeam: e.team_id,
        points: pts, type: e.type,
      })
    }

    let lastNotLeadingIdx = -1
    for (let i = snapshots.length - 1; i >= 0; i--) {
      const s = snapshots[i]
      const winnerLeadNow = winnerTeamId === game.home_team_id ? s.home > s.away : s.away > s.home
      if (!winnerLeadNow) { lastNotLeadingIdx = i; break }
    }
    if (lastNotLeadingIdx >= 0) {
      for (let i = lastNotLeadingIdx + 1; i < snapshots.length; i++) {
        const s = snapshots[i]
        if (s.scored && s.scorerTeam === winnerTeamId && s.scorer) {
          const winnerLeadAfter = winnerTeamId === game.home_team_id ? s.home > s.away : s.away > s.home
          if (!winnerLeadAfter) continue
          badges.push({
            league_id: game.league_id, player_id: s.scorer, game_id: game.id,
            badge_type: 'winning_shot', earned_at_date: dateStr,
            meta: {
              before_score_home: winnerTeamId === game.home_team_id ? s.home - s.points : s.home,
              before_score_away: winnerTeamId === game.away_team_id ? s.away - s.points : s.away,
              after_score_home: s.home, after_score_away: s.away,
              points_scored: s.points, event_type: s.type, event_seq: s.evtIdx,
            },
          })
          break
        }
      }
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

  // 리그별 plus_one 선수 캐시
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

  let totalCreated = 0, totalRemoved = 0, processed = 0, failed = 0

  for (const game of games) {
    try {
      const plusOneSet = await getPlusOneSet(game.league_id)
      const payloads = await computeBadgesForGame(game, plusOneSet)

      // 기존 삭제
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
      totalCreated += payloads.length
      totalRemoved += removed
      processed++
      if (payloads.length > 0) {
        console.log(`  ${game.date} · ${game.id.slice(0, 8)} → +${payloads.length} (- ${removed})`)
      }
    } catch (err) {
      failed++
      console.error(`  ✗ ${game.id}: ${err.message}`)
    }
  }

  console.log()
  console.log(`▶ 완료: 처리 ${processed} · 신규 ${totalCreated} · 삭제 ${totalRemoved} · 실패 ${failed}`)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
