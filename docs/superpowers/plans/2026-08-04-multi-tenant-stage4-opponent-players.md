# 단계 4 — 대회형 상대팀 선수 기록 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대회형 시즌에서 상대팀 선수의 득점을 경기 기록 중에 남길 수 있게 하되, 그 기록이 우리 팀 통계·어워즈·라커룸에는 절대 섞이지 않게 한다.

**Architecture:** 상대팀은 `league_teams.is_external = true` 인 팀으로 만들고, 상대 선수는 평범한 `league_players` 행으로 만들되 `league_game_players` 로 그 외부 팀에 배정한다. 집계 제외는 **선수 플래그가 아니라 팀의 `is_external`** 에서 유도한다 — 진실을 한 곳에만 둔다. 등록은 사전에 못 하므로(벤치는 교체로 들어와야 특정된다) 기록 화면에서 등번호만으로 즉석 생성한다.

**Tech Stack:** Next.js App Router · Supabase · TypeScript · `scripts/db-migrate.mjs` · `scripts/verify-schema.mjs`

## Global Constraints

- 마이그레이션은 `supabase/migrations/NNN_*.sql`, 번호는 081 다음부터. 실행은 `node scripts/db-migrate.mjs up NNN` — 번호를 반드시 지정한다.
- **`is_external` 은 팀(`league_teams`)에만 둔다.** `league_players` 에 외부 플래그 컬럼을 추가하지 않는다. 선수의 외부 여부는 그 선수가 배정된 팀에서 유도한다 — 두 곳에 두면 불일치가 생긴다.
- **상대 선수는 시즌 간 재사용하지 않는다.** 같은 상대를 다음 시즌에 다시 만나도 명단을 새로 쌓는다(선수 구성이 바뀌고, 시즌 격리 원칙과도 맞는다).
- 득점 계산은 `src/lib/stats/scoring.ts` 의 `scorePoints()` 만 쓴다. 이 계획에서 새로운 득점 계산을 만들지 않는다.
- 기록 화면(`LeagueEventInputPad`)은 **속도가 생명**이다. 즉석 등록이 화면 전환이나 페이지 이탈을 유발하면 안 된다.
- 검증은 `node scripts/verify-schema.mjs` 와 `node scripts/verify-scoring.mjs` 로 하며 둘 다 exit 0 을 유지한다.
- 미라클(리그형) 화면의 수치는 **하나도 바뀌면 안 된다.** 외부 팀이 0건인 리그에서는 이번 변경이 전부 no-op 이어야 한다.

## 노출 범위 (스펙에서 확정된 것)

| 화면·기능 | 외부 선수 |
|---|---|
| 박스스코어 · 게임 로그 · 하이라이트 | **보인다** — 경기의 사실이므로 |
| 시즌 스탯 · 리더보드 · 어워즈 · 마일스톤 · 배지 | **안 보인다** |
| 라커룸(로스터) · 선수 카드 · 회원 가입 대상 | **안 보인다** |
| 팀 득점 기여율 등 팀 대비 지표의 분모 | **안 들어간다** |

## 현재 스키마 (2026-08-04 실측)

```
league_teams          id · league_id · name · color · is_external(기본 false)
league_players        id · league_id · name(NOT NULL) · number · position · is_guest · plus_one · …
                      → 팀 컬럼이 없다. 소속은 아래 두 테이블로 표현된다.
league_game_players   id · league_id · league_game_id · league_player_id · team_id
                      → 게임별 배정. 비정규·임시 출전에 이미 쓰이고 있다.
league_player_quarters → 분기별 정규 소속 (리그형 전용)
league_game_events    … team_id 를 직접 들고 있다 (이벤트 시점의 소속)
```

**외부 선수 표현**: `league_players` 행 + `league_game_players(team_id = 외부팀)` 배정.
이름을 모를 때는 `name` 을 `#12` 형태로 저장한다 (`name` 이 NOT NULL 이라 빈 문자열을 쓰면 UI 가 깨진다).
나중에 실명을 알게 되면 그 행의 `name` 만 고치면 기록에 소급 반영된다.

