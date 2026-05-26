// API 의 정확한 로직 (전체 팀 이벤트 fetch → 선수별 집계) 재현
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const env = Object.fromEntries(
  readFileSync(resolve('.env.local'), 'utf-8').split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const L = '8eda8257-8907-4bf3-a7de-e5e7fde54a89'
const T = '75140c73-204c-47ee-9930-c69d56b20186'
const PID = 'de588497-78ed-472c-b3b0-f2b43c63e506'

// is_started 게임
const { data: games } = await supabase.from('league_games')
  .select('id, plus_one_player_id, date, round_num')
  .eq('league_id', L).eq('is_started', true)
const gameIds = games.map(g => g.id)
console.log('🎮 is_started 게임:', gameIds.length)

const gamePlusOneMap = Object.fromEntries(games.map(g => [g.id, g.plus_one_player_id ?? null]))

// 선수 plus_one
const { data: lps } = await supabase.from('league_players').select('id, plus_one').eq('league_id', L)
const plusOneSet = new Set(lps.filter(p => p.plus_one).map(p => p.id))

// 락다운 이벤트 페이지네이션 (API 와 동일)
const PAGE = 1000
const events = []
let page = 0
while (true) {
  const { data } = await supabase.from('league_game_events')
    .select('league_player_id, related_player_id, team_id, type, result, points, league_game_id')
    .in('league_game_id', gameIds)
    .not('league_player_id', 'is', null)
    .eq('team_id', T)
    .range(page * PAGE, (page + 1) * PAGE - 1)
  if (data?.length) events.push(...data)
  if (!data || data.length < PAGE) break
  page++
}
console.log('📦 락다운 이벤트 전체:', events.length, '(페이지:', page + 1, ')')

// 김로빈 이벤트만 카운트
const kimEvents = events.filter(e => e.league_player_id === PID)
console.log('📦 그중 김로빈:', kimEvents.length)

// API 로직 그대로 — 모든 선수 집계
const statsMap = {}
for (const e of events) {
  if (!e.league_player_id) continue
  const pid = e.league_player_id
  if (!statsMap[pid]) statsMap[pid] = { pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0 }
  const s = statsMap[pid]
  const made = e.result === 'made'
  const gpo = gamePlusOneMap[e.league_game_id]
  const isPlusOne = gpo !== null ? pid === gpo : plusOneSet.has(pid)

  switch (e.type) {
    case 'shot_3p':
      s.fg3a++; s.fga++
      if (made) { s.fg3m++; s.fgm++; s.pts += isPlusOne ? 4 : 3 }
      break
    case 'shot_2p_mid':
    case 'shot_layup':
    case 'shot_post':
    case 'shot_2p_drive':
      s.fga++
      if (made) { s.fgm++; s.pts += isPlusOne ? 3 : 2 }
      break
    case 'and_one':
      if (made) s.pts += 1
      break
    case 'ft_2pt':
      s.fta++; if (made) { s.ftm++; s.pts += 2 }; break
    case 'ft_3pt_1':
      s.fta++; if (made) { s.ftm++; s.pts += 2 }; break
    case 'free_throw':
    case 'ft_3pt_2':
      s.fta++; if (made) { s.ftm++; s.pts += 1 }; break
  }
}

console.log()
const kim = statsMap[PID]
console.log('📊 김로빈 락다운 (재현 결과):')
console.log('   PTS=' + kim.pts + ', FG=' + kim.fgm + '/' + kim.fga + ', 3P=' + kim.fg3m + '/' + kim.fg3a)
console.log()
console.log('🌐 Vercel API:        PTS=352, FG=152/282, 3P=20/75')
console.log('🧪 단일 fetch+로직:    PTS=407, FG=176/331, 3P=23/93')
console.log()
console.log('차이가 있으면 → events 수가 다른 것. 확인:', events.length, 'vs Vercel API 내부 페이지네이션')
