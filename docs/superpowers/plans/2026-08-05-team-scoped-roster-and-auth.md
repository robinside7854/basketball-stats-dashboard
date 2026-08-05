# 명단·로그인을 팀 단위로 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 팀의 명단과 회원 계정을 경기묶음이 아니라 **팀**에 매달아, 리그와 대회를 오가도 같은 사람·같은 로그인이 유지되게 한다. 대회 참가 인원은 대회마다 등록해서 정한다.

**Architecture:** `league_players` 와 `league_user_accounts` 에 `team_id` 를 추가해 그것을 정체성의 기준으로 삼는다. `league_id` 는 지우지 않고 남기되 읽기 경로를 팀 기준으로 바꾼다 — 39개 파일이 읽고 있어 한 번에 지우면 어디가 깨졌는지 알 수 없다. 세션의 소속 값도 팀으로 옮기되, **이미 발급된 쿠키를 무효화하지 않도록** 전환기 동안 옛 값도 받아준다. 참가 등록은 새로 만들지 않는다 — `league_player_quarters` 가 파란날개의 `tournament_players` 와 같은 역할을 이미 한다.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase/PostgreSQL, HMAC 세션 쿠키.

## Global Constraints

- 선행: `docs/superpowers/plans/2026-08-05-team-competitions-trial.md` (미라클에 대회 묶음 생성 완료)
- **파란날개(레거시 트리)는 어느 단계에서도 건드리지 않는다.** `src/app/(main)/` 와 `teams`·`tournaments`·`games`·`game_events`·`players` 는 읽지도 쓰지도 않는다. 단, **등록 방식은 그 트리의 `tournament_players` 모델을 참고**한다(읽기만).
- **로그인한 회원이 로그아웃되면 안 된다.** 세션 쿠키는 30일짜리이고 이미 발급돼 있다. 검증 기준을 바꾸면서 옛 쿠키를 거부하면 전원이 튕긴다.
- **미라클 기준선 불변**: 득점 7114 · 선수 45 · league_teams 3. 각 태스크 끝에서 `node scripts/verify-schema.mjs` · `node scripts/verify-scoring.mjs` exit 0.
- 마이그레이션 번호: 086 까지 적용됨. `ls supabase/migrations/` 로 확인 후 087 부터. 정확히 한 번 적용(`node scripts/db-migrate.mjs up 087`) — 번호를 생략하면 옛 파일까지 재실행된다.
- `npx tsc --noEmit` · `npm run build` 통과. ⚠ `npm run build` 와 dev 서버가 같은 `.next` 를 쓰면 dev 가 죽는다(포트 3033) — 먼저 멈추고 나중에 재기동.
- 디자인: `mm-*` CSS 변수만. 하드코딩 hex 금지. 모바일 우선(375px), 터치 타깃 44×44px, `cursor-pointer`, 포커스 표시. 한국어 문구.
- 쿼리 실패를 빈 결과로 삼키지 않는다 — 문맥과 함께 throw.
- 브랜치 `master`. 태스크마다 커밋. **푸시 금지** — 전체 검토 후 한 번에.
- 주석·커밋 메시지는 한국어, *왜* 를 적는다.
- 작업 디렉터리 `c:\Users\N_399\Desktop\ai_rob\basketball-stats-dashboard`. 셸이 리셋되므로 매 명령 앞에 `cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard &&`.

## 지금 무엇이 잘못돼 있나 (실측)

| 테이블 | 스코프 | 결과 |
|---|---|---|
| `league_players` | `league_id NOT NULL` | 묶음마다 명단이 따로. 미라클 대회 묶음은 선수 0명 |
| `league_user_accounts` | `league_id NOT NULL` | 묶음마다 계정이 따로. 대회로 넘어가면 로그아웃 + 재가입 요구 |
| `league_player_quarters` | `(quarter_id, league_player_id)` | **이미 참가 등록 개념** — 새로 만들 필요 없음 |

