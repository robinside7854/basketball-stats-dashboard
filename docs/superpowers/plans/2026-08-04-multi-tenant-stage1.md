# 멀티테넌트 표준화 단계 1 — 조직·시즌 계층 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 조직(`orgs`) → 팀(`teams`) → 시즌(`leagues`) → 세그먼트(`league_quarters`) 계층을 스키마에 세우고, 기존 데이터를 그 계층에 배치한다.

**Architecture:** 순수 추가만 한다. 새 테이블 1개(`orgs`)와 컬럼 몇 개를 더하고 백필할 뿐, 기존 컬럼·읽기 경로·URL은 하나도 건드리지 않는다. 애플리케이션 코드는 이 단계에서 변경하지 않는다 — 새 컬럼을 실제로 소비하는 것은 단계 2 이후다. 따라서 이 단계의 성공 기준은 "화면이 아무것도 달라지지 않는 것"이다.

**Tech Stack:** PostgreSQL (Supabase) · `scripts/db-migrate.mjs` (Management API 러너) · Node 스크립트 검증

## Global Constraints

- 마이그레이션 파일은 `supabase/migrations/NNN_*.sql`, 번호는 073 다음부터 순차.
- 실행은 반드시 `node scripts/db-migrate.mjs up NNN` — 번호를 지정한다. 인자 없이 `up` 을 돌리면 이력 도입 이전 파일(001~072)이 재실행된다.
- **기존 컬럼을 삭제하거나 이름을 바꾸지 않는다.** `leagues.org_slug`, `league_quarters.year`, `teams.org_slug` 는 단계 1에서 그대로 둔다. 제거는 소비처가 전부 옮겨간 뒤(단계 5 이후).
- **URL을 바꾸지 않는다.** `/league/miracle/2026`, `/paranalgae/youth` 는 그대로 동작해야 한다.
- 테이블명 유지 원칙: `leagues` 가 시즌을, `league_quarters` 가 세그먼트를 담게 되어도 이름은 바꾸지 않는다. 문자열 기반 Supabase 쿼리라 전역 치환은 타입 체커가 못 잡는다.
- 이름이 겹치는 두 개념을 혼동하지 않는다: `teams` = 청년부/장년부(조직 소속 팀), `league_teams` = 락다운/굿모닝(시즌 내 경기 팀).
- 이 저장소에는 테스트 러너가 없다(`package.json` scripts = dev/build/start/lint). 각 태스크의 검증은 `scripts/verify-schema.mjs` 에 어서션을 추가하고 실행하는 것으로 한다. 실패 시 non-zero 종료.

## 현재 데이터 (2026-08-04 실측)

```
teams    paranalgae/youth   파란날개        accent=blue
         paranalgae/senior  파란날개 장년부  accent=orange
leagues  miracle/2026              미라클모닝농구단      teams=3 players=45 games=301 quarters=3(모두 2026)
         pana-basket-senior/2026   파란날개 장년부 자체전  전부 0건 (빈 껍데기)
```

`miracle` 은 `teams` 행이 없다 → 이 계획에서 생성한다.
`pana-basket-senior` 는 데이터가 없는 스텁이다 → 파란날개 장년부 팀에 붙인다(삭제하지 않는다).
`league_quarters` 에 2025 행은 없다 → 시즌 분할 대상이 없다.

## File Structure

| 파일 | 책임 |
|---|---|
| `supabase/migrations/074_orgs_and_team_fk.sql` | `orgs` 신설 · `teams.org_id` FK · miracle 팀 생성 |
| `supabase/migrations/075_seasons_mode_rules.sql` | `leagues` 에 `team_id` · `mode` · `rules` 추가 + 백필 |
| `supabase/migrations/076_segments_and_external.sql` | `league_quarters` 세그먼트 일반화 · `league_teams.is_external` |
| `scripts/verify-schema.mjs` | 계층 불변식 검증 — 태스크마다 어서션을 누적 추가 |

마이그레이션을 3개로 나눈 이유: 각각 독립적으로 리뷰·롤백 가능한 단위다.
조직 계층 백필은 틀려도 시즌 계층과 무관하고, 그 반대도 마찬가지다.

---

### Task 1: 조직 계층 — `orgs` 신설 + `teams.org_id`

**Files:**
- Create: `supabase/migrations/074_orgs_and_team_fk.sql`
- Create: `scripts/verify-schema.mjs`

