# 통일 단계 B — 파란날개 데이터 복사 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 파란날개(청년부·장년부)의 레거시 기록 전체를 리그 테이블로 복사하고, 원본과 행 단위로 대조해 한 건도 어긋나지 않았음을 증명한다.

**Architecture:** 레거시 원본은 **읽기만** 한다 — 이 단계 어디에서도 `games`·`game_events`·`players`·`tournaments` 를 수정하거나 삭제하지 않는다. 이관은 단일 스크립트(`scripts/migrate-legacy.mjs`)가 상위→하위 순서로 수행하며, 단계 A 가 만든 `legacy_id` 로 멱등하다(있으면 갱신, 없으면 삽입). 별도 스크립트(`scripts/verify-migration.mjs`)가 원본을 진실로 삼아 사본을 대조하며, 태스크마다 단언이 늘어난다. 화면은 이 단계에서 여전히 레거시를 본다.

**Tech Stack:** Node 24 (ESM, `.mjs`), Supabase Management API 경유 SQL(`scripts/db-migrate.mjs sql`), PostgreSQL.

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-08-05-tournament-league-unification-design.md` (단계 B 에 해당)
- 선행: 단계 A 완료됨 — 마이그레이션 083 적용, `legacy_id` 5개와 보존 컬럼 8개 존재, `legacy_id` 채워진 행 0건
- **운영 DB.** 미라클모닝·파란날개가 매일 쓴다.
- **레거시 테이블 쓰기 금지.** `INSERT`/`UPDATE`/`DELETE` 대상은 `league_*` 테이블뿐이다. 레거시에 쓰는 문장을 작성하게 되면 중단하고 보고한다.
- **미라클 불변.** 모든 태스크 끝에서 `node scripts/verify-schema.mjs` 와 `node scripts/verify-scoring.mjs` 가 exit 0 이어야 한다 (미라클 득점 7114 · 선수 45 · 경기 271 · league_teams 3).
- 스크립트 기본은 **드라이런**. 실제 쓰기는 `--commit` 플래그로만. `scripts/onboard-club.mjs` 가 쓰는 관례와 같다.
- ⚠ `games.team_type` 을 **절대 신뢰하지 않는다.** 50경기 전부 `'youth'` 로 적혀 있으나 실제 장년부 경기가 14건이다. 팀은 반드시 `games.tournament_id → tournaments.team_id` 로 유도한다.
- 브랜치 `master`. 태스크마다 커밋. **푸시 금지** — 단계 전체 검토 후 한 번에.
- 주석·커밋 메시지는 한국어. *왜* 를 적는다.
- 작업 디렉터리는 `c:\Users\N_399\Desktop\ai_rob\basketball-stats-dashboard`. 셸이 리셋되므로 매 명령 앞에 `cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard &&` 를 붙인다.

## 이관 규모 (실측)

| 원본 | 행 수 | 사본 대상 |
|---|---|---|
| `tournaments` | 12 (청년 8 / 장년 4) | `league_quarters` (kind='tournament') |
| `games` | 50 (청년 36 / 장년 14) | `league_games` |
| `game_events` | 5,993 | `league_game_events` |
| `players` | 68 (청년 36 / 장년 32) | `league_players` |
| `player_minutes` | 1,525 | `league_player_minutes` |
| `tournament_players` | 112 | `league_player_quarters` |
| `games.opponent` 고유값 | 41 | `league_teams` (is_external=true) |

## 이벤트 타입 대응 (실측)

| 레거시 타입 | 건수 | 점수 합 | 처리 |
|---|---|---|---|
| `shot_3p` | 724 (성공 186) | 558 | 그대로 |
| `shot_2p_mid` | ... (성공 120) | 240 | 그대로 |
| `shot_layup` | 352 (성공 202) | 404 | 그대로 |
| `shot_post` | 288 (성공 157) | 314 | 그대로 |
| `free_throw` | 467 (성공 300) | 300 | 그대로 (`STANDARD_SCORING` 에 `free_throw: 1` 존재) |
| `foul` | 588 | 0 | 그대로 — **리그 모드는 파울을 기록하지 않으므로 이건 덤으로 살아남는 데이터다** |
| `dreb` / `oreb` / `steal` / `block` / `turnover` | 731 / 266 / 187 / 112 / 328 | 0 | 그대로 |
| `sub_in` / `sub_out` | 512 / 512 | 0 | 그대로 |
| `opp_score` | 177 | **322** | 그대로 — 단, 선수 없음 · `team_id` 는 **외부 상대팀** |
| `quarter_start` / `quarter_end` | 199 / 140 | 0 | 그대로 — 선수 없음 · `team_id` 는 우리 팀 |

우리 팀 총득점 1,816 + 상대 322 = **전체 2,138**. 이 두 숫자가 대조의 최종 관문이다.

⚠ 레거시에는 `and_one` · `ft_2pt` · `ft_3pt_1` · `ft_3pt_2` 타입이 **존재하지 않는다.** 앤드원은 "성공 슛 + 별개의 자유투" 두 행으로 남아 있고 둘을 잇는 정보가 없다. 총점은 맞지만 파울 종류별 세분화는 소급 복원이 불가능하다. 이건 받아들인다.

⚠ `opp_score` 는 리그 규칙 엔진(`scorePoints`)이 모르는 타입이다 — 재계산하면 0이 된다. **이 단계는 저장된 `points` 를 그대로 복사하지 재계산하지 않는다.** 단계 C 에서 상대 득점을 어떻게 표시할지 정할 때 이 사실을 반드시 고려해야 한다.

---

## 파일 구성

| 파일 | 책임 |
|---|---|
| `scripts/migrate-legacy.mjs` (신규) | 이관 전부. 상위→하위 순서로 실행. 드라이런 기본, `--commit` 으로 적용. |
| `scripts/verify-migration.mjs` (신규) | 원본↔사본 대조. 태스크마다 단언이 늘어난다. 실패 시 exit 1. |
| `docs/legacy-migration-notes.md` (신규) | 이관 중 내린 판단과 실측 수치 기록. 단계 C·D 가 참조한다. |

이관과 검증을 **한 파일에 합치지 않는다.** 같은 코드가 옮기고 스스로 채점하면, 잘못 옮긴 것을 잘못된 기준으로 통과시킨다. 검증 스크립트는 이관 스크립트의 변수·매핑을 재사용하지 않고 원본 테이블을 직접 다시 읽는다.

## 신규 `leagues` 행 설계

| 필드 | 청년부 | 장년부 |
|---|---|---|
| `org_slug` | `paranalgae` | `paranalgae` |
| `slug` | `youth-2026` | `senior-2026` |
| `name` | `파란날개 청년부` | `파란날개 장년부` |
| `team_id` | `cf9bf3ce-6713-470f-ad1d-3ba3de17cc5b` | `194b30d8-d7da-4d5f-8c70-750edbfb563b` |
| `mode` | `tournament` | `tournament` |
| `season_year` | 2026 | 2026 |
| `season_type` | `annual` | `annual` |
| `status` | `active` | `active` |
| `start_date` | 해당 팀 최소 경기일 | 해당 팀 최소 경기일 |
| `total_rounds` | 대회 수 (8) | 대회 수 (4) |
| `edit_pin` | **레거시 `teams.edit_pin` 그대로** | **레거시 `teams.edit_pin` 그대로** |

`edit_pin` 을 새로 만들지 않는 이유: 파란날개 총무가 쓰던 PIN 이 그대로 통해야 한다. 새 PIN 을 발급하면 이관 직후 아무도 기록을 못 넣는다.

`rules` (양쪽 동일):
```json
{
  "round_unit": "tournament",
  "event_points": {
    "shot_3p": 3, "shot_2p_mid": 2, "shot_layup": 2, "shot_post": 2,
    "ft_2pt": 2, "ft_3pt_1": 2, "ft_3pt_2": 1, "free_throw": 1, "and_one": 1
  },
  "plus_one_bonus": { "amount": 0, "applies_to": ["shot_3p", "shot_2p_mid", "shot_layup", "shot_post"] },
  "qualification": { "min_round_ratio": 0.3 }
}
```

`plus_one_bonus.amount` 가 **0** 인 것이 핵심이다. 미라클은 1점 가산 규칙이 있지만 파란날개에는 없다. 1로 두면 이관된 과거 기록의 득점이 재계산될 때 부풀어 오른다.

⚠ `leagues` 에는 `UNIQUE (org_slug, slug)` 와 `UNIQUE (team_id, season_year, slug)` 가 있다. 위 조합은 둘 다 만족한다. 기존 `pana-basket-senior` 스텁(`76f91f2f-…`, `mode='league'`, "파란날개 장년부 자체전")은 **건드리지 않는다** — 그건 자체전용 리그로 대회 기록과 다른 개념이다.

⚠ 알려진 미해결: `/league/paranalgae` (leagueId 없는 주소)는 org 아래 리그가 둘이 되면 어느 쪽으로 보낼지 모호해진다. **단계 C 에서 해결한다.** 이 단계에서는 손대지 않는다.

---

### Task 1: 이관 골격 + 리그·대회·팀

**Files:**
- Create: `scripts/migrate-legacy.mjs`
- Create: `scripts/verify-migration.mjs`
- Create: `docs/legacy-migration-notes.md`

**Interfaces:**
- Consumes: 단계 A 의 `legacy_id` 컬럼들, `league_quarters.tournament_type` / `.description`
- Produces: 이후 태스크가 쓰는 헬퍼와 산출물
  - `sql(query: string): Promise<object[]>` — 읽기 질의
  - `exec(query: string): Promise<void>` — 쓰기 질의 (드라이런이면 출력만 하고 실행 안 함)
  - `COMMIT: boolean` — `--commit` 여부
  - DB 산출물: `leagues` 2행(`mode='tournament'`), `league_quarters` 12행, `league_teams` 우리 팀 2행 + 외부 상대팀 N행

- [ ] **Step 1: 기존 스크립트의 관례 확인**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && head -60 scripts/db-migrate.mjs && echo '=== ONBOARD ===' && head -50 scripts/onboard-club.mjs
```