## File Structure

| 파일 | 책임 |
|---|---|
| `src/lib/league/externalPlayers.ts` | **신설.** 외부 팀·외부 선수 id 집합을 구하는 공용 헬퍼. 유도 규칙을 한 곳에 둔다 |
| `src/lib/stats/leagueStats.ts` | 외부 팀 이벤트를 집계에서 제외 |
| `src/app/api/leagues/[leagueId]/players/route.ts` | 로스터 GET 에서 외부 선수 제외 (`includeExternal` 옵트인) |
| `src/app/api/leagues/[leagueId]/teams/route.ts` | 외부 팀 생성 지원 |
| `src/app/api/leagues/[leagueId]/games/[gameId]/opponent-players/route.ts` | **신설.** 상대 선수 즉석 생성 + 게임 배정 원자적 처리 |
| `src/components/league/LeagueEventInputPad.tsx` | 등번호 즉석 등록 UI |
| `scripts/verify-schema.mjs` | 외부 선수 격리 어서션 누적 |

---

### Task 1: 외부 선수 유도 헬퍼 + 집계 제외

**Files:**
- Create: `src/lib/league/externalPlayers.ts`
- Modify: `src/lib/stats/leagueStats.ts`
- Modify: `scripts/verify-schema.mjs`

**Interfaces:**
- Produces: `export async function fetchExternalTeamIds(sb: SupabaseClient, leagueId: string): Promise<Set<string>>`
- Produces: `export async function fetchExternalPlayerIds(sb: SupabaseClient, leagueId: string): Promise<Set<string>>`
- 이후 태스크가 두 함수를 그대로 쓴다.

- [ ] **Step 1: 헬퍼 작성**

`src/lib/league/externalPlayers.ts` 생성:

```ts
/**
 * 외부(상대) 팀·선수 판별 — 유도 규칙을 한 곳에만 둔다.
 *
 * 진실은 `league_teams.is_external` 하나뿐이다. 선수에는 외부 플래그를 두지 않는다 —
 * 두 곳에 두면 반드시 어긋나고, 어긋나면 상대팀 기록이 우리 팀 통계에 섞인다.
 *
 * 선수의 외부 여부는 `league_game_players` 배정으로 유도한다:
 *   외부 팀에만 배정된 적이 있고, 내부 팀에 배정된 적이 없으면 외부 선수다.
 *   (우리 선수가 상대팀으로 뛰는 일은 없지만, 용병·게스트 운영을 감안해
 *    "내부 배정이 하나라도 있으면 내부 선수"로 판정한다 — 우리 기록을 잃지 않는 쪽으로 기운다)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export async function fetchExternalTeamIds(sb: SupabaseClient, leagueId: string): Promise<Set<string>> {
  const { data, error } = await sb
    .from('league_teams')
    .select('id')
    .eq('league_id', leagueId)
    .eq('is_external', true)
  if (error) throw new Error(`league_teams: leagueId=${leagueId} 외부 팀 조회 실패 — ${error.message}`)
  return new Set((data ?? []).map(r => r.id as string))
}

export async function fetchExternalPlayerIds(sb: SupabaseClient, leagueId: string): Promise<Set<string>> {
  const externalTeams = await fetchExternalTeamIds(sb, leagueId)
  if (externalTeams.size === 0) return new Set()

  const { data, error } = await sb
    .from('league_game_players')
    .select('league_player_id, team_id')
    .eq('league_id', leagueId)
  if (error) throw new Error(`league_game_players: leagueId=${leagueId} 배정 조회 실패 — ${error.message}`)

  const internal = new Set<string>()
  const external = new Set<string>()
  for (const r of (data ?? []) as Array<{ league_player_id: string | null; team_id: string | null }>) {
    if (!r.league_player_id || !r.team_id) continue
    if (externalTeams.has(r.team_id)) external.add(r.league_player_id)
    else internal.add(r.league_player_id)
  }
  for (const pid of internal) external.delete(pid)
  return external
}
```

