// 김로빈 vs_opponents 섹션 진단
// 어느 게임에서 어느 팀으로 잡혀 "vs 락다운" 이 나오는지 추적
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const env = Object.fromEntries(
  readFileSync(resolve('.env.local'), 'utf-8').split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const L = '8eda8257-8907-4bf3-a7de-e5e7fde54a89'
const PID = 'de588497-78ed-472c-b3b0-f2b43c63e506'

// 게임/팀 메타
const { data: games } = await supabase.from('league_games')
  .select('id, date, home_team_id, away_team_id, home_score, away_score, is_started, is_complete, is_exhibition, quarter_id, round_num, slot_num')
  .eq('league_id', L).eq('is_started', true)
const gameMap = Object.fromEntries(games.map(g => [g.id, g]))

const { data: teams } = await supabase.from('league_teams').select('id, name').eq('league_id', L)
const teamMap = Object.fromEntries(teams.map(t => [t.id, t.name]))

// league_player_quarters (김로빈 정규 팀)
const { data: lpq } = await supabase.from('league_player_quarters')
  .select('quarter_id, team_id, is_regular').eq('league_player_id', PID).eq('league_id', L)
console.log('🏠 김로빈 분기별 정규 소속:')
for (const r of lpq) console.log(`   Q ${r.quarter_id.slice(0, 8)} → ${teamMap[r.team_id] ?? '?'} (regular=${r.is_regular})`)
const qTeamMap = Object.fromEntries(lpq.map(r => [r.quarter_id, r.team_id]))

// league_game_players (게임별 배정)
const { data: lgp } = await supabase.from('league_game_players')
  .select('league_game_id, team_id').eq('league_player_id', PID).eq('league_id', L)
const gpTeamMap = Object.fromEntries(lgp.map(r => [r.league_game_id, r.team_id]))
console.log(`\n🎯 김로빈 게임별 배정 (league_game_players): ${lgp.length}건`)
if (lgp.length > 0) {
  for (const r of lgp.slice(0, 20)) {
    const g = gameMap[r.league_game_id]
    console.log(`   ${g?.date ?? '?'} (slot ${g?.slot_num}) → ${teamMap[r.team_id] ?? '?'} (game: ${teamMap[g?.home_team_id] ?? '?'} vs ${teamMap[g?.away_team_id] ?? '?'})`)
  }
  if (lgp.length > 20) console.log(`   ... +${lgp.length - 20}개`)
}

// 김로빈 이벤트 (team_id 포함)
const PAGE = 1000
const events = []
let page = 0
while (true) {
  const { data } = await supabase.from('league_game_events')
    .select('league_game_id, team_id, type')
    .eq('league_player_id', PID)
    .order('id', { ascending: true })
    .range(page * PAGE, (page + 1) * PAGE - 1)
  if (data?.length) events.push(...data)
  if (!data || data.length < PAGE) break
  page++
}

// 게임별 김로빈 이벤트의 team_id 분포
const eventTeamPerGame = {}
for (const e of events) {
  if (e.type === 'sub_in' || e.type === 'sub_out') continue
  if (!eventTeamPerGame[e.league_game_id]) eventTeamPerGame[e.league_game_id] = {}
  const tid = e.team_id ?? 'NULL'
  eventTeamPerGame[e.league_game_id][tid] = (eventTeamPerGame[e.league_game_id][tid] ?? 0) + 1
}

// teamForGame 함수 (수정 후: event.team_id 다수결 우선)
const eventTeamMap = {}
for (const [gId, counts] of Object.entries(eventTeamPerGame)) {
  const filtered = Object.entries(counts).filter(([t]) => t !== 'NULL')
  if (filtered.length > 0) {
    const top = filtered.sort((a, b) => b[1] - a[1])[0]
    eventTeamMap[gId] = top[0]
  }
}
function teamForGame(g) {
  if (!g) return undefined
  return eventTeamMap[g.id] ?? gpTeamMap[g.id] ?? (g.quarter_id ? qTeamMap[g.quarter_id] : undefined)
}

// vs_opponents 시뮬레이션 — 어느 게임에서 어느 팀이 상대로 잡히는지
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  vs_opponents 시뮬레이션 (현재 detail API 로직)')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

const oppCount = {}
const suspectGames = []

for (const gId of Object.keys(eventTeamPerGame)) {
  const g = gameMap[gId]
  if (!g || g.is_exhibition) continue
  const myTeamId = teamForGame(g)
  if (!myTeamId) continue
  const oppTeamId = g.home_team_id === myTeamId ? g.away_team_id : g.home_team_id
  if (!oppTeamId) continue

  oppCount[oppTeamId] = (oppCount[oppTeamId] ?? 0) + 1

  // 이벤트의 team_id 분포
  const eventTids = eventTeamPerGame[gId]
  const eventTeamMajority = Object.entries(eventTids).sort((a, b) => b[1] - a[1])[0]

  // myTeamId 가 게임 home/away 둘 다 아닌 경우 — 데이터 이상
  const inGame = g.home_team_id === myTeamId || g.away_team_id === myTeamId
  if (!inGame) {
    suspectGames.push({ gId, g, myTeamId, oppTeamId, eventTids, eventTeamMajority })
  }
}

console.log('\n[상대팀별 카운트 — 현재 로직]')
for (const [tid, c] of Object.entries(oppCount).sort((a, b) => b[1] - a[1])) {
  console.log(`   vs ${teamMap[tid] ?? '?'}: ${c} 게임`)
}

console.log(`\n⚠ 의심 게임 (myTeamId 가 game home/away 둘 다 아님): ${suspectGames.length}건`)
for (const s of suspectGames.slice(0, 15)) {
  console.log(`   ${s.g.date} slot${s.g.slot_num} | game: ${teamMap[s.g.home_team_id]} vs ${teamMap[s.g.away_team_id]}`)
  console.log(`      teamForGame() → ${teamMap[s.myTeamId] ?? s.myTeamId} (event team_id 분포: ${JSON.stringify(Object.fromEntries(Object.entries(s.eventTids).map(([k, v]) => [teamMap[k] ?? k, v])))})`)
  console.log(`      → "vs ${teamMap[s.oppTeamId]}" 로 잡힘 ❌`)
}
if (suspectGames.length > 15) console.log(`   ... +${suspectGames.length - 15}개`)