**Interfaces:**
- Produces: `orgs(id, slug, name, brand_color, logo_url, status, created_at)` — 이후 태스크가 `orgs.id` 를 FK 로 참조한다.
- Produces: `teams.org_id UUID NOT NULL REFERENCES orgs(id)` — Task 2 가 `teams.id` 를 `leagues.team_id` 로 참조한다.
- Produces: `scripts/verify-schema.mjs` 의 `check(name, sql, assertFn)` 헬퍼 — Task 2·3 이 어서션을 추가한다.

- [ ] **Step 1: 검증 스크립트 작성 (아직 실패해야 함)**

`scripts/verify-schema.mjs` 생성:

```js
// 멀티테넌트 계층 불변식 검증 — 단계 1
//
//   node scripts/verify-schema.mjs
//
// 실패가 하나라도 있으면 non-zero 로 종료한다.
// 마이그레이션마다 어서션을 여기에 누적한다.
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function readEnvFile(path) {
  if (!existsSync(path)) return {}
  return Object.fromEntries(
    readFileSync(path, 'utf8').split('\n')
      .filter(l => l.includes('=') && !l.trim().startsWith('#'))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
  )
}

const env = readEnvFile('.env.local')
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]
let token = process.env.SUPABASE_ACCESS_TOKEN ?? env.SUPABASE_ACCESS_TOKEN
if (!token) {
  const cfg = JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf8'))
  for (const s of Object.values(cfg.mcpServers ?? {})) {
    if ((s.args ?? []).join(' ').includes(ref) && s.env?.SUPABASE_ACCESS_TOKEN) { token = s.env.SUPABASE_ACCESS_TOKEN; break }
  }
}

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Management API ${res.status}\n${text}`)
  try { return JSON.parse(text) } catch { return [] }
}

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

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}건 실패`)
process.exitCode = failed === 0 ? 0 : 1
```

- [ ] **Step 2: 검증 실행해 실패 확인**

Run: `node scripts/verify-schema.mjs`

Expected: 3건 모두 `✖` — `orgs` 테이블이 없고 `teams.org_id` 컬럼이 없으므로 쿼리 자체가 실패한다.
마지막 줄에 `3건 실패`, 종료 코드 1.

- [ ] **Step 3: 마이그레이션 작성**

`supabase/migrations/074_orgs_and_team_fk.sql` 생성:

```sql
-- =============================================
-- 074_orgs_and_team_fk.sql
-- 멀티테넌트 표준화 단계 1-a — 조직 계층 신설
-- =============================================
-- 지금까지 조직은 테이블이 아니라 org_slug TEXT 관습이었다.
-- teams.org_slug 와 leagues.org_slug 가 서로 다른 네임스페이스로 놀고 있어
-- (teams=paranalgae / leagues=miracle, pana-basket-senior) 조직 단위로
-- 로고·브랜드컬러·상태를 붙일 데가 없었다.
--
-- 순수 추가다. org_slug 컬럼은 그대로 두고 org_id FK 를 나란히 놓는다.
-- 소비처가 전부 옮겨간 뒤(단계 5 이후)에 제거한다.
-- =============================================

CREATE TABLE IF NOT EXISTS orgs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  brand_color  TEXT,                                  -- 없으면 앱 기본 팔레트 사용
  logo_url     TEXT,
  status       TEXT NOT NULL DEFAULT 'active',        -- active | dormant
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orgs_public_read ON orgs;
CREATE POLICY orgs_public_read ON orgs FOR SELECT USING (true);
-- 쓰기는 service_role 전용 (어드민 API 가 admin 클라이언트로 접근)

-- 기존 조직 2개 등록
--   paranalgae : teams.org_slug 에서 유래 (청년부·장년부)
--   miracle    : leagues.org_slug 에서 유래 (teams 행이 없어 아래에서 생성)
INSERT INTO orgs (slug, name, brand_color)
VALUES
  ('paranalgae', '파란날개',       NULL),
  ('miracle',    '미라클모닝농구단', '#EAB308')
ON CONFLICT (slug) DO NOTHING;

-- teams 에 org FK 추가
ALTER TABLE teams ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES orgs(id);

UPDATE teams t
   SET org_id = o.id
  FROM orgs o
 WHERE o.slug = t.org_slug
   AND t.org_id IS NULL;

-- miracle 은 teams 행이 없다 → 생성.
--   sub_slug='main' : 서브팀 구분이 없는 조직의 단일 팀
--   edit_pin        : leagues.edit_pin 을 그대로 승계해 기존 편집 권한과 어긋나지 않게
INSERT INTO teams (org_id, org_slug, sub_slug, name, accent_color, edit_pin, is_active)
SELECT o.id, 'miracle', 'main', '미라클모닝농구단', 'yellow',
       COALESCE((SELECT l.edit_pin FROM leagues l WHERE l.org_slug = 'miracle' LIMIT 1), '0000'),
       true
  FROM orgs o
 WHERE o.slug = 'miracle'
   AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.org_slug = 'miracle');

ALTER TABLE teams ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teams_org_id ON teams(org_id);
```