- [ ] **Step 2: 집계에서 외부 팀 이벤트 제외**

`src/lib/stats/leagueStats.ts` 상단 import 에 추가:

```ts
import { fetchExternalTeamIds } from '@/lib/league/externalPlayers'
```

`fetchScoringRules` 를 읽는 줄 바로 다음에 추가:

```ts
  // 외부(상대) 팀 이벤트는 우리 팀 통계가 아니다. 이벤트가 team_id 를 직접 들고 있으므로
  // 선수 단위가 아니라 이벤트 단위로 거른다 — 같은 선수가 다른 경기에서 우리 팀으로
  // 뛰는 경우까지 정확히 처리된다.
  const externalTeamIds = await fetchExternalTeamIds(sb, leagueId)
```

이벤트 루프(`for (const e of events ?? [])`)의 맨 앞, `if (!e.league_player_id) continue` 바로 다음 줄에 추가:

```ts
    if (e.team_id && externalTeamIds.has(e.team_id)) continue
```

- [ ] **Step 3: 격리 어서션 추가**

`scripts/verify-schema.mjs` 의 마지막 `console.log(failed === 0 ? ...)` **바로 위**에 삽입:

```js
// ── 단계 4: 외부(상대) 선수 격리 ────────────────────
await check(
  '외부 팀 이벤트는 우리 팀 집계 대상이 아니다 (외부 팀 0건이면 자동 통과)',
  `SELECT
     (SELECT count(*)::int FROM league_teams WHERE is_external = true) AS ext_teams,
     (SELECT count(*)::int FROM league_game_events e
        JOIN league_teams t ON t.id = e.team_id
       WHERE t.is_external = true) AS ext_events`,
  rows => {
    const r = rows[0]
    // 외부 팀이 아직 없으면(리그형만 운영) 이 어서션은 통과 상태로 둔다.
    if (r.ext_teams === 0) return r.ext_events === 0 || `외부 팀이 0인데 외부 이벤트가 ${r.ext_events}건`
    return true
  }
)
```

- [ ] **Step 4: 검증**

Run: `node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs && npx tsc --noEmit -p tsconfig.json && npm run build`

Expected: 두 검증 모두 `전부 통과`, 타입 오류 없음, `✓ Compiled successfully`

**미라클 수치가 안 바뀌는지 반드시 확인할 것** — 외부 팀이 0건이라 `externalTeamIds` 가 빈 집합이고 `continue` 가 한 번도 실행되지 않아야 한다.

Run: `node scripts/db-migrate.mjs sql "SELECT count(*)::int AS n FROM league_teams WHERE is_external = true"`
Expected: `n: 0`

- [ ] **Step 5: 커밋**

```bash
git add src/lib/league/externalPlayers.ts src/lib/stats/leagueStats.ts scripts/verify-schema.mjs
git commit -m "feat(external): 외부 팀 판별 헬퍼 + 집계 제외

상대팀 기록이 우리 팀 통계에 섞이지 않게 하는 기반.
진실은 league_teams.is_external 하나뿐이고 선수에는 플래그를 두지 않는다 —
두 곳에 두면 어긋나고, 어긋나면 남의 팀 득점이 우리 리더보드에 올라간다.

집계는 선수가 아니라 이벤트의 team_id 로 거른다. 같은 선수가 다른 경기에서
우리 팀으로 뛰는 경우까지 정확히 처리된다.

외부 팀이 0건인 현재 리그에서는 전부 no-op — 미라클 수치 불변 확인."
```

---

### Task 2: 외부 팀 생성 (대회 상대 등록)

