# 통일 단계 A — 목적지 준비 (스키마) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 파란날개 레거시 데이터가 들어올 자리를 리그 테이블에 만든다 — 보존 컬럼 8개와 이관 추적용 `legacy_id` 5개.

**Architecture:** 순수 스키마 추가만 한다. 데이터 이동 없음, 화면 변화 없음, 기존 읽기/쓰기 경로 변화 없음. 모든 컬럼은 nullable 이거나 기본값을 가지므로 기존 행과 기존 INSERT 문이 그대로 동작한다. `legacy_id` 는 단계 D 에서 제거될 임시 컬럼이며, 그 사실을 컬럼 주석으로 DB 안에 남긴다.

**Tech Stack:** PostgreSQL (Supabase), Supabase Management API 로 DDL 실행 (`scripts/db-migrate.mjs`), Node 24 검증 스크립트.

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-08-05-tournament-league-unification-design.md`. 이 계획은 그 문서의 "단계 A" 에 해당한다.
- **운영 DB 다.** 미라클모닝·파란날개가 매일 쓴다. 파괴적 DDL(DROP/ALTER TYPE/NOT NULL 추가) 금지 — 이 단계는 `ADD COLUMN` 과 `COMMENT` 만 쓴다.
- 마이그레이션 번호: 현재 최고 082. 이 계획은 **083** 하나만 만든다. `ls supabase/migrations/` 로 반드시 확인 후 작성.
- 마이그레이션 실행은 정확히 한 번: `node scripts/db-migrate.mjs up 083`. **번호를 생략하면 083 이전 파일까지 재실행된다.**
- `node scripts/verify-schema.mjs` 와 `node scripts/verify-scoring.mjs` 는 각 태스크 끝에서 **반드시 exit 0**. 미라클 기준선(득점 7114 · 선수 45 · 경기 271(날짜 컷오프 `date <= '2026-08-04'` 기준) · league_teams 3 · 외부팀 0) 은 이 단계에서 하나도 움직이면 안 된다.
- `npx tsc --noEmit` 과 `npm run build` 통과.
- ⚠ `npm run build` 와 `next dev` 를 같은 `.next` 디렉터리에 동시에 돌리면 dev 서버가 죽는다. build 전에 dev 서버를 멈추거나, build 후 재기동한다.
- 브랜치 `master` (승인됨). 각 태스크 끝에서 커밋. **푸시 금지** — 전체 단계 검토 후 한 번에 푸시한다.
- 주석·커밋 메시지는 한국어. *무엇을* 이 아니라 *왜* 를 적는다.
- 작업 디렉터리는 `c:\Users\N_399\Desktop\ai_rob\basketball-stats-dashboard`. 셸이 리셋되므로 매 명령 앞에 `cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard &&` 를 붙인다.

---

## 파일 구성

| 파일 | 책임 |
|---|---|
| `supabase/migrations/083_unification_destination_columns.sql` (신규) | 보존 컬럼 8개 + `legacy_id` 5개 추가. 이 단계의 전부. |
| `scripts/verify-schema.mjs` (수정) | 새 컬럼의 존재·타입·nullable 여부, 그리고 "기존 데이터가 하나도 안 변했음"을 단언 |
| `src/types/league.ts` (수정) | 새 컬럼을 타입에 반영 — 단계 B 스크립트가 타입 안전하게 쓰도록 |

`legacy_id` 를 별도 매핑 테이블이 아니라 각 테이블의 컬럼으로 두는 이유: 조인 없이 원본↔사본을 한 쿼리로 대조할 수 있고, 단계 D 에서 컬럼 하나씩 지우면 흔적이 남지 않는다. 매핑 테이블은 지울 때 참조를 찾아다녀야 한다.

---

### Task 1: 보존 컬럼과 legacy_id 추가

**Files:**
- Create: `supabase/migrations/083_unification_destination_columns.sql`
- Modify: `scripts/verify-schema.mjs` (마지막 요약 줄 바로 앞에 단언 추가)

**Interfaces:**
- Consumes: 없음 (이 계획의 첫 태스크)
- Produces: 아래 컬럼들. 단계 B 의 이관 스크립트가 이 이름들을 그대로 쓴다.
  - `league_games.venue TEXT NULL`
  - `league_games.round_label TEXT NULL`
  - `league_games.ai_mvp JSONB NULL`
  - `league_games.legacy_id UUID NULL`
  - `league_players.height_cm INTEGER NULL`
  - `league_players.is_pro BOOLEAN NOT NULL DEFAULT false`
  - `league_players.is_active BOOLEAN NOT NULL DEFAULT true`
  - `league_players.legacy_id UUID NULL`
  - `league_quarters.tournament_type TEXT NULL`
  - `league_quarters.description TEXT NULL`
  - `league_quarters.legacy_id UUID NULL`
  - `league_teams.legacy_id UUID NULL`
  - `league_game_events.legacy_id UUID NULL`

- [ ] **Step 1: 마이그레이션 번호 확인**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && ls supabase/migrations/ | tail -5
```
Expected: `082_team_visibility.sql` 이 마지막. 083 이 비어 있음을 확인한다. 만약 083 이 이미 있으면 **중단하고 보고** — 다른 작업과 번호가 충돌한 것이다.

