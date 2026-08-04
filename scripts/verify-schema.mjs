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

// I5(077) — plus_one_bonus 는 077 부터 { amount, applies_to } 구조다.
// applies_to 는 야투 4종에만 고정(leagueStats.ts / players/[playerId]/detail/route.ts 실측) —
// and_one · 자유투에는 절대 붙지 않으므로 단계2 룰 엔진이 이 리스트를 하드코딩하지 않게 한다.
const SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post']

await check(
  'miracle 룰 — plus_one_bonus={amount:1,applies_to:야투4종}, 자유투 ft_2pt=2',
  `SELECT rules FROM leagues WHERE org_slug = 'miracle'`,
  rows => {
    const r = rows[0].rules
    const b = r.plus_one_bonus
    if (b.amount !== 1) return `plus_one_bonus.amount 기대 1, 실제 ${b.amount}`
    if (JSON.stringify(b.applies_to) !== JSON.stringify(SHOT_TYPES)) return `plus_one_bonus.applies_to 기대 ${JSON.stringify(SHOT_TYPES)}, 실제 ${JSON.stringify(b.applies_to)}`
    if (r.event_points.ft_2pt !== 2) return `ft_2pt 기대 2, 실제 ${r.event_points.ft_2pt}`
    if (r.round_unit !== 'day') return `round_unit 기대 day, 실제 ${r.round_unit}`
    if (r.qualification.min_round_ratio !== 0.3) return `min_round_ratio 기대 0.3, 실제 ${r.qualification.min_round_ratio}`
    return true
  }
)