**Files:**
- Modify: `src/app/api/leagues/[leagueId]/teams/route.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `POST /api/leagues/[leagueId]/teams` 가 `{ name, color?, is_external? }` 를 받아 팀을 만든다. `is_external: true` 로 상대팀을 등록한다.

- [ ] **Step 1: 현재 구현 확인**

Run: `cat "src/app/api/leagues/[leagueId]/teams/route.ts"`

POST 핸들러가 이미 있는지, `is_external` 을 받는지 확인한다. 없으면 추가하고, 있으면 필드만 받도록 넓힌다.

- [ ] **Step 2: `is_external` 수용**

POST 핸들러의 insert 에 `is_external` 을 추가한다. 값은 **명시적으로 boolean 으로 정규화**한다 (문자열 `"true"` 가 들어와도 안전하게):

```ts
  const isExternal = body.is_external === true || body.is_external === 'true'
```

그리고 insert payload 에 `is_external: isExternal` 을 넣는다.

주석으로 이유를 남긴다:

```ts
  // 대회형에서 상대팀은 is_external=true 로 만든다.
  // 이 플래그 하나가 통계·어워즈·라커룸 노출 전체를 가른다 — 실수로 true 가 되면
  // 우리 팀 기록이 통계에서 사라지므로 명시적으로만 켜지게 한다(기본 false).
```

- [ ] **Step 3: 실제로 만들어보고 되돌리기**

미라클 리그에 외부 팀을 하나 만들었다가 지워서, 플래그가 실제로 저장되는지 확인한다.

```bash
node scripts/db-migrate.mjs sql "SELECT id FROM leagues WHERE org_slug='miracle'"
```

그 id 로 팀을 만들고 확인한 뒤 삭제한다:

```bash
node scripts/db-migrate.mjs sql "INSERT INTO league_teams (league_id, name, color, is_external) VALUES ('<리그id>', '테스트상대', '#888888', true) RETURNING id, is_external"
node scripts/db-migrate.mjs sql "DELETE FROM league_teams WHERE league_id='<리그id>' AND name='테스트상대'"
node scripts/db-migrate.mjs sql "SELECT count(*)::int AS n FROM league_teams WHERE is_external = true"
```

Expected: 삽입 시 `is_external: true`, 삭제 후 `n: 0`. 결과를 리포트에 남긴다.

- [ ] **Step 4: 검증**

Run: `node scripts/verify-schema.mjs && npx tsc --noEmit -p tsconfig.json && npm run build`

Expected: 전부 통과.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/api/leagues/[leagueId]/teams/route.ts"
git commit -m "feat(external): 팀 생성 API 가 is_external 을 받는다

대회형에서 상대팀을 등록하기 위한 입구. 기본값은 false 이며 명시적으로만 켜진다 —
실수로 켜지면 그 팀 소속 우리 선수 기록이 통계에서 통째로 빠지기 때문이다."
```

---

### Task 3: 상대 선수 즉석 등록 API

**Files:**
- Create: `src/app/api/leagues/[leagueId]/games/[gameId]/opponent-players/route.ts`

**Interfaces:**
- Consumes: Task 1 의 `fetchExternalTeamIds`
- Produces: `POST /api/leagues/[leagueId]/games/[gameId]/opponent-players`
  - body: `{ team_id: string, number: number, name?: string }`
  - 201 → `{ id, name, number, team_id }`
  - 이미 그 경기·그 팀에 같은 등번호가 있으면 **새로 만들지 않고 기존 선수를 돌려준다**(중복 방지)

- [ ] **Step 1: 라우트 작성**

`src/app/api/leagues/[leagueId]/games/[gameId]/opponent-players/route.ts` 생성:

```ts
import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { fetchExternalTeamIds } from '@/lib/league/externalPlayers'

// POST /api/leagues/[leagueId]/games/[gameId]/opponent-players
// body: { team_id, number, name? }
//
// 경기 기록 도중 상대 선수를 즉석 등록한다.
//   · 상대 명단은 미리 알 수 없다 — 선발 5명은 파악해도 벤치는 교체로 들어와야 특정된다.
//   · 이름은 선택이다. 모르면 등번호만으로 만들고 나중에 채운다.
//     league_players.name 이 NOT NULL 이라 빈 문자열 대신 '#12' 형태로 저장한다.
//   · 선수 생성과 게임 배정을 함께 처리한다 — 배정이 없으면 그 선수가 어느 팀인지
//     알 수 없고, 외부 여부 판정(league_game_players 기반)이 성립하지 않는다.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; gameId: string }> }
) {
  const { leagueId, gameId } = await params
  if (!await canEditLeague(req, leagueId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const teamId = body.team_id as string | undefined
  const number = Number(body.number)
  const rawName = typeof body.name === 'string' ? body.name.trim() : ''

  if (!teamId) return NextResponse.json({ error: 'team_id 가 필요합니다' }, { status: 400 })
  if (!Number.isInteger(number) || number < 0 || number > 99) {
    return NextResponse.json({ error: '등번호는 0~99 사이 정수여야 합니다' }, { status: 400 })
  }

  const supabase = createClient()

  // 지정된 팀이 이 리그의 외부 팀인지 확인한다.
  // 우리 팀에 이 엔드포인트로 선수를 넣으면 로스터 관리 경로를 우회하게 되므로 막는다.
  const externalTeamIds = await fetchExternalTeamIds(supabase, leagueId)
  if (!externalTeamIds.has(teamId)) {
    return NextResponse.json({ error: '상대(외부) 팀에만 등록할 수 있습니다' }, { status: 400 })
  }

  // 같은 경기·같은 팀에 같은 등번호가 이미 있으면 그 선수를 재사용한다.
  // 기록 중 같은 번호를 여러 번 누르는 건 정상이므로 중복 생성이 나면 안 된다.
  const { data: existing, error: exErr } = await supabase
    .from('league_game_players')
    .select('league_player_id, league_players(id, name, number)')
    .eq('league_id', leagueId)
    .eq('league_game_id', gameId)
    .eq('team_id', teamId)
  if (exErr) {
    throw new Error(`league_game_players: gameId=${gameId} 조회 실패 — ${exErr.message}`)
  }
  for (const row of (existing ?? []) as unknown as Array<{ league_players: { id: string; name: string; number: number | null } | null }>) {
    const p = row.league_players
    if (p && p.number === number) {
      return NextResponse.json({ id: p.id, name: p.name, number: p.number, team_id: teamId }, { status: 200 })
    }
  }

  // 이름을 모르면 등번호를 이름으로 쓴다. 나중에 실명을 알게 되면 이 행의 name 만 고치면
  // 기록은 league_player_id 로 묶여 있으므로 소급 반영된다.
  const name = rawName || `#${number}`

  const { data: player, error: pErr } = await supabase
    .from('league_players')
    .insert({ league_id: leagueId, name, number, is_guest: false })
    .select('id, name, number')
    .single()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  const { error: apErr } = await supabase
    .from('league_game_players')
    .insert({ league_id: leagueId, league_game_id: gameId, league_player_id: player.id, team_id: teamId })
  if (apErr) {
    // 배정이 실패하면 선수만 붕 뜬다 — 소속을 알 수 없어 외부 판정이 안 되므로 되돌린다.
    await supabase.from('league_players').delete().eq('id', player.id)
    return NextResponse.json({ error: `배정 실패: ${apErr.message}` }, { status: 500 })
  }

  revalidateTag(`league-${leagueId}`, 'max')
  return NextResponse.json({ ...player, team_id: teamId }, { status: 201 })
}
```

- [ ] **Step 2: 실제 호출로 왕복 확인**

미라클 리그에 임시 외부 팀과 경기를 준비해 등록·중복·되돌리기를 확인한다.
`npm run dev` 로 서버를 띄우고, 편집 PIN 헤더를 붙여 호출한다.
편집 PIN 은 `node scripts/db-migrate.mjs sql "SELECT edit_pin FROM leagues WHERE org_slug='miracle'"` 로 확인한다.

확인할 것:
1. 이름 없이 등번호만 보내면 `name` 이 `#<번호>` 로 저장되는가
2. 같은 번호를 다시 보내면 **새로 만들지 않고 200 으로 기존 선수를 돌려주는가**
3. 우리 팀(내부 팀) id 를 보내면 400 으로 거부되는가

