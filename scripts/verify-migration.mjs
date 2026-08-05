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

// ── 경기 ─────────────────────────────────────
await check(
  '경기 50건이 전부 옮겨졌다',
  `SELECT count(*)::int n FROM league_games WHERE legacy_id IS NOT NULL`,
  (r) => r[0].n === 50,
)

await check(
  '원본 경기 중 사본이 없는 것이 0건',
  `SELECT count(*)::int n FROM games g
    WHERE NOT EXISTS (SELECT 1 FROM league_games lg WHERE lg.legacy_id = g.id)`,
  (r) => r[0].n === 0,
)

// ⚠ 이 이관 최대의 함정. games.team_type 은 50건 전부 'youth' 지만 실제 장년부가 14건이다.
//   대회를 통해 유도한 팀 귀속이 맞는지 반드시 확인한다.
await check(
  '경기가 대회 원본의 팀 리그에 붙어 있다 (team_type 함정)',
  `SELECT count(*)::int n
     FROM games g
     JOIN tournaments tr ON tr.id = g.tournament_id
     JOIN league_games lg ON lg.legacy_id = g.id
     JOIN leagues l ON l.id = lg.league_id
    WHERE l.team_id IS DISTINCT FROM tr.team_id`,
  (r) => r[0].n === 0,
)

await check(
  '청년부 36경기 · 장년부 14경기로 갈렸다',
  `SELECT l.slug, count(*)::int n
     FROM league_games lg JOIN leagues l ON l.id = lg.league_id
    WHERE lg.legacy_id IS NOT NULL GROUP BY l.slug ORDER BY l.slug`,
  (r) => {
    const m = Object.fromEntries(r.map((x) => [x.slug, x.n]))
    return m['youth-2026'] === 36 && m['senior-2026'] === 14
  },
)

// 점수가 뒤집히면 승패가 반대로 나온다 — 우리 점수는 홈, 상대 점수는 원정이어야 한다.
// venue 는 NULLIF(btrim(...), '') 로 비교한다 — 원본 9건이 NULL 이 아니라 빈 문자열이고,
//   이관 스크립트가 그 9건을 NULL 로 정규화했기 때문이다(normalizeVenue 주석 참고).
await check(
  '경기 속성이 원본과 일치 (날짜·점수·경기장·라운드·완료)',
  `SELECT count(*)::int n
     FROM games g JOIN league_games lg ON lg.legacy_id = g.id
    WHERE lg.date        IS DISTINCT FROM g.date
       OR lg.home_score  IS DISTINCT FROM g.our_score
       OR lg.away_score  IS DISTINCT FROM g.opponent_score
       OR lg.venue       IS DISTINCT FROM NULLIF(btrim(g.venue), '')
       OR lg.round_label IS DISTINCT FROM g.round
       OR lg.is_complete IS DISTINCT FROM g.is_complete
       OR lg.youtube_url IS DISTINCT FROM g.youtube_url`,
  (r) => r[0].n === 0,
)

await check(
  '상대팀 이름이 원본 문자열과 일치',
  `SELECT count(*)::int n
     FROM games g
     JOIN league_games lg ON lg.legacy_id = g.id
     LEFT JOIN league_teams away ON away.id = lg.away_team_id
    WHERE btrim(coalesce(g.opponent, '')) <> coalesce(away.name, '')`,
  (r) => r[0].n === 0,
)

await check(
  '보존 필드가 실제로 채워졌다 (경기장 33 · 라운드 43 · AI MVP 44)',
  `SELECT count(venue)::int v, count(round_label)::int rl, count(ai_mvp)::int am
     FROM league_games WHERE legacy_id IS NOT NULL`,
  (r) => r[0].v === 33 && r[0].rl === 43 && r[0].am === 44,
)

// ── 이벤트 ───────────────────────────────────
await check(
  '이벤트 5993건이 전부 옮겨졌다',
  `SELECT count(*)::int n FROM league_game_events WHERE legacy_id IS NOT NULL`,
  (r) => r[0].n === 5993,
)