세션 페이로드는 `{ uid, lid, pid }` 이고 `lid` 를 `leagueId` 와 직접 비교한다(5곳: `guard.ts:16`, `leagueAdmin.ts:20`, `auth/me`, `auth/password`, `session.ts:48`). 그래서 다른 묶음으로 가면 `lid !== leagueId` 가 되어 세션이 없는 것으로 처리된다 — **이것이 로그인이 풀리는 직접 원인이다.**

`league_players` 를 읽는 파일은 39개다. 한 번에 바꾸지 않는다.

---

## 파일 구성

| 파일 | 책임 |
|---|---|
| `supabase/migrations/087_team_scoped_roster_auth.sql` (신규) | `team_id` 추가 + 백필 + 인덱스 |
| `src/lib/league/teamScope.ts` (신규) | `leagueId → team_id` 해석 한 곳 (캐시 포함) |
| `src/lib/auth/session.ts` (수정) | 페이로드에 `tid` 추가, 옛 쿠키 호환 |
| `src/lib/auth/guard.ts` · `leagueAdmin.ts` (수정) | 팀 기준 판정 |
| `src/app/api/leagues/[leagueId]/players/route.ts` 외 명단 경로 (수정) | 팀 기준 조회 |
| `src/components/league/TournamentRosterPanel.tsx` (신규) | 대회 참가 인원 등록 UI |

---

### Task 1: 스키마 — 명단·계정에 team_id 붙이기

**Files:**
- Create: `supabase/migrations/087_team_scoped_roster_auth.sql`
- Create: `src/lib/league/teamScope.ts`
- Modify: `scripts/verify-schema.mjs`

**Interfaces:**
- Produces:
  - `league_players.team_id UUID` (백필됨, 이후 NOT NULL 아님 — 전환기)
  - `league_user_accounts.team_id UUID` (백필됨)
  - `resolveTeamId(leagueId: string): Promise<string>` — 못 찾으면 throw

- [ ] **Step 1: 현재 값 기록**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT (SELECT count(*) FROM league_players) players, (SELECT count(*) FROM league_user_accounts) accounts, (SELECT count(*) FROM league_user_accounts WHERE status='approved') approved, (SELECT count(*) FROM leagues) leagues"
```
보고서에 적는다. Step 5 에서 **행 수가 같아야** 한다.

- [ ] **Step 2: 마이그레이션 작성**

Create `supabase/migrations/087_team_scoped_roster_auth.sql`:

```sql
-- =============================================
-- 087_team_scoped_roster_auth.sql
-- 명단과 회원 계정을 경기묶음이 아니라 팀에 매단다
-- =============================================
-- 배경
--   league_players 와 league_user_accounts 가 league_id(경기묶음)에 매여 있다.
--   한 팀이 리그와 대회를 함께 운영하면 같은 사람이 묶음마다 다른 행이 되고,
--   회원은 묶음을 옮길 때마다 로그아웃되고 재가입을 요구받는다.
--
--   팀이 명단과 회원의 주인이다. 대회에 누가 나가는지는 대회마다 등록해서 정한다
--   (league_player_quarters — 이미 있는 개념이라 새로 만들지 않는다).
--
-- 이 마이그레이션은 컬럼 추가 + 백필 + 인덱스만 한다.
--   league_id 는 지우지 않는다 — 39개 파일이 그걸로 읽고 있어서, 한 번에 없애면
--   어디가 깨졌는지 알 수 없다. 읽기 경로를 옮긴 뒤 별도로 정리한다.
-- =============================================

ALTER TABLE league_players       ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE league_user_accounts ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

COMMENT ON COLUMN league_players.team_id       IS '명단의 주인. 같은 팀의 모든 경기묶음이 이 명단을 공유한다. 대회 참가 인원은 league_player_quarters 로 따로 등록.';
COMMENT ON COLUMN league_user_accounts.team_id IS '계정의 주인. 팀 단위라 리그↔대회를 오가도 로그인이 유지된다.';

-- 백필 — 지금은 묶음마다 명단이 따로이므로 각 행의 league 가 속한 팀을 넣으면 된다.
UPDATE league_players p
   SET team_id = l.team_id
  FROM leagues l
 WHERE l.id = p.league_id AND p.team_id IS NULL;