- [ ] **Step 2: 마이그레이션 파일 작성**

Create `supabase/migrations/083_unification_destination_columns.sql`:

```sql
-- =============================================
-- 083_unification_destination_columns.sql
-- 대회형→리그형 통일 단계 A — 목적지 컬럼 준비
-- =============================================
-- 배경
--   파란날개(대회형)를 리그 구조로 옮긴다. 레거시 테이블에만 있는 필드를
--   그냥 두고 옮기면 실제로 값이 있는 기록이 사라진다. 실측 결과:
--     games.venue        50중 33건
--     games.round        43건 (조별예선·8강·결승 …)
--     games.ai_mvp       44건
--     tournaments.type   12건 (amateur 7 / pro 5)
--     tournaments.description 12건 전부
--     players.height_cm  68명 전원 (164~195)
--     players.is_pro     7명 (화면에 '선출' 배지로 노출 중)
--     players.is_active  비활성 3명
--   버리는 것: players.weight_kg(0건) · games.notes(0건) · game_events.notes(0건)
--
-- 이 마이그레이션은 ADD COLUMN 과 COMMENT 만 한다.
--   데이터 이동 없음. 기존 행·기존 INSERT 문 전부 그대로 동작한다
--   (전부 nullable 이거나 기본값 보유).
-- =============================================

-- ── 경기 ─────────────────────────────────────
-- round_label 로 이름을 바꾼 이유: league_games 에는 이미 round_num(일정 슬롯
--   번호)이 있다. 레거시의 round('8강','결승')를 같은 이름으로 넣으면 두 개념이
--   한 이름을 두고 싸운다.
ALTER TABLE league_games ADD COLUMN IF NOT EXISTS venue       TEXT;
ALTER TABLE league_games ADD COLUMN IF NOT EXISTS round_label TEXT;
ALTER TABLE league_games ADD COLUMN IF NOT EXISTS ai_mvp      JSONB;

COMMENT ON COLUMN league_games.venue       IS '경기장. 대회형에서 주로 쓴다(리그형은 홈코트 고정이라 비는 경우가 많다).';
COMMENT ON COLUMN league_games.round_label IS '토너먼트 라운드 표기(조별예선·16강·8강·4강·준결승·결승). 일정 슬롯 번호인 round_num 과 다른 개념.';
COMMENT ON COLUMN league_games.ai_mvp      IS 'AI 가 쓴 경기 MVP 코멘트(jsonb). 레거시 games.ai_mvp 에서 이관.';

-- ── 선수 ─────────────────────────────────────
-- is_pro / is_active 는 NOT NULL + 기본값으로 둔다. 기존 리그 선수 45명은
--   자동으로 '비선출·활동중'이 되는데, 이는 현재 화면이 암묵적으로 가정하던 값과 같다.
ALTER TABLE league_players ADD COLUMN IF NOT EXISTS height_cm INTEGER;
ALTER TABLE league_players ADD COLUMN IF NOT EXISTS is_pro    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE league_players ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN league_players.height_cm IS '키(cm). 레거시 players.height_cm 에서 이관 — 68명 전원 실측값 보유.';
COMMENT ON COLUMN league_players.is_pro    IS '선출(선수 출신) 여부. 명단 화면에 배지로 노출.';
COMMENT ON COLUMN league_players.is_active IS '활동 중 여부. false 면 명단에서 내리되 과거 기록은 유지한다.';

-- ── 세그먼트(대회) ───────────────────────────
-- 대회는 새 테이블을 만들지 않고 league_quarters(kind='tournament') 로 담는다.
--   076 이 이미 kind 를 일반화하며 'tournament' 를 값으로 넣어 뒀다 — 설계는 그때 끝나 있었다.
ALTER TABLE league_quarters ADD COLUMN IF NOT EXISTS tournament_type TEXT;
ALTER TABLE league_quarters ADD COLUMN IF NOT EXISTS description     TEXT;

-- ⚠ Postgres 에서 큰따옴표는 문자열이 아니라 식별자다. 주석 안에 작은따옴표를
--   써야 하므로 '' 로 이스케이프한다.
COMMENT ON COLUMN league_quarters.tournament_type IS '대회 성격(''pro''|''amateur''). kind=''tournament'' 일 때만 의미가 있다.';
COMMENT ON COLUMN league_quarters.description     IS '대회 설명. 레거시 tournaments.description 에서 이관.';

-- ── 이관 추적용 임시 컬럼 ────────────────────
-- ⚠ 단계 D(레거시 정리)에서 전부 제거한다. 영구 스키마가 아니다.
--   두 가지 때문에 둔다:
--   1) 멱등성 — 이관 스크립트를 두 번 돌려도 중복이 안 생긴다(있으면 갱신).
--   2) 대조 가능성 — 총합만 맞고 개별 행이 어긋나는 사고를 잡으려면
--      원본 행과 사본 행을 1:1 로 맞춰볼 수 있어야 한다.
ALTER TABLE league_games       ADD COLUMN IF NOT EXISTS legacy_id UUID;
ALTER TABLE league_players     ADD COLUMN IF NOT EXISTS legacy_id UUID;
ALTER TABLE league_quarters    ADD COLUMN IF NOT EXISTS legacy_id UUID;
ALTER TABLE league_teams       ADD COLUMN IF NOT EXISTS legacy_id UUID;
ALTER TABLE league_game_events ADD COLUMN IF NOT EXISTS legacy_id UUID;

COMMENT ON COLUMN league_games.legacy_id       IS '[임시·단계D에서 제거] 이관 원본 games.id';
COMMENT ON COLUMN league_players.legacy_id     IS '[임시·단계D에서 제거] 이관 원본 players.id';
COMMENT ON COLUMN league_quarters.legacy_id    IS '[임시·단계D에서 제거] 이관 원본 tournaments.id';
COMMENT ON COLUMN league_teams.legacy_id       IS '[임시·단계D에서 제거] 이관 원본 teams.id 또는 외부팀 생성 근거';
COMMENT ON COLUMN league_game_events.legacy_id IS '[임시·단계D에서 제거] 이관 원본 game_events.id';

-- 부분 유니크 인덱스 — 같은 원본 행이 두 번 복사되는 걸 DB 가 막는다.
--   스크립트의 "있으면 갱신" 로직이 경합이나 버그로 뚫려도 여기서 걸린다.
--   WHERE 절로 NULL(기존 리그 데이터 전체)은 인덱스 밖에 둔다 — 기존 행 45명·271경기는
--   legacy_id 가 전부 NULL 이므로 이 제약의 영향을 받지 않는다.
CREATE UNIQUE INDEX IF NOT EXISTS league_games_legacy_id_uniq       ON league_games(legacy_id)       WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS league_players_legacy_id_uniq     ON league_players(legacy_id)     WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS league_quarters_legacy_id_uniq    ON league_quarters(legacy_id)    WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS league_game_events_legacy_id_uniq ON league_game_events(legacy_id) WHERE legacy_id IS NOT NULL;
-- league_teams 는 유니크를 걸지 않는다 — 외부 상대팀은 같은 레거시 근거(teams.id)를
--   여러 리그에 걸쳐 만들 수 있어 1:1 이 아니다.
```

