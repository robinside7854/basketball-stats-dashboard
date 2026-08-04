// 멀티테넌트 계층 불변식 검증 — 단계 1
//
//   node scripts/verify-schema.mjs
//
// 실패가 하나라도 있으면 non-zero 로 종료한다.
// 마이그레이션마다 어서션을 여기에 누적한다.
import { query as q } from './lib/supabase-admin.mjs'

let failed = 0
async function check(name, sql, assertFn) {
  let rows
  try { rows = await q(sql) } catch (e) { console.log(`✖ ${name}\n    쿼리 실패: ${e.message}`); failed++; return }
  const result = assertFn(rows)
  if (result === true) console.log(`✔ ${name}`)
  else { console.log(`✖ ${name}\n    ${result}\n    실제: ${JSON.stringify(rows)}`); failed++ }
}

// ── Task 1: 조직 계층 ────────────────────────────────
await check(
  'orgs 2건 (paranalgae · miracle)',
  `SELECT slug FROM orgs ORDER BY slug`,
  rows => {
    const slugs = rows.map(r => r.slug)
    return JSON.stringify(slugs) === JSON.stringify(['miracle', 'paranalgae'])
      || `기대 ['miracle','paranalgae'], 실제 ${JSON.stringify(slugs)}`
  }
)

await check(
  'teams 전 행에 org_id 채워짐 (NULL 0건)',
  `SELECT count(*)::int AS n FROM teams WHERE org_id IS NULL`,
  rows => rows[0].n === 0 || `org_id NULL 인 teams 행이 ${rows[0].n}건`
)

await check(
  'teams 3건 — paranalgae 2 + miracle 1',
  `SELECT o.slug AS org, t.sub_slug FROM teams t JOIN orgs o ON o.id = t.org_id ORDER BY o.slug, t.sub_slug`,
  rows => {
    const got = rows.map(r => `${r.org}/${r.sub_slug}`)
    const want = ['miracle/main', 'paranalgae/senior', 'paranalgae/youth']
    return JSON.stringify(got) === JSON.stringify(want) || `기대 ${JSON.stringify(want)}, 실제 ${JSON.stringify(got)}`
  }
)

// ── Task 2: 시즌 계층 ────────────────────────────────
await check(
  'leagues 전 행에 team_id 채워짐 (NULL 0건)',
  `SELECT count(*)::int AS n FROM leagues WHERE team_id IS NULL`,
  rows => rows[0].n === 0 || `team_id NULL 인 leagues 행이 ${rows[0].n}건`
)

await check(
  'leagues 가 올바른 팀에 배치됨',
  `SELECT l.org_slug, o.slug AS org, t.sub_slug, l.mode
     FROM leagues l
     JOIN teams t ON t.id = l.team_id
     JOIN orgs  o ON o.id = t.org_id
    ORDER BY l.org_slug`,
  rows => {
    const got = rows.map(r => `${r.org_slug}→${r.org}/${r.sub_slug}:${r.mode}`)
    const want = [
      'miracle→miracle/main:league',
      'pana-basket-senior→paranalgae/senior:league',
    ]
    return JSON.stringify(got) === JSON.stringify(want) || `기대 ${JSON.stringify(want)}, 실제 ${JSON.stringify(got)}`
  }
)

await check(
  'miracle 룰 — plus_one_bonus=1, 자유투 ft_2pt=2',
  `SELECT rules FROM leagues WHERE org_slug = 'miracle'`,
  rows => {
    const r = rows[0].rules
    if (r.plus_one_bonus !== 1) return `plus_one_bonus 기대 1, 실제 ${r.plus_one_bonus}`
    if (r.event_points.ft_2pt !== 2) return `ft_2pt 기대 2, 실제 ${r.event_points.ft_2pt}`
    if (r.round_unit !== 'day') return `round_unit 기대 day, 실제 ${r.round_unit}`
    if (r.qualification.min_round_ratio !== 0.3) return `min_round_ratio 기대 0.3, 실제 ${r.qualification.min_round_ratio}`
    return true
  }
)