UPDATE league_user_accounts a
   SET team_id = l.team_id
  FROM leagues l
 WHERE l.id = a.league_id AND a.team_id IS NULL;

-- 팀 기준 조회가 새 주 경로가 되므로 인덱스를 준다.
CREATE INDEX IF NOT EXISTS league_players_team_idx       ON league_players(team_id);
CREATE INDEX IF NOT EXISTS league_user_accounts_team_idx ON league_user_accounts(team_id);

-- 로그인 아이디는 이제 팀 안에서 유일해야 한다.
--   묶음마다 계정이 따로일 때는 같은 아이디가 여러 묶음에 존재할 수 있었지만,
--   팀 단위로 합치면 그건 같은 사람 둘이 된다.
--   ⚠ 기존 데이터에 팀 내 중복이 있으면 이 인덱스 생성이 실패한다 — 그 경우
--     실패를 그대로 보고하고, 중복을 지우지 말 것(어느 쪽이 진짜인지 사람이 판단해야 한다).
CREATE UNIQUE INDEX IF NOT EXISTS league_user_accounts_team_login_uniq
  ON league_user_accounts(team_id, login_id) WHERE team_id IS NOT NULL;
```

- [ ] **Step 3: 중복 로그인 아이디를 먼저 확인한다**

인덱스가 실패할 수 있으므로 적용 전에 본다.

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT l.team_id, a.login_id, count(*) FROM league_user_accounts a JOIN leagues l ON l.id=a.league_id GROUP BY 1,2 HAVING count(*) > 1"
```
Expected: 0행. 행이 나오면 **중단하고 보고** — 지우지 말 것.

- [ ] **Step 4: 적용**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs up 087
```

- [ ] **Step 5: 백필 확인**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT (SELECT count(*) FROM league_players) players, (SELECT count(*) FROM league_players WHERE team_id IS NULL) players_null, (SELECT count(*) FROM league_user_accounts) accounts, (SELECT count(*) FROM league_user_accounts WHERE team_id IS NULL) accounts_null"
```
Expected: 행 수는 Step 1 과 동일, `*_null` 은 **0**.

- [ ] **Step 6: 팀 해석 헬퍼**

Create `src/lib/league/teamScope.ts`:

```ts
import { createClient } from '@/lib/supabase/admin'

// 경기묶음(leagues 행) → 그 묶음이 속한 팀.
//   명단과 계정이 팀에 매달리면서 거의 모든 조회가 이 값을 먼저 필요로 한다.
//   요청마다 같은 값을 다시 묻게 되므로 짧게 캐시한다 — 팀 소속은 사실상 바뀌지 않는다.
const cache = new Map<string, { teamId: string; expiresAt: number }>()
const TTL_MS = 5 * 60 * 1000

export async function resolveTeamId(leagueId: string): Promise<string> {
  const hit = cache.get(leagueId)
  if (hit && Date.now() < hit.expiresAt) return hit.teamId

  const sb = createClient()
  const { data, error } = await sb
    .from('leagues')
    .select('team_id')
    .eq('id', leagueId)
    .maybeSingle()
  if (error) throw new Error(`leagues: leagueId=${leagueId} team_id 조회 실패 — ${error.message}`)
  // 팀을 못 찾으면 빈 값으로 넘기지 않는다 — 그러면 호출부가 "팀이 없는 명단" 을
  //   조회하게 되고, 조건에 안 맞아 빈 결과가 나와 "선수가 없다" 로 읽힌다.
  if (!data?.team_id) throw new Error(`leagues: leagueId=${leagueId} 에 team_id 가 없다`)

  cache.set(leagueId, { teamId: data.team_id, expiresAt: Date.now() + TTL_MS })
  return data.team_id
}
```

- [ ] **Step 7: 단언 추가 + 검증 + 커밋**

`scripts/verify-schema.mjs` 의 마지막 요약 앞에 추가:

```js
// 087 — 명단·계정이 팀에 매달려 있는지. 이게 비면 리그↔대회 이동 시 로그인이 풀린다.
await check(
  '명단·계정에 team_id 가 전부 채워져 있다',
  `SELECT (SELECT count(*)::int FROM league_players WHERE team_id IS NULL) p,
          (SELECT count(*)::int FROM league_user_accounts WHERE team_id IS NULL) a`,
  (r) => r[0].p === 0 && r[0].a === 0,
)
```

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs && npx tsc --noEmit && git add -A && git commit -m "$(cat <<'EOF'
feat(team-scope): 명단·계정을 팀에 매단다 (1/3 스키마)

league_players 와 league_user_accounts 가 경기묶음에 매여 있어, 한 팀이
리그와 대회를 함께 운영하면 같은 사람이 묶음마다 다른 행이 되고 회원은
묶음을 옮길 때마다 로그아웃되고 재가입을 요구받았다.

league_id 는 지우지 않는다. 39개 파일이 그걸로 읽고 있어서 한 번에
없애면 어디가 깨졌는지 알 수 없다 — 읽기 경로를 옮긴 뒤 따로 정리한다.

로그인 아이디는 이제 팀 안에서 유일해야 한다. 묶음마다 계정이 따로일
때는 같은 아이디가 여러 묶음에 있을 수 있었지만, 팀으로 합치면 그건
같은 사람 둘이다. 기존 중복이 0건임을 확인하고 유니크 인덱스를 걸었다.
EOF
)"
```

---

### Task 2: 로그인이 묶음을 넘나들게

**Files:**
- Modify: `src/lib/auth/session.ts`
- Modify: `src/lib/auth/guard.ts`
- Modify: `src/lib/auth/leagueAdmin.ts`
- Modify: `src/app/api/leagues/[leagueId]/auth/me/route.ts`
- Modify: `src/app/api/leagues/[leagueId]/auth/password/route.ts`
- Modify: 로그인·가입 라우트 (`auth/login`, `auth/signup` — 실제 경로는 확인할 것)

**Interfaces:**
- Consumes: `resolveTeamId(leagueId)` (Task 1)
- Produces: 세션 페이로드에 `tid`(팀 id) 추가. 검증은 팀 기준.

**이 태스크의 핵심 위험:** 세션 쿠키는 30일이고 이미 발급돼 있다. 검증 기준을 팀으로 바꾸면서 옛 쿠키(`tid` 없음)를 거부하면 **로그인한 회원 전원이 튕긴다.** 반드시 옛 쿠키를 받아준다.

- [ ] **Step 1: 세션 구조와 발급 지점을 먼저 읽는다**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && cat src/lib/auth/session.ts && grep -rn "createSession\|signSession" src --include=*.ts | head
```

페이로드가 어떻게 서명되고 검증되는지, 어디서 발급되는지 확인한다. **서명 방식을 바꾸지 않는다** — 바꾸면 기존 쿠키가 전부 무효가 된다.

- [ ] **Step 2: 페이로드에 tid 추가 (옵셔널)**

`SessionPayload` 에 `tid?: string` 을 더한다. **옵셔널이어야 한다** — 이미 발급된 쿠키에는 없다.

`verifySession` 의 필수 필드 검사(`session.ts:48` 부근, 현재 `uid`/`lid`/`pid` 를 요구)에 `tid` 를 **넣지 않는다.** 넣으면 옛 쿠키가 전부 거부된다.

- [ ] **Step 3: 판정을 팀 기준으로**

`guard.ts` 의 `getApprovedSession` 이 현재 하는 일:
```ts
if (!session || session.lid !== leagueId) return null
```

이걸 아래 뜻으로 바꾼다 — **같은 팀이면 통과**:
- 세션에 `tid` 가 있으면 `tid === await resolveTeamId(leagueId)` 로 판정
- `tid` 가 없으면(옛 쿠키) `resolveTeamId(session.lid) === resolveTeamId(leagueId)` 로 판정

두 번째 갈래가 옛 쿠키를 살리는 장치다. 주석으로 그 사실과 언제 제거할 수 있는지를 남긴다(모든 쿠키가 만료되는 30일 뒤).