- [ ] **Step 3: 적용 전 상태 기록**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT (SELECT count(*) FROM league_players) players, (SELECT count(*) FROM league_games) games, (SELECT count(*) FROM league_game_events) events, (SELECT count(*) FROM league_teams) teams, (SELECT count(*) FROM league_quarters) quarters"
```
이 숫자를 보고서에 적어 둔다. Step 6 에서 **동일해야** 한다.

- [ ] **Step 4: 마이그레이션 적용**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs up 083
```
Expected: 성공 메시지. 실패하면 **다시 실행하지 말고** 오류 전문을 보고한다 — 부분 적용 상태에서 재실행하면 무엇이 적용됐는지 알 수 없어진다. (`IF NOT EXISTS` 라 재실행 자체는 안전하지만, 실패 원인을 먼저 밝힌다.)

- [ ] **Step 5: 컬럼이 실제로 생겼는지 확인**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND (column_name IN ('venue','round_label','ai_mvp','height_cm','is_pro','is_active','tournament_type','description','legacy_id')) AND table_name LIKE 'league_%' ORDER BY table_name, column_name"
```
Expected: 13행. 특히 확인할 것 —
- `league_players.is_pro` → `is_nullable=NO`, `column_default=false`
- `league_players.is_active` → `is_nullable=NO`, `column_default=true`
- 나머지 전부 `is_nullable=YES`

- [ ] **Step 6: 기존 데이터가 안 변했는지 확인**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT (SELECT count(*) FROM league_players) players, (SELECT count(*) FROM league_games) games, (SELECT count(*) FROM league_game_events) events, (SELECT count(*) FROM league_teams) teams, (SELECT count(*) FROM league_quarters) quarters, (SELECT count(*) FROM league_players WHERE legacy_id IS NOT NULL) migrated_players, (SELECT count(*) FROM league_players WHERE is_pro) pro, (SELECT count(*) FROM league_players WHERE NOT is_active) inactive"
```
Expected: 앞 5개는 Step 3 과 **정확히 동일**. `migrated_players=0`, `pro=0`, `inactive=0` — 아직 아무것도 이관하지 않았고 기본값이 제대로 먹었다는 뜻.

