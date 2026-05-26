// 락다운 team 이벤트 수와 페이지네이션 동작 검증
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
const env = Object.fromEntries(
  envText.split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: t } = await supabase.from('league_teams').select('id, name, league_id').ilike('name', '%락다운%').single()
const teamId = t.id
const leagueId = t.league_id
console.log(`🔍 락다운: ${teamId.slice(0, 8)}`)

// is_started 게임 가져오기
const { data: games } = await supabase.from('league_games')
  .select('id').eq('league_id', leagueId).eq('is_started', true)
const gameIds = games.map(g => g.id)
console.log(`🔍 is_started 게임: ${gameIds.length}`)

// 방법 1: 정확한 count (head:true)
const { count: exactCount } = await supabase
  .from('league_game_events')
  .select('id', { count: 'exact', head: true })
  .in('league_game_id', gameIds)
  .eq('team_id', teamId)
  .not('league_player_id', 'is', null)
console.log(`📊 정확한 count (락다운 이벤트): ${exactCount}`)

// 방법 2: 페이지네이션 with 1000 (API 와 동일한 방식)
const PAGE = 1000
let page = 0
let totalFetched = 0
while (true) {
  const { data } = await supabase
    .from('league_game_events')
    .select('id')
    .in('league_game_id', gameIds)
    .eq('team_id', teamId)
    .not('league_player_id', 'is', null)
    .range(page * PAGE, (page + 1) * PAGE - 1)
  if (data?.length) totalFetched += data.length
  if (!data || data.length < PAGE) break
  page++
}
console.log(`📊 페이지네이션 fetch (PAGE=1000): ${totalFetched} (페이지 수: ${page + 1})`)

// 방법 3: 김로빈 한정 페이지네이션
const { data: kim } = await supabase.from('league_players').select('id').ilike('name', '%김로빈%').single()
const playerId = kim.id

page = 0
let kimFetched = 0
while (true) {
  const { data } = await supabase
    .from('league_game_events')
    .select('id, type, result')
    .in('league_game_id', gameIds)
    .eq('team_id', teamId)
    .eq('league_player_id', playerId)
    .range(page * PAGE, (page + 1) * PAGE - 1)
  if (data?.length) kimFetched += data.length
  if (!data || data.length < PAGE) break
  page++
}
console.log(`📊 김로빈 @ 락다운 (페이지네이션): ${kimFetched}`)

const { count: kimExactCount } = await supabase
  .from('league_game_events')
  .select('id', { count: 'exact', head: true })
  .in('league_game_id', gameIds)
  .eq('team_id', teamId)
  .eq('league_player_id', playerId)
console.log(`📊 김로빈 @ 락다운 (정확한 count): ${kimExactCount}`)
