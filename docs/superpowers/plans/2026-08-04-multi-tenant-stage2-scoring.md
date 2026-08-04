# 멀티테넌트 표준화 단계 2 — 룰 엔진(득점 채점 통합) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 리그 계열에 흩어진 득점 계산 15곳을 공용 채점 모듈 하나로 모으고, 그 모듈이 시즌별 `rules` 를 읽게 해 동호회마다 다른 득점 룰이 실제로 적용되게 한다.

**Architecture:** `src/lib/stats/scoring.ts` 에 순수 함수 `scorePoints(type, result, isPlusOne, rules)` 하나를 두고, 기존 `switch`/삼항 계산을 전부 이 호출로 치환한다. 모듈은 외부 import 가 없어 Node 가 TS 를 그대로 실행할 수 있고, 검증 스크립트가 **실제 모듈을 임포트해** 이벤트 전량을 대조한다. 마지막에 저장값 6건을 룰 계산값으로 백필해 저장·표시가 일치하게 만든다.

**Tech Stack:** TypeScript · Next.js · Supabase · Node 24 네이티브 TS 임포트(검증 스크립트) · `scripts/db-migrate.mjs`

## Global Constraints

- 마이그레이션은 `supabase/migrations/NNN_*.sql`, 번호는 078 다음부터. 실행은 `node scripts/db-migrate.mjs up NNN` — 번호를 반드시 지정한다.
- **레거시(파란날개) 계열은 이번 범위가 아니다.** `src/lib/stats/calculator.ts`, `src/app/api/players/[id]/stats/route.ts`, `src/components/GameBoxScoreModal.tsx`, `src/app/api/events/route.ts`, `src/app/api/dashboard/route.ts`, `src/app/api/stats/season/route.ts` 는 **건드리지 않는다** — 단계 5에서 트리째 제거된다.
- **`scripts/diagnose-*.mjs` 도 건드리지 않는다** — 개발자 진단 도구이며 프로덕션 경로가 아니다.
- `src/lib/stats/scoring.ts` 는 **값 import 를 하지 않는다.** 타입 import(`import type`)만 허용. Node 의 타입 스트리핑으로 `.mjs` 에서 직접 임포트해야 하기 때문이다.
- 미라클 룰 값은 이미 DB 에 있다(`leagues.rules`). 코드에 다시 적지 않는다. 유일한 예외가 `STANDARD_SCORING` 상수이며, 이는 rules 를 못 읽은 경우의 폴백이 아니라 **테스트·온보딩 스크립트가 공유하는 표준값**이다.
- **`plus_one_bonus` 는 야투 4종에만 붙는다.** 자유투·앤드원에는 붙지 않는다. 이 사실은 `rules.plus_one_bonus.applies_to` 배열에 데이터로 들어 있으므로 코드에 하드코딩하지 않는다.
- 이 저장소에는 테스트 러너가 없다. 검증은 `node scripts/verify-scoring.mjs` 로 하며 실패 시 non-zero 종료한다.

## 배경 — 왜 지금 값이 어긋나 있나

득점 계산이 세 갈래로 갈라져 있다.

| 방식 | 구현 위치 | 미라클 시즌 총득점 |
|---|---|---|
| A. 타입에서 계산 + plus_one | 메인 스탯, 선수카드, 박스스코어 등 | **7,114** |
| B. 저장된 `points` 우선 | 마일스톤, 클러치 | **7,108** |

이벤트 3,253건 대조 결과 **6건이 불일치**한다.

| 대상 | 건수 | 저장값 | 룰 계산 | 판정 |
|---|---|---|---|---|
| 구범준 (`shot_post`·`shot_layup`, 2026-01-03) | 2 | 2 | 3 | **룰 계산이 맞다** — 플러스원(50세 기준)은 고정 속성이라 1월 경기에도 적용되어야 한다 |
| 변원식 (`ft_3pt_1`, 2026-01-10·05-02) | 4 | 1 | 2 | **룰 계산이 맞다** — 3점슛 파울 자유투 1구는 미라클 룰상 2점 |

사용자 확인 완료(2026-08-04): **저장값이 잘못됐고 룰이 정본이다.** 따라서 전환 후 총득점은 **7,114점으로 통일**되며, 저장값도 그에 맞춰 백필한다.

## File Structure

| 파일 | 책임 |
|---|---|
| `src/lib/stats/scoring.ts` | **신설.** 채점의 단일 진실. `scorePoints()` + `ScoringRules` 타입 + `STANDARD_SCORING` 상수 + `fetchScoringRules()` |
| `scripts/verify-scoring.mjs` | **신설.** 실제 모듈을 임포트해 DB 이벤트 전량을 대조. 태스크마다 어서션 누적 |
| `src/lib/stats/leagueStats.ts` | 메인 집계 2곳 전환 |
| `src/app/api/leagues/[leagueId]/players/[playerId]/detail/route.ts` | 선수카드 5곳 전환 |
| API 6종 | daily-boxscore · events/[eventId] · games/[gameId]/recompute · season-highs · teams/[teamId]/insights · stats/[gameId] |
| 파생 라이브러리 5종 | `lib/leagueStats.ts`(드래프트) · `lib/badges/computeBadges.ts` · `lib/stats/clutchStats.ts` · `lib/stats/milestones.ts` · `lib/stats/perDayStats.ts` |
| `src/components/league/LeagueEventInputPad.tsx` + `api/leagues/[leagueId]/events/route.ts` | 기록 경로 — 클라이언트 계산 제거, 서버가 룰로 계산 |
| `supabase/migrations/079_backfill_event_points.sql` | 저장값 6건 백필 |
| `src/app/api/leagues/[leagueId]/awards/route.ts` | EFFICIENCY 기준 eFG% → TS% |

---

### Task 1: 공용 채점 모듈 + 검증 스크립트

**Files:**
- Create: `src/lib/stats/scoring.ts`
- Create: `scripts/verify-scoring.mjs`