await check(
  '원본 이벤트 중 사본이 없는 것이 0건',
  `SELECT count(*)::int n FROM game_events e
    WHERE NOT EXISTS (SELECT 1 FROM league_game_events x WHERE x.legacy_id = e.id)`,
  (r) => r[0].n === 0,
)

// LEFT JOIN 이라 선수 매핑이 실패해도 조용히 NULL 이 된다 — 여기서 잡는다.
await check(
  '선수가 있던 이벤트는 사본에도 선수가 있다',
  `SELECT count(*)::int n
     FROM game_events e JOIN league_game_events x ON x.legacy_id = e.id
    WHERE (e.player_id IS NULL) <> (x.league_player_id IS NULL)
       OR (e.related_player_id IS NULL) <> (x.related_player_id IS NULL)`,
  (r) => r[0].n === 0,
)

await check(
  '이벤트 타입·결과·점수·쿼터가 원본과 일치',
  `SELECT count(*)::int n
     FROM game_events e JOIN league_game_events x ON x.legacy_id = e.id
    WHERE x.type    IS DISTINCT FROM e.type::text
       OR x.result  IS DISTINCT FROM e.result::text
       OR x.points  IS DISTINCT FROM e.points
       OR x.quarter IS DISTINCT FROM e.quarter
       OR x.video_timestamp IS DISTINCT FROM e.video_timestamp
       OR x.shot_zone IS DISTINCT FROM e.shot_zone`,
  (r) => r[0].n === 0,
)

// league_game_events.team_id 는 반드시 채워야 한다는 코드베이스 규칙이 있다.
await check(
  '모든 이관 이벤트에 team_id 가 있다',
  `SELECT count(*)::int n FROM league_game_events WHERE legacy_id IS NOT NULL AND team_id IS NULL`,
  (r) => r[0].n === 0,
)

await check(
  '상대 득점만 외부 팀에 달려 있다',
  `SELECT count(*)::int n
     FROM league_game_events x JOIN league_teams lt ON lt.id = x.team_id
    WHERE x.legacy_id IS NOT NULL AND lt.is_external AND x.type <> 'opp_score'`,
  (r) => r[0].n === 0,
)

// ★ 최종 관문 — 선수별 총득점을 원본 대비 전수 대조한다.
//   총합이 맞아도 두 선수의 점수가 서로 바뀌었다면 이 단언만이 잡아낸다.
await check(
  '선수별 총득점이 원본과 한 명도 빠짐없이 일치',
  `WITH src AS (
     SELECT player_id, sum(points)::int pts FROM game_events
      WHERE player_id IS NOT NULL GROUP BY player_id
   ), dst AS (
     SELECT lp.legacy_id AS player_id, sum(x.points)::int pts
       FROM league_game_events x JOIN league_players lp ON lp.id = x.league_player_id
      WHERE x.legacy_id IS NOT NULL AND lp.legacy_id IS NOT NULL
      GROUP BY lp.legacy_id
   )
   SELECT count(*)::int n FROM src FULL OUTER JOIN dst USING (player_id)
    WHERE src.pts IS DISTINCT FROM dst.pts`,
  (r) => r[0].n === 0,
)

await check(
  '전체 득점 2138 · 상대 득점 322 가 일치',
  `SELECT sum(points)::int total, sum(points) FILTER (WHERE type='opp_score')::int opp
     FROM league_game_events WHERE legacy_id IS NOT NULL`,
  (r) => r[0].total === 2138 && r[0].opp === 322,
)

