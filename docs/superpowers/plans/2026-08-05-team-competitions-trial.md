# 팀 단위 경기묶음 통합 — 미라클 시험 적용 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 팀이 내부 리그와 외부 대회를 **함께** 운영할 수 있게 만들고, 미라클에 대회를 하나 붙여 실제로 굴려 본다.

**Architecture:** 새 테이블을 만들지 않는다 — `leagues` 는 이미 "경기묶음(competition)" 이고 `mode` 로 성격이 갈리며, `UNIQUE (team_id, season_year, slug)` 라 한 팀이 같은 해에 여러 묶음을 가질 수 있다. 설계는 075 에 이미 들어가 있고 쓰이지 않았을 뿐이다. **그릇(팀·명단·선수 정체성)은 공유하고, 보여주는 방식은 갈린다** — 지난 실패는 화면을 하나로 합쳐 대회를 리그처럼 굴린 것이었다. 스탯은 `league_id` 로 이미 격리되므로 "기본 분리" 는 공짜로 얻고, "커리어 합산" 만 새로 만든다.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Tailwind + `mm-*` 토큰.

## Global Constraints

- **파란날개(레거시 트리)는 이 계획의 어느 단계에서도 건드리지 않는다.** `/[org]/[team]/*` 와 `teams`·`tournaments`·`games`·`game_events`·`players` 테이블은 읽지도 쓰지도 않는다. 시험은 미라클에서만 한다.
- **미라클의 기존 리그 시즌은 화면·숫자 모두 그대로여야 한다.** 새 경기묶음이 생겨도 `/league/miracle/2026` 은 지금과 동일하게 동작한다.
- 검증: `node scripts/verify-schema.mjs` · `node scripts/verify-scoring.mjs` 각 태스크 끝에서 exit 0. 미라클 기준선(득점 7114 · 선수 45 · league_teams 3 · 경기 271(`date <= '2026-08-04'`))은 **리그 시즌 기준으로** 불변이어야 한다 — 새 대회 묶음의 행은 그 집계에 섞이면 안 된다.
- `npx tsc --noEmit` · `npm run build` 통과. ⚠ `npm run build` 와 dev 서버가 같은 `.next` 를 쓰면 dev 가 죽는다(포트 3033 에 떠 있을 수 있음) — 먼저 멈추고 나중에 재기동.
- 디자인: `mm-*` CSS 변수만(`--mm-ground`·`--mm-ink`·`--mm-ink-soft`·`--mm-panel`·`--mm-rule`). 하드코딩 hex 금지 — 테마가 뒤집히면 대비가 깨진다. 모바일 우선(375px 가로 스크롤 없음), 터치 타깃 44×44px, `cursor-pointer`, 포커스 표시.
- 비공개 게이트를 건드리지 않는다. `layout.tsx` 의 게이트는 렌더 전에 돌아야 하고, 각 `page.tsx` 는 맨 위에서 `isLeaguePrivateGated` 를 확인한 뒤 데이터를 가져와야 한다(안 그러면 비공개 동호회 데이터가 raw HTML 로 샌다 — 실측된 사실이다).
- 브랜치 `master`. 태스크마다 커밋. **푸시 금지** — 전체 검토 후 한 번에.
- 주석·UI 문구·커밋 메시지는 한국어. 주석은 *왜* 를 적는다.
- 작업 디렉터리 `c:\Users\N_399\Desktop\ai_rob\basketball-stats-dashboard`. 셸이 리셋되므로 매 명령 앞에 `cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard &&`.

## 용어

이 계획에서 **경기묶음(competition)** 은 `leagues` 행 하나를 뜻한다. `mode='league'` 면 내부 리그 시즌, `mode='tournament'` 면 외부 대회 묶음이다. 코드에 `competition` 이라는 새 이름을 도입하지 않는다 — 테이블명과 어긋나면 읽는 사람이 두 개념을 찾게 된다. 사용자에게 보이는 말만 "리그" / "대회" 로 나눈다.

## 현재 확인된 사실