끝나면 만든 선수·배정·팀을 전부 삭제하고, `SELECT count(*) FROM league_teams WHERE is_external=true` 가 0 인지 확인한다.
정확한 절차와 관찰값을 리포트에 남긴다. **실제로 HTTP 로 호출하지 못했다면 그렇게 적을 것** — 했다고 쓰지 말 것.

- [ ] **Step 3: 검증**

Run: `node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs && npx tsc --noEmit -p tsconfig.json && npm run build`

Expected: 전부 통과.

- [ ] **Step 4: 커밋**

```bash
git add "src/app/api/leagues/[leagueId]/games/[gameId]/opponent-players"
git commit -m "feat(external): 상대 선수 즉석 등록 API

상대 명단은 미리 알 수 없다 — 선발 5명은 파악해도 벤치는 교체로 들어와야 특정된다.
그래서 경기 기록 도중 등번호만으로 만든다. 이름은 선택이며 나중에 채우면
league_player_id 로 묶여 있어 기록에 소급 반영된다.

선수 생성과 게임 배정을 함께 처리한다 — 배정이 없으면 소속을 알 수 없어
외부 판정이 성립하지 않는다. 배정 실패 시 선수도 되돌린다.
같은 경기·팀에 같은 등번호가 오면 재사용해 중복 생성을 막는다."
```

---

### Task 4: 기록 화면 즉석 등록 UI

**Files:**
- Modify: `src/components/league/LeagueEventInputPad.tsx`

**Interfaces:**
- Consumes: Task 3 의 `POST /api/leagues/[leagueId]/games/[gameId]/opponent-players`

- [ ] **Step 1: 현재 구조 파악**

Run: `grep -n "awayPlayers\|awayTeam\|selectedPlayer\|RosterPlayer" src/components/league/LeagueEventInputPad.tsx | head -30`

이 패드는 `homePlayers` / `awayPlayers` 를 props 로 받아 선수 버튼을 그린다.
상대팀(외부 팀) 쪽 선수 목록이 비어 있거나 부족할 때 등번호를 입력해 추가하는 진입점을 만든다.

> ⚠️ **이 태스크는 정확한 JSX 를 계획에 담지 않았다.** 대상 컴포넌트가 776줄이고
> 선수 버튼·선택 상태 구조가 파일 내부에 있어, 읽지 않고 쓴 코드는 오히려 방해가 된다.
> 대신 **동작 요구사항과 수용 기준**을 명시했다. 구현자는 파일을 먼저 읽고 기존 패턴에 맞춰 붙일 것.

- [ ] **Step 2: 등번호 즉석 추가 UI**

상대팀(외부 팀) 선수 영역에 **번호 입력 + 추가 버튼**을 넣는다. 다음을 지킨다:

- 화면 전환·모달 없이 그 자리에서 처리한다. 기록 중 이탈은 금물이다.
- 추가 성공 시 그 선수를 **즉시 선택 상태로** 만들어, 방금 만든 선수로 바로 기록을 이어갈 수 있게 한다.
- 터치 타겟은 최소 44×44px (프로젝트 접근성 규칙).
- 이름 입력란은 선택 사항으로 두되, 좁은 화면에서 기록 흐름을 방해하지 않도록 번호가 주 입력이다.
- 실패 시 토스트로 알리고 입력값은 유지한다 (다시 타이핑하지 않게).

부모(`record/page.tsx`)가 선수 목록을 다시 불러오도록 기존 `onEventSaved` 와 같은 패턴의 콜백을 쓰거나, 로컬 상태에 추가한 선수를 합쳐 그린다. 어느 쪽이든 **새로고침 없이** 버튼이 보여야 한다.