await check(
  '표준 룰 기본값 — 신규 시즌은 plus_one 없음 · 자유투 1점',
  `SELECT rules FROM leagues WHERE org_slug = 'pana-basket-senior'`,
  rows => {
    const r = rows[0].rules
    if (r.plus_one_bonus !== 0) return `plus_one_bonus 기대 0, 실제 ${r.plus_one_bonus}`
    if (r.event_points.ft_2pt !== 1) return `ft_2pt 기대 1, 실제 ${r.event_points.ft_2pt}`
    return true
  }
)

await check(
  '시즌 신원 유일 제약 (team_id, season_year, slug)',
  `SELECT conname FROM pg_constraint WHERE conname = 'leagues_team_season_unique'`,
  rows => rows.length === 1 || 'leagues_team_season_unique 제약이 없음'
)

// ── Task 3: 세그먼트 · 외부 팀 ────────────────────────
await check(
  '세그먼트 3건 모두 kind=quarter 이고 이름이 붙음',
  `SELECT kind, name, ord FROM league_quarters ORDER BY ord`,
  rows => {
    const got = rows.map(r => `${r.kind}:${r.name}:${r.ord}`)
    const want = ['quarter:26.1Q:1', 'quarter:26.2Q:2', 'quarter:26.3Q:3']
    return JSON.stringify(got) === JSON.stringify(want) || `기대 ${JSON.stringify(want)}, 실제 ${JSON.stringify(got)}`
  }
)

await check(
  'league_teams 전 행 is_external=false (기존 팀은 전부 내부 팀)',
  `SELECT count(*)::int AS n FROM league_teams WHERE is_external IS DISTINCT FROM false`,
  rows => rows[0].n === 0 || `is_external 이 false 가 아닌 행이 ${rows[0].n}건`
)

await check(
  '외부 팀은 아직 0건 (단계 4 에서 생김)',
  `SELECT count(*)::int AS n FROM league_teams WHERE is_external = true`,
  rows => rows[0].n === 0 || `외부 팀이 벌써 ${rows[0].n}건 있음`
)

// ── Task 4: 회귀 방지 — 단계 1 은 데이터를 바꾸지 않았다 ──
await check(
  '경기·선수·이벤트 건수 불변',
  `SELECT
     (SELECT count(*)::int FROM league_games)        AS games,
     (SELECT count(*)::int FROM league_players)      AS players,
     (SELECT count(*)::int FROM league_game_events)  AS events,
     (SELECT count(*)::int FROM league_teams)        AS teams`,
  rows => {
    const r = rows[0]
    // 2026-08-04 단계 1 착수 시점 실측값
    if (r.games !== 301) return `games 기대 301, 실제 ${r.games}`
    if (r.players !== 45) return `players 기대 45, 실제 ${r.players}`
    if (r.teams !== 3) return `league_teams 기대 3, 실제 ${r.teams}`
    if (r.events <= 0) return `events 가 0건`
    return true
  }
)

await check(
  '득점 합계 불변 — 룰을 데이터로 옮겼을 뿐 집계는 아직 안 바뀜',
  `SELECT
     COALESCE(sum(points), 0)::int AS total,
     count(*)::int                 AS made_events
   FROM league_game_events WHERE result = 'made'`,
  rows => {
    const r = rows[0]
    // 2026-08-04 단계 1 착수 시점 실측값 (마이그레이션 074-076 적용 직후)
    // 정당한 드리프트(신규 경기 기록)라면 아래 두 숫자를 갱신할 것
    if (r.total !== 7108) return `득점 합계 기대 7108, 실제 ${r.total} (차이 ${r.total - 7108})`
    if (r.made_events !== 3253) return `성공 슛 이벤트 수 기대 3253, 실제 ${r.made_events} (차이 ${r.made_events - 3253})`
    return true
  }
)

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}건 실패`)
process.exitCode = failed === 0 ? 0 : 1
