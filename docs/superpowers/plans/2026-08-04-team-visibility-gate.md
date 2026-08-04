# 팀 공개/비공개 게이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 동호회(팀)를 비공개로 전환하면 로그인 전에는 그 동호회의 어떤 정보도 볼 수 없게 하고, 관리자가 설정 화면에서 언제든 전환할 수 있게 한다.

**Architecture:** `teams.is_public` 하나로 상태를 표현한다(기본 `true` — 현재 동작 유지). 기존 `src/lib/auth/guard.ts` 의 `canViewStats` 패턴을 그대로 따라 `canViewLeague` 를 만들고, 공개 API 와 리그 레이아웃에 건다. **화면만 막으면 API 로 그대로 뚫리므로 데이터 계층이 진짜 게이트다.**

**Tech Stack:** Next.js App Router · Supabase · TypeScript · `scripts/db-migrate.mjs`

## Global Constraints

- 마이그레이션은 `supabase/migrations/NNN_*.sql`, 번호는 081 다음부터. 실행은 `node scripts/db-migrate.mjs up NNN` — 번호를 반드시 지정한다.
- **기본값은 공개(`true`)다.** 기존 두 동호회의 현재 동작이 바뀌면 안 된다.
- **비공개일 때 클럽 이름조차 노출하지 않는다.** 링크를 가진 사람이 보는 화면이지만, 이름을 흘리면 "누가 쓰는 서비스인지" 정보가 새어 나간다. 일반 문구 + 로그인 유도만 보여준다.
- 가입·승인 프로세스는 **그대로**다. 비공개는 열람 게이트일 뿐 가입 방식을 바꾸지 않는다.
- 편집 권한자(어드민 role 회원 · 편집 PIN)는 비공개여도 통과한다 — `canViewStats` 와 같은 규칙.
- 검증은 `node scripts/verify-schema.mjs` 로 하며 exit 0 을 유지한다.

## 상태 정의 (사용자 확정 2026-08-04)

| 상태 | 로그인 전 | 로그인(승인) 후 |
|---|---|---|
| **공개** (기본) | 박스스코어·일정·명단·순위표·공지 열람 가능 | 스탯·어워즈·하이라이트까지 |
| **비공개** | **아무것도 안 보임** — 로그인 유도만 | 공개와 동일 |

발견 경로는 **링크 공유뿐**이다. 온볼 대문(`/`)은 어떤 상태든 동호회를 노출하지 않는다(이미 반영됨).

## File Structure

| 파일 | 책임 |
|---|---|
| `supabase/migrations/082_team_visibility.sql` | `teams.is_public` 추가 (기본 true) |
| `src/lib/auth/guard.ts` | `canViewLeague` 추가 — 기존 `canViewStats` 옆에 |
| `src/app/league/[orgSlug]/[leagueId]/layout.tsx` | 비공개 + 미로그인 → 로그인 유도 화면으로 대체 |
| `src/components/league/auth/PrivateLeagueGate.tsx` | **신설.** 비공개 안내 + 로그인 CTA |
| 공개 API 다수 | `canViewLeague` 게이트 적용 |
| `src/app/league/[orgSlug]/[leagueId]/settings/page.tsx` | 관리자용 공개/비공개 토글 |
| `src/app/api/leagues/[leagueId]/visibility/route.ts` | **신설.** 토글 저장 |
| `scripts/onboard-club.mjs` · `docs/onboarding-checklist.md` | 온보딩 시 공개 여부 설정 |

---

### Task 1: 스키마 + 서버 가드

**Files:**
- Create: `supabase/migrations/082_team_visibility.sql`
- Modify: `src/lib/auth/guard.ts`
- Modify: `scripts/verify-schema.mjs`