- `leagues_team_season_unique (team_id, season_year, slug)` — 한 팀이 같은 해에 여러 묶음 가능
- `leagues_mode_check CHECK (mode IN ('league','tournament'))` — 이미 존재
- `league_quarters.kind CHECK (kind IN ('quarter','tournament'))` — 대회 세그먼트 지원
- `league_quarters_quarter_check` 는 `kind='quarter'` 일 때만 1~4 를 강제 — 대회는 개수 제한 없음
- `league_teams.is_external` + 상대 선수 즉석 등록 API 존재 — **대회 경기 기록은 이미 가능하다**
- 스탯 집계는 전부 `league_id` 로 스코프됨 — 묶음이 다르면 자동으로 분리된다
- `/league/[orgSlug]/page.tsx` 는 묶음 하나로 자동 리다이렉트 — 여러 개일 때의 처리가 없다

---

## 파일 구성

| 파일 | 책임 |
|---|---|
| `src/lib/league/competitions.ts` (신규) | 팀의 경기묶음 목록 조회 + 노출 규칙 한 곳 |
| `src/app/api/leagues/[leagueId]/competitions/route.ts` (신규) | 전환 UI 용 목록 API |
| `src/components/league/CompetitionSwitcher.tsx` (신규) | 묶음 전환 UI |
| `_components/LeagueLayoutClient.tsx` (수정) | 전환 UI 배치 |
| `src/components/league/TournamentBoard.tsx` (신규) | 대회 목록·성적 화면 |
| `src/app/league/[orgSlug]/[leagueId]/page.tsx` (수정) | 대회 묶음이면 대회 보드 |
| `src/app/api/leagues/[leagueId]/players/[playerId]/career/route.ts` (신규) | 팀 전체 통산 |
| `src/app/league/[orgSlug]/page.tsx` (수정) | 묶음이 여러 개일 때 선택 화면 |

---

### Task 1: 경기묶음 조회 + 노출 규칙

**Files:**
- Create: `src/lib/league/competitions.ts`
- Create: `src/app/api/leagues/[leagueId]/competitions/route.ts`

**Interfaces:**
- Produces:
  - `type Competition = { id: string; slug: string; name: string; mode: 'league' | 'tournament'; season_year: number; status: string; game_count: number }`
  - `fetchTeamCompetitions(leagueId: string): Promise<Competition[]>` — 이 묶음이 속한 **팀의 모든 묶음**을 반환. 자기 자신 포함. 연도 내림차순, 같은 해면 리그 먼저.
  - `GET /api/leagues/[leagueId]/competitions` → `{ competitions: Competition[] }`

**왜 leagueId 로 팀을 유도하나:** URL 에 팀 id 가 없다. 화면은 항상 묶음 하나를 보고 있으므로 거기서 `leagues.team_id` 로 올라가 형제 묶음을 찾는 것이 유일하게 가능한 경로다.

- [ ] **Step 1: 기존 조회 헬퍼의 형태를 먼저 읽는다**

Run:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && cat src/lib/auth/guard.ts && ls src/lib/league/
```

`isLeaguePublic` 이 `leagues → teams` 를 어떻게 타고 올라가는지, 에러를 어떻게 던지는지 본다. **같은 형태를 따른다** — 쿼리 실패를 빈 배열로 삼키지 않고 문맥과 함께 throw 한다(이 코드베이스에서 반복해서 문제가 됐던 지점이다).

- [ ] **Step 2: 조회 헬퍼 작성**

Create `src/lib/league/competitions.ts`:

```ts
import { createClient } from '@/lib/supabase/admin'

// 경기묶음 = leagues 행 하나. mode 로 성격이 갈린다.
//   league     — 내부 인원을 팀으로 나눠 치르는 시즌
//   tournament — 외부 동호회와 붙는 대회 묶음
// 한 팀이 둘 다 가질 수 있다 (UNIQUE (team_id, season_year, slug) 라 같은 해도 가능).
export type Competition = {
  id: string
  slug: string
  name: string
  mode: 'league' | 'tournament'
  season_year: number
  status: string
  game_count: number
}

