# 통일 단계 C — 화면 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 리그 화면이 `mode='tournament'` 를 실제로 분기해 대회형으로 동작하게 만들고, 파란날개 사용자를 새 주소로 넘긴다.

**Architecture:** 화면을 새로 만들지 않는다 — 기존 리그 화면 하나가 `leagues.mode` 에 따라 다르게 굴게 한다. 순서가 안전장치다: 데이터 무결성(트리거) → 분기 배선 → 대회형 표시 → **옛 화면과 숫자 대조** → 그 대조가 통과한 뒤에야 리다이렉트. 리다이렉트 직전까지 사용자가 보는 것은 하나도 안 바뀌고, 리다이렉트만 되돌리면 즉시 레거시로 복귀한다.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, PostgreSQL 트리거, Tailwind + `mm-*` 토큰.

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-08-05-tournament-league-unification-design.md` (단계 C)
- 인계 문서: `docs/legacy-migration-notes.md` — 단계 B 가 남긴 인계 사항 7건. **먼저 읽는다.**
- 선행 완료: 단계 A(스키마) · 단계 B(데이터 복사, 대조 38개 통과). 파란날개 데이터가 이미 리그 테이블에 있다.
- **레거시 원본은 여전히 읽기만.** `games`·`game_events`·`players`·`tournaments`·`teams` 에 쓰지 않는다. 단계 D 전까지 되돌릴 곳으로 남겨 둔다.
- **미라클 불변.** 모든 태스크 끝에서 `verify-schema.mjs` · `verify-scoring.mjs` · `verify-migration.mjs` 셋 다 exit 0.
- 마이그레이션 번호: 084 까지 적용됨. 이 계획은 **085** 하나만 만든다. `ls supabase/migrations/` 로 확인.
- 디자인: `mm-*` CSS 변수만 사용(`--mm-ground`·`--mm-ink`·`--mm-ink-soft`·`--mm-panel`·`--mm-rule`). 하드코딩 hex 금지 — 라이트/다크가 뒤집히면 대비가 깨진다. 모바일 우선, 터치 타깃 44×44px 이상.
- `npx tsc --noEmit` · `npm run build` 통과. ⚠ dev 서버와 `npm run build` 가 같은 `.next` 를 동시에 쓰면 dev 가 죽는다.
- 브랜치 `master`. 태스크마다 커밋. **푸시 금지** — 단계 전체 검토 후 한 번에.
- 주석·UI 문구·커밋 메시지는 한국어. 주석은 *왜* 를 적는다.
- 작업 디렉터리는 `c:\Users\N_399\Desktop\ai_rob\basketball-stats-dashboard`. 셸이 리셋되므로 매 명령 앞에 `cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard &&`.

## 현재 상태 (단계 B 결과)

| 리그 | slug | mode | 대회 | 경기 | 선수 | 상대팀 |
|---|---|---|---|---|---|---|
| 파란날개 청년부 | `youth-2026` | tournament | 8 | 36 | 36 | 31 |
| 파란날개 장년부 | `senior-2026` | tournament | 4 | 14 | 32 | 12 |
| 미라클모닝 | `2026` | league | 3(분기) | 271 | 45 | 3 |
| 파란날개 장년부 자체전 | `pana-basket-senior` | league | — | 0 | 0 | 0 |

주소는 미들웨어가 slug↔UUID 를 변환한다: `/league/paranalgae/youth-2026` 로 접근하면 내부적으로 UUID 경로로 rewrite 된다.

---

## 파일 구성

| 파일 | 책임 |
|---|---|
| `supabase/migrations/085_manual_scores.sql` (신규) | `league_games.scores_manual` + 재계산 함수가 그 플래그를 존중하게 수정 |
| `src/lib/league/mode.ts` (신규) | `LeagueMode` 타입, `fetchLeagueMode()`, `segmentLabel(mode)` 등 분기 어휘 한 곳 |
| `src/contexts/LeagueModeContext.tsx` (신규) | 클라이언트 컴포넌트가 mode 를 prop drilling 없이 읽는다 |
| `src/app/league/[orgSlug]/[leagueId]/layout.tsx` (수정) | mode 를 조회해 컨텍스트로 내려보냄 |
| `_components/LeagueLayoutClient.tsx` (수정) | 탭 구성 분기 (드래프트 숨김 등) |
| `src/components/league/TournamentSummary.tsx` (신규) | 대회별 성적 요약 (우승·N강) — 레거시에만 있던 화면의 대체 |
| `src/middleware.ts` (수정) | `/paranalgae/*` → 새 주소 리다이렉트 (**마지막 태스크에서만**) |
| `scripts/verify-switchover.mjs` (신규) | 옛 화면과 새 화면이 같은 숫자를 내는지 대조 |

---

### Task 1: 점수 재계산 트리거 — 수기 점수 보호

**Files:**
- Create: `supabase/migrations/085_manual_scores.sql`
- Modify: `scripts/verify-migration.mjs` (단언 추가)

**Interfaces:**
- Produces: `league_games.scores_manual BOOLEAN NOT NULL DEFAULT false`. 이후 태스크와 단계 D 가 이 컬럼에 의존한다.

**왜 이 태스크가 첫 번째인가:** 단계 B 에서 이벤트를 넣자마자 트리거가 43경기의 상대 점수를 깎았다. 지금은 복구해 뒀지만 **누군가 이관된 경기의 이벤트를 한 번만 수정해도 다시 깎인다.** 화면을 전환하기 전에 막아야 한다 — 전환 후에 터지면 사용자가 잘못된 점수를 보는 상태에서 원인을 찾게 된다.

**근본 원인:** `recompute_league_game_score(p_game_id)` 는 홈/원정 점수를 이벤트 합으로 다시 계산한다. 우리 팀 득점은 이벤트가 완전해서 맞지만, **상대 득점은 레거시가 `opp_score` 이벤트로 177건(322점)만 남겼고 진짜 총점은 `games.opponent_score` 에 수기로 들어 있었다.** 이벤트에서 유도하면 상대 점수가 실제보다 훨씬 작아진다.

- [ ] **Step 1: 현재 상태 확인**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT count(*) games, sum(home_score) hs, sum(away_score) as_ FROM league_games WHERE legacy_id IS NOT NULL"
```
이 세 숫자를 보고서에 적는다. Step 5 이후에도 **동일해야** 한다.

- [ ] **Step 2: 마이그레이션 작성**

Create `supabase/migrations/085_manual_scores.sql`:

```sql
-- =============================================
-- 085_manual_scores.sql
-- 수기 입력 점수 보호 — 이벤트에서 유도하면 안 되는 경기를 표시한다
-- =============================================
-- 배경
--   trg_events_recompute_score 가 이벤트가 바뀔 때마다 league_games 의
--   home_score/away_score 를 이벤트 합으로 다시 계산한다. 리그형에서는 맞다 —
--   양 팀 득점이 전부 이벤트로 기록되기 때문이다.
--
--   그런데 이관된 대회형 경기는 다르다. 레거시는 상대 득점을 opp_score 이벤트로
--   177건(322점)만 남겼고, 진짜 상대 점수는 games.opponent_score 에 수기로
--   들어 있었다. 이벤트에서 유도하면 상대 점수가 실제보다 훨씬 작아진다.
--   실제로 단계 B 에서 43경기의 상대 점수가 깎였다(복구함).
--
--   → "이 경기의 점수는 사람이 적은 것" 이라고 표시하고, 재계산이 그걸 존중하게 한다.
--
-- 왜 legacy_id 로 판별하지 않나: legacy_id 는 단계 D 에서 제거되는 임시 컬럼이다.
--   그때 이 보호가 같이 사라지면 안 된다. 또 "수기 점수" 는 이관 여부와 무관한
--   영구 개념이다 — 앞으로도 이벤트 없이 스코어만 적는 경기가 있을 수 있다.
-- =============================================

ALTER TABLE league_games ADD COLUMN IF NOT EXISTS scores_manual BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN league_games.scores_manual IS
  '점수를 사람이 직접 적은 경기. true 면 이벤트 합으로 재계산하지 않는다(이벤트가 경기의 일부만 담고 있을 때).';

-- 이관된 경기는 전부 수기 점수다. 상대 득점이 이벤트에 완전히 담겨 있지 않다.
UPDATE league_games SET scores_manual = true WHERE legacy_id IS NOT NULL;

-- 재계산 함수가 플래그를 존중하게 한다.
--   RETURN QUERY 로 현재 값을 그대로 돌려주는 이유: 호출부가 반환값을 쓰고 있을 수 있어
--   "아무것도 안 함" 과 "0을 돌려줌" 은 다르다.
CREATE OR REPLACE FUNCTION public.recompute_league_game_score(p_game_id uuid)
 RETURNS TABLE(home_score integer, away_score integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_home_team_id UUID;
  v_away_team_id UUID;
  v_manual BOOLEAN;
  v_hs INT;
  v_as INT;
BEGIN
  SELECT g.home_team_id, g.away_team_id, g.scores_manual
    INTO v_home_team_id, v_away_team_id, v_manual
    FROM league_games g
   WHERE g.id = p_game_id;

  -- 수기 점수 경기는 건드리지 않고 저장된 값을 그대로 돌려준다.
  IF v_manual THEN
    RETURN QUERY SELECT g.home_score, g.away_score FROM league_games g WHERE g.id = p_game_id;
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN e.team_id = v_home_team_id THEN e.points ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN e.team_id = v_away_team_id THEN e.points ELSE 0 END), 0)
  INTO v_hs, v_as
  FROM league_game_events e
  WHERE e.league_game_id = p_game_id
    AND e.points > 0;

  UPDATE league_games
     SET home_score = v_hs,
         away_score = v_as
   WHERE id = p_game_id;

  RETURN QUERY SELECT v_hs, v_as;
END;
$function$;
```

- [ ] **Step 3: 적용**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs up 085
```

- [ ] **Step 4: 보호가 실제로 작동하는지 시험한다**

플래그를 넣었다고 안심하지 말고, **트리거를 실제로 발화시켜** 점수가 안 변하는지 본다.

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "
WITH target AS (
  SELECT lg.id, lg.home_score, lg.away_score,
         (SELECT e.id FROM league_game_events e WHERE e.league_game_id = lg.id AND e.points > 0 LIMIT 1) AS ev
    FROM league_games lg WHERE lg.legacy_id IS NOT NULL AND lg.away_score > 0 LIMIT 1
)
SELECT * FROM target"
```
경기 하나와 그 경기의 이벤트 하나를 고른다. 값을 적어 둔 뒤, 그 이벤트의 `points` 를 **같은 값으로** UPDATE 해서 트리거를 발화시킨다(값은 안 바뀌지만 `UPDATE OF points` 는 발화한다):

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "UPDATE league_game_events SET points = points WHERE id = '<위에서 고른 ev>'" && node scripts/db-migrate.mjs sql "SELECT id, home_score, away_score FROM league_games WHERE id = '<위에서 고른 경기>'"
```
Expected: 점수가 **그대로**. 바뀌었으면 보호가 안 걸린 것이므로 중단하고 보고.

같은 시험을 미라클 경기 하나에도 해서 **거기서는 재계산이 여전히 작동하는지** 확인한다 — 보호가 과하게 걸려 리그형까지 멈추면 그것도 버그다.

- [ ] **Step 5: 전체 점수 불변 확인 + 단언 추가**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT count(*) games, sum(home_score) hs, sum(away_score) as_ FROM league_games WHERE legacy_id IS NOT NULL"
```
Expected: Step 1 과 동일.

`scripts/verify-migration.mjs` 의 마지막 `console.log` 앞에 추가:

```js
// 085 — 수기 점수 보호. 이게 풀리면 이벤트 수정 한 번에 상대 점수가 깎인다.
await check(
  '이관 경기는 전부 수기 점수로 표시돼 있다',
  `SELECT count(*)::int n FROM league_games WHERE legacy_id IS NOT NULL AND NOT scores_manual`,
  (r) => r[0].n === 0,
)

// 리그형(미라클)은 여전히 이벤트에서 유도해야 한다 — 보호가 과하게 걸리면 그것도 버그다.
await check(
  '미라클 경기에는 수기 점수 표시가 없다',
  `SELECT count(*)::int n FROM league_games
    WHERE league_id = '8eda8257-8907-4bf3-a7de-e5e7fde54a89' AND scores_manual`,
  (r) => r[0].n === 0,
)
```

- [ ] **Step 6: 검증 3종 + 커밋**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/verify-migration.mjs && node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs && git add supabase/migrations/085_manual_scores.sql scripts/verify-migration.mjs && git commit -m "$(cat <<'EOF'
fix(unify): 수기 입력 점수를 재계산에서 보호 (단계 C-1)

이관된 대회 경기는 상대 득점이 이벤트에 일부만 담겨 있다 — 레거시가
opp_score 를 177건(322점)만 남겼고 진짜 점수는 수기로 적혀 있었다.
그래서 이벤트 합으로 재계산하면 상대 점수가 깎인다. 단계 B 에서 실제로
43경기가 깎였고, 지금 구조로는 이벤트를 한 번만 수정해도 또 깎인다.

legacy_id 로 판별하지 않는 이유: 그건 단계 D 에서 사라지는 임시 컬럼이라
보호가 같이 사라진다. "수기 점수" 는 이관과 무관한 영구 개념이기도 하다.

리그형(미라클)에서는 재계산이 그대로 작동하는지 함께 확인했다 — 보호가
과하게 걸려 리그형까지 멈추면 그것도 버그다.
EOF
)"
```

---

### Task 2: mode 를 화면까지 내려보내기

**Files:**
- Create: `src/lib/league/mode.ts`
- Create: `src/contexts/LeagueModeContext.tsx`
- Modify: `src/app/league/[orgSlug]/[leagueId]/layout.tsx`
- Modify: `src/app/league/[orgSlug]/[leagueId]/_components/LeagueLayoutClient.tsx`

**Interfaces:**
- Produces:
  - `type LeagueMode = 'league' | 'tournament'`
  - `fetchLeagueMode(leagueId: string): Promise<LeagueMode>` — 서버 전용. 못 찾으면 `'league'` (기존 동작 유지가 안전한 쪽)
  - `segmentLabel(mode: LeagueMode): string` — `'분기'` / `'대회'`
  - `<LeagueModeProvider mode={...}>` + `useLeagueMode(): LeagueMode`

**왜 컨텍스트인가:** mode 를 쓰는 컴포넌트가 레이아웃에서 여러 겹 아래에 있다. prop 으로 내리면 중간 컴포넌트 전부가 자기와 상관없는 값을 들고 다니게 되고, 나중에 한 곳을 빠뜨린다.

- [ ] **Step 1: 어휘 모듈 작성**

Create `src/lib/league/mode.ts`:

```ts
import { createClient } from '@/lib/supabase/admin'

// 리그 운영 방식. leagues.mode 컬럼과 1:1 (075 마이그레이션에서 CHECK 로 제한).
//   league     — 동호회 내부 인원을 팀으로 나눠 시즌을 치른다 (미라클)
//   tournament — 외부 동호회와 대회를 치른다 (파란날개)
export type LeagueMode = 'league' | 'tournament'

// 서버 전용. 못 찾으면 'league' 로 떨어진다 — 기존 동작이 리그형이므로,
//   판정 실패 시 지금까지와 같게 구는 쪽이 안전하다.
export async function fetchLeagueMode(leagueId: string): Promise<LeagueMode> {
  const sb = createClient()
  const { data, error } = await sb.from('leagues').select('mode').eq('id', leagueId).maybeSingle()
  if (error) throw new Error(`leagues: leagueId=${leagueId} mode 조회 실패 — ${error.message}`)
  return data?.mode === 'tournament' ? 'tournament' : 'league'
}

// 세그먼트(league_quarters)를 사용자에게 뭐라고 부를지.
//   같은 테이블이지만 리그형에서는 시즌 안의 '분기' 고, 대회형에서는 개별 '대회' 다.
export function segmentLabel(mode: LeagueMode): string {
  return mode === 'tournament' ? '대회' : '분기'
}

// 드래프트는 내부 인원을 팀으로 나눌 때만 의미가 있다. 외부 팀과 붙는 대회형에는 없다.
export function hasDraft(mode: LeagueMode): boolean {
  return mode === 'league'
}
```

- [ ] **Step 2: 컨텍스트 작성**

Create `src/contexts/LeagueModeContext.tsx`. **기존 컨텍스트 파일을 먼저 읽고 같은 형태로 쓴다** — `src/contexts/LeagueQuarterContext.tsx` 가 참고 대상이다. 제공할 것: `LeagueModeProvider({ mode, children })` 와 `useLeagueMode(): LeagueMode`. Provider 밖에서 훅을 부르면 `'league'` 로 떨어지게 한다(기존 동작 유지).

- [ ] **Step 3: 레이아웃에서 mode 조회해 내려보내기**

`layout.tsx` 는 이미 `isLeaguePublic(leagueId)` 를 부른다. `fetchLeagueMode(leagueId)` 를 **같은 `Promise.all` 로 묶어** 왕복을 늘리지 않는다. 비공개 게이트 분기(`PrivateLeagueGate`)는 그대로 두고, 통과했을 때만 `LeagueModeProvider` 로 감싼다.

⚠ 비공개 게이트가 먼저다. mode 조회 때문에 게이트를 우회하는 경로가 생기면 안 된다.

- [ ] **Step 4: 탭 구성 분기**

`LeagueLayoutClient.tsx` 의 `TabNav`/`BottomNav` 에서 `useLeagueMode()` 를 쓴다. 대회형일 때:
- **드래프트 탭 제거** — `hasDraft(mode)` 가 false. 기존 `showDraft` prop 과 AND 로 묶는다(둘 다 참일 때만 노출).
- 나머지 탭(홈·라커룸·경기·스탯·하이라이트·설정)은 그대로. 이름은 이미 통일돼 있다.

레거시 트리의 탭 이름(영상·통계·선수)은 **고치지 않는다.** 단계 D 에서 그 트리가 통째로 사라지므로 지금 고치면 버려질 작업이다.

- [ ] **Step 5: 확인**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && npx tsc --noEmit && npm run build 2>&1 | tail -3
```

dev 서버로 눈으로 확인한다(포트 3005, 없으면 `npm run dev -- -p 3005`):
- `http://localhost:3005/league/paranalgae/youth-2026` → 드래프트 탭이 **없다**
- `http://localhost:3005/league/miracle/2026` → 드래프트 탭이 **기존과 동일하게** 뜬다(드래프트 활성 시)

미라클 화면이 조금이라도 달라지면 중단하고 보고 — 이 태스크는 대회형만 바꿔야 한다.

- [ ] **Step 6: 커밋**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs && git add src/lib/league/mode.ts src/contexts/LeagueModeContext.tsx "src/app/league/[orgSlug]/[leagueId]/layout.tsx" "src/app/league/[orgSlug]/[leagueId]/_components/LeagueLayoutClient.tsx" && git commit -m "$(cat <<'EOF'
feat(unify): leagues.mode 를 실제 분기점으로 사용 (단계 C-2)

075 에서 만들어 두고 코드가 한 번도 읽지 않던 컬럼이다. 대신 트리를
통째로 복제하는 쪽으로 흘러 같은 기능이 두 벌이 됐다.

mode 를 prop 이 아니라 컨텍스트로 내리는 이유: 쓰는 컴포넌트가 여러 겹
아래에 있어, prop 으로 내리면 중간 컴포넌트가 자기와 상관없는 값을 들고
다니게 되고 언젠가 한 곳을 빠뜨린다.

fetchLeagueMode 는 못 찾으면 'league' 로 떨어진다 — 기존 동작이 리그형
이므로 판정 실패 시 지금까지와 같게 구는 쪽이 안전하다.

레거시 트리의 탭 이름(영상·통계·선수)은 고치지 않는다. 단계 D 에서
그 트리가 사라지므로 지금 고치면 버려질 작업이다.
EOF
)"
```

---

### Task 3: 대회형 화면 — 세그먼트 호칭과 대회별 성적

**Files:**
- Create: `src/components/league/TournamentSummary.tsx`
- Modify: 세그먼트를 '분기' 라고 부르는 비-드래프트 컴포넌트들
- Modify: `src/app/league/[orgSlug]/[leagueId]/page.tsx` (대회형일 때 요약 노출)

**Interfaces:**
- Consumes: `useLeagueMode()`, `segmentLabel(mode)` (Task 2)
- Produces: `<TournamentSummary leagueId={...} />`

**왜 필요한가:** 레거시 `/tournaments` 화면에는 대회별 성적 요약(우승·준우승·N강 탈락)이 있었다. 리그형에는 대응 개념이 없어서, 이대로 전환하면 파란날개 입장에서는 **기능이 사라진 것**이 된다. `league_games.round_label`(43건)에 조별예선·16강·8강·4강·준결승·결승이 그대로 들어와 있으므로 재구성할 수 있다.

- [ ] **Step 1: 원본 화면의 판정 규칙을 읽는다**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && sed -n '1,80p' "src/app/(main)/[org]/[team]/tournaments/page.tsx"
```

우승/준우승/N강을 어떻게 판정하는지 **그대로 옮긴다.** 새로 규칙을 만들면 같은 대회의 성적이 옛 화면과 새 화면에서 달라지고, Task 4 의 대조가 실패한다. 판정 로직을 읽고 요약해 보고서에 적는다.

- [ ] **Step 2: 실제 데이터로 규칙을 확인한다**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT q.name, lg.round_label, lg.home_score, lg.away_score, lg.date FROM league_games lg JOIN league_quarters q ON q.id = lg.quarter_id WHERE lg.legacy_id IS NOT NULL ORDER BY q.ord, lg.date LIMIT 40"
```

- [ ] **Step 3: 요약 컴포넌트 작성**

`TournamentSummary.tsx` 는 대회(세그먼트)마다 한 줄을 보여준다: 대회 이름 · 기간 · 전적(승-패) · 최종 성적(우승/준우승/N강). Step 1 에서 읽은 판정 규칙을 그대로 쓴다.

디자인은 **기존 리그 화면의 카드 어휘를 따른다** — `src/app/league/[orgSlug]/[leagueId]/highlights/page.tsx` 의 카드 그리드가 참고 대상이다. `mm-*` 토큰만 쓰고, 375px 에서 가로 스크롤이 없어야 한다.

- [ ] **Step 4: 홈 화면에 연결**

리그 홈(`page.tsx`)에서 `mode === 'tournament'` 일 때만 이 요약을 보여준다. 리그형 홈은 건드리지 않는다.

⚠ `page.tsx` 는 비공개 게이트(`isLeaguePrivateGated`)를 함수 맨 위에서 확인하고 데이터 fetch 전에 return 한다. **그 순서를 깨지 않는다** — 위에 뭔가를 넣으면 비공개 리그의 데이터가 raw HTML 로 샌다.

- [ ] **Step 5: 세그먼트 호칭 정리**

`segmentLabel(mode)` 를 써서 '분기' 라는 사용자 노출 문구를 대회형에서 '대회' 로 바꾼다. 대상은 **드래프트가 아닌** 컴포넌트만 — 드래프트는 대회형에 아예 없다(Task 2).

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && grep -rn "분기" src/components/league src/app/league --include=*.tsx | grep -iv draft
```

각 건이 **사용자에게 보이는 문구인지 주석인지** 판별한다. 주석은 그대로 둔다.

- [ ] **Step 6: 확인 + 커밋**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && npx tsc --noEmit && npm run build 2>&1 | tail -3 && node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs
```

dev 서버에서 375px 폭으로 확인:
- `/league/paranalgae/youth-2026` → 대회 8개의 성적 요약, 가로 스크롤 없음
- `/league/miracle/2026` → **변화 없음**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && git add -A && git commit -m "$(cat <<'EOF'
feat(unify): 대회형 성적 요약 + 세그먼트 호칭 분기 (단계 C-3)

레거시 /tournaments 에 있던 대회별 성적(우승·준우승·N강)을 리그 화면에
되살린다. 이게 없으면 파란날개 입장에서 전환은 이관이 아니라 기능 상실이다.
round_label 43건이 그대로 이관돼 있어 재구성할 수 있다.

판정 규칙은 레거시 화면의 것을 그대로 옮겼다. 새로 만들면 같은 대회의
성적이 옛 화면과 새 화면에서 달라진다.

같은 테이블(league_quarters)을 리그형에서는 '분기', 대회형에서는 '대회'
로 부른다 — 사용자에게는 다른 개념이다.
EOF
)"
```

---

### Task 4: 옛 화면과 새 화면 숫자 대조 — 전환 게이트

**Files:**
- Create: `scripts/verify-switchover.mjs`

**Interfaces:**
- Produces: exit 0 이면 전환해도 된다는 증거. Task 5 는 이게 통과해야 시작한다.

**왜 이 태스크가 리다이렉트보다 먼저인가:** 단계 B 는 "데이터가 정확히 복사됐는가" 를 증명했다. 이 태스크는 **"두 화면이 사용자에게 같은 숫자를 보여주는가"** 를 본다. 복사가 완벽해도 리그 집계 코드가 `opp_score`·`foul` 같은 낯선 타입에서 다르게 굴면 화면 숫자가 달라진다. 전환한 뒤에 알면 이미 사용자가 잘못된 숫자를 본 뒤다.

- [ ] **Step 1: 대조할 지표를 정한다**

레거시 API 와 리그 API 를 같은 대상에 대해 호출해 비교한다. 최소한 다음:

| 지표 | 레거시 출처 | 리그 출처 |
|---|---|---|
| 선수별 시즌 총득점 | `/api/stats/season` | `/api/leagues/{id}/stats` |
| 선수별 경기 수 | 〃 | 〃 |
| 경기별 우리/상대 점수 | `/api/games` | `/api/leagues/{id}/games` |
| 팀 전적(승-패) | `/tournaments` 화면 로직 | `TournamentSummary` 로직 |

각 API 의 실제 응답 형태를 **먼저 호출해서 확인한 뒤** 비교 코드를 쓴다. 필드 이름을 추측하지 않는다.

- [ ] **Step 2: 대조 스크립트 작성**

Create `scripts/verify-switchover.mjs`. 두 API 를 호출해 지표를 뽑고, 선수 단위·경기 단위로 비교한다. 하나라도 다르면 **어느 선수/경기가 얼마나 다른지 출력하고** exit 1.

레거시 API 는 팀 PIN 인증을 요구할 수 있고 리그 API 는 스탯 게이팅(`canViewStats`)이 걸려 있다. 인증이 필요하면 `.env.local` 의 값이나 DB 의 `edit_pin` 을 써서 통과시킨다 — **가드를 우회하는 코드를 프로덕션 경로에 넣지 않는다.** 스크립트 안에서만 해결한다.

- [ ] **Step 3: 실행**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/verify-switchover.mjs
```

**차이가 나오면 그게 이 태스크의 성과다.** 숨기지 말고 전부 보고한다. 차이의 성격에 따라 대응이 갈린다:
- 리그 집계가 `opp_score`/`foul` 을 다르게 다뤄서 생긴 차이 → 리그 쪽을 고친다
- 레거시 화면이 원래 틀렸던 것 → 고치지 말고 기록만 한다(이관 문제가 아니다)

판단이 서지 않으면 **차이를 그대로 보고하고 멈춘다.** 임의로 한쪽에 맞추지 않는다.

- [ ] **Step 4: 커밋**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && git add scripts/verify-switchover.mjs && git commit -m "$(cat <<'EOF'
test(unify): 옛 화면과 새 화면 숫자 대조 (단계 C-4)

단계 B 는 "데이터가 정확히 복사됐는가" 를 증명했다. 이건 "두 화면이
사용자에게 같은 숫자를 보여주는가" 를 본다. 복사가 완벽해도 리그 집계
코드가 opp_score·foul 같은 낯선 타입에서 다르게 굴면 화면 숫자가 달라진다.

리다이렉트보다 먼저 두는 이유: 전환한 뒤에 알면 이미 사용자가 잘못된
숫자를 본 뒤다.
EOF
)"
```

---

### Task 5: 리다이렉트 — 실제 전환

**Files:**
- Modify: `src/middleware.ts`
- Modify: `docs/legacy-migration-notes.md`

**⚠ Task 4 가 통과하지 않았으면 이 태스크를 시작하지 않는다.** 사용자가 보는 화면이 바뀌는 유일한 태스크다.

- [ ] **Step 1: 현재 리다이렉트 규칙을 읽는다**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && sed -n '60,120p' src/middleware.ts
```

지금은 `/youth` → `/paranalgae/youth`(301), `/senior` → `/paranalgae/senior`(301) 이고, `/paranalgae/*` 는 레거시 트리가 받는다.

- [ ] **Step 2: 새 매핑 작성**

| 옛 주소 | 새 주소 |
|---|---|
| `/youth`, `/youth/*` | `/league/paranalgae/youth-2026` |
| `/senior`, `/senior/*` | `/league/paranalgae/senior-2026` |
| `/paranalgae/youth`, `/paranalgae/youth/*` | `/league/paranalgae/youth-2026` |
| `/paranalgae/senior`, `/paranalgae/senior/*` | `/league/paranalgae/senior-2026` |

**하위 경로는 그대로 이어붙이지 않는다.** 레거시의 `/boxscore`·`/gamelog`·`/tournaments` 는 리그 트리에 같은 이름이 없거나 뜻이 다르다. 이어붙이면 404 가 난다. 하위 경로가 있으면 **리그 홈으로 보낸다** — 404 보다 낫다.

**301 이 아니라 307/302 를 쓴다.** 301 은 브라우저가 영구 캐시해서, 문제가 생겨 되돌려도 사용자 브라우저가 계속 새 주소로 간다. 전환이 안정된 뒤 단계 D 에서 301 로 바꾼다. 이 이유를 주석에 남긴다.

- [ ] **Step 3: `/league/paranalgae` 모호성 해결**

org 아래 리그가 셋이다(`youth-2026` · `senior-2026` · 빈 `pana-basket-senior` 자체전 스텁). `src/app/league/[orgSlug]/page.tsx` 는 active/upcoming 중 하나를 임의로 고른다.

파란날개는 청년부·장년부가 **다른 팀**이므로 자동으로 한쪽을 고르면 절반은 틀린다. 선택 화면을 보여준다 — 청년부/장년부 두 카드. `mm-*` 토큰, 44px 터치 타깃.

⚠ **다른 동호회의 존재를 노출하지 않는다.** 이 화면은 URL 에 있는 org 의 리그만 보여준다. 비공개 팀은 이름조차 노출하지 않는다(`isLeaguePublic`).

- [ ] **Step 4: 전환 확인**

dev 서버에서:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && for p in /youth /senior /paranalgae/youth /paranalgae/senior /paranalgae/youth/boxscore /league/paranalgae; do printf "%-32s " "$p"; curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" "http://localhost:3005$p"; done
```
Expected: 넷은 새 리그 주소로, 하위 경로도 리그 홈으로, `/league/paranalgae` 는 200(선택 화면).

미라클 주소가 영향받지 않는지도 확인:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3005/league/miracle/2026
```

- [ ] **Step 5: 되돌리는 법을 문서화**

`docs/legacy-migration-notes.md` 에 추가한다 — 리다이렉트 블록을 지우면 즉시 레거시로 복귀한다는 것, 307 을 쓴 이유, 그리고 레거시 트리가 아직 살아 있다는 것.

- [ ] **Step 6: 커밋**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && npx tsc --noEmit && npm run build 2>&1 | tail -3 && node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs && node scripts/verify-migration.mjs && git add src/middleware.ts docs/legacy-migration-notes.md "src/app/league/[orgSlug]/page.tsx" && git commit -m "$(cat <<'EOF'
feat(unify): 파란날개를 리그 주소로 전환 (단계 C-5)

사용자가 보는 화면이 바뀌는 유일한 커밋이다. 앞의 대조(C-4)가 통과한
뒤에만 한다.

301 이 아니라 307 을 쓴다. 301 은 브라우저가 영구 캐시해서, 문제가 생겨
되돌려도 사용자 브라우저가 계속 새 주소로 간다. 안정된 뒤 단계 D 에서 바꾼다.

하위 경로는 이어붙이지 않고 리그 홈으로 보낸다. 레거시의 /boxscore·
/gamelog·/tournaments 는 리그 트리에 같은 이름이 없거나 뜻이 달라
이어붙이면 404 가 난다.

/league/paranalgae 는 청년부/장년부 선택 화면으로 만든다. 둘은 다른
팀이라 자동으로 하나를 고르면 절반은 틀린 곳으로 간다. 이 화면은 URL 의
org 것만 보여준다 — 다른 동호회의 존재가 새면 안 된다.

레거시 트리는 그대로 살아 있다. 리다이렉트만 지우면 즉시 복귀한다.
EOF
)"
```

---

## 완료 기준

- `verify-migration.mjs` · `verify-schema.mjs` · `verify-scoring.mjs` · `verify-switchover.mjs` 넷 다 exit 0
- 이관 경기의 이벤트를 수정해도 점수가 안 깎인다(실측 확인), 미라클은 재계산이 그대로 동작
- 대회형 화면에 드래프트 탭이 없고, 세그먼트가 '대회' 로 불린다
- 대회별 성적 요약이 레거시와 같은 판정을 낸다
- `/youth` · `/senior` · `/paranalgae/*` 가 새 리그 주소로 간다
- `/league/paranalgae` 가 청년부/장년부 선택 화면
- **미라클 화면은 아무것도 안 바뀐다**
- 레거시 트리는 여전히 동작한다 — 리다이렉트만 지우면 복귀

## 단계 D 로 넘기는 것

- `foul` 588건 — 리그 박스스코어에 파울 자리를 만들지 판단
- `quarter_start`/`quarter_end` 339건 — 영상 마커, 대응 개념 없음
- 307 → 301 전환 (안정 후)
- 레거시 트리·API 23개·테이블 삭제, `legacy_id` 컬럼 제거
- `pana-basket-senior` 빈 스텁 리그 정리