**Interfaces:**
- Produces: `teams.is_public BOOLEAN NOT NULL DEFAULT true`
- Produces: `export async function isLeaguePublic(leagueId: string): Promise<boolean>` — 리그 → 팀 → `is_public`
- Produces: `export async function canViewLeague(req: Request, leagueId: string): Promise<boolean>` — 공개면 true, 아니면 승인 세션 또는 편집 권한

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/082_team_visibility.sql` 생성:

```sql
-- =============================================
-- 082_team_visibility.sql
-- 팀 공개/비공개 상태
-- =============================================
-- 동호회는 기본적으로 폐쇄적으로 운영된다. 링크를 공유받지 않은 사람이
-- 다른 동호회의 기록을 보게 되면 안 된다.
--
-- 다만 **기본값은 공개(true)** 다 — 기존 두 동호회가 지금 그렇게 돌아가고 있고,
-- 기본값을 비공개로 두면 이 마이그레이션만으로 운영이 멈춘다.
-- 비공개가 필요한 곳은 온보딩 때 정하거나 관리자가 설정에서 켠다.
--
-- 상태는 2단계다(사용자 확정 2026-08-04):
--   공개   — 로그인 전에도 박스스코어·일정·명단·순위표·공지 열람 가능 (현행)
--   비공개 — 로그인 전에는 아무것도 안 보이고 로그인 유도만
--
-- 팀 단위인 이유: 청년부는 공개, 장년부는 비공개처럼 갈릴 수 있다.
-- 리그(시즌)는 팀에 매달려 있으므로 league → team → is_public 으로 유도한다.
-- =============================================

ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN teams.is_public IS
  '공개 여부. true=링크가 있으면 로그인 없이 열람 가능, false=승인 회원만. 기본 true.';
```

- [ ] **Step 2: 마이그레이션 실행 + 기본값 확인**

Run: `node scripts/db-migrate.mjs up 082`
Expected: `▶ 082_team_visibility.sql ... 완료`

Run: `node scripts/db-migrate.mjs sql "SELECT org_slug, sub_slug, is_public FROM teams ORDER BY org_slug, sub_slug"`
Expected: 3개 팀 전부 `is_public: true`. 하나라도 false 면 **멈추고 보고할 것** — 기존 동호회가 잠긴다.

- [ ] **Step 3: 가드 추가**

`src/lib/auth/guard.ts` 의 `canViewStats` **아래**에 추가:

```ts
// 리그(시즌)가 속한 팀이 공개인지. 공개면 로그인 없이도 기본 정보를 볼 수 있다.
// 리그 → 팀 → is_public 으로 유도한다 — 상태는 팀에만 두고 리그에 복제하지 않는다.
export async function isLeaguePublic(leagueId: string): Promise<boolean> {
  const sb = createClient()
  const { data, error } = await sb
    .from('leagues')
    .select('teams(is_public)')
    .eq('id', leagueId)
    .maybeSingle()
  if (error) throw new Error(`leagues: leagueId=${leagueId} 공개여부 조회 실패 — ${error.message}`)
  const team = (data as { teams?: { is_public?: boolean } | null } | null)?.teams
  // 팀을 못 찾으면 공개로 취급하지 않는다 — 판정 불가일 때는 닫는 쪽이 안전하다.
  return team?.is_public === true
}

// API 라우트용 — 공개 리그면 누구나, 비공개면 승인 회원 또는 편집 권한자만.
// canViewStats 와 같은 규칙을 쓰되, 이쪽은 "리그 자체를 볼 수 있는가"를 본다.
export async function canViewLeague(req: Request, leagueId: string): Promise<boolean> {
  if (await isLeaguePublic(leagueId)) return true
  if (await getApprovedSession(leagueId)) return true
  return canEditLeague(req, leagueId)
}
```

- [ ] **Step 4: 어서션 추가**

`scripts/verify-schema.mjs` 의 마지막 `console.log(failed === 0 ? ...)` **바로 위**에 삽입:

```js
await check(
  '기존 팀 3건은 공개 상태 (082 기본값 — 기존 동호회 동작 불변)',
  `SELECT count(*)::int AS n FROM teams t JOIN orgs o ON o.id = t.org_id
    WHERE o.slug IN ${BASELINE_ORGS} AND t.is_public IS DISTINCT FROM true`,
  rows => rows[0].n === 0 || `기존 팀 중 비공개가 ${rows[0].n}건 — 운영 중인 동호회가 잠긴다`
)
```

- [ ] **Step 5: 검증**

Run: `node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs && npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: 전부 통과.

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/082_team_visibility.sql src/lib/auth/guard.ts scripts/verify-schema.mjs
git commit -m "feat(visibility): teams.is_public + canViewLeague 가드

동호회는 기본적으로 폐쇄적으로 운영되지만, 기본값은 공개로 둔다 —
기본값을 비공개로 하면 이 마이그레이션만으로 운영 중인 두 동호회가 멈춘다.