await check(
  '표준 룰 기본값 — 신규 시즌은 plus_one_bonus.amount=0 · 자유투 1점',
  `SELECT rules FROM leagues WHERE org_slug = 'pana-basket-senior'`,
  rows => {
    const r = rows[0].rules
    const b = r.plus_one_bonus
    if (b.amount !== 0) return `plus_one_bonus.amount 기대 0, 실제 ${b.amount}`
    if (JSON.stringify(b.applies_to) !== JSON.stringify(SHOT_TYPES)) return `plus_one_bonus.applies_to 기대 ${JSON.stringify(SHOT_TYPES)}, 실제 ${JSON.stringify(b.applies_to)}`
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
//
// M8(077): 원래 이 블록은 games=301 처럼 전체 카운트를 그대로 박아뒀다 — 그런데
// league_games 에는 미래 예정 경기(스케줄 스텁, 아직 안 뛴 경기)가 계속 쌓이므로
// 새 경기가 열릴 때마다 이 assertion 이 깨지고, "깨지면 숫자를 고친다"가 습관이 되면
// assertion 은 있으나 마나 해진다. league_games.date / league_game_events.created_at 로
// 기준일(2026-08-04, 이 리뷰 착수일) 이전만 스코프해 숫자가 시간이 지나도 안 변하게 한다.
// league_players / league_teams 는 날짜 컬럼이 없어 스코프할 수 없다 — 회원이 늘면(팀 창단 등)
// 그때 가서 숫자를 갱신해야 한다는 걸 감안하고 그대로 둔다.
const BASELINE_DATE = '2026-08-04'      // league_games.date 기준 (경기일, 자정 단위라 <= 로 포함)
const BASELINE_NEXT_DAY = '2026-08-05'  // league_game_events.created_at 기준 (타임스탬프라 < 로 배타)

await check(
  `경기(2026-08-04 이전) · 선수 · 이벤트 건수 불변`,
  `SELECT
     (SELECT count(*)::int FROM league_games WHERE date <= '${BASELINE_DATE}') AS games,
     (SELECT count(*)::int FROM league_players)                               AS players,
     (SELECT count(*)::int FROM league_game_events)                          AS events,
     (SELECT count(*)::int FROM league_teams)                                 AS teams`,
  rows => {
    const r = rows[0]
    // 2026-08-04 단계 1 착수 시점 실측값 — games 는 그 날짜까지로 스코프된 값
    if (r.games !== 279) return `games(~${BASELINE_DATE}) 기대 279, 실제 ${r.games}`
    if (r.players !== 45) return `players 기대 45, 실제 ${r.players} (클럽에 회원이 늘면 이 숫자를 갱신할 것)`
    if (r.teams !== 3) return `league_teams 기대 3, 실제 ${r.teams} (팀이 새로 생기면 이 숫자를 갱신할 것)`
    if (r.events <= 0) return `events 가 0건`
    return true
  }
)

await check(
  `득점 합계 불변(이벤트 생성일 ${BASELINE_NEXT_DAY} 이전) — 룰을 데이터로 옮겼을 뿐 집계는 아직 안 바뀜`,
  `SELECT
     COALESCE(sum(points), 0)::int AS total,
     count(*)::int                 AS made_events
   FROM league_game_events WHERE result = 'made' AND created_at < '${BASELINE_NEXT_DAY}'`,
  rows => {
    const r = rows[0]
    // 2026-08-04 단계 1 착수 시점 실측값 (마이그레이션 074-076 적용 직후, created_at 스코프 재측정)
    if (r.total !== 7108) return `득점 합계 기대 7108, 실제 ${r.total} (차이 ${r.total - 7108})`
    if (r.made_events !== 3253) return `성공 슛 이벤트 수 기대 3253, 실제 ${r.made_events} (차이 ${r.made_events - 3253})`
    return true
  }
)

// ── I2(077): NOT NULL 인데 채워질 방법이 없는 컬럼 — C1 이 대표하는 버그 클래스 회귀 방지 ──
// C1 은 league_quarters.name/ord 가 NOT NULL 인데 기본값도, (당시엔) 트리거도 없어서
// 부분 업서트가 23502 로 깨진 사고였다. 이 assertion 은 "NOT NULL 인데 기본값도 트리거도
// 없는 컬럼"을 구조적으로 찾아서 같은 사고가 또 나기 전에 잡는다.
//
// 스코프: 074~076 이 이번 단계에서 새로 추가한 컬럼만 본다. PK, teams.sub_slug,
// leagues.slug 같은 기존(단계 1 이전) 컬럼까지 포함하면 원래부터 기본값/트리거 없이
// 항상 명시적으로 채워온 정상 컬럼들이 대량으로 걸려 노이즈가 된다.
//
// 아래 4개는 "단계 1 이 추가한 컬럼"이지만 의도적으로 제외했다 — 트리거로 기계적 유도가
// 불가능한 호출자 필수 입력값이기 때문:
//   orgs.slug / orgs.name : orgs 테이블은 아직 앱 쓰기 경로가 없다(마이그레이션에서만 INSERT).
//   teams.org_id          : org_slug → org_id 유도가 가능해 보이지만, POST /api/admin/orgs
//                           는 "새 클럽 등록"이라 애초에 orgs 행이 없는 org_slug 를 만든다 —
//                           유도할 org 자체가 없으므로 트리거로 못 고친다. 실제로 이 라우트는
//                           지금 org_id 없이 INSERT 해서 깨져 있다(별도 후속 작업 필요, 리포트 참고).
//   leagues.team_id       : leagues.org_slug 는 teams.org_slug 와 다른 네임스페이스로 논다
//                           (074 주석 참고, 예: 'pana-basket-senior' → org 'paranalgae'/'senior')
//                           라서 기계적으로 유도할 수 없다. POST /api/leagues 도 team_id 없이
//                           INSERT 해서 마찬가지로 깨져 있다(별도 후속 작업 필요, 리포트 참고).
const STAGE1_NOT_NULL_COLUMNS = [
  ['orgs', 'status'],
  ['orgs', 'created_at'],
  ['leagues', 'mode'],
  ['leagues', 'rules'],
  ['league_quarters', 'kind'],
  ['league_quarters', 'name'],    // 077 트리거로 커버
  ['league_quarters', 'ord'],     // 077 트리거로 커버
  ['league_teams', 'is_external'],
]

const TRIGGER_COVERED = new Set(['league_quarters.name', 'league_quarters.ord'])

await check(
  '단계 1 이 추가한 NOT NULL 컬럼은 기본값 또는 트리거로 커버됨 (C1 회귀 방지)',
  `SELECT table_name, column_name, column_default
     FROM information_schema.columns
    WHERE table_schema = 'public'
      AND is_nullable = 'NO'
      AND table_name IN ('orgs','teams','leagues','league_quarters','league_teams')`,
  rows => {
    const wanted = new Set(STAGE1_NOT_NULL_COLUMNS.map(([t, c]) => `${t}.${c}`))
    const bad = []
    for (const key of wanted) {
      const [t, c] = key.split('.')
      const row = rows.find(r => r.table_name === t && r.column_name === c)
      if (!row) continue // 컬럼이 없거나(스코프 밖) NULL 허용으로 바뀜 — 이 체크 대상 아님
      const hasDefault = row.column_default !== null
      const hasTrigger = TRIGGER_COVERED.has(key)
      if (!hasDefault && !hasTrigger) bad.push(key)
    }
    return bad.length === 0 || `기본값도 트리거도 없는 NOT NULL 컬럼: ${bad.join(', ')}`
  }
)

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}건 실패`)
process.exitCode = failed === 0 ? 0 : 1