`db-migrate.mjs` 가 어떻게 토큰을 찾고 SQL 을 던지는지, `onboard-club.mjs` 가 드라이런을 어떻게 표현하는지 확인한다. **새 방식을 만들지 말고 이 관례를 그대로 따른다.** 특히 토큰 해석 순서(env → `.env.local` → `~/.claude.json`)를 재구현하지 말고 재사용할 방법을 찾는다.

- [ ] **Step 2: 이관 대상 실측값을 먼저 확인**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT t.id team_id, t.name, t.sub_slug, count(DISTINCT tr.id) tournaments, count(DISTINCT g.id) games, min(g.date) first_game, count(DISTINCT p.id) players FROM teams t LEFT JOIN tournaments tr ON tr.team_id=t.id LEFT JOIN games g ON g.tournament_id=tr.id LEFT JOIN players p ON p.team_id=t.id WHERE t.org_slug='paranalgae' GROUP BY t.id, t.name, t.sub_slug"
```
Expected: 2행 — 청년부(`cf9bf3ce…`) 대회 8·경기 36·선수 36, 장년부(`194b30d8…`) 대회 4·경기 14·선수 32.

숫자가 다르면 **중단하고 보고** — 계획이 세워진 이후 데이터가 바뀐 것이므로 매핑을 다시 검토해야 한다.

- [ ] **Step 3: 이관 스크립트 골격 작성**

Create `scripts/migrate-legacy.mjs`:

```js
#!/usr/bin/env node
// 파란날개(대회형) → 리그 구조 이관. 통일 단계 B.
//
// 원칙
//   1. 레거시 원본은 읽기만 한다. games/game_events/players/tournaments 에
//      INSERT·UPDATE·DELETE 를 하지 않는다 — 문제가 생겨도 되돌릴 곳이 남아 있어야 한다.
//   2. legacy_id 로 멱등하다. 두 번 돌려도 중복이 안 생긴다(있으면 갱신).
//   3. 기본은 드라이런. 실제 쓰기는 --commit 을 줘야 한다.
//
// ⚠ games.team_type 을 쓰지 않는다. 50경기 전부 'youth' 로 적혀 있으나
//   실제 장년부 경기가 14건이다. 팀은 tournament_id → tournaments.team_id 로만 유도한다.
//
// 사용:
//   node scripts/migrate-legacy.mjs           # 드라이런 — 무엇을 할지 출력만
//   node scripts/migrate-legacy.mjs --commit  # 실제 적용

import { runSql } from './db-migrate.mjs'   // Step 1 에서 확인한 실제 export 이름으로 교체

const COMMIT = process.argv.includes('--commit')

// 파란날개 두 팀 — 레거시 teams.id. 하드코딩하는 이유: 이관은 일회성이고,
//   슬러그로 찾다가 엉뚱한 팀을 잡으면 남의 기록을 옮기게 된다.
const TEAMS = [
  { legacyTeamId: 'cf9bf3ce-6713-470f-ad1d-3ba3de17cc5b', slug: 'youth-2026',  name: '파란날개 청년부' },
  { legacyTeamId: '194b30d8-d7da-4d5f-8c70-750edbfb563b', slug: 'senior-2026', name: '파란날개 장년부' },
]