// 이 묶음이 속한 팀의 모든 묶음. URL 에 팀 id 가 없어서 leagues.team_id 로 올라간다.
export async function fetchTeamCompetitions(leagueId: string): Promise<Competition[]> {
  const sb = createClient()

  const { data: self, error: selfErr } = await sb
    .from('leagues')
    .select('team_id')
    .eq('id', leagueId)
    .maybeSingle()
  if (selfErr) throw new Error(`leagues: leagueId=${leagueId} 조회 실패 — ${selfErr.message}`)
  if (!self?.team_id) return []

  const { data, error } = await sb
    .from('leagues')
    .select('id, slug, name, mode, season_year, status')
    .eq('team_id', self.team_id)
    .order('season_year', { ascending: false })
  if (error) throw new Error(`leagues: team_id=${self.team_id} 형제 묶음 조회 실패 — ${error.message}`)

  const rows = data ?? []
  if (rows.length === 0) return []

  // 경기 수는 "빈 묶음을 회원에게 보일지" 판단에 쓴다 (Step 3 노출 규칙).
  //   묶음마다 count 쿼리를 돌리면 왕복이 늘어나므로 한 번에 가져와 센다.
  const { data: games, error: gErr } = await sb
    .from('league_games')
    .select('league_id')
    .in('league_id', rows.map(r => r.id))
  if (gErr) throw new Error(`league_games: 묶음별 경기 수 조회 실패 — ${gErr.message}`)

  const counts = new Map<string, number>()
  for (const g of games ?? []) counts.set(g.league_id, (counts.get(g.league_id) ?? 0) + 1)

  return rows
    .map(r => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      mode: r.mode === 'tournament' ? ('tournament' as const) : ('league' as const),
      season_year: r.season_year,
      status: r.status ?? '',
      game_count: counts.get(r.id) ?? 0,
    }))
    // 같은 해면 리그를 먼저 — 내부 시즌이 그 팀의 본류이고 대회는 그 위에 얹히는 활동이다.
    .sort((a, b) =>
      b.season_year - a.season_year ||
      (a.mode === b.mode ? a.name.localeCompare(b.name) : a.mode === 'league' ? -1 : 1),
    )
}

// 회원에게 보일 묶음만 남긴다.
//   빈 묶음(경기 0건)은 숨긴다 — 운영자가 만들어만 두고 아직 안 쓴 대회가 탭으로 뜨면
//   회원은 "여기 들어가면 뭐가 있나" 하고 눌렀다가 빈 화면을 본다. 지금 보고 있는
//   묶음은 비어 있어도 남긴다(그걸 숨기면 자기가 있는 곳이 목록에서 사라진다).
export function visibleCompetitions(
  all: Competition[],
  currentId: string,
  canEdit: boolean,
): Competition[] {
  if (canEdit) return all
  return all.filter(c => c.game_count > 0 || c.id === currentId)
}
```

- [ ] **Step 3: API 라우트 작성**

Create `src/app/api/leagues/[leagueId]/competitions/route.ts`.

**먼저 이웃 라우트를 읽고 가드 형태를 맞춘다:**
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && cat "src/app/api/leagues/[leagueId]/standings/route.ts"
```

이 목록은 "이 팀에 어떤 묶음이 있는가" 라는 **공개 등급** 정보다(명단·일정과 같은 급). 따라서 `canViewLeague` 로 막는다 — 비공개 동호회면 로그인 전에는 안 보이고, 공개면 누구나 본다. `canViewStats`(승인 회원 전용)는 과하다.

편집 권한 여부는 `canEditLeague` 로 판정해 `visibleCompetitions` 에 넘긴다.

- [ ] **Step 4: 미라클에 대회 묶음 생성**

⚠ 운영 DB 다. 아래 값을 그대로 쓴다.

