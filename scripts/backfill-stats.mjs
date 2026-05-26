// 백필: league_game_events.team_id 가 NULL 인 이벤트에 team_id 채우기
//
// 우선순위:
//   ① league_game_players (게임별 배정 — 비정규/타팀 임시 출전, 정규보다 우선)
//   ② league_player_quarters (정규 분기 팀 — 게임의 quarter_id 기반)
//   ③ 같은 게임 내 동일 선수의 이미 알려진 team_id (fallback)
//
// 사용: node scripts/backfill-stats.mjs [--dry-run]

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DRY_RUN = process.argv.includes('--dry-run')

const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
const env = Object.fromEntries(
  envText.split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function fetchAll(table, select, filterBuilder) {
  const PAGE = 1000
  const rows = []
  let page = 0
  while (true) {
    let q = supabase.from(table).select(select).range(page * PAGE, (page + 1) * PAGE - 1)
    if (filterBuilder) q = filterBuilder(q)
    const { data, error } = await q
    if (error) throw error
    if (data?.length) rows.push(...data)
    if (!data || data.length < PAGE) break
    page++
  }
  return rows
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`  team_id NULL 이벤트 백필 ${DRY_RUN ? '(DRY-RUN — 변경 안 함)' : '(실제 적용)'}`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

// ── 1) 메타 데이터 수집 ─────────────────────────────────────
console.log('📦 데이터 수집 중...')

// is_started 게임 + quarter_id
const { data: startedGames, error: gErr } = await supabase
  .from('league_games')
  .select('id, quarter_id, home_team_id, away_team_id')
  .eq('is_started', true)
if (gErr) { console.error(gErr); process.exit(1) }
const startedIds = startedGames.map(g => g.id)
const gameMeta = Object.fromEntries(startedGames.map(g => [g.id, g]))

// league_game_players: (game_id, player_id) → team_id
const gp = await fetchAll('league_game_players', 'league_game_id, league_player_id, team_id')
const gpMap = {}
for (const r of gp) {
  if (r.team_id) gpMap[`${r.league_game_id}:${r.league_player_id}`] = r.team_id
}

// league_player_quarters: (quarter_id, player_id) → team_id
const lpq = await fetchAll('league_player_quarters', 'quarter_id, league_player_id, team_id')
const lpqMap = {}
for (const r of lpq) {
  if (r.team_id) lpqMap[`${r.quarter_id}:${r.league_player_id}`] = r.team_id
}

// NULL team_id 이벤트
const nullEvents = await fetchAll('league_game_events',
  'id, league_game_id, league_player_id, type',
  q => q.in('league_game_id', startedIds).is('team_id', null).not('league_player_id', 'is', null).not('type', 'in', '(sub_in,sub_out)')
)
console.log(`   - is_started 게임          : ${startedGames.length}`)
console.log(`   - league_game_players      : ${gp.length}`)
console.log(`   - league_player_quarters   : ${lpq.length}`)
console.log(`   - team_id NULL 이벤트      : ${nullEvents.length}\n`)

// ── 2) 같은 게임의 알려진 team_id 매핑 구축 (3차 fallback용) ─
const knownInGame = {}  // (game_id, player_id) → team_id (해당 게임 내 다른 이벤트로 알려진 값)
const knownEvents = await fetchAll('league_game_events',
  'league_game_id, league_player_id, team_id',
  q => q.in('league_game_id', startedIds).not('team_id', 'is', null).not('league_player_id', 'is', null)
)
for (const r of knownEvents) {
  knownInGame[`${r.league_game_id}:${r.league_player_id}`] = r.team_id
}

// ── 3) 백필 계산 ────────────────────────────────────────────
console.log('🔍 백필 매핑 분석 중...')

const updates = []  // { id, team_id, source }
const unresolved = []
let s1 = 0, s2 = 0, s3 = 0

for (const e of nullEvents) {
  const key = `${e.league_game_id}:${e.league_player_id}`
  let tid = null, source = null

  if (gpMap[key]) { tid = gpMap[key]; source = '① league_game_players'; s1++ }
  else {
    const g = gameMeta[e.league_game_id]
    const qid = g?.quarter_id
    if (qid && lpqMap[`${qid}:${e.league_player_id}`]) {
      tid = lpqMap[`${qid}:${e.league_player_id}`]; source = '② league_player_quarters'; s2++
    } else if (knownInGame[key]) {
      tid = knownInGame[key]; source = '③ 같은 게임 내 알려진 team_id'; s3++
    }
  }

  if (tid) updates.push({ id: e.id, team_id: tid, source })
  else unresolved.push(e)
}

console.log(`   ① league_game_players      : ${s1}`)
console.log(`   ② league_player_quarters   : ${s2}`)
console.log(`   ③ 같은 게임 내 알려진 값   : ${s3}`)
console.log(`   ─────────────────────────────`)
console.log(`   해결 가능                  : ${updates.length}`)
console.log(`   미해결                     : ${unresolved.length}\n`)

if (unresolved.length > 0) {
  console.log('⚠ 미해결 이벤트 분석 (선수별 카운트):')
  const byPlayer = {}
  for (const e of unresolved) byPlayer[e.league_player_id] = (byPlayer[e.league_player_id] ?? 0) + 1
  const topPids = Object.entries(byPlayer).sort((a, b) => b[1] - a[1]).slice(0, 10)
  const { data: names } = await supabase
    .from('league_players')
    .select('id, name')
    .in('id', topPids.map(([id]) => id))
  const nameMap = Object.fromEntries((names ?? []).map(p => [p.id, p.name]))
  for (const [pid, cnt] of topPids) {
    console.log(`     - ${nameMap[pid] ?? pid.slice(0, 8)}: ${cnt}개 (정규/임시 배정 없음)`)
  }
  console.log()
}

// ── 4) DRY-RUN 여부에 따라 실행 ─────────────────────────────
if (DRY_RUN) {
  console.log('🔵 DRY-RUN 모드 — 실제 업데이트 안 함')
  console.log('   실제 적용: node scripts/backfill-stats.mjs (--dry-run 없이)')
} else if (updates.length === 0) {
  console.log('✅ 업데이트할 이벤트 없음 — 종료')
} else {
  console.log(`🔧 ${updates.length}개 이벤트 업데이트 시작...`)

  // team_id별로 그룹핑하여 in() 으로 한 번에 업데이트 (배치 효율)
  const byTeam = {}
  for (const u of updates) {
    if (!byTeam[u.team_id]) byTeam[u.team_id] = []
    byTeam[u.team_id].push(u.id)
  }

  let done = 0
  for (const [teamId, ids] of Object.entries(byTeam)) {
    // 한 번에 너무 많이 보내지 않도록 청크 (1000개씩)
    const CHUNK = 500
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      const { error } = await supabase
        .from('league_game_events')
        .update({ team_id: teamId })
        .in('id', chunk)
      if (error) {
        console.error(`   ❌ team_id=${teamId} 업데이트 실패:`, error.message)
        process.exit(1)
      }
      done += chunk.length
      process.stdout.write(`\r   진행: ${done}/${updates.length}`)
    }
  }
  console.log('\n✅ 모든 업데이트 완료')
}

console.log()
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  백필 종료')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