// 파란날개에는 나이 가산 규칙이 없다. amount 를 1로 두면(미라클 규칙) 이관된
//   과거 기록이 재계산될 때 득점이 부풀어 오른다.
const TOURNAMENT_RULES = {
  round_unit: 'tournament',
  event_points: {
    shot_3p: 3, shot_2p_mid: 2, shot_layup: 2, shot_post: 2,
    ft_2pt: 2, ft_3pt_1: 2, ft_3pt_2: 1, free_throw: 1, and_one: 1,
  },
  plus_one_bonus: { amount: 0, applies_to: ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post'] },
  qualification: { min_round_ratio: 0.3 },
}

function q(v) {
  // SQL 문자열 리터럴 이스케이프. 상대팀 이름에 작은따옴표가 들어 있을 수 있다.
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return `'${String(v).replace(/'/g, "''")}'`
}

async function sql(query) {
  return runSql(query)
}

async function exec(query) {
  if (!COMMIT) {
    console.log('  [dry-run]', query.replace(/\s+/g, ' ').slice(0, 200))
    return
  }
  await runSql(query)
}

async function main() {
  console.log(COMMIT ? '=== 실제 적용 (--commit) ===' : '=== 드라이런 — 쓰기 없음 ===')
  await migrateLeagues()
  await migrateQuarters()
  await migrateTeams()
  console.log(COMMIT ? '완료' : '드라이런 끝. 적용하려면 --commit')
}

main().catch((e) => { console.error(e); process.exit(1) })
```

`import { runSql } from './db-migrate.mjs'` 는 **가정이다.** Step 1 에서 확인한 실제 export 를 쓴다. `db-migrate.mjs` 가 아무것도 export 하지 않으면 두 가지 중 하나를 택한다 —
- 그 파일에 `export` 를 추가한다(기존 CLI 동작을 깨지 않는 선에서), 또는
- 토큰 해석 + fetch 로직을 `scripts/lib/mgmt-api.mjs` 로 빼고 양쪽이 쓴다.

**토큰 찾는 코드를 복붙하지 말 것** — 두 벌이 되면 한쪽만 고쳐지는 날이 온다.

- [ ] **Step 4: 리그 2행 생성 함수 작성**

`migrate-legacy.mjs` 에 추가:

```js
// 리그(시즌) 2행. 대회형이므로 mode='tournament'.
async function migrateLeagues() {
  console.log('\n[1/3] 리그')
  for (const t of TEAMS) {
    const [meta] = await sql(`
      SELECT tm.edit_pin,
             (SELECT count(*)::int FROM tournaments WHERE team_id = tm.id) AS rounds,
             (SELECT min(g.date) FROM games g
                JOIN tournaments tr ON tr.id = g.tournament_id
               WHERE tr.team_id = tm.id) AS first_game
        FROM teams tm WHERE tm.id = ${q(t.legacyTeamId)}
    `)
    if (!meta) throw new Error(`레거시 팀 없음: ${t.legacyTeamId}`)
    if (!meta.edit_pin) throw new Error(`팀 ${t.name} 에 edit_pin 이 없다 — 이관 후 아무도 기록을 못 넣게 된다`)
    if (!meta.first_game) throw new Error(`팀 ${t.name} 에 경기가 없다`)

    // 이미 만든 리그가 있으면 다시 만들지 않는다 — 멱등.
    const [existing] = await sql(
      `SELECT id FROM leagues WHERE team_id = ${q(t.legacyTeamId)} AND slug = ${q(t.slug)}`
    )
    if (existing) {
      console.log(`  이미 있음: ${t.name} → ${existing.id}`)
      continue
    }

    // edit_pin 은 레거시 것을 그대로 쓴다. 새로 발급하면 파란날개 총무가
    //   쓰던 PIN 이 막혀 이관 직후 기록을 못 넣는다.
    await exec(`
      INSERT INTO leagues (org_slug, slug, name, season_year, season_type, status, mode,
                           start_date, total_rounds, edit_pin, team_id, rules)
      VALUES (${q('paranalgae')}, ${q(t.slug)}, ${q(t.name)}, 2026, ${q('annual')},
              ${q('active')}, ${q('tournament')}, ${q(meta.first_game)}, ${meta.rounds},
              ${q(meta.edit_pin)}, ${q(t.legacyTeamId)}, ${q(JSON.stringify(TOURNAMENT_RULES))}::jsonb)
    `)
    console.log(`  생성: ${t.name} (대회 ${meta.rounds}개, 시작 ${meta.first_game})`)
  }
}

// 이후 단계가 "이 레거시 팀의 리그 id" 를 자주 필요로 하므로 한 번에 푼다.
async function leagueIdFor(legacyTeamId) {
  const t = TEAMS.find((x) => x.legacyTeamId === legacyTeamId)
  if (!t) throw new Error(`이관 대상 팀이 아니다: ${legacyTeamId}`)
  const [row] = await sql(`SELECT id FROM leagues WHERE team_id = ${q(legacyTeamId)} AND slug = ${q(t.slug)}`)
  if (!row) throw new Error(`리그가 아직 없다: ${t.name} — migrateLeagues 를 먼저 --commit 으로 실행했는가`)
  return row.id
}
```

- [ ] **Step 5: 대회 → 세그먼트 12행 생성 함수 작성**

```js
// 대회를 league_quarters(kind='tournament') 로 담는다. 새 테이블을 만들지 않는 이유는
//   076 이 이미 kind 를 일반화하며 'tournament' 를 값으로 넣어 뒀기 때문이다.
async function migrateQuarters() {
  console.log('\n[2/3] 대회 → 세그먼트')
  for (const t of TEAMS) {
    const leagueId = await leagueIdFor(t.legacyTeamId)
    // ord 는 대회의 첫 경기일 순서로 매긴다 — 화면에서 시간순으로 보이게.
    //   tournaments 에는 날짜가 없고 year 만 있어서 games 를 통해 유도한다.
    const rows = await sql(`
      SELECT tr.id, tr.name, tr.year, tr.type, tr.description,
             (SELECT min(date) FROM games WHERE tournament_id = tr.id) AS start_date,
             (SELECT max(date) FROM games WHERE tournament_id = tr.id) AS end_date
        FROM tournaments tr
       WHERE tr.team_id = ${q(t.legacyTeamId)}
       ORDER BY (SELECT min(date) FROM games WHERE tournament_id = tr.id) NULLS LAST, tr.name
    `)
    let ord = 0
    for (const r of rows) {
      ord += 1
      const [existing] = await sql(`SELECT id FROM league_quarters WHERE legacy_id = ${q(r.id)}`)
      if (existing) {
        console.log(`  이미 있음: ${r.name}`)
        continue
      }
      // quarter 컬럼은 리그형의 분기 번호다. 대회형에는 의미가 없지만 NOT NULL 이 아니므로
      //   ord 와 같은 값을 넣어 정렬 폴백으로만 쓴다.
      await exec(`
        INSERT INTO league_quarters (league_id, year, quarter, kind, name, ord,
                                     start_date, end_date, tournament_type, description,
                                     is_current, legacy_id)
        VALUES (${q(leagueId)}, ${r.year}, ${ord}, ${q('tournament')}, ${q(r.name)}, ${ord},
                ${q(r.start_date)}, ${q(r.end_date)}, ${q(r.type)}, ${q(r.description)},
                false, ${q(r.id)})
      `)
      console.log(`  생성: ${t.name} / ${r.name} (${r.type}, ${r.start_date}~${r.end_date})`)
    }
  }
}
```

⚠ `league_quarters.quarter` 와 `year` 가 NOT NULL 인지 Step 2 이전에 확인한다. 마이그레이션 076 이 트리거로 기본값을 채우고 있을 수 있다 — 그렇다면 위 INSERT 의 해당 컬럼은 생략해도 된다. 확인 명령:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name='league_quarters' ORDER BY ordinal_position"
```

- [ ] **Step 6: 팀(우리 팀 + 외부 상대팀) 생성 함수 작성**

```js
// 팀은 두 종류를 만든다.
//   1) 우리 팀 — 리그당 1행. legacy_id 에 레거시 teams.id 를 남긴다.
//   2) 외부 상대팀 — games.opponent 문자열의 고유값마다 1행, is_external=true.
//      레거시는 상대를 문자열로만 갖는다(구조화된 상대 테이블은 073 에서 이미 삭제됨).
//      따라서 legacy_id 로 짝지을 원본 행이 없어, (league_id, name) 으로 중복을 막는다.
async function migrateTeams() {
  console.log('\n[3/3] 팀')
  for (const t of TEAMS) {
    const leagueId = await leagueIdFor(t.legacyTeamId)

    const [ours] = await sql(
      `SELECT id FROM league_teams WHERE league_id = ${q(leagueId)} AND legacy_id = ${q(t.legacyTeamId)}`
    )
    if (!ours) {
      const [legacy] = await sql(`SELECT name, accent_color FROM teams WHERE id = ${q(t.legacyTeamId)}`)
      await exec(`
        INSERT INTO league_teams (league_id, name, color, is_external, legacy_id)
        VALUES (${q(leagueId)}, ${q(legacy.name)}, ${q(legacy.accent_color)}, false, ${q(t.legacyTeamId)})
      `)
      console.log(`  우리 팀 생성: ${legacy.name}`)
    } else {
      console.log(`  우리 팀 이미 있음: ${t.name}`)
    }

    const opponents = await sql(`
      SELECT DISTINCT g.opponent
        FROM games g JOIN tournaments tr ON tr.id = g.tournament_id
       WHERE tr.team_id = ${q(t.legacyTeamId)} AND g.opponent IS NOT NULL AND btrim(g.opponent) <> ''
       ORDER BY 1
    `)
    let made = 0
    for (const o of opponents) {
      const name = o.opponent.trim()
      const [exists] = await sql(
        `SELECT id FROM league_teams WHERE league_id = ${q(leagueId)} AND name = ${q(name)} AND is_external`
      )
      if (exists) continue
      await exec(`
        INSERT INTO league_teams (league_id, name, color, is_external, legacy_id)
        VALUES (${q(leagueId)}, ${q(name)}, NULL, true, NULL)
      `)
      made += 1
    }
    console.log(`  외부 상대팀: ${opponents.length}팀 중 ${made}팀 신규`)
  }
}
```

- [ ] **Step 7: 드라이런 실행**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/migrate-legacy.mjs
```
Expected: `=== 드라이런 — 쓰기 없음 ===` 으로 시작하고, 리그 2건 · 대회 12건 · 팀(우리 2 + 외부 N)에 대한 `[dry-run] INSERT …` 출력. 오류 없이 끝나야 한다.

이 시점에 DB 는 하나도 안 변했다. 확인:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT count(*) FROM leagues"
```
Expected: `2` (미라클 + 장년부 스텁). 늘어났으면 드라이런이 새는 것이므로 **중단하고 보고**.

- [ ] **Step 8: 검증 스크립트 작성 (이 태스크 범위)**

Create `scripts/verify-migration.mjs`:

```js
#!/usr/bin/env node
// 이관 대조 — 원본(레거시)을 진실로 삼아 사본(리그)을 검사한다.
//
// 왜 이관 스크립트와 분리하나: 같은 코드가 옮기고 스스로 채점하면, 잘못 옮긴 것을
//   잘못된 기준으로 통과시킨다. 이 파일은 migrate-legacy.mjs 의 변수나 매핑을 쓰지 않고
//   원본 테이블을 직접 다시 읽는다.
//
// 하나라도 실패하면 exit 1.

import { runSql } from './db-migrate.mjs'   // migrate-legacy.mjs 와 같은 방식으로 맞춘다

let failed = 0

async function check(name, sqlText, assertFn) {
  const rows = await runSql(sqlText)
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

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}건 실패`)
process.exit(failed === 0 ? 0 : 1)
```

- [ ] **Step 9: 검증이 지금은 실패하는지 확인**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/verify-migration.mjs; echo "exit=$?"
```
Expected: **실패** (`exit=1`) — 아직 아무것도 이관하지 않았으므로 리그 0개, 대회 0개다. 통과한다면 검증이 아무것도 안 보고 있다는 뜻이므로 **중단하고 보고**.