`leagueAdmin.ts` 의 `canEditLeague`, `auth/me`, `auth/password` 도 같은 판정으로 맞춘다. **네 곳이 서로 다른 규칙을 쓰면 어떤 화면은 되고 어떤 화면은 안 되는 상태가 된다** — 판정 로직을 한 함수로 뽑아 네 곳이 그것을 부르게 한다.

계정 조회도 팀 기준으로 바꾼다: `league_user_accounts` 를 `league_id` 가 아니라 `team_id` 로 찾는다.

- [ ] **Step 4: 새로 발급되는 세션에 tid 를 넣는다**

로그인·가입 성공 지점에서 `tid` 를 채운다. 기존 필드는 그대로 둔다(옛 코드가 `lid` 를 읽고 있을 수 있다).

- [ ] **Step 5: 실측 — 이게 이 태스크의 증명이다**

dev 서버(3033)에서 미라클 회원 계정 하나로:

1. 리그 묶음(`/league/miracle/2026`)에서 로그인
2. **쿠키를 그대로 들고** 대회 묶음의 API 를 호출 → 로그인 상태가 유지되는지
3. 옛 형식 쿠키(= `tid` 없이 발급된 것)로도 2번이 되는지

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT a.login_id, a.status, l.slug FROM league_user_accounts a JOIN leagues l ON l.id=a.league_id WHERE a.status='approved' LIMIT 3"
```
로 계정을 확인하고, `curl -c/-b` 로 쿠키를 저장·재사용해 두 묶음에서 `auth/me` 를 호출한다. **양쪽 다 같은 사람으로 나와야 한다.**

옛 쿠키 시험은 `tid` 없이 서명한 값을 만들어 넣는다(스크립트로 생성). 이게 통과하지 않으면 배포 순간 전원이 로그아웃된다.

- [ ] **Step 6: 검증 + 커밋**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && npx tsc --noEmit && npm run build 2>&1 | tail -3 && node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs && git add -A && git commit -m "$(cat <<'EOF'
fix(auth): 리그↔대회를 오가도 로그인이 유지되게 (2/3)

세션이 경기묶음(lid)에 매여 있어 다른 묶음으로 가면 세션이 없는 것으로
처리됐다 — 로그아웃되고 재가입을 요구받은 직접 원인이다. 판정을 팀
기준으로 바꾼다.

⚠ 옛 쿠키를 반드시 받아준다. 세션 쿠키는 30일이고 이미 발급돼 있어서,
tid 를 필수로 만들면 배포 순간 로그인한 회원 전원이 튕긴다. tid 가 없는
쿠키는 lid 로 팀을 유도해 판정한다 — 모든 쿠키가 만료되는 30일 뒤 제거 가능.

판정 로직을 한 함수로 뽑아 네 곳(guard·leagueAdmin·auth/me·auth/password)이
같은 것을 쓰게 했다. 규칙이 갈리면 어떤 화면은 되고 어떤 화면은 안 되는
상태가 되는데, 그건 사용자가 원인을 짐작할 수 없다.
EOF
)"
```

---

### Task 3: 명단 공유 + 대회 참가 등록

**Files:**
- Modify: `src/app/api/leagues/[leagueId]/players/route.ts` 및 명단을 읽는 경로들
- Create: `src/components/league/TournamentRosterPanel.tsx`
- Modify: 대회 보드(`src/components/league/TournamentBoard.tsx`)

**Interfaces:**
- Consumes: `resolveTeamId` (Task 1), 팀 기준 세션 (Task 2)
- Produces: 팀 명단 공유 + 대회별 참가 인원 등록

**참고할 모델:** 파란날개의 `tournament_players (tournament_id, player_id)` — "우리 명단 중 이 대회에 등록된 사람". 리그 쪽 대응물은 `league_player_quarters (quarter_id, league_player_id, team_id, is_regular)` 로 **이미 존재한다.** 새 테이블을 만들지 않는다. 레거시 화면을 읽어 등록 UX 를 참고하되 **import 하지 않는다.**

