// 특정 선수의 팀별 스탯 집계 — 전체 vs 팀별 합 검증용
//
// 사용: node scripts/diagnose-player.mjs [선수이름]
//        node scripts/diagnose-player.mjs 김로빈

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
const env = Object.fromEntries(
  envText.split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const targetName = process.argv[2] ?? '김로빈'
console.log(`\n🔍 선수: ${targetName}\n`)

// 1) 선수 찾기
const { data: players } = await supabase
  .from('league_players')
  .select('id, name, league_id, plus_one')
  .ilike('name', `%${targetName}%`)
if (!players?.length) { console.error('선수 못 찾음'); process.exit(1) }

for (const p of players) {
  console.log(`📌 ${p.name} (id: ${p.id.slice(0, 8)}..., league: ${p.league_id.slice(0, 8)}..., plus_one: ${p.plus_one})`)
}
const player = players[0]
const leagueId = player.league_id
const playerId = player.id

// 2) 모든 이벤트 + 게임 정보
const PAGE = 1000
const events = []
let page = 0
while (true) {
  const { data, error } = await supabase
    .from('league_game_events')
    .select('id, league_game_id, type, result, team_id, related_player_id')
    .eq('league_player_id', playerId)
    .range(page * PAGE, (page + 1) * PAGE - 1)
  if (error) throw error
  if (data?.length) events.push(...data)
  if (!data || data.length < PAGE) break
  page++
}

const gameIds = [...new Set(events.map(e => e.league_game_id))]
const { data: games } = await supabase
  .from('league_games')
  .select('id, date, is_started, is_complete, is_exhibition, quarter_id, home_team_id, away_team_id')
  .in('id', gameIds)
const gameMap = Object.fromEntries((games ?? []).map(g => [g.id, g]))

// 어시스트 (related_player_id = 본인): 다른 선수들의 슛 이벤트
const assists = []
let ap = 0
while (true) {
  const { data, error } = await supabase
    .from('league_game_events')
    .select('id, league_game_id, type, result, team_id, league_player_id')
    .eq('related_player_id', playerId)
    .eq('result', 'made')
    .in('type', ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive'])
    .range(ap * PAGE, (ap + 1) * PAGE - 1)
  if (error) throw error
  if (data?.length) assists.push(...data)
  if (!data || data.length < PAGE) break
  ap++
}

// 어시스트 게임도 모음
const assistGameIds = [...new Set(assists.map(e => e.league_game_id))]
const additionalGames = assistGameIds.filter(id => !gameMap[id])
if (additionalGames.length > 0) {
  const { data: ag } = await supabase
    .from('league_games')
    .select('id, date, is_started, is_complete, is_exhibition, quarter_id, home_team_id, away_team_id')
    .in('id', additionalGames)
  for (const g of ag ?? []) gameMap[g.id] = g
}

// 모든 팀 정보
const { data: teams } = await supabase
  .from('league_teams')
  .select('id, name, color')
  .eq('league_id', leagueId)
const teamMap = Object.fromEntries((teams ?? []).map(t => [t.id, t.name]))

// 3) 집계
const PLUS_ONE = player.plus_one
function shotPts(type, isMade) {
  if (!isMade) return 0
  if (type === 'shot_3p') return PLUS_ONE ? 4 : 3
  if (['shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive'].includes(type)) return PLUS_ONE ? 3 : 2
  return 0
}
function ftPts(type, isMade) {
  if (!isMade) return 0
  if (type === 'ft_2pt' || type === 'ft_3pt_1') return 2
  if (type === 'free_throw' || type === 'ft_3pt_2') return 1
  if (type === 'and_one') return 1
  return 0
}

// 게임의 plus_one_player_id 오버라이드도 고려 (정밀 집계)
const { data: gamesP1 } = await supabase
  .from('league_games')
  .select('id, plus_one_player_id')
  .in('id', gameIds)
const gameP1Override = Object.fromEntries((gamesP1 ?? []).map(g => [g.id, g.plus_one_player_id]))

function pointsForPlayer(e) {
  const gpo = gameP1Override[e.league_game_id]
  const isP1 = gpo !== null && gpo !== undefined ? playerId === gpo : PLUS_ONE
  const made = e.result === 'made'
  if (e.type === 'shot_3p')        return made ? (isP1 ? 4 : 3) : 0
  if (['shot_2p_mid','shot_layup','shot_post','shot_2p_drive'].includes(e.type)) return made ? (isP1 ? 3 : 2) : 0
  return ftPts(e.type, made)
}

// per-team breakdown
const byTeam = {}
const byTeamPerQuarter = {}  // team_id → quarter_label → counts
let totalPts = 0
const games_by_team = {}  // team_id → Set of game_ids

for (const e of events) {
  if (e.type === 'sub_in' || e.type === 'sub_out') continue
  const tid = e.team_id ?? 'NULL'
  const pts = pointsForPlayer(e)
  if (!byTeam[tid]) byTeam[tid] = { pts: 0, events: 0, games: new Set() }
  byTeam[tid].pts += pts
  byTeam[tid].events++
  byTeam[tid].games.add(e.league_game_id)
  totalPts += pts
}

// 4) 결과 출력
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  [본인 이벤트] 팀별 집계 (sub_in/sub_out 제외)')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('   팀                | 이벤트 | 게임수 | PTS')
console.log('   ------------------+--------+--------+-----')
for (const [tid, x] of Object.entries(byTeam).sort((a, b) => b[1].pts - a[1].pts)) {
  const name = tid === 'NULL' ? '⚠ NULL team_id' : (teamMap[tid] ?? tid.slice(0, 8))
  console.log(`   ${name.padEnd(18)}| ${String(x.events).padStart(6)} | ${String(x.games.size).padStart(6)} | ${String(x.pts).padStart(4)}`)
}
console.log('   ------------------+--------+--------+-----')
console.log(`   합계              |        |        | ${totalPts}`)
console.log()

// 5) 게임별 상세 — 게임의 home/away와 team_id가 다른 경우 확인
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  [게임별 상세] 본인이 어느 팀으로 뛰었는지')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

const gameStats = {}
for (const e of events) {
  if (e.type === 'sub_in' || e.type === 'sub_out') continue
  const gid = e.league_game_id
  if (!gameStats[gid]) gameStats[gid] = { team_ids: new Set(), pts: 0, events: 0 }
  if (e.team_id) gameStats[gid].team_ids.add(e.team_id)
  gameStats[gid].pts += pointsForPlayer(e)
  gameStats[gid].events++
}

const gameList = Object.entries(gameStats)
  .map(([gid, s]) => ({ gid, ...s, game: gameMap[gid] }))
  .sort((a, b) => (a.game?.date ?? '').localeCompare(b.game?.date ?? ''))

console.log('   날짜        | 게임 home / away    | 본인 team_id        | exh | PTS')
console.log('   ------------+---------------------+---------------------+-----+----')
for (const x of gameList) {
  const g = x.game
  if (!g) continue
  const home = teamMap[g.home_team_id] ?? '?'
  const away = teamMap[g.away_team_id] ?? '?'
  const tids = [...x.team_ids].map(id => teamMap[id] ?? id.slice(0, 8)).join(',')
  const exh = g.is_exhibition ? 'YES' : ''
  console.log(`   ${(g.date ?? '?').padEnd(12)}| ${`${home} / ${away}`.padEnd(20)}| ${tids.padEnd(20)}| ${exh.padEnd(4)}| ${String(x.pts).padStart(3)}`)
}
console.log()

// 6) 어시스트 검증
const astByTeam = {}
for (const a of assists) {
  const tid = a.team_id ?? 'NULL'
  if (!astByTeam[tid]) astByTeam[tid] = 0
  astByTeam[tid]++
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  [어시스트] 본인을 어시스터로 한 다른 선수의 슛')
console.log('  ⚠ 어시스트는 슈터의 team_id 로 귀속됨 → 본인 팀과 다를 수 있음')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('   팀                | 어시스트 수')
console.log('   ------------------+------------')
for (const [tid, c] of Object.entries(astByTeam).sort((a, b) => b[1] - a[1])) {
  const name = tid === 'NULL' ? '⚠ NULL team_id' : (teamMap[tid] ?? tid.slice(0, 8))
  console.log(`   ${name.padEnd(18)}| ${String(c).padStart(11)}`)
}
console.log(`   총 어시스트: ${assists.length}`)
console.log()

// 7) API 결과와 비교 (전체 vs 팀별)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  [예상 차이] 페이지에 표시되는 값과 비교')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
const sumByRealTeam = Object.entries(byTeam)
  .filter(([tid]) => tid !== 'NULL')
  .reduce((s, [, v]) => s + v.pts, 0)
console.log(`   전체 PTS                   : ${totalPts}`)
console.log(`   팀 귀속 PTS 합 (NULL 제외) : ${sumByRealTeam}`)
console.log(`   차이 (= NULL team_id)      : ${totalPts - sumByRealTeam}`)