단, `미라클 리그는 손대지 않았다` 는 지금도 통과해야 한다.

- [ ] **Step 10: 실제 적용**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/migrate-legacy.mjs --commit
```
Expected: `=== 실제 적용 ===` 으로 시작. 리그 2건 생성, 대회 12건 생성, 팀 생성 로그.

- [ ] **Step 11: 검증 통과 확인 + 멱등 확인**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/verify-migration.mjs && echo "--- 두 번째 실행 (멱등) ---" && node scripts/migrate-legacy.mjs --commit && node scripts/verify-migration.mjs
```
Expected: 첫 검증 `전부 통과`. 두 번째 이관은 전부 `이미 있음` 으로 건너뛰고, 검증이 **또** `전부 통과` — 개수가 배로 늘지 않았다는 뜻이다.

멱등이 깨져 대회가 24개가 되면 **중단하고 보고**. 되돌리려면 `DELETE FROM league_quarters WHERE legacy_id IS NOT NULL` 로 지우고 다시 시작할 수 있다(원본은 무사하다).

- [ ] **Step 12: 기존 검증 스크립트 재확인**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs
```
Expected: 양쪽 `전부 통과`.

⚠ `verify-schema.mjs` 의 `league_teams 3건` 단언이 있다면 **이제 깨진다** — 파란날개 팀이 늘었기 때문이다. 깨지면 그 단언을 "미라클 리그의 league_teams 는 3건" 으로 좁혀 고친다. 단언을 지우지 말 것 — 범위를 좁히는 것과 없애는 것은 다르다.

- [ ] **Step 13: 판단 기록 문서 작성**

Create `docs/legacy-migration-notes.md` — 아래를 포함한다:
- 신규 `leagues` 2행의 id 와 slug (단계 C 가 리다이렉트를 걸 때 필요)
- 외부 상대팀 실제 생성 수 (리그별)
- `pana-basket-senior` 스텁을 건드리지 않은 이유
- `/league/paranalgae` 모호성이 단계 C 로 이월됐다는 사실

- [ ] **Step 14: 커밋**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && git add scripts/migrate-legacy.mjs scripts/verify-migration.mjs docs/legacy-migration-notes.md scripts/verify-schema.mjs && git commit -m "$(cat <<'EOF'
feat(unify): 파란날개 리그·대회·팀 이관 (단계 B-1)

레거시 원본은 읽기만 한다 — 문제가 생겨도 되돌릴 곳이 남아 있어야 한다.
legacy_id 로 멱등해서 두 번 돌려도 중복이 안 생기고, 기본은 드라이런이다.

이관과 검증을 두 파일로 나눴다. 같은 코드가 옮기고 스스로 채점하면
잘못 옮긴 것을 잘못된 기준으로 통과시킨다 — 검증은 원본을 다시 읽는다.

리그 규칙의 plus_one 가산을 0으로 뒀다. 미라클 값(1)을 그대로 쓰면
이관된 과거 기록이 재계산될 때 득점이 부풀어 오른다.

edit_pin 은 레거시 팀 것을 그대로 옮겼다. 새로 발급하면 파란날개
총무가 이관 직후 기록을 못 넣는다.
EOF
)"
```

---

### Task 2: 선수 이관

**Files:**
- Modify: `scripts/migrate-legacy.mjs` (`migratePlayers()` 추가, `main()` 에 연결)
- Modify: `scripts/verify-migration.mjs` (선수 단언 추가)

**Interfaces:**
- Consumes: Task 1 의 `sql` / `exec` / `q` / `leagueIdFor` / `TEAMS` / `COMMIT`
- Produces: `league_players` 68행(`legacy_id` 채움), `league_team_players` 68행

