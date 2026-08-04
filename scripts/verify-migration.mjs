#!/usr/bin/env node
// 이관 대조 — 원본(레거시)을 진실로 삼아 사본(리그)을 검사한다.
//
// 왜 이관 스크립트와 분리하나: 같은 코드가 옮기고 스스로 채점하면, 잘못 옮긴 것을
//   잘못된 기준으로 통과시킨다. 이 파일은 migrate-legacy.mjs 의 변수나 매핑을 쓰지 않고
//   원본 테이블을 직접 다시 읽는다.
//
// migrate-legacy.mjs 와 같은 방식으로 scripts/lib/supabase-admin.mjs 의 query() 를 그대로 쓴다
// (db-migrate.mjs 는 runSql 을 export 하지 않는다 — Step 1 확인 사항).
//
// 하나라도 실패하면 exit 1.
import { query } from './lib/supabase-admin.mjs'

let failed = 0

async function check(name, sqlText, assertFn) {
  const rows = await query(sqlText)
  const ok = assertFn(rows)
  console.log(`${ok ? '✔' : '✖'} ${name}`)
  if (!ok) {
    failed += 1
    console.log('   실제:', JSON.stringify(rows).slice(0, 500))
  }
}

// ── 리그 ─────────────────────────────────────
await check(
  '대회형 리그 2개 생성 (mode=tournament)',
  `SELECT count(*)::int n FROM leagues WHERE org_slug='paranalgae' AND mode='tournament'`,
  (r) => r[0].n === 2,
)

// 가산점 규칙이 새어 들어오면 이관된 과거 기록이 재계산될 때 득점이 부풀어 오른다.
await check(
  '대회형 리그에 plus_one 가산이 없다',
  `SELECT count(*)::int n FROM leagues
    WHERE mode='tournament' AND (rules->'plus_one_bonus'->>'amount')::int <> 0`,
  (r) => r[0].n === 0,
)

// 총무 PIN 이 그대로여야 이관 직후에도 기록을 넣을 수 있다.
await check(
  '리그 edit_pin 이 레거시 팀 PIN 과 같다',
  `SELECT count(*)::int n
     FROM leagues l JOIN teams t ON t.id = l.team_id
    WHERE l.mode='tournament' AND l.edit_pin IS DISTINCT FROM t.edit_pin`,
  (r) => r[0].n === 0,
)

// ── 대회(세그먼트) ───────────────────────────
await check(
  '대회 12개가 세그먼트로 옮겨졌다',
  `SELECT count(*)::int n FROM league_quarters WHERE kind='tournament' AND legacy_id IS NOT NULL`,
  (r) => r[0].n === 12,
)

// 원본 대회가 하나도 빠지지 않았는지 — 개수만 맞고 다른 행이 들어간 경우를 잡는다.
await check(
  '원본 대회 중 사본이 없는 것이 0건',
  `SELECT count(*)::int n FROM tournaments tr
    WHERE NOT EXISTS (SELECT 1 FROM league_quarters q WHERE q.legacy_id = tr.id)`,
  (r) => r[0].n === 0,
)

await check(
  '대회의 종류·설명이 원본과 같다',
  `SELECT count(*)::int n
     FROM tournaments tr JOIN league_quarters q ON q.legacy_id = tr.id
    WHERE q.name IS DISTINCT FROM tr.name
       OR q.tournament_type IS DISTINCT FROM tr.type
       OR q.description IS DISTINCT FROM tr.description`,
  (r) => r[0].n === 0,
)

// 대회가 엉뚱한 팀의 리그에 붙는 것을 막는다 — 이 이관의 최대 함정(games.team_type)과 같은 종류의 사고.
await check(
  '대회가 원본 팀의 리그에 붙어 있다',
  `SELECT count(*)::int n
     FROM tournaments tr
     JOIN league_quarters q ON q.legacy_id = tr.id
     JOIN leagues l ON l.id = q.league_id
    WHERE l.team_id IS DISTINCT FROM tr.team_id`,
  (r) => r[0].n === 0,
)

// ── 팀 ───────────────────────────────────────
await check(
  '우리 팀이 리그마다 정확히 1개',
  `SELECT count(*)::int n FROM league_teams lt
     JOIN leagues l ON l.id = lt.league_id
    WHERE l.mode='tournament' AND NOT lt.is_external`,
  (r) => r[0].n === 2,
)