- [ ] **Step 1: 명단을 읽는 경로를 전수 조사한다**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && grep -rn "from('league_players')" src --include=*.ts --include=*.tsx | grep -n "league_id" | head -40
```

39개 파일 중 **어떤 것이 "팀 명단"이고 어떤 것이 "이 묶음에서 뛴 사람"인지 가른다.** 둘은 다르다:
- 명단 화면·선수 선택기 → **팀 기준**(공유)
- 시즌 스탯·순위·어워즈 → **묶음 기준**(분리 — 사용자가 정한 규칙)

각 파일의 판정과 근거를 보고서에 표로 남긴다. **모호하면 바꾸지 말고 보고한다.**

- [ ] **Step 2: 팀 기준으로 바꿀 것만 바꾼다**

`league_id` 필터를 `team_id` 로 교체한다. `resolveTeamId(leagueId)` 를 쓴다.

⚠ 스탯 집계 경로를 팀 기준으로 바꾸면 **리그와 대회 기록이 섞인다** — 사용자가 명시적으로 "기본 분리" 를 정했다. 집계는 건드리지 않는다.

- [ ] **Step 3: 대회 참가 등록 UI**

대회(=`league_quarters` 중 `kind='tournament'`)마다 "누가 나가는가" 를 정한다.
- 팀 명단 전체를 보여주고 체크로 등록/해제
- 저장은 `league_player_quarters` 에 `(league_id, quarter_id, league_player_id, team_id, is_regular=true)`
- **편집 권한자에게만** 보인다(`canEditLeague`)
- 이미 그 대회 경기에 기록이 있는 선수는 **해제할 수 없게** 막는다 — 해제하면 그 사람의 기록이 명단에서 사라진 채로 남는다

`mm-*` 토큰, 375px, 44px 터치 타깃. 문구는 동호회 총무가 읽는 말로.

- [ ] **Step 4: 실측**

미라클 대회 묶음에서:
1. 명단 화면에 **리그와 같은 45명**이 보이는지 (전에는 0명이었다)
2. 대회 하나를 만들고 몇 명을 등록 → 그 대회 경기 기록 화면에 등록된 사람만 뜨는지
3. 리그 묶음의 시즌 스탯이 **변하지 않았는지** (7114점)
4. 기록이 있는 선수의 등록 해제가 막히는지

시험 데이터는 만들었으면 지우고, 원상복구를 쿼리로 증명한다.

- [ ] **Step 5: 검증 + 커밋**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && npx tsc --noEmit && npm run build 2>&1 | tail -3 && node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs && git add -A && git commit -m "$(cat <<'EOF'
feat(team-scope): 명단 공유 + 대회 참가 등록 (3/3)

명단은 팀이 주인이고, 대회에 누가 나가는지는 대회마다 등록해서 정한다 —
파란날개의 tournament_players 모델과 같은 방식이다. 리그 쪽 대응물인
league_player_quarters 가 이미 있어 새 테이블을 만들지 않았다.

스탯 집계는 묶음 기준 그대로 둔다. 사용자가 "기본 분리" 를 정했고,
팀 기준으로 바꾸면 상대 수준이 다른 기록이 섞여 평균이 왜곡된다.

이미 기록이 있는 선수는 등록을 해제할 수 없다. 해제하면 그 사람의
기록이 명단에서 사라진 채로 남는다.
EOF
)"
```

---

## 완료 기준

- 미라클 대회 묶음의 명단에 리그와 **같은 45명**이 보인다
- 리그에서 로그인한 회원이 대회로 이동해도 **로그인이 유지된다** — 재가입 요구 없음
- **이미 발급된 쿠키를 가진 회원이 로그아웃되지 않는다**(옛 쿠키 실측 확인)
- 대회마다 참가 인원을 등록할 수 있고, 기록이 있는 선수는 해제되지 않는다
- 리그 시즌 스탯이 그대로다(7114점·45명) — 대회 기록이 섞이지 않는다
- 파란날개는 어느 것도 달라지지 않는다

## 이 계획 범위 밖

- `league_players.league_id` / `league_user_accounts.league_id` 컬럼 제거 — 읽기 경로가 전부 팀 기준으로 옮겨간 뒤 별도로
- 옛 쿠키 호환 갈래 제거 — 30일 뒤
- 파란날개를 이 구조로 이관