- [ ] **Step 1: 원본 선수 데이터 확인**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT team_id, count(*) n, count(*) FILTER (WHERE is_pro) pro, count(*) FILTER (WHERE NOT is_active) inactive, count(height_cm) h, count(photo_url) photo, count(birthdate) bd, count(*) FILTER (WHERE number !~ '^[0-9]+$') nonnum FROM players GROUP BY team_id"
```
Expected: 두 팀 합계 68, 선출 7, 비활동 3, 키 68, 비숫자 등번호 **0**.

비숫자 등번호가 0 이 아니면 **중단하고 보고** — `league_players.number` 는 정수라 형 변환이 실패한다.

- [ ] **Step 2: 선수 이관 함수 작성**

`migrate-legacy.mjs` 에 추가하고 `main()` 에서 `migrateTeams()` 다음에 호출한다:

```js
// 선수. 레거시 players.number 는 text 이고 league_players.number 는 integer 다.
//   Step 1 에서 비숫자 등번호가 0건임을 확인했으므로 단순 캐스팅으로 충분하지만,
//   방어적으로 한 번 더 거른다 — 데이터가 나중에 늘어날 수 있다.
async function migratePlayers() {
  console.log('\n[4] 선수')
  for (const t of TEAMS) {
    const leagueId = await leagueIdFor(t.legacyTeamId)
    const [ourTeam] = await sql(
      `SELECT id FROM league_teams WHERE league_id = ${q(leagueId)} AND legacy_id = ${q(t.legacyTeamId)}`
    )
    if (!ourTeam) throw new Error(`우리 팀 행이 없다: ${t.name} — migrateTeams 를 먼저 실행했는가`)

    const rows = await sql(`
      SELECT id, name, number, position, birthdate, photo_url, height_cm, is_pro, is_active
        FROM players WHERE team_id = ${q(t.legacyTeamId)} ORDER BY name
    `)
    let made = 0
    for (const p of rows) {
      if (!/^[0-9]+$/.test(String(p.number ?? ''))) {
        throw new Error(`등번호가 숫자가 아니다: ${p.name} (${p.number}) — league_players.number 는 integer`)
      }
      const [existing] = await sql(`SELECT id FROM league_players WHERE legacy_id = ${q(p.id)}`)
      let playerId
      if (existing) {
        playerId = existing.id
      } else {
        // RETURNING 을 쓰지 않는 이유: exec 는 드라이런에서 실행하지 않으므로 id 가 없다.
        //   드라이런에서도 흐름이 끝까지 돌게 하려면 삽입 후 다시 조회하는 편이 단순하다.
        await exec(`
          INSERT INTO league_players (league_id, name, number, position, birth_date, photo_url,
                                      height_cm, is_pro, is_active, plus_one, is_guest, legacy_id)
          VALUES (${q(leagueId)}, ${q(p.name)}, ${Number(p.number)}, ${q(p.position)}, ${q(p.birthdate)},
                  ${q(p.photo_url)}, ${p.height_cm === null ? 'NULL' : Number(p.height_cm)},
                  ${q(p.is_pro)}, ${q(p.is_active)}, false, false, ${q(p.id)})
        `)
        made += 1
        if (!COMMIT) continue   // 드라이런이면 아래 연결 단계는 건너뛴다 (id 가 없다)
        const [created] = await sql(`SELECT id FROM league_players WHERE legacy_id = ${q(p.id)}`)
        playerId = created.id
      }

      // 명단 연결. league_team_players 는 (league_team_id, league_player_id) 복합키다.
      const [linked] = await sql(`
        SELECT 1 FROM league_team_players
         WHERE league_team_id = ${q(ourTeam.id)} AND league_player_id = ${q(playerId)}
      `)
      if (!linked) {
        await exec(`
          INSERT INTO league_team_players (league_team_id, league_player_id)
          VALUES (${q(ourTeam.id)}, ${q(playerId)})
        `)
      }
    }
    console.log(`  ${t.name}: 원본 ${rows.length}명 중 ${made}명 신규`)
  }
}
```

`plus_one: false` 를 명시하는 이유: 파란날개에는 나이 가산 규칙이 없다. 기본값에 기대지 않고 의도를 남긴다.

- [ ] **Step 3: 선수 단언 추가**

`verify-migration.mjs` 의 `console.log(failed === 0 ...)` 앞에 추가:

```js
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
```

- [ ] **Step 4: 드라이런**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/migrate-legacy.mjs 2>&1 | tail -20
```
Expected: 선수 68명 신규로 표시. 오류 없음.

- [ ] **Step 5: 검증이 아직 실패하는지 확인**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/verify-migration.mjs; echo "exit=$?"
```
Expected: 선수 단언 6개가 실패, `exit=1`. Task 1 단언들은 통과.

- [ ] **Step 6: 적용 + 검증**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/migrate-legacy.mjs --commit && node scripts/verify-migration.mjs
```
Expected: `전부 통과`.

- [ ] **Step 7: 멱등 확인**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/migrate-legacy.mjs --commit && node scripts/verify-migration.mjs && node scripts/db-migrate.mjs sql "SELECT count(*) n FROM league_players WHERE legacy_id IS NOT NULL"
```
Expected: `전부 통과` 이고 `n=68` — 136 이 되면 멱등이 깨진 것이므로 중단하고 보고.

- [ ] **Step 8: 기존 검증 + 커밋**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs && git add scripts/migrate-legacy.mjs scripts/verify-migration.mjs && git commit -m "$(cat <<'EOF'
feat(unify): 파란날개 선수 68명 이관 (단계 B-2)

이름·등번호·키·선출·활동·생일·사진을 행 단위로 대조한다. 총합만 맞고
개별 행이 어긋나는 사고를 잡으려면 개수 비교로는 부족하다.

선수가 엉뚱한 팀의 리그로 들어가는지 별도로 검사한다 — games.team_type
함정과 같은 종류의 사고가 선수에서도 날 수 있다.

plus_one 은 명시적으로 false. 파란날개에는 나이 가산 규칙이 없다.
EOF
)"
```

---

### Task 3: 경기 이관

**Files:**
- Modify: `scripts/migrate-legacy.mjs` (`migrateGames()` 추가)
- Modify: `scripts/verify-migration.mjs` (경기 단언 추가)

**Interfaces:**
- Consumes: Task 1·2 의 헬퍼와 `league_teams` / `league_quarters` 행
- Produces: `league_games` 50행(`legacy_id` 채움)