- [ ] **Step 7: verify-schema.mjs 에 단언 추가**

`scripts/verify-schema.mjs` 를 열고, 마지막 `console.log(failed === 0 ? ...)` 줄 **바로 앞에** 아래를 넣는다. 기존 단언은 건드리지 않는다.

```js
// 083 — 통일 단계 A 목적지 컬럼. 단계 B 이관 스크립트가 이 이름들에 의존한다.
//   컬럼이 조용히 사라지거나 이름이 바뀌면 이관이 런타임에서야 깨지므로 여기서 잡는다.
await check(
  '083 목적지 컬럼 13개 존재',
  `SELECT count(*)::int AS n
     FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name IN ('league_games','league_players','league_quarters','league_teams','league_game_events')
      AND (
        (table_name='league_games'       AND column_name IN ('venue','round_label','ai_mvp','legacy_id')) OR
        (table_name='league_players'     AND column_name IN ('height_cm','is_pro','is_active','legacy_id')) OR
        (table_name='league_quarters'    AND column_name IN ('tournament_type','description','legacy_id')) OR
        (table_name='league_teams'       AND column_name='legacy_id') OR
        (table_name='league_game_events' AND column_name='legacy_id')
      )`,
  (rows) => rows[0].n === 13,
)

// 단계 A 는 스키마만 준비한다 — 데이터는 단계 B 에서 옮긴다.
//   여기서 legacy_id 가 채워진 행이 보이면 단계를 건너뛰었거나 시험 데이터가 남은 것이다.
await check(
  '단계 A 시점에는 이관된 행이 없다',
  `SELECT
     (SELECT count(*)::int FROM league_games       WHERE legacy_id IS NOT NULL) AS g,
     (SELECT count(*)::int FROM league_players     WHERE legacy_id IS NOT NULL) AS p,
     (SELECT count(*)::int FROM league_game_events WHERE legacy_id IS NOT NULL) AS e`,
  (rows) => rows[0].g === 0 && rows[0].p === 0 && rows[0].e === 0,
)

// 기존 리그 선수 45명은 새 기본값을 받아야 한다 — NOT NULL 기본값이 제대로 먹었는지 확인.
//   (파란날개 이관 후에는 is_pro 7명이 생기므로, 그 시점에 이 단언은 단계 B 에서 갱신한다.)
await check(
  '기존 선수는 전원 비선출·활동중 기본값',
  `SELECT count(*)::int AS n FROM league_players WHERE legacy_id IS NULL AND (is_pro OR NOT is_active)`,
  (rows) => rows[0].n === 0,
)
```