먼저 미라클 리그의 팀·PIN·규칙을 확인:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT id, team_id, org_slug, slug, season_year, edit_pin IS NOT NULL haspin, rules FROM leagues WHERE org_slug='miracle'"
```

그 다음 대회 묶음을 만든다. **`edit_pin` 과 `rules` 는 리그 시즌 것을 그대로 복사한다** — 같은 팀이므로 운영자도 득점 규칙도 같아야 한다. 특히 규칙이 달라지면 같은 선수의 같은 플레이가 묶음마다 다른 점수가 된다.

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "
INSERT INTO leagues (org_slug, slug, name, season_year, season_type, status, mode,
                     start_date, total_rounds, edit_pin, team_id, rules)
SELECT l.org_slug, '2026-tournament', '미라클모닝 대회', l.season_year, l.season_type,
       'active', 'tournament', l.start_date, 0, l.edit_pin, l.team_id, l.rules
  FROM leagues l WHERE l.org_slug='miracle' AND l.mode='league'
  AND NOT EXISTS (SELECT 1 FROM leagues x WHERE x.team_id=l.team_id AND x.slug='2026-tournament')
RETURNING id, slug, mode"
```

`total_rounds=0` 인 이유: 대회는 아직 하나도 없다. 대회를 추가하면서 늘린다.

**이 시점에 미라클 회원에게는 아무 변화가 없어야 한다** — 경기가 0건이라 Step 2 의 노출 규칙이 숨긴다. 확인:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT slug, mode, status, (SELECT count(*) FROM league_games g WHERE g.league_id=l.id) games FROM leagues l WHERE org_slug='miracle'"
```
Expected: `2026`(league, 경기 다수) + `2026-tournament`(tournament, **경기 0**).

- [ ] **Step 5: 기준선이 안 움직였는지 확인**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs
```

⚠ `verify-schema.mjs` 에 "미라클 org 의 leagues 형태" 를 단언하는 항목이 있다면 이제 깨진다 — 묶음이 하나 늘었기 때문이다. **지우지 말고** 새 형태를 반영해 고친다. 미라클 득점 7114·선수 45 단언은 리그 시즌 기준이므로 그대로 통과해야 한다. 통과하지 않으면 새 묶음이 집계에 새고 있다는 뜻이니 **중단하고 보고**.

- [ ] **Step 6: API 실측 + 커밋**

dev 서버(포트 3033, 없으면 `npm run dev -- -p 3033`)에서:
```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && curl -s "http://localhost:3033/api/leagues/8eda8257-8907-4bf3-a7de-e5e7fde54a89/competitions"
```
Expected: 미인증이므로 편집 권한 없음 → 경기 0건인 대회 묶음은 **빠지고** 리그 시즌만 나온다.

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && git add -A && git commit -m "$(cat <<'EOF'
feat(competition): 팀의 경기묶음 조회 + 미라클 대회 묶음 생성 (시험 1/4)

leagues 는 이미 "경기묶음" 이고 mode 로 성격이 갈린다. UNIQUE 가
(team_id, season_year, slug) 라 한 팀이 같은 해에 리그와 대회를 함께
가질 수 있다 — 075 에 설계가 들어가 있었고 쓰이지 않았을 뿐이다.

빈 묶음은 회원에게 숨긴다. 운영자가 만들어만 두고 안 쓴 대회가 탭으로
뜨면 회원은 눌렀다가 빈 화면을 본다. 편집 권한자에겐 보인다 — 안 보이면
경기를 넣을 수가 없다.

대회 묶음의 edit_pin·rules 는 리그 시즌 것을 복사한다. 같은 팀이라
운영자도 득점 규칙도 같아야 하고, 규칙이 갈리면 같은 플레이가 묶음마다
다른 점수가 된다.
EOF
)"
```

---

### Task 2: 경기묶음 전환 UI

**Files:**
- Create: `src/components/league/CompetitionSwitcher.tsx`
- Modify: `src/app/league/[orgSlug]/[leagueId]/_components/LeagueLayoutClient.tsx`

**Interfaces:**
- Consumes: `GET /api/leagues/[leagueId]/competitions` (Task 1)
- Produces: 헤더에서 묶음을 오가는 UI

- [ ] **Step 1: 레이아웃의 기존 헤더 구성을 읽는다**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && sed -n '1,140p' "src/app/league/[orgSlug]/[leagueId]/_components/LeagueLayoutClient.tsx"
```

탭 바·로그인 칩·테마 토글·프레즌스가 어떻게 배치돼 있는지, `deriveLeagueBase` 가 왜 pathname 에서 base 를 뽑는지(미들웨어가 slug↔UUID 를 rewrite 하므로 props 의 leagueId 는 UUID, pathname 은 slug) 확인한다. **전환 링크도 같은 기준을 써야 한다** — 안 그러면 활성 판정이 어긋난다.