- [ ] **Step 1: 원본 경기 데이터와 함정 재확인**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT tr.team_id, count(*) games, count(g.venue) venue, count(g.round) round, count(g.ai_mvp) ai_mvp, count(*) FILTER (WHERE g.is_complete) complete, count(g.youtube_url) yt FROM games g JOIN tournaments tr ON tr.id=g.tournament_id GROUP BY tr.team_id" && node scripts/db-migrate.mjs sql "SELECT g.team_type AS 기록된값, CASE WHEN tr.team_id='194b30d8-d7da-4d5f-8c70-750edbfb563b' THEN 'senior' ELSE 'youth' END AS 실제, count(*) FROM games g JOIN tournaments tr ON tr.id=g.tournament_id GROUP BY 1,2"
```
Expected: 두 번째 질의가 **`기록된값='youth'` 인데 `실제='senior'` 인 행 14건**을 보여준다. 이것이 이 이관의 최대 함정이며, 아래 코드가 `team_type` 을 쓰지 않는 이유다.

- [ ] **Step 2: 경기 이관 함수 작성**

```js
// 경기. 레거시는 항상 "우리 vs 상대" 이므로 우리 팀을 홈, 상대를 원정으로 고정한다.
//   실제 홈/원정 구분 정보가 원본에 없어서 임의로 정하는 것이고, 이 규칙을 어기면
//   our_score/opponent_score 가 뒤집혀 승패가 반대로 나온다.
//
// ⚠ 팀은 g.team_type 이 아니라 tournament_id → tournaments.team_id 로 유도한다.
//   50경기 전부 team_type='youth' 로 적혀 있으나 실제 장년부 경기가 14건이다.
async function migrateGames() {
  console.log('\n[5] 경기')
  const rows = await sql(`
    SELECT g.id, g.tournament_id, g.date, g.opponent, g.venue, g.round, g.ai_mvp,
           g.our_score, g.opponent_score, g.youtube_url, g.youtube_start_offset,
           g.is_complete, tr.team_id AS legacy_team_id
      FROM games g JOIN tournaments tr ON tr.id = g.tournament_id
     ORDER BY g.date, g.id
  `)
  let made = 0
  for (const g of rows) {
    const [existing] = await sql(`SELECT id FROM league_games WHERE legacy_id = ${q(g.id)}`)
    if (existing) continue

    const leagueId = await leagueIdFor(g.legacy_team_id)
    const [ourTeam] = await sql(
      `SELECT id FROM league_teams WHERE league_id = ${q(leagueId)} AND legacy_id = ${q(g.legacy_team_id)}`
    )
    const [quarter] = await sql(`SELECT id FROM league_quarters WHERE legacy_id = ${q(g.tournament_id)}`)
    if (!ourTeam || !quarter) throw new Error(`선행 행이 없다 (경기 ${g.id}) — 앞 단계를 --commit 으로 실행했는가`)

    // 상대팀. 이름이 비어 있는 경기가 있으면 원정 팀을 NULL 로 두고 넘어간다 —
    //   억지로 '미상' 같은 팀을 만들면 순위표에 유령 팀이 생긴다.
    let awayId = null
    const oppName = (g.opponent ?? '').trim()
    if (oppName) {
      const [opp] = await sql(
        `SELECT id FROM league_teams WHERE league_id = ${q(leagueId)} AND name = ${q(oppName)} AND is_external`
      )
      if (!opp) throw new Error(`외부 상대팀이 없다: "${oppName}" — migrateTeams 를 먼저 실행했는가`)
      awayId = opp.id
    }

    await exec(`
      INSERT INTO league_games (league_id, quarter_id, home_team_id, away_team_id, date,
                                home_score, away_score, is_complete, is_started, is_exhibition,
                                youtube_url, youtube_start_offset,
                                venue, round_label, ai_mvp, legacy_id)
      VALUES (${q(leagueId)}, ${q(quarter.id)}, ${q(ourTeam.id)}, ${awayId ? q(awayId) : 'NULL'}, ${q(g.date)},
              ${g.our_score === null ? 'NULL' : Number(g.our_score)},
              ${g.opponent_score === null ? 'NULL' : Number(g.opponent_score)},
              ${q(g.is_complete)}, ${q(g.is_complete)}, false,
              ${q(g.youtube_url)}, ${g.youtube_start_offset === null ? 'NULL' : Number(g.youtube_start_offset)},
              ${q(g.venue)}, ${q(g.round)},
              ${g.ai_mvp === null ? 'NULL' : `${q(JSON.stringify(g.ai_mvp))}::jsonb`},
              ${q(g.id)})
    `)
    made += 1
  }
  console.log(`  원본 ${rows.length}경기 중 ${made}경기 신규`)
}
```

`is_started` 에 `is_complete` 를 넣는 이유: 레거시에는 "시작됨" 개념이 없다. 완료된 경기는 당연히 시작됐고, 미완료 6건은 시작 여부를 알 수 없어 보수적으로 false 로 둔다.

`is_exhibition: false` 를 명시하는 이유: 친선전 기능은 081 에서 제거됐다. 기본값에 기대지 않고 의도를 남긴다.

- [ ] **Step 3: 경기 단언 추가**

`verify-migration.mjs` 에 추가:

```js
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
await check(
  '경기 속성이 원본과 일치 (날짜·점수·경기장·라운드·완료)',
  `SELECT count(*)::int n
     FROM games g JOIN league_games lg ON lg.legacy_id = g.id
    WHERE lg.date        IS DISTINCT FROM g.date
       OR lg.home_score  IS DISTINCT FROM g.our_score
       OR lg.away_score  IS DISTINCT FROM g.opponent_score
       OR lg.venue       IS DISTINCT FROM g.venue
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
```

- [ ] **Step 4: 드라이런 → 적용 → 검증**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/migrate-legacy.mjs 2>&1 | tail -10 && node scripts/verify-migration.mjs; echo "적용전 exit=$?"
```
Expected: 드라이런 성공, 검증은 경기 단언에서 실패(`exit=1`).

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/migrate-legacy.mjs --commit && node scripts/verify-migration.mjs
```
Expected: `전부 통과`.

- [ ] **Step 5: 멱등 + 기존 검증 + 커밋**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/migrate-legacy.mjs --commit && node scripts/verify-migration.mjs && node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs && git add scripts/migrate-legacy.mjs scripts/verify-migration.mjs && git commit -m "$(cat <<'EOF'
feat(unify): 파란날개 경기 50건 이관 (단계 B-3)

팀 귀속을 games.team_type 이 아니라 tournament_id→tournaments.team_id
로 유도한다. team_type 은 50건 전부 'youth' 로 적혀 있지만 실제
장년부 경기가 14건이라, 그대로 믿으면 장년부 기록이 통째로 청년부에 섞인다.
검증에 그 대조를 넣어 다시는 이 방식으로 못 틀리게 했다.

우리 팀을 홈, 상대를 원정으로 고정한다. 원본에 홈/원정 정보가 없어
정한 규칙이며, 어기면 점수가 뒤집혀 승패가 반대로 나온다.

상대 이름이 빈 경기는 원정 팀을 NULL 로 둔다. '미상' 같은 팀을 만들면
순위표에 유령 팀이 생긴다.
EOF
)"
```

---

### Task 4: 이벤트 · 출전시간 · 대회 명단 이관

**Files:**
- Modify: `scripts/migrate-legacy.mjs` (`migrateEvents()` · `migrateMinutes()` · `migrateTournamentPlayers()` 추가)
- Modify: `scripts/verify-migration.mjs` (단언 추가)

**Interfaces:**
- Consumes: Task 1~3 의 모든 산출물
- Produces: `league_game_events` 5,993행 · `league_player_minutes` 1,525행 · `league_player_quarters` 112행

- [ ] **Step 1: 이벤트 타입·점수 원본값 확인**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT count(*) total, sum(points) pts, sum(points) FILTER (WHERE type::text='opp_score') opp_pts, count(*) FILTER (WHERE player_id IS NULL) no_player FROM game_events"
```
Expected: `total=5993`, `pts=2138`, `opp_pts=322`, `no_player=516` (opp_score 177 + quarter_start 199 + quarter_end 140).

이 네 숫자가 최종 대조의 기준이다. 다르면 **중단하고 보고**.

- [ ] **Step 2: 이벤트 이관 함수 작성**

이벤트가 5,993행이라 한 행씩 INSERT 하면 왕복이 너무 많다. `INSERT … SELECT` 로 DB 안에서 한 번에 옮긴다.

```js
// 이벤트. 5993행이라 왕복을 줄이려고 INSERT…SELECT 로 DB 안에서 옮긴다.
//
// team_id 배정 규칙 (league_game_events.team_id 는 반드시 채운다):
//   · 우리 선수의 이벤트        → 우리 팀(홈)
//   · opp_score (상대 득점)     → 외부 상대팀(원정). 선수는 NULL.
//   · quarter_start/end 마커     → 우리 팀(홈). 선수 NULL, 점수 0 이라 통계에 영향 없음.
//
// ⚠ points 는 저장값을 그대로 복사한다. 재계산하지 않는다 —
//   레거시 하드코딩 값이 STANDARD_SCORING 과 일치함을 실측으로 확인했고(불일치 0건),
//   opp_score 는 규칙 엔진이 모르는 타입이라 재계산하면 322점이 통째로 0이 된다.
async function migrateEvents() {
  console.log('\n[6] 이벤트')
  const [before] = await sql(`SELECT count(*)::int n FROM league_game_events WHERE legacy_id IS NOT NULL`)
  await exec(`
    INSERT INTO league_game_events
      (league_game_id, quarter, video_timestamp, type, league_player_id, result,
       related_player_id, points, team_id, shot_zone, legacy_id)
    SELECT lg.id,
           e.quarter,
           e.video_timestamp,
           e.type::text,
           lp.id,
           e.result::text,
           rp.id,
           e.points,
           CASE WHEN e.type::text = 'opp_score' THEN lg.away_team_id ELSE lg.home_team_id END,
           e.shot_zone,
           e.id
      FROM game_events e
      JOIN league_games lg   ON lg.legacy_id = e.game_id
      LEFT JOIN league_players lp ON lp.legacy_id = e.player_id
      LEFT JOIN league_players rp ON rp.legacy_id = e.related_player_id
     WHERE NOT EXISTS (SELECT 1 FROM league_game_events x WHERE x.legacy_id = e.id)
  `)
  const [after] = await sql(`SELECT count(*)::int n FROM league_game_events WHERE legacy_id IS NOT NULL`)
  console.log(`  ${before.n} → ${after.n}`)
}
```