팀 단위인 이유는 청년부/장년부처럼 갈릴 수 있어서다. 리그는 팀에 매달려
있으므로 league → team → is_public 으로 유도하고 리그에 복제하지 않는다.

판정 불가(팀 못 찾음)일 때는 공개로 취급하지 않는다 — 닫는 쪽이 안전하다."
```

---

### Task 2: API 게이트 적용

**Files:**
- Modify: 아래 목록의 공개 API 라우트

**Interfaces:**
- Consumes: Task 1 의 `canViewLeague`

**화면만 막으면 API 로 그대로 뚫린다.** 비공개 리그의 데이터를 돌려주는 라우트에 전부 건다.

- [ ] **Step 1: 대상 라우트 파악**

Run: `find "src/app/api/leagues/[leagueId]" -name route.ts | sort`

각 라우트를 열어 다음 셋 중 어디인지 분류하고, 그 결과를 리포트에 표로 남긴다:

| 분류 | 처리 |
|---|---|
| 이미 `canViewStats` 로 막힘 (스탯·어워즈·하이라이트 등) | **건드리지 않는다** — 비공개면 어차피 승인 회원만이다 |
| 편집 전용 (`canEditLeague` 있음) | **건드리지 않는다** |
| 공개 데이터 (명단·일정·순위표·경기·공지·팀 등) | **`canViewLeague` 추가** |
| 인증 자체 (`auth/*`) | **건드리지 않는다** — 로그인하려면 접근돼야 한다 |

- [ ] **Step 2: 공개 데이터 라우트에 게이트 추가**

각 대상 라우트의 GET 핸들러 맨 앞에 넣는다. `canViewStats` 를 쓰는 파일들의 기존 패턴과 동일하게:

```ts
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
```

import 는 `import { canViewLeague } from '@/lib/auth/guard'`.

- [ ] **Step 3: 공개 리그가 여전히 열려 있는지 확인**

미라클은 공개이므로 로그인 없이 200 이어야 한다.

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/leagues/<미라클id>/players"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/leagues/<미라클id>/standings"
```

리그 id: `node scripts/db-migrate.mjs sql "SELECT id FROM leagues WHERE org_slug='miracle'"`
Expected: 둘 다 `200`.

- [ ] **Step 4: 비공개로 바꿔 실제로 막히는지 확인**

미라클 팀을 잠깐 비공개로 돌리고 같은 요청을 보낸 뒤 되돌린다.

```bash
node scripts/db-migrate.mjs sql "UPDATE teams SET is_public=false WHERE sub_slug='main' AND org_id=(SELECT id FROM orgs WHERE slug='miracle')"
# → 위 curl 두 개가 401 이어야 한다
node scripts/db-migrate.mjs sql "UPDATE teams SET is_public=true WHERE sub_slug='main' AND org_id=(SELECT id FROM orgs WHERE slug='miracle')"
# → 다시 200
```

**반드시 되돌릴 것.** 관찰값과 복구 확인을 리포트에 남긴다. 되돌리지 않으면 운영 중인 리그가 잠긴다.

- [ ] **Step 5: 검증**

Run: `node scripts/verify-schema.mjs && npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: 전부 통과.

- [ ] **Step 6: 커밋**

```bash
git add "src/app/api/leagues"
git commit -m "feat(visibility): 공개 데이터 API 에 canViewLeague 게이트

화면만 막으면 API 로 그대로 뚫린다 — 데이터 계층이 진짜 게이트다.
이미 canViewStats 로 막힌 라우트와 편집 전용·인증 라우트는 건드리지 않았다.

비공개 전환 후 401, 복구 후 200 을 실제 요청으로 확인."
```

---

### Task 3: 리그 화면 게이트

**Files:**
- Create: `src/components/league/auth/PrivateLeagueGate.tsx`
- Modify: `src/app/league/[orgSlug]/[leagueId]/layout.tsx`

**Interfaces:**
- Consumes: Task 1 의 `isLeaguePublic`, `getApprovedSession`

- [ ] **Step 1: 게이트 화면 작성**

`src/components/league/auth/PrivateLeagueGate.tsx` 생성. 기존 `src/components/league/auth/StatGate.tsx` 를 먼저 읽고 톤·구조를 맞춘다.

요구사항:
- **클럽 이름을 표시하지 않는다.** 링크를 가진 사람이 보는 화면이지만, 이름을 흘리면 "누가 쓰는 서비스인지"가 새어 나간다.
- 비공개라는 사실 + 로그인/가입 안내만 보여준다.
- 로그인 버튼은 기존 로그인 모달을 여는 방식을 따른다 — `StatGate` 가 쓰는 `mm-open-login` 커스텀 이벤트 패턴을 그대로 쓴다.
- 터치 타겟 최소 44×44px, `--mm-*` 토큰만 사용.

- [ ] **Step 2: 레이아웃에 게이트 적용**

`src/app/league/[orgSlug]/[leagueId]/layout.tsx` 에서 자식을 렌더하기 전에 판정한다:

```tsx
  const publicLeague = await isLeaguePublic(leagueId)
  if (!publicLeague && !(await getApprovedSession(leagueId))) {
    return <PrivateLeagueGate />
  }
```

⚠️ 편집 권한자(편집 PIN)는 서버 컴포넌트에서 `req` 를 못 받으므로 `canEditLeague` 를 쓸 수 없다.
**관리자는 로그인 회원 role 로 통과**시키고, PIN 전용 운영자는 API 계층에서만 통과한다 —
이 제약을 코드 주석에 남기고 리포트에도 적을 것.

또한 `generateMetadata` 가 리그 이름을 title 로 쓰고 있다. 비공개면 **이름을 노출하지 않도록** 일반 문구로 바꾼다.

- [ ] **Step 3: 실제로 확인**

`npm run dev` 로 띄우고:
1. 미라클(공개) → 평소대로 홈이 보이는가
2. 미라클을 비공개로 바꾼 뒤 → 게이트가 뜨고 **클럽 이름이 화면·탭 제목 어디에도 없는가**
3. 되돌린 뒤 → 정상 복귀

비공개 전환/복구 SQL 은 Task 2 Step 4 와 동일하다. **반드시 되돌릴 것.**

- [ ] **Step 4: 검증**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build && node scripts/verify-schema.mjs`
Expected: 전부 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/components/league/auth/PrivateLeagueGate.tsx "src/app/league/[orgSlug]/[leagueId]/layout.tsx"
git commit -m "feat(visibility): 비공개 리그 화면 게이트

비공개면 로그인 전에 아무것도 안 보이고 로그인 유도만 한다.
클럽 이름은 화면에도 탭 제목에도 넣지 않는다 — 링크를 가진 사람이 보는
화면이지만 이름을 흘리면 누가 쓰는 서비스인지가 새어 나간다.

제약: 서버 컴포넌트에서는 편집 PIN 을 검사할 수 없어 관리자는 로그인 회원
role 로 통과한다. PIN 전용 운영자는 API 계층에서만 통과."
```

---

### Task 4: 관리자 토글 + 온보딩 반영

**Files:**
- Create: `src/app/api/leagues/[leagueId]/visibility/route.ts`
- Modify: `src/app/league/[orgSlug]/[leagueId]/settings/page.tsx`
- Modify: `scripts/onboard-club.mjs`
- Modify: `scripts/onboard-samples/example-club.json`
- Modify: `docs/onboarding-checklist.md`

**Interfaces:**
- Produces: `PATCH /api/leagues/[leagueId]/visibility` — body `{ is_public: boolean }`, 편집 권한 필요

- [ ] **Step 1: 토글 API**

`src/app/api/leagues/[leagueId]/visibility/route.ts` 생성:

```ts
import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'

// PATCH /api/leagues/[leagueId]/visibility
// body: { is_public: boolean }
//
// 공개 여부는 팀에 저장된다(리그는 팀에 매달려 있다). 이 리그가 속한 팀을 찾아 바꾼다.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()
  if (typeof body.is_public !== 'boolean') {
    return NextResponse.json({ error: 'is_public 은 true/false 여야 합니다' }, { status: 400 })
  }

  const supabase = createClient()
  const { data: league, error: lErr } = await supabase
    .from('leagues').select('team_id').eq('id', leagueId).maybeSingle()
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })
  if (!league?.team_id) {
    return NextResponse.json({ error: '이 시즌에 연결된 팀이 없습니다' }, { status: 400 })
  }

  const { error } = await supabase
    .from('teams').update({ is_public: body.is_public }).eq('id', league.team_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag(`league-${leagueId}`, 'max')
  return NextResponse.json({ is_public: body.is_public })
}
```

- [ ] **Step 2: 설정 화면 토글**

`src/app/league/[orgSlug]/[leagueId]/settings/page.tsx` 에 공개/비공개 토글을 추가한다.
먼저 파일을 읽어 기존 설정 항목들의 마크업 패턴을 확인하고 그대로 맞춘다.

문구는 결과를 분명히 말한다 — 관리자가 무심코 눌러 동호회를 잠그면 안 된다:

- 공개: "링크를 아는 사람은 로그인 없이 경기 기록·명단·순위를 볼 수 있습니다."
- 비공개: "로그인한 승인 회원만 볼 수 있습니다. 링크가 있어도 로그인 전에는 아무것도 보이지 않습니다."

비공개로 **바꿀 때만** 확인 창을 띄운다(공개로 여는 건 되돌리기 쉽다).

- [ ] **Step 3: 온보딩에 반영**

`scripts/onboard-club.mjs`:
- 설정의 `team.is_public` (선택, 기본 `true`) 을 읽어 `teams` insert 에 넣는다
- dry-run 출력에 `공개  공개 / 비공개` 한 줄을 추가한다

`scripts/onboard-samples/example-club.json` 의 `team` 블록에 추가:

```jsonc
"_is_public_주석": "생략하면 공개. 링크를 아는 사람이 로그인 없이 볼 수 있습니다. 닫으려면 false.",
"is_public": true
```

`docs/onboarding-checklist.md` 의 1.1 기본 정보 표에 행을 추가:

| 공개 여부 | 링크를 아는 사람이 로그인 없이 봐도 되나요? | `team.is_public` |

그리고 "5. 아직 안 되는 것" 표에서 이 항목이 있다면 제거한다.

- [ ] **Step 4: 왕복 확인**

토글 API 를 실제로 호출해 DB 값이 바뀌는지 확인하고 원복한다.

```bash
node scripts/db-migrate.mjs sql "SELECT sub_slug, is_public FROM teams WHERE org_id=(SELECT id FROM orgs WHERE slug='miracle')"
```

호출 전후 값과 복구 확인을 리포트에 남긴다. **미라클은 공개 상태로 끝나야 한다.**

- [ ] **Step 5: 검증**

Run: `node scripts/verify-schema.mjs && npx tsc --noEmit -p tsconfig.json && npm run build && node scripts/onboard-club.mjs scripts/onboard-samples/example-club.json`
Expected: 검증 통과, 빌드 성공, 온보딩 dry-run 이 공개 여부를 출력하며 통과.

- [ ] **Step 6: 커밋**

```bash
git add "src/app/api/leagues/[leagueId]/visibility" "src/app/league/[orgSlug]/[leagueId]/settings/page.tsx" scripts/onboard-club.mjs scripts/onboard-samples/example-club.json docs/onboarding-checklist.md
git commit -m "feat(visibility): 관리자 공개/비공개 토글 + 온보딩 반영

공개 여부는 팀에 저장되므로 리그 → 팀을 찾아 바꾼다.
비공개로 바꿀 때만 확인 창을 띄운다 — 무심코 눌러 동호회를 잠그면 안 된다.
문구는 '무엇이 달라지는지'를 직접 말한다.

온보딩 스크립트와 체크리스트에도 공개 여부 항목을 넣었다."
```

---

## 완료 후 상태

- 팀별로 공개/비공개를 켤 수 있고 기본은 공개다(기존 동호회 동작 불변).
- 비공개면 화면도 API 도 로그인 전에는 아무것도 내주지 않으며, 클럽 이름조차 노출하지 않는다.
- 관리자가 설정 화면에서 언제든 바꾼다.
- 온보딩 때 물어보고 바로 설정한다.

## 이번 범위에서 제외한 것 (의도적)

- **초대 기반 가입** — "어드민이 등록·초대해 진입하는 구조"는 별도 과제다. 이번 게이트는 그 선행 조건(열람 통제)만 만든다.
- **org 단위 공개 설정** — 팀 단위로 충분하다. 조직 아래 팀이 여럿일 때 각각 다르게 두는 편이 실제 운영에 맞는다.
- **비공개 리그의 검색엔진 차단(noindex)** — 게이트가 데이터를 안 내주므로 색인될 내용이 없다. 필요해지면 별도로 다룬다.
