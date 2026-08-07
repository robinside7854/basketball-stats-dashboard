// 백업 클론 프로젝트에서 특정 경기의 기록을 운영 DB 로 되살린다.
//
//   node scripts/restore-game-events.mjs <cloneRef> <gameId>            # 조회만 (dry-run)
//   node scripts/restore-game-events.mjs <cloneRef> <gameId> --commit   # 실제 이식
//
// 배경: 2026-08-07 파란날개 "초기화" 사고로 game_events 161건이 하드 DELETE 됐다.
//       일일 백업을 새 프로젝트(클론)로 복원한 뒤, 그 경기 행만 뽑아 운영에 되돌린다.
//       운영 DB 의 다른 데이터는 건드리지 않는다.
//
// 원본 id·created_at 을 그대로 유지한다 — 하이라이트/스탯이 id 를 참조할 수 있고,
// 재실행해도 PK 충돌로 막히는 편이 조용한 중복보다 낫다.
import { resolveCredentials, projectRef } from './lib/supabase-admin.mjs'

const [cloneRef, gameId, ...flags] = process.argv.slice(2)
const COMMIT = flags.includes('--commit')

if (!cloneRef || !gameId) {
  console.error('사용법: node scripts/restore-game-events.mjs <cloneRef> <gameId> [--commit]')
  process.exit(1)
}

const { token } = resolveCredentials()
const PROD = projectRef()

if (cloneRef === PROD) {
  console.error('✖ cloneRef 가 운영 프로젝트와 같습니다. 복원된 새 프로젝트의 ref 를 주세요.')
  process.exit(1)
}

async function q(ref, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`[${ref}] ${res.status}\n${text}`)
  try { return JSON.parse(text) } catch { return [] }
}

const TABLES = [
  { name: 'game_events', label: '이벤트' },
  { name: 'player_minutes', label: '출전시간' },
]

console.log(`운영 ${PROD} ← 클론 ${cloneRef}`)
console.log(`경기 ${gameId}\n`)

// ── 클론 쪽 경기 정보 확인 (엉뚱한 프로젝트를 가리켰는지 즉시 드러난다) ──────
const [cloneGame] = await q(cloneRef, `
  select g.opponent, g.date::text as date, g.round, g.our_score, g.opponent_score, g.is_complete
  from games g where g.id = '${gameId}'
`)
if (!cloneGame) throw new Error('클론에 해당 경기가 없습니다. ref 또는 gameId 를 확인하세요.')
console.log('클론의 경기:', JSON.stringify(cloneGame))

const [prodGame] = await q(PROD, `
  select g.opponent, g.is_complete from games g where g.id = '${gameId}'
`)
if (!prodGame) throw new Error('운영에 해당 경기가 없습니다.')
if (prodGame.opponent !== cloneGame.opponent) {
  throw new Error(`상대팀이 다릅니다 (운영 ${prodGame.opponent} ≠ 클론 ${cloneGame.opponent})`)
}

// ── 표 단위로 대조 ────────────────────────────────────────────────────────
const plans = []
for (const { name, label } of TABLES) {
  const [{ n: srcN }] = await q(cloneRef, `select count(*)::int as n from ${name} where game_id = '${gameId}'`)
  const [{ n: dstN }] = await q(PROD, `select count(*)::int as n from ${name} where game_id = '${gameId}'`)
  console.log(`${label.padEnd(6)} 클론 ${srcN}건 · 운영 ${dstN}건`)
  if (dstN > 0) {
    throw new Error(`운영에 ${name} 이 이미 ${dstN}건 있습니다. 덮어쓰지 않고 중단합니다.`)
  }
  if (srcN === 0) {
    console.log(`  ⚠ 클론에도 ${label}이 없습니다 — 이 표는 건너뜁니다`)
    continue
  }
  const [{ j }] = await q(cloneRef, `
    select coalesce(json_agg(t), '[]'::json)::text as j from ${name} t where game_id = '${gameId}'
  `)
  plans.push({ name, label, json: j, count: srcN })
}

if (plans.length === 0) { console.log('\n되살릴 행이 없습니다.'); process.exit(0) }

if (!COMMIT) {
  console.log('\n[dry-run] 실제로 넣으려면 --commit 을 붙이세요.')
  for (const p of plans) console.log(`  ${p.name}: ${p.count}건 삽입 예정`)
  console.log(`  games.is_complete: ${prodGame.is_complete} → ${cloneGame.is_complete}`)
  process.exit(0)
}

// ── 이식 ──────────────────────────────────────────────────────────────────
const TAG = 'restore_payload'
for (const p of plans) {
  if (p.json.includes(`$${TAG}$`)) throw new Error('JSON 에 달러 인용 태그가 섞였습니다 — 중단')
  await q(PROD, `
    insert into public.${p.name}
    select * from json_populate_recordset(null::public.${p.name}, $${TAG}$${p.json}$${TAG}$)
  `)
  const [{ n }] = await q(PROD, `select count(*)::int as n from ${p.name} where game_id = '${gameId}'`)
  console.log(`✔ ${p.label} ${n}건 복구 (기대 ${p.count})`)
  if (n !== p.count) throw new Error(`${p.name} 건수 불일치 — 확인 필요`)
}

await q(PROD, `update games set is_complete = ${cloneGame.is_complete} where id = '${gameId}'`)
console.log(`✔ games.is_complete → ${cloneGame.is_complete}`)

const [totals] = await q(PROD, `select (select count(*) from game_events) as events, (select count(*) from player_minutes) as minutes`)
console.log(`\n운영 전체: 이벤트 ${totals.events} · 출전시간 ${totals.minutes}`)
console.log('※ 기준선(파란날개 이벤트 5993)과 대조하세요.')