await check(
  '외부 상대팀이 원본 상대 이름 집합과 일치',
  `WITH src AS (
     SELECT DISTINCT l.id AS league_id, btrim(g.opponent) AS name
       FROM games g
       JOIN tournaments tr ON tr.id = g.tournament_id
       JOIN leagues l ON l.team_id = tr.team_id AND l.mode='tournament'
      WHERE g.opponent IS NOT NULL AND btrim(g.opponent) <> ''
   ), dst AS (
     SELECT lt.league_id, lt.name FROM league_teams lt
      JOIN leagues l ON l.id = lt.league_id
     WHERE l.mode='tournament' AND lt.is_external
   )
   SELECT (SELECT count(*)::int FROM (SELECT * FROM src EXCEPT SELECT * FROM dst) x) AS missing,
          (SELECT count(*)::int FROM (SELECT * FROM dst EXCEPT SELECT * FROM src) y) AS extra`,
  (r) => r[0].missing === 0 && r[0].extra === 0,
)

// ── 미라클 불변 ──────────────────────────────
// 이관은 파란날개만 건드려야 한다. 미라클 쪽이 한 행이라도 움직이면 즉시 실패시킨다.
await check(
  '미라클 리그는 손대지 않았다',
  `SELECT (SELECT count(*)::int FROM league_players WHERE league_id='8eda8257-8907-4bf3-a7de-e5e7fde54a89') p,
          (SELECT count(*)::int FROM league_teams   WHERE league_id='8eda8257-8907-4bf3-a7de-e5e7fde54a89') t`,
  (r) => r[0].p === 45 && r[0].t === 3,
)

// ── 선수 ─────────────────────────────────────
await check(
  '선수 68명이 전부 옮겨졌다',
  `SELECT count(*)::int n FROM league_players WHERE legacy_id IS NOT NULL`,
  (r) => r[0].n === 68,
)

await check(
  '원본 선수 중 사본이 없는 것이 0건',
  `SELECT count(*)::int n FROM players p
    WHERE NOT EXISTS (SELECT 1 FROM league_players lp WHERE lp.legacy_id = p.id)`,
  (r) => r[0].n === 0,
)

// 이름·등번호·키·선출 여부가 한 명이라도 다르면 실패. 총합이 아니라 행 단위 대조다.
await check(
  '선수 속성이 원본과 일치 (이름·등번호·키·선출·활동)',
  `SELECT count(*)::int n
     FROM players p JOIN league_players lp ON lp.legacy_id = p.id
    WHERE lp.name       IS DISTINCT FROM p.name
       OR lp.number     IS DISTINCT FROM p.number::int
       OR lp.height_cm  IS DISTINCT FROM p.height_cm
       OR lp.is_pro     IS DISTINCT FROM p.is_pro
       OR lp.is_active  IS DISTINCT FROM p.is_active
       OR lp.birth_date IS DISTINCT FROM p.birthdate
       OR lp.photo_url  IS DISTINCT FROM p.photo_url`,
  (r) => r[0].n === 0,
)

// 이 이관의 최대 함정과 같은 종류: 선수가 엉뚱한 팀의 리그로 들어가는 사고.
await check(
  '선수가 원본 팀의 리그에 속해 있다',
  `SELECT count(*)::int n
     FROM players p
     JOIN league_players lp ON lp.legacy_id = p.id
     JOIN leagues l ON l.id = lp.league_id
    WHERE l.team_id IS DISTINCT FROM p.team_id`,
  (r) => r[0].n === 0,
)

await check(
  '선수가 전부 우리 팀 명단에 연결됐다',
  `SELECT count(*)::int n
     FROM league_players lp
    WHERE lp.legacy_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM league_team_players ltp WHERE ltp.league_player_id = lp.id)`,
  (r) => r[0].n === 0,
)

await check(
  '선출 7명 · 비활동 3명이 그대로 옮겨졌다',
  `SELECT count(*) FILTER (WHERE is_pro)::int pro,
          count(*) FILTER (WHERE NOT is_active)::int inactive
     FROM league_players WHERE legacy_id IS NOT NULL`,
  (r) => r[0].pro === 7 && r[0].inactive === 3,
)

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}건 실패`)
process.exit(failed === 0 ? 0 : 1)