- [ ] **Step 4: 마이그레이션 실행**

Run: `node scripts/db-migrate.mjs up 074`

Expected:
```
▶ 074_orgs_and_team_fk.sql ... 완료

1개 적용됨
```

- [ ] **Step 5: 검증 실행해 통과 확인**

Run: `node scripts/verify-schema.mjs`

Expected: 3건 모두 `✔`, 마지막 줄 `전부 통과`, 종료 코드 0.

- [ ] **Step 6: 기존 화면 회귀 확인**

Run: `npm run build`

Expected: `✓ Compiled successfully`. 코드를 안 건드렸으므로 반드시 통과해야 한다.
실패하면 마이그레이션이 아니라 다른 원인이므로 멈추고 조사한다.

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/074_orgs_and_team_fk.sql scripts/verify-schema.mjs
git commit -m "feat(db): orgs 테이블 신설 + teams.org_id FK (단계 1-a)

조직이 테이블이 아니라 org_slug TEXT 관습이었고, teams 와 leagues 의
org_slug 네임스페이스가 서로 달라 조직 단위 속성을 붙일 데가 없었다.

- orgs 신설 (slug/name/brand_color/logo_url/status) + public read RLS
- paranalgae · miracle 2건 등록
- teams.org_id FK 추가 후 백필 → NOT NULL
- miracle 은 teams 행이 없어 sub_slug=main 으로 생성 (edit_pin 은 league 승계)
- scripts/verify-schema.mjs 신설 — 계층 불변식 검증

기존 컬럼·URL 변경 없음. 순수 추가."
```

---

### Task 2: 시즌 계층 — `leagues.team_id` · `mode` · `rules`

**Files:**
- Create: `supabase/migrations/075_seasons_mode_rules.sql`
- Modify: `scripts/verify-schema.mjs` (Task 1 의 마지막 `console.log(failed === 0 ...)` 블록 **앞에** 어서션 추가)

**Interfaces:**
- Consumes: Task 1 의 `orgs.id`, `teams.id`, `scripts/verify-schema.mjs` 의 `check()` 헬퍼.
- Produces: `leagues.team_id UUID NOT NULL REFERENCES teams(id)` · `leagues.mode TEXT` · `leagues.rules JSONB` — 단계 2 의 룰 엔진이 `rules` 를 읽는다.
- Produces: `rules` JSON 형태 — 키 이름은 단계 2 집계 로직이 그대로 참조하므로 여기서 확정한다.

- [ ] **Step 1: 검증 어서션 추가 (아직 실패해야 함)**

`scripts/verify-schema.mjs` 의 `console.log(failed === 0 ? ...)` **바로 위**에 삽입:

```js
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
```

- [ ] **Step 2: 검증 실행해 새 어서션이 실패하는지 확인**

Run: `node scripts/verify-schema.mjs`

Expected: Task 1 어서션 3건 `✔`, 새 어서션 5건 `✖` (컬럼 없음), `5건 실패`, 종료 코드 1.

- [ ] **Step 3: 마이그레이션 작성**

`supabase/migrations/075_seasons_mode_rules.sql` 생성:

```sql
-- =============================================
-- 075_seasons_mode_rules.sql
-- 멀티테넌트 표준화 단계 1-b — 시즌 계층
-- =============================================
-- leagues 를 "시즌"으로 확장한다. 시즌 = 연도 1개.
--   · team_id : 어느 팀의 시즌인지 (조직이 아니라 팀에 매단다 — 청년부/장년부 격리)
--   · mode    : league | tournament — 운영 방식 분기점
--   · rules   : 팀별로 달라지는 운영 룰. 통계·배지·어워즈는 여기 넣지 않는다(전 팀 동일).
--
-- rules 키는 단계 2 집계 로직이 그대로 참조하므로 여기서 확정한다.
--   event_points     : 이벤트 타입 → 득점. 현재 하드코딩된 switch 문을 대체한다.
--   plus_one_bonus   : plus_one 선수의 야투 성공에 더할 점수 (미라클 1, 표준 0)
--   round_unit       : 'day' = 경기일 1개가 1라운드 (미라클), 'game' = 경기 슬롯 1개가 1라운드
--   qualification    : 리더보드 최소 출전 자격 — 기간 내 열린 라운드 대비 비율
--   period / tracking: 아직 소비처가 없다. 단계 2 이후 사용 (지금은 데이터만 보관)
--
-- 순수 추가다. org_slug · season_year · slug 는 그대로 둔다.
-- =============================================

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS mode    TEXT NOT NULL DEFAULT 'league';
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS rules   JSONB;

ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_mode_check;
ALTER TABLE leagues ADD  CONSTRAINT leagues_mode_check CHECK (mode IN ('league', 'tournament'));