**Interfaces:**
- Produces: `export interface ScoringRules { event_points: Record<string, number>; plus_one_bonus: { amount: number; applies_to: string[] } }`
- Produces: `export function scorePoints(type: string, result: string | null | undefined, isPlusOne: boolean, rules: ScoringRules): number`
- Produces: `export const STANDARD_SCORING: ScoringRules`
- Produces: `export async function fetchScoringRules(sb: SupabaseClient, leagueId: string): Promise<ScoringRules>`
- 이후 모든 태스크가 `scorePoints` 와 `fetchScoringRules` 를 쓴다.

- [ ] **Step 1: 검증 스크립트 작성 (아직 실패해야 함)**

`scripts/verify-scoring.mjs` 생성:

```js
// 득점 채점 검증 — 실제 모듈(src/lib/stats/scoring.ts)을 그대로 임포트해 DB 이벤트 전량 대조.
//
//   node scripts/verify-scoring.mjs
//
// Node 24 는 .ts 를 네이티브로 타입 스트리핑해 실행하므로 로직을 복제하지 않는다.
// scoring.ts 에 값 import 가 생기면 이 스크립트가 깨진다 — 그게 의도된 제약이다.
import { query } from './lib/supabase-admin.mjs'
import { scorePoints, STANDARD_SCORING } from '../src/lib/stats/scoring.ts'

let failed = 0
function check(name, fn) {
  let r
  try { r = fn() } catch (e) { console.log(`✖ ${name}\n    예외: ${e.message}`); failed++; return }
  if (r === true) console.log(`✔ ${name}`)
  else { console.log(`✖ ${name}\n    ${r}`); failed++ }
}

// ── 순수 함수 단위 검증 (미라클 룰) ──────────────────
const MIRACLE = {
  event_points: {
    shot_3p: 3, shot_2p_mid: 2, shot_layup: 2, shot_post: 2,
    ft_2pt: 2, ft_3pt_1: 2, ft_3pt_2: 1, free_throw: 1, and_one: 1,
  },
  plus_one_bonus: { amount: 1, applies_to: ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post'] },
}

check('실패한 슛은 0점', () =>
  scorePoints('shot_3p', 'missed', false, MIRACLE) === 0 || `기대 0, 실제 ${scorePoints('shot_3p', 'missed', false, MIRACLE)}`)

check('result 가 null 이면 0점 (교체·파울 등)', () =>
  scorePoints('shot_3p', null, false, MIRACLE) === 0 || '실패')

check('3점 = 3점, 플러스원이면 4점', () =>
  (scorePoints('shot_3p', 'made', false, MIRACLE) === 3 && scorePoints('shot_3p', 'made', true, MIRACLE) === 4)
  || `실제 ${scorePoints('shot_3p', 'made', false, MIRACLE)} / ${scorePoints('shot_3p', 'made', true, MIRACLE)}`)

check('2점 야투 3종 = 2점, 플러스원이면 3점', () =>
  ['shot_2p_mid', 'shot_layup', 'shot_post'].every(t =>
    scorePoints(t, 'made', false, MIRACLE) === 2 && scorePoints(t, 'made', true, MIRACLE) === 3) || '실패')

check('자유투에는 플러스원 보너스가 붙지 않는다', () =>
  (scorePoints('ft_2pt', 'made', true, MIRACLE) === 2 && scorePoints('free_throw', 'made', true, MIRACLE) === 1)
  || `실제 ft_2pt=${scorePoints('ft_2pt', 'made', true, MIRACLE)}, free_throw=${scorePoints('free_throw', 'made', true, MIRACLE)}`)

check('앤드원에도 보너스가 붙지 않는다', () =>
  scorePoints('and_one', 'made', true, MIRACLE) === 1 || `실제 ${scorePoints('and_one', 'made', true, MIRACLE)}`)

check('모르는 타입은 0점 (리바운드·스틸 등)', () =>
  (scorePoints('oreb', 'made', true, MIRACLE) === 0 && scorePoints('steal', null, false, MIRACLE) === 0) || '실패')

check('표준 룰에는 플러스원 보너스가 없고 자유투가 1점', () =>
  (scorePoints('shot_3p', 'made', true, STANDARD_SCORING) === 3 && scorePoints('ft_2pt', 'made', false, STANDARD_SCORING) === 1)
  || `실제 ${scorePoints('shot_3p', 'made', true, STANDARD_SCORING)} / ${scorePoints('ft_2pt', 'made', false, STANDARD_SCORING)}`)

// ── DB 이벤트 전량 대조 ─────────────────────────────
// 미라클 이벤트를 전부 읽어 모듈 계산 합계를 구한다.
// 저장값(7,108)이 아니라 룰 계산값(7,114)이 정본이다 — 저장값 6건이 잘못됐고
// 사용자 확인으로 룰이 맞다고 확정됐다(2026-08-04). Task 7 에서 저장값을 백필한다.
const rows = await query(`
  SELECT e.type, e.result,
         ((g.plus_one_player_id IS NOT NULL AND e.league_player_id = g.plus_one_player_id)
          OR (g.plus_one_player_id IS NULL AND p.plus_one)) AS is_p1
    FROM league_game_events e
    JOIN league_games   g ON g.id = e.league_game_id
    JOIN league_players p ON p.id = e.league_player_id
   WHERE g.league_id = (SELECT id FROM leagues WHERE org_slug = 'miracle')`)

const total = rows.reduce((sum, r) => sum + scorePoints(r.type, r.result, r.is_p1, MIRACLE), 0)

check(`미라클 시즌 총득점 = 7114 (룰 계산 기준)`, () =>
  total === 7114 || `기대 7114, 실제 ${total}. 경기가 추가로 기록됐다면 이 숫자를 갱신할 것`)

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}건 실패`)
process.exitCode = failed === 0 ? 0 : 1
```

- [ ] **Step 2: 검증 실행해 실패 확인**

Run: `node scripts/verify-scoring.mjs`

Expected: `Cannot find module` 계열 오류로 즉시 실패한다 — `src/lib/stats/scoring.ts` 가 아직 없기 때문이다. 종료 코드 1.

- [ ] **Step 3: 채점 모듈 작성**

`src/lib/stats/scoring.ts` 생성:

```ts
/**
 * 리그 득점 채점 — 단일 진실.
 *
 * 이 파일이 생기기 전에는 득점 계산이 15곳에 흩어져 있었고, 세 갈래로 갈라져
 * 화면마다 총득점이 달랐다(타입 계산 7,114 / 저장값 7,108 · 불일치 6건).
 * 계산은 여기서만 한다. 다른 곳에 `case 'shot_3p'` 를 다시 쓰지 말 것.
 *
 * ⚠️ 값 import 금지 — 타입 import 만 허용한다.
 *    scripts/verify-scoring.mjs 가 Node 의 타입 스트리핑으로 이 파일을 직접 임포트해
 *    로직 복제 없이 검증한다. 값 import 가 생기면 그 검증이 깨진다.
 *    (`import type` 은 스트리핑에서 지워지므로 허용된다)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ScoringRules {
  /** 이벤트 타입 → 기본 득점. 여기 없는 타입은 0점(리바운드·스틸 등). */
  event_points: Record<string, number>
  /**
   * 플러스원 선수의 추가 득점.
   * applies_to 에 든 타입에만 붙는다 — 자유투·앤드원에는 붙지 않으며,
   * 그 사실을 코드가 아니라 데이터로 표현하기 위해 배열로 둔다.
   */
  plus_one_bonus: { amount: number; applies_to: string[] }
}