⚠ **선수가 있는 이벤트인데 `lp.id` 가 NULL 로 들어가면 안 된다.** `LEFT JOIN` 이라 매핑 실패가 조용히 NULL 이 된다. Step 4 의 단언이 이걸 잡는다.

- [ ] **Step 3: 출전시간·대회 명단 이관 함수 작성**

```js
// 출전 시간. 구조가 1:1 이라 그대로 옮긴다.
async function migrateMinutes() {
  console.log('\n[7] 출전시간')
  await exec(`
    INSERT INTO league_player_minutes (league_game_id, league_player_id, quarter, in_time, out_time)
    SELECT lg.id, lp.id, pm.quarter, pm.in_time, pm.out_time
      FROM player_minutes pm
      JOIN league_games lg   ON lg.legacy_id = pm.game_id
      JOIN league_players lp ON lp.legacy_id = pm.player_id
     WHERE NOT EXISTS (
       SELECT 1 FROM league_player_minutes x
        WHERE x.league_game_id = lg.id AND x.league_player_id = lp.id AND x.quarter = pm.quarter
     )
  `)
  const [n] = await sql(`
    SELECT count(*)::int n FROM league_player_minutes m
     JOIN league_games lg ON lg.id = m.league_game_id WHERE lg.legacy_id IS NOT NULL
  `)
  console.log(`  ${n.n}행`)
}

// 대회 참가 명단 → 세그먼트 명단. is_regular=true 로 둔다 —
//   레거시 tournament_players 는 "이 대회에 등록된 우리 선수" 라는 뜻이고,
//   리그형의 '정규 명단' 과 의미가 같다.
async function migrateTournamentPlayers() {
  console.log('\n[8] 대회 명단')
  await exec(`
    INSERT INTO league_player_quarters (league_id, quarter_id, league_player_id, team_id, is_regular)
    SELECT lq.league_id, lq.id, lp.id, ourteam.id, true
      FROM tournament_players tp
      JOIN league_quarters lq ON lq.legacy_id = tp.tournament_id
      JOIN league_players lp  ON lp.legacy_id = tp.player_id
      JOIN leagues l          ON l.id = lq.league_id
      JOIN league_teams ourteam ON ourteam.league_id = l.id AND ourteam.legacy_id = l.team_id
     WHERE NOT EXISTS (
       SELECT 1 FROM league_player_quarters x
        WHERE x.quarter_id = lq.id AND x.league_player_id = lp.id
     )
  `)
  const [n] = await sql(`
    SELECT count(*)::int n FROM league_player_quarters pq
     JOIN league_quarters lq ON lq.id = pq.quarter_id WHERE lq.legacy_id IS NOT NULL
  `)
  console.log(`  ${n.n}행`)
}
```

세 함수를 `main()` 에 순서대로 연결한다: `migrateEvents()` → `migrateMinutes()` → `migrateTournamentPlayers()`.

- [ ] **Step 4: 단언 추가 — 여기가 이 단계의 핵심 관문이다**

```js
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
```

- [ ] **Step 5: 드라이런 → 실패 확인 → 적용 → 통과 확인**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/migrate-legacy.mjs 2>&1 | tail -10 && node scripts/verify-migration.mjs; echo "적용전 exit=$?"
```
Expected: 검증 실패(`exit=1`), 이벤트 관련 단언들이 ✖.

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/migrate-legacy.mjs --commit && node scripts/verify-migration.mjs
```
Expected: **`전부 통과`**.

`선수별 총득점이 … 일치` 가 실패하면 **절대 그냥 넘어가지 말 것.** 어긋난 선수를 찾아 보고한다:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "WITH src AS (SELECT player_id, sum(points)::int pts FROM game_events WHERE player_id IS NOT NULL GROUP BY player_id), dst AS (SELECT lp.legacy_id AS player_id, sum(x.points)::int pts FROM league_game_events x JOIN league_players lp ON lp.id=x.league_player_id WHERE x.legacy_id IS NOT NULL GROUP BY lp.legacy_id) SELECT p.name, src.pts src_pts, dst.pts dst_pts FROM src FULL OUTER JOIN dst USING (player_id) LEFT JOIN players p ON p.id=player_id WHERE src.pts IS DISTINCT FROM dst.pts"
```

- [ ] **Step 6: 멱등 + 기존 검증 + 커밋**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/migrate-legacy.mjs --commit && node scripts/verify-migration.mjs && node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs && git add scripts/migrate-legacy.mjs scripts/verify-migration.mjs && git commit -m "$(cat <<'EOF'
feat(unify): 파란날개 이벤트·출전시간·대회명단 이관 (단계 B-4)

이벤트 5993건은 INSERT…SELECT 로 DB 안에서 옮긴다 — 한 행씩 왕복하면
왕복 비용이 실제 작업보다 커진다.

points 는 저장값을 그대로 복사하고 재계산하지 않는다. 레거시 하드코딩
값이 STANDARD_SCORING 과 일치함을 실측했고(불일치 0건), opp_score 는
규칙 엔진이 모르는 타입이라 재계산하면 상대 득점 322점이 통째로 0이 된다.

핵심 관문은 선수별 총득점 전수 대조다. 총합만 보면 두 선수의 점수가
서로 뒤바뀐 사고를 못 잡는다.

LEFT JOIN 으로 선수를 매핑하므로 실패해도 조용히 NULL 이 된다 —
"선수가 있던 이벤트는 사본에도 선수가 있다" 단언으로 막았다.
EOF
)"
```

---

### Task 5: 최종 전수 대조와 인수인계 문서

**Files:**
- Modify: `scripts/verify-migration.mjs` (교차 검증 단언 추가)
- Modify: `docs/legacy-migration-notes.md` (최종 수치와 단계 C 인계 사항)

**Interfaces:**
- Consumes: Task 1~4 의 모든 산출물
- Produces: 단계 C 가 신뢰하고 시작할 수 있는 "이관 완료" 증거

- [ ] **Step 1: 리그 통계 엔진으로 계산한 값이 원본과 맞는지 확인**

지금까지의 단언은 전부 "복사가 정확한가"를 봤다. 이 단계는 **"복사된 데이터를 리그 코드가 읽었을 때 같은 숫자가 나오는가"**를 본다. 둘은 다르다 — 복사가 완벽해도 리그 집계 로직이 `opp_score` 나 `foul` 같은 낯선 타입에서 다르게 동작할 수 있다.

`verify-migration.mjs` 에 추가:

```js
// ── 리그 엔진 관점의 교차 검증 ───────────────
// 여기까지는 "복사가 정확한가" 를 봤다. 이제 "리그 코드가 읽었을 때 같은 숫자인가" 를 본다.
//   복사가 완벽해도 집계 로직이 opp_score·foul 같은 낯선 타입에서 다르게 굴 수 있다.

// 규칙 엔진으로 재계산한 값과 저장값이 어긋나는 이벤트 — 0이어야 한다.
//   (opp_score 는 규칙에 없는 타입이라 제외한다. 재계산 대상이 아니다.)
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

// 이관 데이터가 미라클 집계에 새어 들어가지 않았는지.
await check(
  '미라클 득점 총합 불변 (7114)',
  `SELECT coalesce(sum(x.points),0)::int n
     FROM league_game_events x JOIN league_games lg ON lg.id = x.league_game_id
    WHERE lg.league_id = '8eda8257-8907-4bf3-a7de-e5e7fde54a89'`,
  (r) => r[0].n === 7114,
)

// 이관된 행이 미라클 리그에 하나라도 들어가면 즉시 실패.
await check(
  '이관 행이 미라클 리그에 없다',
  `SELECT (SELECT count(*)::int FROM league_players WHERE legacy_id IS NOT NULL AND league_id='8eda8257-8907-4bf3-a7de-e5e7fde54a89') p,
          (SELECT count(*)::int FROM league_games   WHERE legacy_id IS NOT NULL AND league_id='8eda8257-8907-4bf3-a7de-e5e7fde54a89') g`,
  (r) => r[0].p === 0 && r[0].g === 0,
)

// 레거시 원본이 한 행도 변하지 않았는지 — 이 단계의 대전제다.
await check(
  '레거시 원본 행 수가 그대로 (경기 50 · 이벤트 5993 · 선수 68 · 대회 12)',
  `SELECT (SELECT count(*)::int FROM games) g, (SELECT count(*)::int FROM game_events) e,
          (SELECT count(*)::int FROM players) p, (SELECT count(*)::int FROM tournaments) t`,
  (r) => r[0].g === 50 && r[0].e === 5993 && r[0].p === 68 && r[0].t === 12,
)
```

- [ ] **Step 2: 전체 검증 실행**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/verify-migration.mjs
```
Expected: `전부 통과`.

`저장 점수와 규칙 재계산이 일치` 가 실패하면, 어긋난 타입을 뽑아 보고한다 — 이건 이관 오류가 아니라 **규칙 정의가 레거시 실제 값과 다르다는 뜻**이므로, 리그 `rules` 의 `event_points` 를 고쳐야 할 수 있다:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT x.type, x.result, x.points, count(*) FROM league_game_events x WHERE x.legacy_id IS NOT NULL GROUP BY 1,2,3 ORDER BY 1,2,3"
```

- [ ] **Step 3: 화면이 아직 레거시를 보는지 확인**

이 단계는 데이터만 옮긴다. 사용자가 보는 것은 변하면 안 된다.

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3005/paranalgae/youth && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3005/paranalgae/senior
```
Expected: 양쪽 `200`. 레거시 화면이 그대로 살아 있어야 한다 — 문제가 생기면 여기로 되돌아올 수 있다는 뜻이다.

(dev 서버가 없으면 `npm run dev -- -p 3005` 로 띄운다. 포트 3000/3001 은 다른 프로젝트가 점유 중일 수 있다.)

- [ ] **Step 4: 인수인계 문서 마무리**

`docs/legacy-migration-notes.md` 에 아래를 추가한다:

```markdown
## 이관 완료 수치 (단계 B)

| 항목 | 원본 | 사본 | 비고 |
|---|---|---|---|
| 대회 | 12 | 12 | league_quarters(kind='tournament') |
| 경기 | 50 | 50 | 청년 36 / 장년 14 |
| 이벤트 | 5,993 | 5,993 | 총득점 2,138 (상대 322 포함) |
| 선수 | 68 | 68 | 선출 7 · 비활동 3 |
| 출전시간 | 1,525 | 1,525 | |
| 대회 명단 | 112 | 112 | league_player_quarters(is_regular=true) |

## 단계 C 인계 사항

1. **`/league/paranalgae` 모호성** — org 아래 리그가 둘(youth-2026 · senior-2026)이라
   leagueId 없는 주소가 어디로 갈지 정해야 한다. 미해결.
2. **`opp_score` 표시** — 규칙 엔진이 모르는 타입이다. 상대 득점 322점을 화면에서
   어떻게 보여줄지 정해야 한다. 저장된 `points` 를 쓰거나 `league_games.away_score` 를 쓴다.
3. **`foul` 588건** — 리그 모드에는 파울 기록이 없어서 표시할 화면이 없다. 덤으로 살아남은
   데이터이므로 버리지 말고, 대회형 박스스코어에 자리를 만들지 판단이 필요하다.
4. **`quarter_start`/`quarter_end` 339건** — 영상 구간 마커다. 리그형에는 대응 개념이 없다.
5. **`pana-basket-senior` 스텁 리그** — 건드리지 않았다. 자체전용이며 데이터 0건.
6. **레거시 원본 무손상** — 단계 D 전까지 `/paranalgae/*` 화면이 계속 동작한다.
```

- [ ] **Step 5: 커밋**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && git add scripts/verify-migration.mjs docs/legacy-migration-notes.md && git commit -m "$(cat <<'EOF'
feat(unify): 이관 교차 검증 + 단계 C 인계 문서 (단계 B-5)

지금까지의 단언은 "복사가 정확한가" 를 봤다. 여기서는 "리그 코드가
읽었을 때 같은 숫자가 나오는가" 를 본다 — 복사가 완벽해도 집계 로직이
opp_score·foul 같은 낯선 타입에서 다르게 굴 수 있다.

레거시 원본 행 수를 단언에 넣었다. 이 단계의 대전제가 "원본 무손상"
이므로, 그게 깨지면 다른 무엇이 통과해도 의미가 없다.

인계 사항 5건을 문서로 남긴다 — 특히 /league/paranalgae 모호성과
opp_score 표시 방법은 단계 C 에서 반드시 정해야 한다.
EOF
)"
```

---

## 완료 기준

- `node scripts/verify-migration.mjs` 가 exit 0 (단언 30여 개 전부 통과)
- `node scripts/verify-schema.mjs` · `node scripts/verify-scoring.mjs` exit 0
- 레거시 원본 행 수 불변: 경기 50 · 이벤트 5,993 · 선수 68 · 대회 12
- 미라클 불변: 득점 7,114 · 선수 45 · league_teams 3
- `node scripts/migrate-legacy.mjs --commit` 를 다시 돌려도 행 수가 늘지 않는다
- `/paranalgae/youth` · `/paranalgae/senior` 가 여전히 200 — 사용자가 보는 화면은 그대로
- `docs/legacy-migration-notes.md` 에 신규 리그 id 2개와 인계 사항 6건이 기록됨

## 되돌리는 법

이 단계는 레거시를 건드리지 않으므로 사본만 지우면 완전히 원상복구된다. 순서는 참조 역순:

```sql
DELETE FROM league_player_quarters WHERE quarter_id IN (SELECT id FROM league_quarters WHERE legacy_id IS NOT NULL);
DELETE FROM league_player_minutes  WHERE league_game_id IN (SELECT id FROM league_games WHERE legacy_id IS NOT NULL);
DELETE FROM league_game_events     WHERE legacy_id IS NOT NULL;
DELETE FROM league_games           WHERE legacy_id IS NOT NULL;
DELETE FROM league_team_players    WHERE league_player_id IN (SELECT id FROM league_players WHERE legacy_id IS NOT NULL);
DELETE FROM league_players         WHERE legacy_id IS NOT NULL;
DELETE FROM league_teams           WHERE league_id IN (SELECT id FROM leagues WHERE mode='tournament' AND org_slug='paranalgae');
DELETE FROM league_quarters        WHERE legacy_id IS NOT NULL;
DELETE FROM leagues                WHERE mode='tournament' AND org_slug='paranalgae';
```

이 SQL 을 `docs/legacy-migration-notes.md` 에도 적어 둔다 — 되돌려야 하는 순간에 계획서를 찾아 헤매지 않도록.