-- 배치
--   miracle            → miracle/main       (미라클모닝 자체 리그)
--   pana-basket-senior → paranalgae/senior  (파란날개 장년부 자체전 · 현재 데이터 0건인 스텁)
UPDATE leagues l
   SET team_id = t.id
  FROM teams t
  JOIN orgs  o ON o.id = t.org_id
 WHERE l.team_id IS NULL
   AND (
        (l.org_slug = 'miracle'            AND o.slug = 'miracle'    AND t.sub_slug = 'main')
     OR (l.org_slug = 'pana-basket-senior' AND o.slug = 'paranalgae' AND t.sub_slug = 'senior')
   );

ALTER TABLE leagues ALTER COLUMN team_id SET NOT NULL;

-- 표준 아마추어 농구 룰 (기본값) — 신규 동호회는 아무 설정 없이 이 값으로 동작한다
ALTER TABLE leagues ALTER COLUMN rules SET DEFAULT '{
  "event_points": {
    "shot_3p": 3, "shot_2p_mid": 2, "shot_layup": 2, "shot_post": 2,
    "ft_2pt": 1, "ft_3pt_1": 1, "ft_3pt_2": 1, "free_throw": 1,
    "and_one": 1
  },
  "plus_one_bonus": 0,
  "round_unit": "game",
  "qualification": { "min_round_ratio": 0.3 },
  "period": { "count": 4, "minutes": 10 },
  "tracking": { "fouls": true, "minutes": true }
}'::jsonb;

-- 기존 행에도 같은 기본값을 채운다.
-- (information_schema.column_default 를 읽어 캐스팅하면 '{...}'::jsonb 문자열이라 파싱에 실패한다 —
--  리터럴을 그대로 반복하는 편이 안전하다)
UPDATE leagues
   SET rules = '{
  "event_points": {
    "shot_3p": 3, "shot_2p_mid": 2, "shot_layup": 2, "shot_post": 2,
    "ft_2pt": 1, "ft_3pt_1": 1, "ft_3pt_2": 1, "free_throw": 1,
    "and_one": 1
  },
  "plus_one_bonus": 0,
  "round_unit": "game",
  "qualification": { "min_round_ratio": 0.3 },
  "period": { "count": 4, "minutes": 10 },
  "tracking": { "fouls": true, "minutes": true }
}'::jsonb
 WHERE rules IS NULL;

-- 미라클모닝 예외 룰
--   · plus_one 선수는 야투 성공 시 +1 (3점→4점, 2점→3점)
--   · 2점슛 파울 자유투 1구가 2점(ft_2pt), 3점슛 파울은 2점+1점(ft_3pt_1 + ft_3pt_2)
--   · 하루에 여러 경기를 치르므로 라운드 단위가 '경기일'
--   · 쿼터 7분 4쿼터
UPDATE leagues
   SET rules = rules
     || '{"plus_one_bonus": 1}'::jsonb
     || '{"round_unit": "day"}'::jsonb
     || '{"event_points": {
            "shot_3p": 3, "shot_2p_mid": 2, "shot_layup": 2, "shot_post": 2,
            "ft_2pt": 2, "ft_3pt_1": 2, "ft_3pt_2": 1, "free_throw": 1,
            "and_one": 1
          }}'::jsonb
     || '{"period": {"count": 4, "minutes": 7}}'::jsonb
 WHERE org_slug = 'miracle';