- [ ] **Step 8: 검증 스크립트 실행**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs
```
Expected: 양쪽 다 `전부 통과`. 새 단언 3개를 포함해 실패 0.

기존 단언(미라클 득점 7114 · 선수 45 · 경기 271 · league_teams 3 · 외부팀 0)이 하나라도 깨지면 **중단하고 보고** — 스키마 추가만으로 그것들이 움직일 이유가 없으므로, 깨졌다면 다른 문제가 있는 것이다.

- [ ] **Step 9: 커밋**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && git add supabase/migrations/083_unification_destination_columns.sql scripts/verify-schema.mjs && git commit -m "$(cat <<'EOF'
feat(unify): 대회형 이관 목적지 컬럼 (단계 A)

파란날개를 리그 구조로 옮기기 전에, 레거시에만 있는 필드가 들어갈
자리를 만든다. 실측으로 값이 있는 것만 골랐다 — venue 33건 ·
round 43건 · ai_mvp 44건 · height_cm 68명 전원 · is_pro 7명.
weight_kg(0건) · notes(0건) 는 버린다.

round_label 로 개명: league_games 에 이미 round_num(일정 슬롯)이
있어 같은 이름을 쓰면 두 개념이 충돌한다.

legacy_id 5개는 임시 컬럼이다(단계 D 에서 제거). 이관 스크립트의
멱등성과, 총합이 아니라 행 단위 대조를 가능하게 하려고 둔다.
부분 유니크 인덱스로 같은 원본이 두 번 복사되는 걸 DB 가 막는다.

ADD COLUMN 과 COMMENT 뿐이라 기존 행·기존 쿼리는 그대로 동작한다.
미라클 기준선(7114점·45명·271경기) 불변 확인.
EOF
)"
```

---

### Task 2: 타입 반영

**Files:**
- Modify: `src/types/league.ts`

**Interfaces:**
- Consumes: Task 1 이 만든 13개 컬럼
- Produces: `LeagueGame` · `LeaguePlayer` · `LeagueQuarter` · `LeagueTeam` 타입에 새 필드. 단계 B 의 이관 스크립트와 단계 C 의 화면이 이 타입을 쓴다.

- [ ] **Step 1: 현재 타입 확인**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && grep -n "interface League\(Game\|Player\|Quarter\|Team\)\b" -A 25 src/types/league.ts
```

각 인터페이스의 기존 필드 이름·옵셔널 표기(`?`)·`| null` 사용 습관을 그대로 따른다. **파일이 이미 쓰는 스타일에 맞춘다** — 어떤 코드베이스는 `x?: string`, 어떤 곳은 `x: string | null` 을 쓴다. 섞지 말 것.

- [ ] **Step 2: 새 필드 추가**

읽어 본 스타일에 맞춰 아래 필드를 각 인터페이스에 넣는다. DB 가 nullable 인 컬럼은 타입도 null 을 허용해야 한다 — 그렇지 않으면 이관 전 기존 행(전부 NULL)을 읽을 때 타입이 거짓말을 한다.

`LeagueGame` 에:
```ts
  // 대회형에서 쓰는 필드 — 리그형은 홈코트 고정이라 대개 비어 있다 (083)
  venue: string | null
  // 토너먼트 라운드 표기(8강·결승). 일정 슬롯 번호인 round_num 과 다른 개념 (083)
  round_label: string | null
  // AI 가 쓴 경기 MVP 코멘트 (083)
  ai_mvp: unknown | null
  // [임시·단계D에서 제거] 이관 원본 games.id
  legacy_id: string | null
```

`LeaguePlayer` 에:
```ts
  height_cm: number | null
  // 선출(선수 출신) 여부 — 명단 화면 배지 (083)
  is_pro: boolean
  // false 면 명단에서 내리되 과거 기록은 유지 (083)
  is_active: boolean
  // [임시·단계D에서 제거] 이관 원본 players.id
  legacy_id: string | null
