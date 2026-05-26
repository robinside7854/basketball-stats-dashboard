// API의 정확한 집계 로직을 재현해서 차이 찾기
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
const env = Object.fromEntries(
  envText.split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: kim } = await supabase.from('league_players').select('id, league_id, plus_one').ilike('name', '%김로빈%').single()
const { data: t } = await supabase.from('league_teams').select('id').ilike('name', '%락다운%').single()
const playerId = kim.id
const teamId = t.id
const leagueId = kim.league_id

// 1) is_started 게임 + plus_one_player_id 오버라이드
const { data: games } = await supabase
  .from('league_games')
  .select('id, plus_one_player_id')
  .eq('league_id', leagueId)
  .eq('is_started', true)
const gameIds = games.map(g => g.id)
const gamePlusOneMap = Object.fromEntries(games.map(g => [g.id, g.plus_one_player_id ?? null]))

// 2) all league players' plus_one flags
const { data: lps } = await supabase.from('league_players').select('id, plus_one').eq('league_id', leagueId)
const plusOneSet = new Set(lps.filter(p => p.plus_one).map(p => p.id))

// 3) 김로빈 @ 락다운 이벤트 (페이지네이션)
const PAGE = 1000
const events = []
let page = 0
while (true) {
  const { data } = await supabase
    .from('league_game_events')
    .select('league_game_id, type, result, team_id, league_player_id, related_player_id')
    .in('league_game_id', gameIds)
    .eq('team_id', teamId)
    .eq('league_player_id', playerId)
    .range(page * PAGE, (page + 1) * PAGE - 1)
  if (data?.length) events.push(...data)
  if (!data || data.length < PAGE) break
  page++
}

console.log(`📦 김로빈 @ 락다운 이벤트: ${events.length}`)

// API 와 동일한 집계 로직
let pts = 0, fgm = 0, fga = 0, fg3m = 0, fg3a = 0, ftm = 0, fta = 0

for (const e of events) {
  if (!e.league_player_id) continue
  const made = e.result === 'made'
  const gamePlusOneOverride = gamePlusOneMap[e.league_game_id]
  const isPlusOne = gamePlusOneOverride !== null
    ? playerId === gamePlusOneOverride
    : plusOneSet.has(playerId)

  switch (e.type) {
    case 'shot_3p':
      fg3a++; fga++
      if (made) { fg3m++; fgm++; pts += isPlusOne ? 4 : 3 }
      break
    case 'shot_2p_mid':
    case 'shot_layup':
    case 'shot_post':
    case 'shot_2p_drive':
      fga++
      if (made) { fgm++; pts += isPlusOne ? 3 : 2 }
      break
    case 'and_one':
      if (made) { pts += 1 }
      break
    case 'ft_2pt':
      fta++; if (made) { ftm++; pts += 2 }; break
    case 'ft_3pt_1':
      fta++; if (made) { ftm++; pts += 2 }; break
    case 'free_throw':
    case 'ft_3pt_2':
      fta++; if (made) { ftm++; pts += 1 }; break
  }
}
console.log(`📊 API 로직 결과:    PTS=${pts}, FG=${fgm}/${fga}, 3P=${fg3m}/${fg3a}, FT=${ftm}/${fta}`)
console.log(`📊 API 응답 비교:    PTS=352, FG=152/282, 3P=20/75 (Vercel)`)

// 이제 teamId 필터 없이 — 본인이 락다운으로 뛴 이벤트만 (team_id=락다운 AND player_id=김로빈)
// 이것과 위가 같아야 함. 같으면 → API 응답이 다른 이유는 무엇?

// 또한 어시스트 (related_player_id=김로빈) 처리도 추가 — API는 이걸로 ast 카운트
let ast = 0
const assistsEvents = []
let ap = 0
while (true) {
  const { data } = await supabase
    .from('league_game_events')
    .select('league_game_id, type, result, team_id, related_player_id')
    .in('league_game_id', gameIds)
    .eq('team_id', teamId)
    .eq('related_player_id', playerId)
    .eq('result', 'made')
    .in('type', ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive'])
    .range(ap * PAGE, (ap + 1) * PAGE - 1)
  if (data?.length) { assistsEvents.push(...data); ast += data.length }
  if (!data || data.length < PAGE) break
  ap++
}
console.log(`📊 김로빈 어시스트 @ 락다운: ${ast}`)