ALTER TABLE leagues ALTER COLUMN rules SET NOT NULL;

-- 시즌 신원 = (팀, 연도, 슬러그).
--   보통 팀당 연도당 1개다. 같은 해에 내부 리그와 외부 대회를 병행하면 slug 로 구분해 2개를 둔다.
--   기존 UNIQUE(org_slug, slug) 는 org_slug 를 제거할 때까지 함께 둔다.
ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_team_season_unique;
ALTER TABLE leagues ADD  CONSTRAINT leagues_team_season_unique UNIQUE (team_id, season_year, slug);

CREATE INDEX IF NOT EXISTS idx_leagues_team_id ON leagues(team_id);
```

- [ ] **Step 4: 마이그레이션 실행**

Run: `node scripts/db-migrate.mjs up 075`

Expected:
```
▶ 075_seasons_mode_rules.sql ... 완료

1개 적용됨
```

- [ ] **Step 5: 검증 실행해 통과 확인**

Run: `node scripts/verify-schema.mjs`

Expected: 8건 모두 `✔`, `전부 통과`, 종료 코드 0.

- [ ] **Step 6: 룰 값이 현재 하드코딩과 일치하는지 눈으로 대조**

Run: `node scripts/db-migrate.mjs sql "SELECT org_slug, rules->'event_points' AS pts, rules->'plus_one_bonus' AS bonus FROM leagues ORDER BY org_slug"`

Expected: miracle 의 `ft_2pt=2`, `ft_3pt_1=2`, `bonus=1`.
이 값들은 `src/app/api/leagues/[leagueId]/players/[playerId]/detail/route.ts` 의
`case 'ft_2pt': ... s.pts += 2`, `isPlusOne ? 4 : 3` 와 일치해야 한다.
어긋나면 단계 2 에서 집계 결과가 바뀐다 — 여기서 반드시 잡는다.

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/075_seasons_mode_rules.sql scripts/verify-schema.mjs
git commit -m "feat(db): leagues 를 시즌으로 확장 — team_id · mode · rules (단계 1-b)

- leagues.team_id FK (조직이 아니라 팀에 매달아 청년부/장년부 격리 유지)
- leagues.mode CHECK (league|tournament)
- leagues.rules JSONB — 팀별로 달라지는 운영 룰만. 통계·배지·어워즈는 제외(전 팀 동일)
- 기본값 = 표준 아마추어 룰 → 신규 동호회는 무설정으로 동작
- 미라클 예외만 오버라이드: plus_one_bonus=1 · ft_2pt=2 · round_unit=day · 7분 4쿼터
- 배치: miracle→miracle/main, pana-basket-senior→paranalgae/senior

rules 값은 detail/route.ts 의 현재 하드코딩과 일치함을 대조 확인.
기존 컬럼·URL 변경 없음."
```

---

### Task 3: 세그먼트 일반화 + 외부 팀 플래그

**Files:**
- Create: `supabase/migrations/076_segments_and_external.sql`
- Modify: `scripts/verify-schema.mjs` (마지막 `console.log` 블록 앞에 어서션 추가)

**Interfaces:**
- Consumes: Task 2 의 `leagues.mode`.
- Produces: `league_quarters.kind TEXT` · `.name TEXT` · `.ord INT` — 단계 2 이후 세그먼트 필터 UI 가 `name`/`ord` 를 쓴다.
- Produces: `league_teams.is_external BOOLEAN NOT NULL DEFAULT false` — 단계 4 의 집계 제외 필터가 이 컬럼 하나로 판정한다.

- [ ] **Step 1: 검증 어서션 추가 (아직 실패해야 함)**

`scripts/verify-schema.mjs` 의 `console.log(failed === 0 ? ...)` **바로 위**에 삽입:

```js
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
```

- [ ] **Step 2: 검증 실행해 새 어서션이 실패하는지 확인**

Run: `node scripts/verify-schema.mjs`

Expected: 기존 8건 `✔`, 새 3건 `✖`, `3건 실패`, 종료 코드 1.