// 경기 기록 점수와 경기 스코어가 어긋나면 박스스코어와 순위표가 서로 다른 말을 한다.
await check(
  '경기별 우리 득점 합이 경기 스코어와 맞는 경기가 원본과 같은 수',
  `WITH src AS (
     SELECT g.id, g.our_score, sum(e.points) FILTER (WHERE e.player_id IS NOT NULL) pts
       FROM games g LEFT JOIN game_events e ON e.game_id = g.id GROUP BY g.id, g.our_score
   ), dst AS (
     SELECT lg.legacy_id AS id, lg.home_score,
            sum(x.points) FILTER (WHERE x.league_player_id IS NOT NULL) pts
       FROM league_games lg LEFT JOIN league_game_events x ON x.league_game_id = lg.id
      WHERE lg.legacy_id IS NOT NULL GROUP BY lg.legacy_id, lg.home_score
   )
   SELECT count(*)::int n FROM src JOIN dst USING (id)
    WHERE src.pts IS DISTINCT FROM dst.pts OR src.our_score IS DISTINCT FROM dst.home_score`,
  (r) => r[0].n === 0,
)

// ── 출전시간 · 대회 명단 ─────────────────────
await check(
  '출전시간 1525행이 옮겨졌다',
  `SELECT count(*)::int n FROM league_player_minutes m
     JOIN league_games lg ON lg.id = m.league_game_id WHERE lg.legacy_id IS NOT NULL`,
  (r) => r[0].n === 1525,
)

await check(
  '대회 명단 112행이 옮겨졌다',
  `SELECT count(*)::int n FROM league_player_quarters pq
     JOIN league_quarters lq ON lq.id = pq.quarter_id WHERE lq.legacy_id IS NOT NULL`,
  (r) => r[0].n === 112,
)

// ── 리그 엔진 관점의 교차 검증 (단계 B-5) ────
// 여기까지는 "복사가 정확한가" 를 봤다. 이제 "리그 코드가 읽었을 때 같은 숫자인가" 를 본다.
//   복사가 완벽해도 집계 로직이 opp_score·foul 같은 낯선 타입에서 다르게 굴 수 있다.

// 규칙 엔진으로 재계산한 값과 저장값이 어긋나는 이벤트 — 0이어야 한다.
//   opp_score 는 규칙에 없는 타입이라 제외한다(재계산 대상이 아니며, 재계산하면 322점이 통째로 0이 된다).
await check(
  '저장 점수와 규칙 재계산이 일치 (opp_score 제외)',
  `SELECT count(*)::int n
     FROM league_game_events x
     JOIN league_games lg ON lg.id = x.league_game_id
     JOIN leagues l ON l.id = lg.league_id
    WHERE x.legacy_id IS NOT NULL AND x.type <> 'opp_score'
      AND x.points IS DISTINCT FROM (
        CASE WHEN x.result = 'made'
             THEN coalesce((l.rules->'event_points'->>x.type)::int, 0)
             ELSE 0 END)`,
  (r) => r[0].n === 0,
)

await check(
  '미라클 득점 총합 불변 (7114)',
  `SELECT coalesce(sum(x.points),0)::int n
     FROM league_game_events x JOIN league_games lg ON lg.id = x.league_game_id
    WHERE lg.league_id = '8eda8257-8907-4bf3-a7de-e5e7fde54a89'`,
  (r) => r[0].n === 7114,
)

await check(
  '이관 행이 미라클 리그에 없다',
  `SELECT (SELECT count(*)::int FROM league_players WHERE legacy_id IS NOT NULL AND league_id='8eda8257-8907-4bf3-a7de-e5e7fde54a89') p,
          (SELECT count(*)::int FROM league_games   WHERE legacy_id IS NOT NULL AND league_id='8eda8257-8907-4bf3-a7de-e5e7fde54a89') g`,
  (r) => r[0].p === 0 && r[0].g === 0,
)

// 이 단계의 대전제 — 레거시 원본 무손상. 이게 깨지면 다른 무엇이 통과해도 의미가 없다.
await check(
  '레거시 원본 행 수가 그대로 (경기 50 · 이벤트 5993 · 선수 68 · 대회 12)',
  `SELECT (SELECT count(*)::int FROM games) g, (SELECT count(*)::int FROM game_events) e,
          (SELECT count(*)::int FROM players) p, (SELECT count(*)::int FROM tournaments) t`,
  (r) => r[0].g === 50 && r[0].e === 5993 && r[0].p === 68 && r[0].t === 12,
)

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}건 실패`)
process.exit(failed === 0 ? 0 : 1)