```

`LeagueQuarter` 에:
```ts
  // kind='tournament' 일 때만 의미가 있다 ('pro'|'amateur') (083)
  tournament_type: string | null
  description: string | null
  // [임시·단계D에서 제거] 이관 원본 tournaments.id
  legacy_id: string | null
```

`LeagueTeam` 에:
```ts
  // [임시·단계D에서 제거] 이관 원본 teams.id 또는 외부팀 생성 근거
  legacy_id: string | null
```

`ai_mvp` 를 `unknown | null` 로 두는 이유: 레거시가 jsonb 에 무엇을 넣었는지 아직 모양을 확정하지 않았다. 단계 B 에서 실제 구조를 확인한 뒤 좁힌다. `any` 를 쓰면 좁힐 때 컴파일러가 아무것도 안 잡아 준다.

만약 `LeagueQuarter` 나 `LeagueTeam` 인터페이스가 `src/types/league.ts` 에 없으면 **다른 파일에 있는지 먼저 찾는다** (`grep -rn "interface LeagueQuarter" src/`). 없으면 만들지 말고 보고한다 — 타입이 없다는 건 그 테이블을 타입 없이 다루는 곳이 있다는 뜻이라, 이 태스크 범위 밖의 판단이 필요하다.

- [ ] **Step 3: 타입 검사**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && npx tsc --noEmit
```
Expected: 오류 0.

오류가 난다면 대개 **객체 리터럴로 `LeaguePlayer` 등을 만드는 곳**이 새 필수 필드(`is_pro`, `is_active`)를 안 채워서다. 그런 곳을 찾으면 두 가지 중 하나를 택한다 —
- 그 리터럴이 DB 행을 그대로 담는 것이면 → 셀렉트에 컬럼을 추가한다.
- 화면용 임시 객체면 → 타입을 `Pick<>`/`Omit<>` 으로 좁힌다.

**필드를 옵셔널로 바꿔서 오류를 없애지 말 것.** DB 가 NOT NULL 인 값을 옵셔널로 두면 이후 코드가 `undefined` 를 방어하느라 없는 분기를 만들게 된다.

- [ ] **Step 4: 빌드**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && npm run build 2>&1 | tail -5
```
Expected: 오류 없이 완료.

⚠ dev 서버가 3005 에서 돌고 있으면 먼저 멈춘다 — 같은 `.next` 를 build 와 dev 가 동시에 쓰면 dev 가 죽는다.

- [ ] **Step 5: 검증 스크립트 재실행**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs
```
Expected: 양쪽 `전부 통과`.

- [ ] **Step 6: 커밋**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && git add src/types/league.ts && git commit -m "$(cat <<'EOF'
feat(unify): 083 컬럼을 리그 타입에 반영

DB 가 nullable 인 컬럼은 타입도 null 을 허용하게 뒀다 — 이관 전
기존 행은 전부 NULL 이라, 아니라고 쓰면 타입이 거짓말을 한다.

ai_mvp 는 unknown 으로 둔다. 레거시 jsonb 의 실제 모양을 단계 B 에서
확인한 뒤 좁힌다. any 로 두면 좁힐 때 컴파일러가 안 잡아 준다.
EOF
)"
```

---

## 완료 기준

이 단계가 끝나면 다음이 전부 참이어야 한다.

- `information_schema` 에 새 컬럼 13개가 존재하고, `is_pro`/`is_active` 만 NOT NULL + 기본값을 가진다.
- `league_*` 테이블의 행 수가 단계 시작 시점과 **완전히 동일**하다.
- `legacy_id` 가 채워진 행이 **0건**이다.
- `verify-schema.mjs`(신규 단언 3개 포함)와 `verify-scoring.mjs` 가 exit 0.
- `tsc --noEmit` · `npm run build` 통과.
- 미라클·파란날개 사용자에게 보이는 변화가 **없다** — 이 단계는 화면을 건드리지 않는다.

## 다음 단계

단계 B(데이터 복사)는 별도 계획으로 작성한다. 이 단계의 `legacy_id` 와 보존 컬럼 위에서 동작하며, 레거시 원본은 그때도 건드리지 않는다.