- [ ] **Step 2: 전환 UI 작성**

`CompetitionSwitcher.tsx`:
- 묶음이 **1개면 아무것도 렌더하지 않는다.** 선택지가 하나뿐인 전환 UI 는 화면만 차지한다.
- 2개 이상이면 현재 묶음 이름을 보여주고, 눌러서 다른 묶음으로 간다.
- 링크 주소는 `/league/{orgSlug}/{대상 slug}` — **UUID 가 아니라 slug** 를 쓴다(미들웨어가 rewrite 하고, 사용자 주소창에 예쁜 값이 남는다).
- 대회 묶음에는 시각적 구분을 준다(라벨 또는 아이콘). 같은 이름의 두 묶음을 헷갈리면 엉뚱한 곳에 기록한다.
- `mm-*` 토큰만. 모바일에서 44px 터치 타깃. 포커스 표시.

- [ ] **Step 3: 레이아웃에 배치**

데스크톱 탭 바와 모바일 양쪽에서 닿을 수 있어야 한다. **기존 탭 구성을 바꾸지 않는다** — 전환은 탭이 아니라 그 위 계층이다(어느 묶음을 보는가 → 그 안에서 어느 화면을 보는가).

- [ ] **Step 4: 확인**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && npx tsc --noEmit && npm run build 2>&1 | tail -3
```

dev 서버에서 눈으로:
- `/league/miracle/2026` — 비로그인: 전환 UI **없음**(대회가 경기 0건이라 숨겨져 묶음이 1개)
- 편집 모드(PIN 입력) 후: 전환 UI 등장, 대회로 이동 가능
- 375px 폭에서 가로 스크롤 없음
- 파란날개 주소(`/paranalgae/youth`)는 **영향 없음** — 다른 트리다

- [ ] **Step 5: 커밋**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs && git add -A && git commit -m "$(cat <<'EOF'
feat(competition): 경기묶음 전환 UI (시험 2/4)

전환은 탭이 아니라 그 위 계층이다 — 어느 묶음을 보는가를 먼저 정하고,
그 안에서 어느 화면을 보는지가 탭이다. 그래서 탭 구성을 건드리지 않고
위에 얹었다.

묶음이 하나면 렌더하지 않는다. 선택지가 하나뿐인 전환 UI 는 화면만 차지한다.

링크는 UUID 가 아니라 slug 로 건다 — 미들웨어가 rewrite 하므로 동작은
같지만 주소창에 읽을 수 있는 값이 남는다.
EOF
)"
```

---

### Task 3: 대회 보드 — 대회 목록과 성적

**Files:**
- Create: `src/components/league/TournamentBoard.tsx`
- Modify: `src/app/league/[orgSlug]/[leagueId]/page.tsx`

**Interfaces:**
- Consumes: `league_quarters` (`kind='tournament'`), `league_games`(`round_label` 포함)
- Produces: `<TournamentBoard leagueId={...} />`

**왜 필요한가:** 대회 묶음의 홈은 리그 시즌의 홈과 보여줄 것이 다르다. 리그는 순위표와 라운드가 중심이고, 대회는 **참가한 대회별 성적**(우승·준우승·N강)이 중심이다. 리그 홈을 그대로 쓰면 대회가 리그처럼 굴게 되고, 그게 지난번에 되돌린 이유다.