/** 표준 아마추어 농구 룰. leagues.rules 컬럼 기본값(마이그레이션 075/077)과 같은 값. */
export const STANDARD_SCORING: ScoringRules = {
  event_points: {
    shot_3p: 3, shot_2p_mid: 2, shot_layup: 2, shot_post: 2,
    ft_2pt: 1, ft_3pt_1: 1, ft_3pt_2: 1, free_throw: 1, and_one: 1,
  },
  plus_one_bonus: { amount: 0, applies_to: ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post'] },
}

/**
 * 이벤트 하나의 득점.
 * 성공(made)이 아니면 0점 — 실패 슛·교체·파울처럼 result 가 null 인 이벤트도 여기서 걸러진다.
 */
export function scorePoints(
  type: string,
  result: string | null | undefined,
  isPlusOne: boolean,
  rules: ScoringRules,
): number {
  if (result !== 'made') return 0
  const base = rules.event_points[type]
  if (base === undefined) return 0
  const bonus = isPlusOne && rules.plus_one_bonus.applies_to.includes(type)
    ? rules.plus_one_bonus.amount
    : 0
  return base + bonus
}

/**
 * 시즌의 채점 룰을 읽는다. 행이 없거나 rules 가 비면 표준 룰로 폴백한다
 * (신규 시즌은 DB 기본값이 이미 표준 룰이라 실제로는 거의 발생하지 않는다).
 *
 * `import type` 은 Node 의 타입 스트리핑에서 지워지므로 값 import 금지 제약에 걸리지 않는다.
 * 구조적 타입을 직접 쓰면 supabase 빌더의 실제 형태와 어긋나 타입 오류가 나기 쉬워
 * 공식 타입을 그대로 쓴다.
 */
export async function fetchScoringRules(sb: SupabaseClient, leagueId: string): Promise<ScoringRules> {
  const { data } = await sb.from('leagues').select('rules').eq('id', leagueId).maybeSingle()
  const r = data?.rules as Partial<ScoringRules> | undefined
  if (!r?.event_points || !r?.plus_one_bonus) return STANDARD_SCORING
  return { event_points: r.event_points, plus_one_bonus: r.plus_one_bonus }
}
```

- [ ] **Step 4: 검증 실행해 통과 확인**

Run: `node scripts/verify-scoring.mjs`

Expected: 단위 검증 8건 + DB 대조 1건, 전부 `✔`, 마지막 줄 `전부 통과`, 종료 코드 0.

DB 대조가 `기대 7114, 실제 7108` 로 실패하면 **멈추고 보고할 것** — SQL 의 플러스원 판정이 앱 로직과 어긋난 것이므로 모듈이 아니라 쿼리를 봐야 한다.

- [ ] **Step 5: 타입체크·빌드**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`

Expected: 오류 없음. `✓ Compiled successfully`

- [ ] **Step 6: 커밋**

```bash
git add src/lib/stats/scoring.ts scripts/verify-scoring.mjs
git commit -m "feat(scoring): 득점 채점 단일 모듈 신설 + 이벤트 전량 검증

득점 계산이 15곳에 흩어져 세 갈래로 갈라져 있었다(타입계산 7114 / 저장값 7108).
계산을 한 곳으로 모으기 위한 기반을 먼저 세운다. 아직 아무도 이 모듈을 쓰지 않는다.

- scorePoints(type, result, isPlusOne, rules) — 성공이 아니면 0점
- plus_one_bonus.applies_to 로 '보너스는 야투에만' 을 데이터로 표현 (코드 하드코딩 제거)
- 값 import 금지: verify-scoring.mjs 가 Node 타입 스트리핑으로 이 파일을 직접 임포트해
  로직 복제 없이 검증한다"
```

---

### Task 2: 메인 집계 전환 (`lib/stats/leagueStats.ts`)

**Files:**
- Modify: `src/lib/stats/leagueStats.ts` (`switch (e.type)` 2곳 — 선수별 집계 · 팀별 집계)

**Interfaces:**
- Consumes: Task 1 의 `scorePoints`, `fetchScoringRules`, `ScoringRules`.
- Produces: `computeLeagueStats` 의 반환값은 그대로. 시그니처 변경 없음 — 내부에서 룰을 읽어 쓴다.

이 파일은 스탯 탭·어워즈·리그 홈·개인 대시보드·인스타 카드가 전부 의존하는 **가장 영향이 큰 지점**이다.

- [ ] **Step 1: 룰 로딩 추가**

`src/lib/stats/leagueStats.ts` 상단 import 에 추가:

```ts
import { scorePoints, fetchScoringRules, type ScoringRules } from './scoring'
```

`computeLeagueStats` 안에서 이벤트 루프가 시작되기 전에 룰을 읽는다. 선수 메타를 읽는 부분 근처(파일 앞쪽 `const { data: allLeaguePlayers } = await sb...` 다음)에 넣는다:

```ts
  // 채점 룰 — 동호회마다 다르다(미라클은 plus_one +1, 자유투 ft_2pt 2점).
  // 이벤트 루프 밖에서 한 번만 읽는다.
  const scoringRules: ScoringRules = await fetchScoringRules(sb, leagueId)
```

- [ ] **Step 2: 선수별 집계 switch 의 득점 부분 교체**

`switch (e.type)` 블록(`case 'shot_3p':` 로 시작하는 첫 번째)에서 **득점 가산만** 교체한다.
`fga`/`fgm`/`ds_a` 같은 카운팅은 그대로 둔다 — 이 태스크는 득점만 다룬다.

교체 전:
```ts
        case 'shot_3p':
          s.fg3a++; s.fga++
          if (made) { s.fg3m++; s.fgm++; s.pts += isPlusOne ? 4 : 3 }
          break
```
교체 후:
```ts
        case 'shot_3p':
          s.fg3a++; s.fga++
          if (made) { s.fg3m++; s.fgm++; s.pts += pts }
          break
```

그리고 `switch` 진입 직전에 한 줄을 추가한다:

```ts
      const pts = scorePoints(e.type, e.result, isPlusOne, scoringRules)
```

같은 방식으로 `shot_post` · `shot_layup` · `shot_2p_mid` 의 `s.pts += isPlusOne ? 3 : 2` → `s.pts += pts`,
`and_one` 의 `s.pts += 1` → `s.pts += pts`,
`ft_2pt` 의 `s.pts += 2` → `s.pts += pts`,
`ft_3pt_1` · `ft_3pt_2` · `free_throw` 의 득점 가산도 전부 `s.pts += pts` 로 바꾼다.

- [ ] **Step 3: 팀별 집계 switch 도 동일하게 교체**

같은 파일의 두 번째 `switch`(팀 단위 집계, `g.pts += isPlusOne ? 4 : 3` 형태)에도 진입 직전에
`const pts = scorePoints(e.type, e.result, isPlusOne, scoringRules)` 를 추가하고 득점 가산을 `g.pts += pts` 로 바꾼다.

- [ ] **Step 4: 잔존 하드코딩이 없는지 확인**

Run: `grep -n "isPlusOne ? [0-9]" src/lib/stats/leagueStats.ts`

Expected: 출력 없음. 하나라도 남으면 그 줄을 마저 교체한다.

- [ ] **Step 5: 검증**

Run: `node scripts/verify-scoring.mjs && npx tsc --noEmit -p tsconfig.json && npm run build`

Expected: 검증 전부 통과, 타입 오류 없음, `✓ Compiled successfully`

- [ ] **Step 6: 커밋**

```bash
git add src/lib/stats/leagueStats.ts
git commit -m "refactor(scoring): 메인 집계를 공용 채점 모듈로 전환

스탯 탭·어워즈·리그 홈·개인 대시보드·인스타 카드가 모두 이 파일에 의존한다.
선수별/팀별 switch 두 곳의 득점 가산을 scorePoints() 호출로 교체.
카운팅(fga/fgm/존별)은 이 태스크 범위가 아니라 그대로 둔다.

룰은 이벤트 루프 밖에서 시즌당 한 번만 읽는다."
```

---

### Task 3: 선수카드 상세 전환 (`detail/route.ts`)

**Files:**
- Modify: `src/app/api/leagues/[leagueId]/players/[playerId]/detail/route.ts` (득점 계산 5곳)

**Interfaces:**
- Consumes: Task 1 의 `scorePoints`, `fetchScoringRules`, `ScoringRules`.

이 파일 하나에 득점 계산이 **5벌** 들어 있다(선수 본인 집계, 랭킹용 전체 집계 2곳, 팀 합계, 듀오 집계). 같은 파일 안에서도 서로 달라질 수 있는 상태였다.

- [ ] **Step 1: 룰 로딩 추가**

파일 상단 import 에 추가:

```ts
import { scorePoints, fetchScoringRules, type ScoringRules } from '@/lib/stats/scoring'
```

`const supabase = createClient()` 다음 줄에 추가:

```ts
  // 이 파일에는 득점 계산이 5곳 있었다. 전부 이 룰 하나를 공유한다.
  const scoringRules: ScoringRules = await fetchScoringRules(supabase, leagueId)
```

- [ ] **Step 2: 5곳 전부 교체**

각 지점에서 `isPlusOne`(또는 `isP1`) 변수가 이미 계산되어 있다. 득점 가산만 바꾼다.

1. 선수 본인 집계(`case 'shot_3p':` switch, 파일 앞쪽): switch 진입 직전에
   `const pts = scorePoints(e.type, e.result, isPlusOne, scoringRules)` 를 추가하고
   `s.pts += isPlusOne ? 4 : 3` · `s.pts += isPlusOne ? 3 : 2` · `s.pts += 1` · `s.pts += 2` 를 모두 `s.pts += pts` 로.

2. 랭킹용 전체 집계 (`if (e.type === 'shot_3p') { s.pts += isP1 ? 4 : 3; ... }` 형태, 2곳):
   각 이벤트 처리 시작부에
   `const pts = scorePoints(e.type, e.result, isP1, scoringRules)` 를 추가하고
   `s.pts += isP1 ? 4 : 3` 및 `s.pts += isP1 ? 3 : 2` 를 `s.pts += pts` 로.
   `made` 조건 안에서만 가산하던 코드는 그대로 둔다 — `scorePoints` 가 실패 슛을 0점으로 돌려주므로 결과는 같다.

3. 팀 합계 (`t.pts += isP1 ? 4 : 3` 형태):
   `t.pts += scorePoints(e.type, e.result, isP1, scoringRules)` 로.

4. 다이나믹 듀오 (`const pts = e.points != null && e.points > 0 ? e.points : (e.type === 'shot_3p' ? 3 : 2)`):
   저장값 폴백을 버리고 룰 계산으로 바꾼다.
   ```ts
   const pts = scorePoints(e.type, e.result, isPlusOneForEvent, scoringRules)
   ```
   이 지점에는 플러스원 판정 변수가 없다면, 같은 스코프에서 쓰이는 판정식
   (`gamePlusOne !== null ? scorer === gamePlusOne : plusOneSet.has(scorer)`)을 그대로 재사용해
   `isPlusOneForEvent` 를 만들어 넘긴다.

- [ ] **Step 3: 잔존 하드코딩 확인**

Run: `grep -nE "isP1 \? [0-9]|isPlusOne \? [0-9]|shot_3p' \? 3 : 2" "src/app/api/leagues/[leagueId]/players/[playerId]/detail/route.ts"`

Expected: 출력 없음.

- [ ] **Step 4: 검증**

Run: `node scripts/verify-scoring.mjs && npx tsc --noEmit -p tsconfig.json && npm run build`

Expected: 전부 통과.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/api/leagues/[leagueId]/players/[playerId]/detail/route.ts"
git commit -m "refactor(scoring): 선수카드 상세의 득점 계산 5벌을 공용 모듈로 통합

한 파일 안에 선수 집계·랭킹 집계 2곳·팀 합계·듀오 집계까지 득점 계산이 5벌 있었다.
같은 파일 안에서도 서로 어긋날 수 있는 상태였다.

다이나믹 듀오는 저장된 points 폴백을 쓰고 있었는데(저장값 6건이 틀린 것으로 확인됨)
룰 계산으로 통일했다."
```

---

### Task 4: 나머지 리그 API 6종 전환

**Files:**
- Modify: `src/app/api/leagues/[leagueId]/daily-boxscore/route.ts`
- Modify: `src/app/api/leagues/[leagueId]/events/[eventId]/route.ts`
- Modify: `src/app/api/leagues/[leagueId]/games/[gameId]/recompute/route.ts`
- Modify: `src/app/api/leagues/[leagueId]/season-highs/route.ts`
- Modify: `src/app/api/leagues/[leagueId]/teams/[teamId]/insights/route.ts`
- Modify: `src/app/api/leagues/[leagueId]/stats/[gameId]/route.ts`

**Interfaces:**
- Consumes: Task 1 의 `scorePoints`, `fetchScoringRules`.

- [ ] **Step 1: 6개 파일을 같은 패턴으로 전환**

각 파일에서:
1. `import { scorePoints, fetchScoringRules } from '@/lib/stats/scoring'` 추가
2. supabase 클라이언트를 만든 직후 `const scoringRules = await fetchScoringRules(supabase, leagueId)` 추가
   (`events/[eventId]` 처럼 leagueId 가 params 에 없으면, 해당 이벤트의 게임에서 `league_id` 를 조회해 쓴다)
3. 득점 계산부(`case 'shot_3p':` switch 또는 `isPlusOne ? 4 : 3` 삼항)를 `scorePoints(type, result, isPlusOne, scoringRules)` 로 교체

`events/[eventId]/route.ts` 는 함수 형태(`function pointsFor(type, result, isPlusOne)`)이므로 함수 본문을
`return scorePoints(type, result, isPlusOne, rules)` 로 바꾸고 `rules` 를 인자로 받도록 시그니처를 넓힌다.

- [ ] **Step 2: 잔존 하드코딩 확인**

Run: `grep -rnE "isPlusOne \? [0-9]|isP1 \? [0-9]" "src/app/api/leagues"`

Expected: 출력 없음.

- [ ] **Step 3: 검증**

Run: `node scripts/verify-scoring.mjs && npx tsc --noEmit -p tsconfig.json && npm run build`

Expected: 전부 통과.

- [ ] **Step 4: 커밋**

```bash
git add "src/app/api/leagues"
git commit -m "refactor(scoring): 리그 API 6종의 득점 계산을 공용 모듈로 전환

daily-boxscore · events/[eventId] · games/[gameId]/recompute · season-highs
· teams/[teamId]/insights · stats/[gameId]"
```

---

### Task 5: 파생 라이브러리 5종 전환

**Files:**
- Modify: `src/lib/leagueStats.ts` (드래프트 점수 — `src/lib/stats/leagueStats.ts` 와 **다른 파일**이다)
- Modify: `src/lib/badges/computeBadges.ts`
- Modify: `src/lib/stats/clutchStats.ts`
- Modify: `src/lib/stats/milestones.ts`
- Modify: `src/lib/stats/perDayStats.ts`

**Interfaces:**
- Consumes: Task 1 의 `scorePoints`, `fetchScoringRules`, `ScoringRules`.

⚠️ **`clutchStats.ts` 와 `milestones.ts` 는 저장된 `points` 를 우선 쓰고 있다**(`e.points ?? 3`).
이 태스크에서 그 폴백을 없애면 두 화면의 총득점이 7,108 → 7,114 로 **의도적으로 바뀐다**.
사용자가 "저장값이 잘못됐고 룰이 정본"이라고 확정한 결과다.

- [ ] **Step 1: 5개 파일 전환**

각 파일에서 룰을 인자로 받거나(순수 함수인 경우) supabase 로 읽어(비동기 집계 함수인 경우) `scorePoints` 를 호출한다.

- `src/lib/leagueStats.ts` — `aggregateQuarterStats` 가 supabase 를 받으므로 `fetchScoringRules` 로 읽는다.
- `src/lib/badges/computeBadges.ts` — 순수 함수라면 `rules: ScoringRules` 파라미터를 추가하고 호출부에서 넘긴다.
- `src/lib/stats/clutchStats.ts` — `computeClutchStats(sb, leagueId, opts)` 가 supabase 를 받으므로 내부에서 읽는다.
  `b.pts += e.points ?? 3` 형태를 `b.pts += scorePoints(e.type, e.result, isPlusOne, rules)` 로 교체.
  플러스원 판정 변수가 없으면 이 파일의 이벤트 조회에 `league_player_id` 와 게임의 `plus_one_player_id`,
  선수의 `plus_one` 을 함께 읽어 판정식을 세운다 — `leagueStats.ts` 의 판정과 같은 규칙을 쓸 것.
- `src/lib/stats/milestones.ts` — `if (points != null) return points` 폴백을 제거하고 `scorePoints` 만 쓴다.
- `src/lib/stats/perDayStats.ts` — `computePerDayStats(sb, leagueId)` 내부에서 읽어 쓴다.

- [ ] **Step 2: 잔존 폴백 확인**

Run: `grep -rnE "e\.points \?\?|points != null|isPlusOne \? [0-9]" src/lib/stats src/lib/badges src/lib/leagueStats.ts`

Expected: 출력 없음.

- [ ] **Step 3: 검증**

Run: `node scripts/verify-scoring.mjs && npx tsc --noEmit -p tsconfig.json && npm run build`

Expected: 전부 통과.

- [ ] **Step 4: 커밋**

```bash
git add src/lib
git commit -m "refactor(scoring): 파생 라이브러리 5종을 공용 모듈로 전환

드래프트 점수 · 배지 · 클러치 · 마일스톤 · 일자별 집계.

clutchStats 와 milestones 는 저장된 points 를 우선 쓰고 있었다(e.points ?? 3).
저장값 6건이 틀린 것으로 확인돼(구범준 플러스원 2건 · 변원식 ft_3pt_1 4건)
폴백을 제거했다. 두 화면의 시즌 총득점이 7108 → 7114 로 바뀐다 — 의도된 변경이다."
```

---

### Task 6: 기록 경로 — 서버가 룰로 계산

**Files:**
- Modify: `src/app/api/leagues/[leagueId]/events/route.ts` (POST — 현재 `points: body.points ?? 0`)
- Modify: `src/components/league/LeagueEventInputPad.tsx` (`calcPoints` 제거)

**Interfaces:**
- Consumes: Task 1 의 `scorePoints`, `fetchScoringRules`.

지금은 **클라이언트가 계산한 점수를 서버가 그대로 믿는다.** 신뢰 경계가 어긋나 있고, 저장값이 틀어진 원인이기도 하다.

- [ ] **Step 1: 서버가 계산하도록 변경**

`src/app/api/leagues/[leagueId]/events/route.ts` 의 POST 에서 `points: body.points ?? 0` 을
서버 계산으로 바꾼다. 플러스원 판정은 삽입 대상 게임의 `plus_one_player_id` 와 선수의 `plus_one` 로 세운다:

```ts
  const scoringRules = await fetchScoringRules(supabase, leagueId)
  const { data: g } = await supabase
    .from('league_games').select('plus_one_player_id').eq('id', body.league_game_id).maybeSingle()
  const { data: pl } = await supabase
    .from('league_players').select('plus_one').eq('id', body.league_player_id).maybeSingle()
  const isPlusOne = g?.plus_one_player_id != null
    ? body.league_player_id === g.plus_one_player_id
    : Boolean(pl?.plus_one)
  const points = scorePoints(body.type, body.result, isPlusOne, scoringRules)
```

그리고 insert 의 `points: body.points ?? 0` 을 `points` 로 교체한다.
**클라이언트가 보낸 `body.points` 는 무시한다.**

- [ ] **Step 2: 클라이언트 계산 제거**

`src/components/league/LeagueEventInputPad.tsx` 에서 `function calcPoints(...)` 정의를 삭제하고,
`points: pts` / `points: isAndOne ? 1 : 0` 처럼 points 를 보내던 자리에서 해당 필드를 **제거**한다
(서버가 계산하므로 보낼 필요가 없다). `calcPoints` 호출로 만들던 지역 변수(`pts` 등)도 함께 정리한다.

- [ ] **Step 3: 잔존 확인**

Run: `grep -n "calcPoints\|points:" src/components/league/LeagueEventInputPad.tsx`

Expected: `calcPoints` 는 0건. `points:` 도 0건(전부 서버 계산으로 이관).

- [ ] **Step 4: 기록 동작 실증**

미라클 리그의 임의 게임에 플러스원 선수의 3점 성공 이벤트를 API 로 하나 넣고, 저장된 `points` 가 **4** 인지 확인한 뒤 삭제한다.

```bash
node scripts/db-migrate.mjs sql "SELECT id FROM league_games WHERE league_id=(SELECT id FROM leagues WHERE org_slug='miracle') LIMIT 1"
node scripts/db-migrate.mjs sql "SELECT id FROM league_players WHERE league_id=(SELECT id FROM leagues WHERE org_slug='miracle') AND plus_one LIMIT 1"
```

두 id 로 이벤트를 삽입한 뒤 `points` 를 확인하고 되돌린다. 결과를 리포트에 남긴다.

- [ ] **Step 5: 검증**

Run: `node scripts/verify-scoring.mjs && npx tsc --noEmit -p tsconfig.json && npm run build`

Expected: 전부 통과.

- [ ] **Step 6: 커밋**

```bash
git add "src/app/api/leagues/[leagueId]/events/route.ts" src/components/league/LeagueEventInputPad.tsx
git commit -m "fix(scoring): 득점을 클라이언트가 아니라 서버가 룰로 계산

지금까지는 기록 앱이 계산한 points 를 서버가 그대로 믿고 저장했다.
신뢰 경계가 어긋나 있었고, 저장값 6건이 룰과 어긋난 원인이기도 하다.

서버가 시즌 rules 로 계산하고 클라이언트가 보낸 points 는 무시한다."
```

---

### Task 7: 저장값 백필 + 어워즈 TS% 전환 + eFG% 제거

**Files:**
- Create: `supabase/migrations/079_backfill_event_points.sql`
- Modify: `src/lib/stats/leagueStats.ts` (`ts_pct` 추가)
- Modify: `src/types/league.ts` (`PlayerStat` 에 `ts_pct` 추가, `efg_pct` 제거)
- Modify: `src/app/api/leagues/[leagueId]/awards/route.ts` (EFFICIENCY 기준 교체)
- Modify: `src/app/league/[orgSlug]/[leagueId]/stats/page.tsx` (Basic 탭 eFG% 컬럼 제거)
- Modify: `scripts/verify-scoring.mjs` (백필 후 저장값 일치 어서션 추가)

**Interfaces:**
- Consumes: Task 1~6 의 전환 결과.
- Produces: `PlayerStat.ts_pct: number` — 어워즈와 슈팅 탭이 공유한다.

- [ ] **Step 1: 백필 마이그레이션 작성**

`supabase/migrations/079_backfill_event_points.sql` 생성:

```sql
-- =============================================
-- 079_backfill_event_points.sql
-- 저장된 event points 를 룰 계산값으로 교정
-- =============================================
-- 배경
--   득점 계산이 세 갈래로 갈라져 있었고(타입계산 / 저장값 / 저장값우선),
--   미라클 이벤트 3,253건 중 6건에서 저장값이 룰과 어긋났다.
--     · 구범준 shot_post·shot_layup 2건 — 저장 2, 룰 3 (플러스원 미반영)
--     · 변원식 ft_3pt_1 4건            — 저장 1, 룰 2 (3점파울 자유투 1구는 2점)
--   사용자 확인(2026-08-04): 저장값이 잘못됐고 룰이 정본이다.
--
--   단계 2 에서 읽기 경로를 전부 룰 계산으로 통일했으므로, 저장값도 맞춰 두어
--   'points 컬럼'이 두 번째 진실로 남지 않게 한다.
--
-- 미라클 시즌 총득점: 7,108 → 7,114
-- =============================================

UPDATE league_game_events e
   SET points = sub.correct_points
  FROM (
    SELECT ev.id,
           (r.event_points ->> ev.type)::int
             + CASE WHEN ev.is_p1 AND r.bonus_types ? ev.type THEN r.bonus_amount ELSE 0 END
             AS correct_points
      FROM (
        SELECT e2.id, e2.type, e2.result, g.league_id,
               ((g.plus_one_player_id IS NOT NULL AND e2.league_player_id = g.plus_one_player_id)
                OR (g.plus_one_player_id IS NULL AND p.plus_one)) AS is_p1
          FROM league_game_events e2
          JOIN league_games   g ON g.id = e2.league_game_id
          JOIN league_players p ON p.id = e2.league_player_id
         WHERE e2.result = 'made'
      ) ev
      JOIN (
        SELECT id AS league_id,
               rules -> 'event_points'                        AS event_points,
               (rules -> 'plus_one_bonus' ->> 'amount')::int   AS bonus_amount,
               rules -> 'plus_one_bonus' -> 'applies_to'       AS bonus_types
          FROM leagues
      ) r ON r.league_id = ev.league_id
     WHERE (r.event_points ->> ev.type) IS NOT NULL
  ) sub
 WHERE e.id = sub.id
   AND e.points IS DISTINCT FROM sub.correct_points;
```

- [ ] **Step 2: 백필 실행 전 대상 건수 확인**

Run:
```bash
node scripts/db-migrate.mjs sql "SELECT coalesce(sum(points),0)::int AS before_total FROM league_game_events e JOIN league_games g ON g.id=e.league_game_id WHERE e.result='made' AND g.league_id=(SELECT id FROM leagues WHERE org_slug='miracle')"
```

Expected: `before_total: 7108`

- [ ] **Step 3: 백필 실행**

Run: `node scripts/db-migrate.mjs up 079`

Expected: `▶ 079_backfill_event_points.sql ... 완료`

- [ ] **Step 4: 백필 결과 확인**

Run:
```bash
node scripts/db-migrate.mjs sql "SELECT coalesce(sum(points),0)::int AS after_total FROM league_game_events e JOIN league_games g ON g.id=e.league_game_id WHERE e.result='made' AND g.league_id=(SELECT id FROM leagues WHERE org_slug='miracle')"
```

Expected: `after_total: 7114`

7114 가 아니면 **멈추고 보고할 것.**

- [ ] **Step 5: 저장값 일치 어서션 추가**

`scripts/verify-scoring.mjs` 의 마지막 `console.log(failed === 0 ...)` 바로 위에 삽입:

```js
// ── 백필 이후: 저장값과 룰 계산이 일치해야 한다 ──────
const stored = await query(`
  SELECT coalesce(sum(e.points), 0)::int AS total
    FROM league_game_events e
    JOIN league_games g ON g.id = e.league_game_id
   WHERE e.result = 'made'
     AND g.league_id = (SELECT id FROM leagues WHERE org_slug = 'miracle')`)

check('저장된 points 합계 = 룰 계산 합계 (백필 완료)', () =>
  stored[0].total === total || `저장값 ${stored[0].total} ≠ 룰 계산 ${total}`)
```

- [ ] **Step 6: `ts_pct` 를 집계에 추가**

`src/lib/stats/leagueStats.ts` 의 결과 매핑(현재 `efg_pct:` 를 계산하는 블록)에 추가한다:

```ts
        // 진실야투율 — 자유투까지 포함한 득점 효율. 어워즈 효율왕과 슈팅 탭이 공유한다.
        ts_pct: (s.fga + 0.44 * s.fta) > 0
          ? +(s.pts / (2 * (s.fga + 0.44 * s.fta)) * 100).toFixed(1)
          : 0,
```

`src/types/league.ts` 의 `PlayerStat` 에 `ts_pct: number` 를 추가하고 `efg_pct: number` 를 **제거**한다.

- [ ] **Step 7: eFG% 잔재 제거**

`src/lib/stats/leagueStats.ts` 에서 `efg_pct:` 계산 줄을 삭제한다.
`src/app/league/[orgSlug]/[leagueId]/stats/page.tsx` 에서 Basic 탭 컬럼(`{ key: 'efg_pct', label: 'eFG%' }`),
`SortKey` 유니온의 `'efg_pct'`, `cellVal` 의 `efg_pct` 분기, 리그 평균 푸터의 `leagueEfgPct` 관련 코드,
`BASIC_FULL_LABELS` 의 `efg_pct` 항목, `seasonLeaders` 의 `'efg_pct'` 를 모두 제거한다.

`src/app/league/[orgSlug]/[leagueId]/teams/page.tsx` 에도 `efg_pct` 가 있다면 같이 제거한다.

- [ ] **Step 8: 어워즈 기준 교체**

`src/app/api/leagues/[leagueId]/awards/route.ts` 의 EFFICIENCY 블록을 교체한다.

교체 전:
```ts
      const cands = eligible.filter(p => p.fga > 0).map(p =>
        toCandidate(p, p.efg_pct, `${p.efg_pct.toFixed(1)}%`, {
```
교체 후:
```ts
      const cands = eligible.filter(p => p.fga > 0).map(p =>
        toCandidate(p, p.ts_pct, `${p.ts_pct.toFixed(1)}%`, {
```

같은 블록의 `metric: 'eFG%'` 를 `metric: 'TS%'` 로,
`description: '유효 야투율 최고 (3점 가중)'` 을 `description: '진실 야투율 최고 (자유투 포함)'` 으로 바꾼다.
파일 상단 주석의 `EFFICIENCY — 야투효율왕 (eFG%)` 도 `(TS%)` 로 고친다.

- [ ] **Step 9: 수상자가 안 바뀌는지 확인**

Run:
```bash
node scripts/db-migrate.mjs sql "SELECT p.name, round((count(*) filter (where e.type in ('shot_3p','shot_2p_mid','shot_layup','shot_post') and e.result='made') + 0.5*count(*) filter (where e.type='shot_3p' and e.result='made'))::numeric/nullif(count(*) filter (where e.type in ('shot_3p','shot_2p_mid','shot_layup','shot_post')),0)*100,1) AS efg, round(coalesce(sum(e.points) filter (where e.result='made'),0)::numeric/nullif(2*(count(*) filter (where e.type in ('shot_3p','shot_2p_mid','shot_layup','shot_post')) + 0.44*count(*) filter (where e.type in ('ft_2pt','ft_3pt_1','ft_3pt_2','free_throw'))),0)*100,1) AS ts FROM league_players p JOIN league_game_events e ON e.league_player_id=p.id JOIN league_games g ON g.id=e.league_game_id WHERE p.league_id=(SELECT id FROM leagues WHERE org_slug='miracle') GROUP BY p.name HAVING count(distinct g.date) >= 32 ORDER BY ts DESC LIMIT 5"
```

Expected: eFG% 내림차순과 TS% 내림차순의 선수 순서가 동일해야 한다(2026-08-04 실측에서 상위 8명 순위가 완전히 일치했다).
순서가 달라지면 **멈추고 보고할 것** — 수상자가 바뀐다는 뜻이므로 사용자 판단이 필요하다.

- [ ] **Step 10: 검증**

Run: `node scripts/verify-scoring.mjs && node scripts/verify-schema.mjs && npx tsc --noEmit -p tsconfig.json && npm run build`

Expected: 두 검증 스크립트 모두 `전부 통과`, 타입 오류 없음, `✓ Compiled successfully`

⚠️ `verify-schema.mjs` 의 득점 합계 어서션이 **7108 로 고정**되어 있다. 백필로 7114 가 되므로 이 어서션이 실패한다.
해당 어서션의 기대값을 **7114** 로 갱신하고, 주석에 "단계 2 백필(079)로 6점 증가 — 저장값 오류 교정" 이라고 이유를 남긴다.

- [ ] **Step 11: 커밋**

```bash
git add supabase/migrations/079_backfill_event_points.sql scripts/verify-scoring.mjs scripts/verify-schema.mjs src/lib/stats/leagueStats.ts src/types/league.ts "src/app/api/leagues/[leagueId]/awards/route.ts" "src/app/league/[orgSlug]/[leagueId]/stats/page.tsx"
git commit -m "feat(scoring): 저장값 백필 + 어워즈 TS% 전환 + eFG% 제거

- 079: 저장된 points 6건을 룰 계산값으로 교정 (미라클 7108 → 7114)
  구범준 플러스원 2건 · 변원식 ft_3pt_1 4건. 저장값이 틀렸고 룰이 정본.
- PlayerStat 에 ts_pct 추가, efg_pct 제거
- 어워즈 효율왕 기준 eFG% → TS% (자유투까지 반영해 더 완전한 지표)
  상위 8명 실측에서 두 지표 순위가 동일해 수상자는 바뀌지 않는다.
- Basic 탭의 eFG% 컬럼 제거 — 슈팅 탭에서 이미 뺐던 것과 기준을 맞춘다
- verify-schema 의 득점 합계 기대값을 7114 로 갱신"
```

---

## 완료 후 상태

- 리그 계열의 득점 계산이 `src/lib/stats/scoring.ts` **한 곳**에만 존재한다.
- 시즌마다 `leagues.rules` 로 득점 룰이 갈린다. 새 동호회는 표준 룰로 자동 동작한다.
- 저장값과 표시값이 일치한다(미라클 7,114점).
- 기록 시 서버가 룰로 계산하므로 앞으로 어긋날 수 없다.

## 이번 범위에서 제외한 것 (의도적)

- **레거시(파란날개) 계열** — `calculator.ts` · `api/players/[id]/stats` · `GameBoxScoreModal` · `api/events` · `api/dashboard` · `api/stats/season`. 단계 5에서 트리째 제거된다. 지금 전환하면 버릴 코드를 고치는 셈이다.
- **`scripts/diagnose-*.mjs`** — 개발자 진단 도구. 프로덕션 경로가 아니다.
- **`scripts/2025-import/import-2025.mjs`** — 저장된 `points` 를 그대로 쓰는데, 그게 임포터의 정확한 동작이다(원본 박스스코어와 대조하는 구조). 2025 적재를 실제로 할 때 룰 적용 여부를 별도 판단한다.
- **어워즈·클러치·플레이맵의 기준값**(출석 60% · 클러치 3경기/120초/6점차 · 플레이맵 10회) — 전 동호회 공통으로 유지하기로 확정. `rules.qualification` 자리는 이미 있으므로 요청이 오면 그때 한 줄 추가한다.