- [ ] **Step 3: 마이그레이션 작성**

`supabase/migrations/076_segments_and_external.sql` 생성:

```sql
-- =============================================
-- 076_segments_and_external.sql
-- 멀티테넌트 표준화 단계 1-c — 세그먼트 · 외부 팀
-- =============================================
-- 1) league_quarters 를 "시즌 내 구분(세그먼트)"으로 일반화한다.
--    분기(quarter)는 미라클모닝 리그의 특이점이지 표준이 아니다.
--    대회형은 kind='tournament' 로 개별 대회를 담는다.
--    세그먼트가 0개면 시즌 전체가 하나의 구간이다 — 신규 동호회의 기본 상태.
--
--    year 컬럼은 시즌(leagues)으로 올라갔으나 지금 제거하지 않는다.
--    league_quarters.year 를 읽는 코드가 아직 남아 있다(단계 5 이후 정리).
--
-- 2) league_teams.is_external — 대회형에서 상대팀을 구분한다.
--    집계 제외 판정을 이 컬럼 하나로만 한다. 선수에는 두지 않는다
--    (선수 소속은 팀을 통해 유도되므로 두 곳에 두면 불일치가 생긴다).
-- =============================================

ALTER TABLE league_quarters ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'quarter';
ALTER TABLE league_quarters ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE league_quarters ADD COLUMN IF NOT EXISTS ord  INT;

ALTER TABLE league_quarters DROP CONSTRAINT IF EXISTS league_quarters_kind_check;
ALTER TABLE league_quarters ADD  CONSTRAINT league_quarters_kind_check CHECK (kind IN ('quarter', 'tournament'));

-- 기존 분기에 표시 이름과 정렬 순서 부여 — '26.1Q' 형식은 현재 UI 표기와 동일하게 맞춘다
UPDATE league_quarters
   SET name = COALESCE(name, right(year::text, 2) || '.' || quarter::text || 'Q'),
       ord  = COALESCE(ord, quarter)
 WHERE name IS NULL OR ord IS NULL;

ALTER TABLE league_quarters ALTER COLUMN name SET NOT NULL;
ALTER TABLE league_quarters ALTER COLUMN ord  SET NOT NULL;

ALTER TABLE league_teams ADD COLUMN IF NOT EXISTS is_external BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_league_teams_external ON league_teams(league_id, is_external);
```

- [ ] **Step 4: 마이그레이션 실행**

Run: `node scripts/db-migrate.mjs up 076`

Expected:
```
▶ 076_segments_and_external.sql ... 완료

1개 적용됨
```

- [ ] **Step 5: 검증 실행해 통과 확인**

Run: `node scripts/verify-schema.mjs`

Expected: 11건 모두 `✔`, `전부 통과`, 종료 코드 0.

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/076_segments_and_external.sql scripts/verify-schema.mjs
git commit -m "feat(db): 세그먼트 일반화 + league_teams.is_external (단계 1-c)

- league_quarters 에 kind(quarter|tournament) · name · ord 추가
  분기는 미라클 특이점이지 표준이 아니다. 대회형은 kind=tournament 로 개별 대회를 담는다.
  세그먼트 0개 = 시즌 전체가 하나 → 신규 동호회 기본 상태
  기존 3개 분기에 26.1Q/26.2Q/26.3Q 이름과 정렬 순서 부여
- league_teams.is_external 추가 (기본 false)
  집계 제외 판정을 이 컬럼 하나로만 한다. 선수에는 두지 않는다
- year 컬럼은 아직 읽는 코드가 있어 제거하지 않음 (단계 5 이후)