- [ ] **Step 1: 판정 규칙을 레거시에서 그대로 가져온다**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && sed -n '1,60p' "src/app/(main)/[org]/[team]/tournaments/page.tsx"
```

`ROUND_ORDER` 와 `getTournamentSummary` 를 읽는다. **규칙을 새로 만들지 않는다** — 같은 대회가 두 화면에서 다른 성적으로 읽히면 안 된다. 단, `준결승` 이 최근 추가됐다는 점을 확인하고 그 수정본을 가져온다(빠지면 준결승까지 간 대회가 8강으로 표시된다).

이 화면은 레거시 파일을 **import 하지 않는다**(그 트리는 별개이며 언젠가 사라진다). 규칙을 옮겨 오되, 옮겨 왔다는 사실과 출처를 주석에 남긴다.

- [ ] **Step 2: 대회 보드 작성**

대회(=`league_quarters` 중 `kind='tournament'`)마다 한 줄:
- 대회 이름 · 기간 · 전적(승-패) · 최종 성적(우승/준우승/N강 탈락)
- 대회를 누르면 그 대회의 경기 목록으로

카드 어휘는 `src/app/league/[orgSlug]/[leagueId]/highlights/page.tsx` 의 그리드를 참고한다. `mm-*` 토큰만, 375px 가로 스크롤 없음.

**빈 상태를 성의 있게 만든다.** 미라클의 대회 묶음은 처음에 비어 있다. "아직 참가한 대회가 없습니다" 로 끝내지 말고, 편집 권한자에게는 대회를 어떻게 추가하는지 알려준다.

- [ ] **Step 3: 홈에 연결**

`page.tsx` 에서 `mode === 'tournament'` 면 대회 보드를, 아니면 지금의 리그 홈을 보여준다.

⚠ **`isLeaguePrivateGated` 확인이 함수 맨 위에 있어야 한다.** 그 위에 조회를 넣으면 비공개 동호회의 데이터가 raw HTML 로 샌다 — 실측된 사실이다.

⚠ mode 를 읽는 방법: Task 1 의 `fetchTeamCompetitions` 를 재사용하지 말고(형제 묶음까지 가져와 낭비), `leagues.mode` 만 조회하는 작은 헬퍼를 쓴다. 없으면 만든다.

- [ ] **Step 4: 확인**

- `/league/miracle/2026` → **지금과 완전히 동일**. 리그 홈이 조금이라도 달라지면 중단하고 보고
- `/league/miracle/2026-tournament` → 대회 보드, 빈 상태
- 375px 확인

- [ ] **Step 5: 커밋**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && npx tsc --noEmit && npm run build 2>&1 | tail -3 && node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs && git add -A && git commit -m "$(cat <<'EOF'
feat(competition): 대회 보드 — 대회별 성적 (시험 3/4)

대회 묶음의 홈은 리그와 보여줄 것이 다르다. 리그는 순위표와 라운드가
중심이고 대회는 참가한 대회별 성적이 중심이다. 리그 홈을 그대로 쓰면
대회가 리그처럼 굴게 되는데, 그게 지난번에 되돌린 이유다.

성적 판정 규칙은 레거시 화면의 것을 옮겨 왔다(준결승 수정 포함) —
같은 대회가 두 화면에서 다른 성적으로 읽히면 안 된다. 레거시를 import
하지는 않는다. 그 트리는 별개이며 언젠가 사라진다.
EOF
)"
```

---

### Task 4: 커리어 합산

**Files:**
- Create: `src/app/api/leagues/[leagueId]/players/[playerId]/career/route.ts`
- Modify: 선수 카드(`src/components/league/PlayerQuickViewModal.tsx`)

**Interfaces:**
- Consumes: Task 1 의 `fetchTeamCompetitions`
- Produces: `GET .../players/[playerId]/career` → 묶음별 요약 + 팀 전체 통산

**왜 필요한가:** 사용자 결정은 **"기본 분리 + 커리어 합산 별도"** 다. 분리는 이미 공짜로 얻었다(집계가 `league_id` 로 스코프됨). 합산이 없으면 "내 전체 기록" 을 볼 곳이 없다 — 이 플랫폼이 존재하는 이유가 개인에게 자기 기록을 돌려주는 것이므로, 여기가 비면 안 된다.

- [ ] **Step 1: 선수 식별 문제를 먼저 확인한다**

