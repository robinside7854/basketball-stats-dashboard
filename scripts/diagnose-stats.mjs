// 진단: 전체 vs 분기 합계가 일치하는지 검증
// 044_diagnose_all_vs_quarters_sum.sql 의 supabase-js 버전
//
// 사용: node scripts/diagnose-stats.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// .env.local 직접 파싱 (dotenv 의존성 없이)
const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
const env = Object.fromEntries(
  envText.split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ── 페이지네이션 fetch 헬퍼 ───────────────────────────────────
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
console.log('  팀 구성 페이지 전체 vs 분기합 진단')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

// ── Q1: NULL quarter_id 게임 ─────────────────────────────────
console.log('🔍 Q1. quarter_id 가 NULL 인 게임')
const { data: nullQGames, error: q1err } = await supabase
  .from('league_games')
  .select('id, date, slot_num, round_num, is_started, is_complete, is_exhibition, home_score, away_score')
  .is('quarter_id', null)
  .order('date', { ascending: false })
if (q1err) { console.error(q1err); process.exit(1) }

const startedNullQ = nullQGames.filter(g => g.is_started)
const completeNullQ = nullQGames.filter(g => g.is_complete)
const exhibitionNullQ = nullQGames.filter(g => g.is_exhibition)
console.log(`   total                  : ${nullQGames.length} 행`)
console.log(`   is_started=true        : ${startedNullQ.length} 행`)
console.log(`   is_complete=true       : ${completeNullQ.length} 행`)
console.log(`   is_exhibition=true     : ${exhibitionNullQ.length} 행`)
if (nullQGames.length > 0) {
  const dates = [...new Set(nullQGames.map(g => g.date))].sort()
  console.log(`   영향 날짜              : ${dates.slice(0, 10).join(', ')}${dates.length > 10 ? ` (...총 ${dates.length}개 날짜)` : ''}`)
}
console.log()

// ── Q2: NULL quarter 게임에 기록된 이벤트 ───────────────────
console.log('🔍 Q2. NULL quarter 게임 안에 기록된 이벤트')
if (startedNullQ.length === 0) {
  console.log('   해당 없음 (started + NULL quarter 게임 없음)')
} else {
  const ids = startedNullQ.map(g => g.id)
  const ev = await fetchAll('league_game_events',
    'league_player_id, team_id, type',
    q => q.in('league_game_id', ids).not('league_player_id', 'is', null).not('type', 'in', '(sub_in,sub_out)')
  )
  const players = new Set(ev.map(e => e.league_player_id))
  const withTeam = ev.filter(e => e.team_id).length
  const noTeam = ev.length - withTeam
  console.log(`   영향 이벤트            : ${ev.length}`)
  console.log(`   영향 선수              : ${players.size}명`)
  console.log(`   team_id 있음           : ${withTeam}`)
  console.log(`   team_id 없음           : ${noTeam}`)
}
console.log()

// ── Q3: team_id NULL 이벤트 (started 게임 한정) ────────────
console.log('🔍 Q3. team_id 가 NULL 인 이벤트 (started 게임 한정)')
// is_started=true 인 게임 ID 먼저 수집
const startedGames = await fetchAll('league_games', 'id', q => q.eq('is_started', true))
const startedIds = startedGames.map(g => g.id)

// 페이지네이션으로 team_id IS NULL 이벤트 수집
const nullTeamEvents = await fetchAll('league_game_events',
  'league_player_id, league_game_id, type',
  q => q.in('league_game_id', startedIds).is('team_id', null).not('league_player_id', 'is', null).not('type', 'in', '(sub_in,sub_out)')
)
const nullTeamPlayers = new Set(nullTeamEvents.map(e => e.league_player_id))
const nullTeamGames = new Set(nullTeamEvents.map(e => e.league_game_id))
console.log(`   NULL team_id 이벤트    : ${nullTeamEvents.length}`)
console.log(`   영향 선수              : ${nullTeamPlayers.size}명`)
console.log(`   영향 게임              : ${nullTeamGames.size}개`)

if (nullTeamEvents.length > 0) {
  // 선수별 영향 카운트 TOP 10
  const byPlayer = {}
  for (const e of nullTeamEvents) byPlayer[e.league_player_id] = (byPlayer[e.league_player_id] ?? 0) + 1
  const topPids = Object.entries(byPlayer).sort((a, b) => b[1] - a[1]).slice(0, 10)
  const { data: names } = await supabase
    .from('league_players')
    .select('id, name')
    .in('id', topPids.map(([id]) => id))
  const nameMap = Object.fromEntries((names ?? []).map(p => [p.id, p.name]))
  console.log('   영향 선수 TOP 10:')
  for (const [pid, cnt] of topPids) {
    console.log(`     - ${nameMap[pid] ?? pid.slice(0, 8)}: ${cnt}개 이벤트`)
  }
}
console.log()

// ── Q4: 선수별 전체 vs 분기 합 차이 ─────────────────────────
console.log('🔍 Q4. 선수별 [전체 FGA - 분기 귀속 FGA] 차이 (분기 미귀속 게임으로 인한 손실)')
// is_started 게임 + quarter_id 매핑
const gameQMap = Object.fromEntries(startedGames.map(g => [g.id, null])) // 기본값
const { data: allStartedQids } = await supabase
  .from('league_games')
  .select('id, quarter_id')
  .eq('is_started', true)
for (const g of allStartedQids ?? []) gameQMap[g.id] = g.quarter_id

// 모든 shot 이벤트 가져오기
const shotEvents = await fetchAll('league_game_events',
  'league_player_id, league_game_id, type, result',
  q => q.in('league_game_id', startedIds).not('league_player_id', 'is', null).like('type', 'shot_%')
)

const totals = {}   // pid → { totalFGA, quarteredFGA, totalFGM, quarteredFGM }
for (const e of shotEvents) {
  const pid = e.league_player_id
  if (!totals[pid]) totals[pid] = { totalFGA: 0, quarteredFGA: 0, totalFGM: 0, quarteredFGM: 0 }
  const inQuarter = !!gameQMap[e.league_game_id]
  const made = e.result === 'made'
  totals[pid].totalFGA++
  if (inQuarter) totals[pid].quarteredFGA++
  if (made) {
    totals[pid].totalFGM++
    if (inQuarter) totals[pid].quarteredFGM++
  }
}

const diffs = Object.entries(totals)
  .map(([pid, t]) => ({
    pid,
    totalFGA: t.totalFGA, quarteredFGA: t.quarteredFGA, missFGA: t.totalFGA - t.quarteredFGA,
    totalFGM: t.totalFGM, quarteredFGM: t.quarteredFGM, missFGM: t.totalFGM - t.quarteredFGM,
  }))
  .filter(d => d.missFGA > 0 || d.missFGM > 0)
  .sort((a, b) => b.missFGA - a.missFGA)

if (diffs.length === 0) {
  console.log('   ✅ 모든 선수의 전체 FGA = 분기 합 FGA (시간 누락 없음)')
} else {
  const { data: names2 } = await supabase
    .from('league_players')
    .select('id, name')
    .in('id', diffs.map(d => d.pid))
  const nameMap2 = Object.fromEntries((names2 ?? []).map(p => [p.id, p.name]))
  console.log(`   ⚠ 차이 있는 선수: ${diffs.length}명`)
  console.log('   선수명               | 전체FGA | 분기합FGA | 손실 | 전체FGM | 분기합FGM | 손실')
  console.log('   --------------------+---------+-----------+------+---------+-----------+-----')
  for (const d of diffs.slice(0, 20)) {
    const name = (nameMap2[d.pid] ?? d.pid.slice(0, 8)).padEnd(20)
    console.log(`   ${name}| ${String(d.totalFGA).padStart(7)} | ${String(d.quarteredFGA).padStart(9)} | ${String(d.missFGA).padStart(4)} | ${String(d.totalFGM).padStart(7)} | ${String(d.quarteredFGM).padStart(9)} | ${String(d.missFGM).padStart(4)}`)
  }
}
console.log()

// ── Q5: 같은 분기 안에서 — 팀별 합 vs 분기 전체 ────────────
console.log('🔍 Q5. 같은 분기 안에서 [팀별 FGA 합] vs [분기 전체 FGA]')
const { data: quarters } = await supabase.from('league_quarters').select('id, year, quarter').order('year').order('quarter')
const qByLabel = {}
for (const q of quarters ?? []) {
  qByLabel[q.id] = `${q.year}.${q.quarter}Q`
}

const perQuarter = {}
for (const e of shotEvents) {
  const qid = gameQMap[e.league_game_id]
  if (!qid) continue
  if (!perQuarter[qid]) perQuarter[qid] = { all: 0, withTeam: 0, withoutTeam: 0 }
  perQuarter[qid].all++
}

// team_id 별 분기 합 — events 별도 페치
const allShotEvents = await fetchAll('league_game_events',
  'league_game_id, type, team_id',
  q => q.in('league_game_id', startedIds).like('type', 'shot_%').not('league_player_id', 'is', null)
)
for (const e of allShotEvents) {
  const qid = gameQMap[e.league_game_id]
  if (!qid) continue
  if (!perQuarter[qid]) perQuarter[qid] = { all: 0, withTeam: 0, withoutTeam: 0 }
  if (e.team_id) perQuarter[qid].withTeam++
  else perQuarter[qid].withoutTeam++
}

console.log('   분기   | 전체FGA | 팀귀속FGA | 미귀속FGA')
console.log('   -------+---------+-----------+----------')
for (const [qid, x] of Object.entries(perQuarter)) {
  const label = qByLabel[qid] ?? qid.slice(0, 8)
  console.log(`   ${label.padEnd(6)} | ${String(x.all).padStart(7)} | ${String(x.withTeam).padStart(9)} | ${String(x.withoutTeam).padStart(8)}`)
}
console.log()

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  진단 완료')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log()
console.log('💡 해석:')
console.log('  - Q1 > 0 또는 Q2 의 영향 이벤트 > 0 → 백필 필요 (case A)')
console.log('  - Q3 NULL team_id 이벤트 > 0 → 백필 필요 (case B)')
console.log('  - 둘 다 해결하려면: node scripts/backfill-stats.mjs 실행')