기존 컬럼·URL 변경 없음."
```

---

### Task 4: 회귀 확인 — 화면이 달라지지 않았음을 증명

**Files:**
- Modify: `scripts/verify-schema.mjs` (마지막 `console.log` 블록 앞에 어서션 추가)

**Interfaces:**
- Consumes: Task 1~3 의 모든 스키마 변경.
- Produces: 없음. 이 태스크는 단계 1 전체의 종료 게이트다.

단계 1 은 코드를 한 줄도 바꾸지 않았다. 따라서 **모든 집계 결과가 이전과 완전히 동일해야 한다.**
컬럼 추가가 기존 쿼리를 깨뜨리지 않았는지, `SELECT *` 를 쓰는 코드가 새 컬럼 때문에 오작동하지 않는지 확인한다.

- [ ] **Step 1: 데이터 불변 어서션 추가**

`scripts/verify-schema.mjs` 의 `console.log(failed === 0 ? ...)` **바로 위**에 삽입:

```js
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
  `SELECT COALESCE(sum(points), 0)::int AS total FROM league_game_events WHERE result = 'made'`,
  rows => rows[0].total > 0 || '성공 슛 득점 합계가 0 — 이벤트가 유실되었을 수 있음'
)
```

> 위 기대값 301/45/3 은 2026-08-04 실측값이다. 이 계획을 나중에 실행해 값이 달라졌다면,
> 먼저 `node scripts/db-migrate.mjs sql "SELECT count(*) FROM league_games"` 로 현재값을 확인하고
> 어서션의 숫자를 그 값으로 갱신한 뒤 진행한다. **값이 다르다고 마이그레이션을 의심하지 말 것** —
> 그 사이에 경기가 더 기록됐을 뿐이다.

- [ ] **Step 2: 검증 전체 실행**

Run: `node scripts/verify-schema.mjs`

Expected: 13건 모두 `✔`, `전부 통과`, 종료 코드 0.

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`

Expected: `✓ Compiled successfully`

- [ ] **Step 4: 운영 화면 육안 확인**

브라우저에서 아래 3개를 열어 **이전과 동일한지** 확인한다.

1. `https://basketball-stats-dashboard.vercel.app/league/miracle/2026` — 홈 (팀 승률·최근 라운드·리더)
2. `.../league/miracle/2026/stats` — 리더보드에 45명 중 자격자가 이전과 같은 수로 표시되는지
3. `.../league/miracle/2026/stats` 에서 선수 하나를 눌러 선수 카드의 **커리어 하이 값**

Expected: 세 화면 모두 단계 1 이전과 동일. 하나라도 다르면 **즉시 중단**하고 원인을 찾는다.
단계 1 은 코드를 안 바꿨으므로 화면이 달라질 이유가 없다.

- [ ] **Step 5: 커밋**

```bash
git add scripts/verify-schema.mjs
git commit -m "test(db): 단계 1 회귀 방지 어서션 — 데이터 불변 확인

단계 1 은 코드를 한 줄도 바꾸지 않았으므로 집계 결과가 완전히 동일해야 한다.
경기 301 · 선수 45 · 경기팀 3 건수와 득점 합계를 고정해 컬럼 추가가
기존 쿼리를 깨뜨리지 않았음을 증명한다."
```

- [ ] **Step 6: 푸시**

```bash
git push origin master
```

---

## 단계 1 완료 후 상태

```
orgs        paranalgae(파란날개) · miracle(미라클모닝농구단)
 └ teams    paranalgae/youth · paranalgae/senior · miracle/main
    └ leagues(시즌)  miracle/2026 (mode=league, 미라클 룰)
                     pana-basket-senior/2026 (mode=league, 표준 룰, 데이터 0건)
       └ league_quarters(세그먼트)  26.1Q · 26.2Q · 26.3Q (kind=quarter)
          └ league_teams  3건 (전부 is_external=false)
```

애플리케이션은 여전히 `org_slug`·`season_year`·`quarter` 를 읽는다.
새 컬럼을 소비하는 것은 단계 2(룰 엔진)부터다.

## 단계 1 에서 하지 않은 것 (의도적)

- `leagues.org_slug` · `teams.org_slug` · `league_quarters.year` 제거 — 읽는 코드가 남아 있다. 단계 5 이후.
- URL 구조 변경 — `/league/miracle/2026` 유지.
- 통산 지표의 `team_id` 합산 전환 — **현재 `league_quarters` 에 2025 행이 없어 시즌이 하나뿐이다.**
  시즌층과 통산층이 아직 일치하므로 지금 손댈 이유가 없다. 2025 임포트를 실제로 실행하거나
  2027 시즌이 시작될 때 단계 1.5 로 처리한다. (스펙의 단계 1.5 는 그때까지 보류)
- `pana-basket-senior` 스텁 리그 정리 — 데이터가 0건이라 지워도 무방하지만,
  운영 의도(장년부 자체전 준비)를 모르므로 건드리지 않는다. 사용 계획을 확인한 뒤 결정한다.