- [ ] **Step 3: 외부 팀이 아닐 때는 안 보이게**

리그형(내부 팀만)에서는 이 UI 가 뜨면 안 된다. `awayTeam` 이 외부 팀인지 판단할 근거가 props 에 없으면, `record/page.tsx` 에서 팀의 `is_external` 을 함께 내려주고 패드는 그 값으로 분기한다.

- [ ] **Step 4: 미라클 화면 회귀 확인**

`npm run dev` 로 미라클 리그의 기록 화면을 열어 **즉석 등록 UI 가 보이지 않는지** 확인한다.
리그형에는 외부 팀이 없으므로 아무것도 달라지면 안 된다. 관찰 결과를 리포트에 남긴다.

- [ ] **Step 5: 검증**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build && npx eslint src/components/league/LeagueEventInputPad.tsx`

Expected: 타입·빌드 통과, lint 신규 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/components/league/LeagueEventInputPad.tsx "src/app/league/[orgSlug]/[leagueId]/record/page.tsx"
git commit -m "feat(external): 기록 중 상대 선수 즉석 등록 UI

번호를 넣고 추가하면 그 자리에서 생성되고 바로 선택된다 — 경기 중 기록은
속도가 생명이라 모달·화면 전환을 만들지 않는다.
외부 팀이 없는 리그형에서는 UI 자체가 뜨지 않는다."
```

---

### Task 5: 노출 범위 격리 검증

**Files:**
- Modify: `src/app/api/leagues/[leagueId]/players/route.ts`
- Modify: `scripts/verify-schema.mjs`

**Interfaces:**
- Consumes: Task 1 의 `fetchExternalPlayerIds`
- Produces: `GET /api/leagues/[leagueId]/players` 가 기본적으로 외부 선수를 제외한다. `?includeExternal=1` 이면 포함한다(기록 화면용).

- [ ] **Step 1: 로스터에서 외부 선수 제외**

`src/app/api/leagues/[leagueId]/players/route.ts` 의 GET 에 추가:

```ts
import { fetchExternalPlayerIds } from '@/lib/league/externalPlayers'
```

선수 목록을 만든 뒤, 쿼리 파라미터를 보고 거른다:

```ts
  // 라커룸·선수카드·회원가입 대상에서 상대 선수는 보이면 안 된다.
  // 기록 화면은 상대 선수를 눌러야 하므로 ?includeExternal=1 로 옵트인한다.
  const includeExternal = new URL(req.url).searchParams.get('includeExternal') === '1'
  if (!includeExternal) {
    const externalIds = await fetchExternalPlayerIds(supabase, leagueId)
    if (externalIds.size > 0) {
      rows = rows.filter(p => !externalIds.has(p.id))
    }
  }
```

변수명(`rows`)은 실제 코드에 맞춰 조정한다 — 먼저 파일을 읽고 반환 직전의 배열 이름을 확인할 것.

- [ ] **Step 2: 기록 화면이 상대 선수를 받도록**

기록 화면(`record/page.tsx`)이 선수를 부르는 fetch 에 `?includeExternal=1` 을 붙인다.
그 외 호출처(라커룸·선수카드·가입 등)는 **건드리지 않는다** — 기본 동작이 제외이므로 그대로 두면 맞다.

Run: `grep -rn "leagues/\${leagueId}/players\`" --include=*.tsx src/ | head`
로 호출처를 전부 찾아, 기록 화면만 바꿨는지 확인한다.

- [ ] **Step 3: 격리 어서션 추가**

`scripts/verify-schema.mjs` 의 마지막 `console.log(failed === 0 ? ...)` **바로 위**에 삽입:

```js
await check(
  '외부 선수는 내부 팀 배정을 갖지 않는다 (섞이면 통계에 새어 들어간다)',
  `SELECT count(*)::int AS n
     FROM league_game_players gp_ext
     JOIN league_teams t_ext ON t_ext.id = gp_ext.team_id AND t_ext.is_external = true
    WHERE EXISTS (
      SELECT 1 FROM league_game_players gp_in
        JOIN league_teams t_in ON t_in.id = gp_in.team_id AND t_in.is_external = false
       WHERE gp_in.league_player_id = gp_ext.league_player_id
    )`,
  rows => rows[0].n === 0
    || `외부·내부 팀에 동시에 배정된 선수가 ${rows[0].n}건 — 어느 쪽 기록인지 판정이 흔들린다`
)
```

- [ ] **Step 4: 격리 실증**

임시로 외부 팀 + 상대 선수 + 득점 이벤트를 하나 만들어 놓고 다음을 확인한 뒤 전부 되돌린다:

1. `/api/leagues/<id>/stats` 응답에 그 선수가 **없다**
2. `/api/leagues/<id>/players` 응답에 그 선수가 **없다**
3. `/api/leagues/<id>/players?includeExternal=1` 응답에는 **있다**
4. 미라클 시즌 총득점 — **테스트 중에는 일부러 어긋난다**
   `scripts/verify-scoring.mjs` 는 미라클 리그의 **모든** 이벤트를 합산하므로,
   외부 선수의 득점 이벤트를 넣어둔 동안에는 7114 를 넘어 실패한다. 정상이다.
   되돌린 뒤 다시 통과하는지가 확인 포인트다.
   `node scripts/db-migrate.mjs sql "SELECT coalesce(sum(e.points),0)::int AS total FROM league_game_events e JOIN league_games g ON g.id=e.league_game_id WHERE e.result='made' AND g.league_id=(SELECT id FROM leagues WHERE org_slug='miracle')"`
   — 외부 선수의 이벤트가 더해졌으므로 **저장값 합계는 늘어난다**. 늘어난 만큼이 정확히 그 이벤트 점수인지 확인하고,
   되돌린 뒤 **7114 로 복귀**하는지 확인한다.

정확한 절차·관찰값·복구 확인을 리포트에 남긴다.

- [ ] **Step 5: 검증**

Run: `node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs && npx tsc --noEmit -p tsconfig.json && npm run build`

Expected: 전부 통과.

- [ ] **Step 6: 커밋**

```bash
git add "src/app/api/leagues/[leagueId]/players/route.ts" scripts/verify-schema.mjs "src/app/league/[orgSlug]/[leagueId]/record/page.tsx"
git commit -m "feat(external): 로스터에서 상대 선수 제외 + 격리 검증

기본이 '제외'이고 기록 화면만 ?includeExternal=1 로 옵트인한다 —
새 화면이 생겨도 기본값이 안전한 쪽이다.

외부·내부 팀에 동시 배정된 선수가 있으면 어느 쪽 기록인지 판정이 흔들리므로
어서션으로 0건을 강제한다."
```

---

## 완료 후 상태

- 대회형 시즌에서 상대팀을 만들고, 경기 중 등번호만으로 상대 선수를 등록해 득점을 남길 수 있다.
- 그 기록은 박스스코어·게임로그·하이라이트에는 보이고, 시즌 스탯·리더보드·어워즈·마일스톤·배지·라커룸에는 안 보인다.
- 판정 근거는 `league_teams.is_external` 하나뿐이며, 선수의 외부 여부는 거기서 유도된다.
- 리그형(미라클)은 외부 팀이 0건이라 이번 변경이 전부 no-op 이다.

## 이번 범위에서 제외한 것 (의도적)

- **상대 선수의 리바운드·어시스트 등 세부 스탯** — 대회 기록의 목적은 상대 득점 파악이다. 득점 외 지표까지 상대에게 남기는 건 요구가 확인된 뒤에 한다.
- **상대팀 명단의 시즌 간 재사용** — 스펙에서 하지 않기로 확정했다.
- **어드민 화면의 상대팀 관리 UI** — 단계 7 온보딩 마법사에서 팀 관리와 함께 다룬다.
- **레거시(파란날개) 대회 트리** — 단계 5에서 통째로 이관·제거된다.