⚠ `league_players` 는 **묶음마다 별도 행**이다. 같은 사람이 리그 시즌과 대회 묶음에 각각 존재한다. 합산하려면 두 행이 같은 사람임을 알아야 한다.

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && node scripts/db-migrate.mjs sql "SELECT column_name FROM information_schema.columns WHERE table_name='league_players' ORDER BY ordinal_position"
```

지금은 사람을 잇는 컬럼이 없다. **이 시험 범위에서는 (팀, 이름, 등번호) 조합으로 잇는다** 는 것을 명시하고, 그 한계를 주석과 보고서에 남긴다 — 동명이인이나 등번호 변경에서 깨진다. 영구 해법은 사람 단위 id 를 두는 것이고 이 시험의 범위가 아니다.

**컬럼을 새로 만들지 않는다.** 시험이 성공한 뒤에 제대로 설계한다.

- [ ] **Step 2: 커리어 API 작성**

- 이 선수가 속한 팀의 모든 묶음(`fetchTeamCompetitions`)을 돌며 같은 사람을 찾고
- 묶음별 요약(경기·득점·리바운드·어시스트)과 **팀 전체 통산**을 반환
- 가드는 `canViewStats` — 개인 스탯이므로 승인 회원 전용이다(이 코드베이스의 스탯 게이팅 정책)
- 쿼리 실패를 빈 값으로 삼키지 않는다

- [ ] **Step 3: 선수 카드에 연결**

선수 카드에 통산 항목을 더한다. **기존 시즌 스탯 표시를 바꾸지 않는다** — 그건 지금 묶음 기준이고 그게 맞다. 통산은 그 옆/아래에 별도로 둔다.

묶음이 하나뿐인 선수(미라클 현재 상태)는 통산 = 시즌이므로 **중복 표시를 피한다.** 묶음이 2개 이상 있고 실제로 기록이 있을 때만 통산을 보여준다.

- [ ] **Step 4: 확인**

- 미라클 선수 카드 → 대회 기록이 0건이므로 **지금과 동일**해야 한다
- 대회 묶음에 시험 경기를 하나 넣어 통산이 합쳐지는지 확인한 뒤, **그 시험 데이터를 지우고 원상복구를 쿼리로 증명**한다
- 미라클 기준선(7114점·45명) 불변

- [ ] **Step 5: 커밋**

```bash
cd /c/Users/N_399/Desktop/ai_rob/basketball-stats-dashboard && npx tsc --noEmit && npm run build 2>&1 | tail -3 && node scripts/verify-schema.mjs && node scripts/verify-scoring.mjs && git add -A && git commit -m "$(cat <<'EOF'
feat(competition): 선수 커리어 합산 (시험 4/4)

묶음별 분리는 집계가 league_id 로 스코프돼 공짜로 얻었다. 합산이 없으면
"내 전체 기록" 을 볼 곳이 없는데, 개인에게 자기 기록을 돌려주는 게 이
플랫폼의 존재 이유라 여기가 비면 안 된다.

⚠ 한계: league_players 는 묶음마다 별도 행이고 사람을 잇는 id 가 없다.
이 시험에서는 (팀, 이름, 등번호) 로 잇는다 — 동명이인·등번호 변경에서
깨진다. 컬럼을 새로 만들지 않은 건 시험이 성공한 뒤 제대로 설계하려는
것이다.
EOF
)"
```

---

## 완료 기준

- 미라클에 리그 시즌과 대회 묶음이 함께 존재하고, 편집 권한자는 둘을 오갈 수 있다
- **회원에게는 아직 변화가 없다** — 대회가 비어 있어 숨겨진다
- `/league/miracle/2026` 의 화면과 숫자가 지금과 완전히 동일하다
- 대회 묶음에 경기를 넣으면 대회별 성적이 뜨고, 그 기록은 리그 시즌 스탯에 섞이지 않는다
- 선수 카드에서 팀 전체 통산을 볼 수 있다
- `verify-schema.mjs` · `verify-scoring.mjs` exit 0, 미라클 기준선 불변
- **파란날개는 어느 것도 달라지지 않는다**

## 시험이 성공하면 다음에 할 것 (이 계획 범위 밖)

- 사람 단위 id 도입 — (이름, 등번호) 매칭의 한계 해소
- 파란날개를 이 구조로 이관 (단계 A·B 절차가 `docs/legacy-migration-notes.md` 에 남아 있다)
- 온보딩에서 유형을 묻지 않고, 나중에 묶음을 추가하는 방식으로 전환
- 레거시 트리 제거
