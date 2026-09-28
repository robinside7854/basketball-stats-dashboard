# 스탯 탭 4→2 재편 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 리그 「스탯」 탭을 리더보드·어워즈·선수명단·팀순위 4개에서 「리더보드」·「팀」 2개로 줄인다.

**Architecture:** 어워즈는 리더보드의 4번째 표 모드로 흡수한다. 선수 명단은 팀 순위 페이지에 「팀별 선수」 섹션과 운영자 「명단 편집」 모드로 흡수한다. 분기 칩은 공용 컴포넌트 하나로 통일하고 `LeagueQuarterContext` 를 공유한다. 통계 계산·API·DB 는 손대지 않는다.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind(`mm-*` 토큰), Supabase. 스펙: `docs/superpowers/specs/2026-09-28-stats-tab-ia-design.md`.

## Global Constraints

- 통계 계산(`computeLeagueStats`, `awards/route.ts`, season-highs)·자격 기준(30% / 60%)·DB 스키마·대회 모드 화면은 **변경 금지**.
- 옮기는 코드는 **이동**이지 재작성이 아니다. 기존 JSX·훅을 잘라 붙이고 import 만 고친다.
- 아이콘은 `lucide-react`, 크기 `size={14|16|20|24}`. 이모지·텍스트 글리프 금지. 표면은 불투명 단색.
- 모바일 375px 우선. 가로 스크롤 금지. 터치 타깃 44px.
- 커밋마다 `git add <파일 지정>` (`-A` 금지). 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- 각 태스크 끝에 `npx tsc --noEmit` 통과.
- 본 계획은 800~1500줄 페이지를 옮기는 작업이라 코드 전문을 싣지 않는다. 각 태스크의 구현자는 **명시된 파일과 줄 범위를 직접 읽고** 옮긴다.

---

### Task 1: 공용 분기 칩 `QuarterChips` + 3곳 교체

**Files:**
- Create: `src/components/league/QuarterChips.tsx`
- Modify: `src/app/league/[orgSlug]/[leagueId]/stats/page.tsx:546-562` (인라인 칩 → 컴포넌트)
- Modify: `src/app/league/[orgSlug]/[leagueId]/awards/page.tsx:323-360` (동일)
- Modify: `src/app/league/[orgSlug]/[leagueId]/teams/page.tsx:824, 1125-1150` (로컬 `selectedQId` → `useLeagueQuarter()`, 칩 교체)
- Test: `src/components/league/QuarterChips.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type QuarterChipItem = { id: string; label: string; isCurrent?: boolean }
  export function QuarterChips(props: {
    quarters: QuarterChipItem[]
    value: string            // 'all' | quarterId
    onChange: (v: string) => void
    allLabel?: string        // 기본 '전체'
  }): JSX.Element
  ```
- Consumes: `useLeagueQuarter()` from `src/contexts/LeagueQuarterContext.tsx` (`selectedQuarterId`, `setSelectedQuarterId`).

- [ ] **Step 1: 확인 코드 작성(실패 확인)** — 프로젝트에 테스트 러너가 있으면(`package.json` `scripts.test` 확인) 그 형식으로, 없으면 `node --test` + `react-dom/server` 로 다음 하나만 남긴다.
  ```ts
  // 「전체」 + 분기 2개가 버튼 3개로 렌더되고, 선택된 것에 aria-pressed=true
  import { renderToStaticMarkup } from 'react-dom/server'
  import { QuarterChips } from './QuarterChips'
  const html = renderToStaticMarkup(
    <QuarterChips quarters={[{id:'q1',label:'26.1Q'},{id:'q2',label:'26.2Q',isCurrent:true}]} value="q2" onChange={()=>{}} />
  )
  assert.equal((html.match(/<button/g) ?? []).length, 3)
  assert.match(html, /aria-pressed="true"[^>]*>[^<]*26\.2Q/)
  ```
- [ ] **Step 2: 실행해 실패 확인** (모듈 없음)
- [ ] **Step 3: `QuarterChips.tsx` 구현** — `stats/page.tsx:546-562` 의 기존 버튼 마크업·클래스를 그대로 옮겨 props 로 일반화. 버튼에 `aria-pressed`, 현재 분기 점 표시는 `awards/page.tsx` 의 것을 채택. 가로 스크롤 컨테이너(`overflow-x-auto`, `-mx-4 px-4`)는 stats 의 것 유지.
- [ ] **Step 4: 실행해 통과 확인**
- [ ] **Step 5: 3개 페이지 교체.** stats·awards 는 이미 `useLeagueQuarter()` 사용 → 인라인 버튼만 `<QuarterChips …/>` 로. teams 는 `selectedQId` state 를 지우고 `useLeagueQuarter()` 로 바꾼다. teams 기본값이 「현재 분기」였던 동작은 유지: 컨텍스트 값이 `'all'` 이고 localStorage 에 저장값이 없을 때만 현재 분기로 `setSelectedQuarterId` 한 번 호출(마운트 시 1회, `quarters` 로드 후).
- [ ] **Step 6: `npx tsc --noEmit` 통과, 375px 에서 세 화면 칩이 같은 모양·같은 문구(「전체」)인지 육안 확인**
- [ ] **Step 7: Commit** `feat(stats): 공용 QuarterChips 도입, 팀순위 분기 선택을 공유 컨텍스트로`

---

### Task 2: 어워즈를 리더보드 4번째 모드로 흡수

**Files:**
- Create: `src/app/league/[orgSlug]/[leagueId]/stats/_components/AwardsBoard.tsx`
- Modify: `src/app/league/[orgSlug]/[leagueId]/stats/page.tsx` (모드 칩에 `'awards'` 추가, 모드가 awards 면 `<AwardsBoard/>` 렌더, 표·TOP5·기록실은 숨김)
- Modify: `src/app/league/[orgSlug]/[leagueId]/awards/page.tsx` → 리다이렉트 한 줄로 축소
- Delete: `src/app/league/[orgSlug]/[leagueId]/awards/loading.tsx`
- Modify: `src/app/api/leagues/[leagueId]/awards/route.ts:10` 주석 「11종」→「12종(코어 9 + 특수 3)」

**Interfaces:**
- Produces: `AwardsBoard({ leagueId, quarterId }: { leagueId: string; quarterId: string })` — `quarterId==='all'` 이면 API 에 `quarterId` 를 붙이지 않는다(기존 awards 페이지의 규칙 그대로).
- Consumes: `GET /api/leagues/[id]/awards?quarterId=` (변경 없음), Task 1 의 `QuarterChips`.

- [ ] **Step 1: `awards/page.tsx` 를 읽고 이동 대상을 표시** — 자격 요건 박스, 부문 접이식 카드, 전체 후보 모달, fetch 훅, 401 시 `StatGate`. 헤더·탭바·분기 칩은 stats 가 이미 가지므로 옮기지 않는다.
- [ ] **Step 2: `AwardsBoard.tsx` 로 이동** — JSX·상태·헬퍼를 그대로 옮기고 `leagueId`·`quarterId` 를 props 로 받는다. 화면 문구 「코어 8 + 특수 3」→「코어 9 + 특수 3」.
- [ ] **Step 3: stats 모드 칩 확장** — 기존 모드 타입(`'basic'|'shooting'|'advanced'`)에 `'awards'` 추가, 칩 라벨 「어워즈」. URL `?mode=awards` 로 진입 가능하게(기존 `?tab=seasonHigh` 폴백 코드 옆에 같은 방식으로). awards 모드에서는 평균/누적 토글·정렬·기록실·TOP5·`StatsReadingGuide` 를 렌더하지 않는다.
- [ ] **Step 4: `awards/page.tsx` 교체**
  ```tsx
  import { redirect } from 'next/navigation'
  export default async function AwardsRedirect({ params }: { params: Promise<{ orgSlug: string; leagueId: string }> }) {
    const { orgSlug, leagueId } = await params
    redirect(`/league/${orgSlug}/${leagueId}/stats?mode=awards`)
  }
  ```
  `awards/loading.tsx` 삭제.
- [ ] **Step 5: `tsc` 통과, 육안** — `/stats?mode=awards` 에서 부문 카드·모달 동작, 분기 칩 바꾸면 재조회, `/awards` 접속 시 리다이렉트. 375px 확인.
- [ ] **Step 6: Commit** `feat(stats): 어워즈를 리더보드 표 모드로 흡수, /awards 리다이렉트`

---

### Task 3: 팀 페이지에 「팀별 선수」·「게스트」 섹션 정리

**Files:**
- Modify: `src/app/league/[orgSlug]/[leagueId]/teams/page.tsx` (기존 「팀별 선수 스탯」 섹션 → 「팀별 선수」, 「비정규 선수」 아래에 「게스트」 접이식 추가)

**Interfaces:**
- Consumes: 이미 페이지가 받는 `/quarters/{q}/players`(정규 명단), `/stats?teamId=&quarterIds=`, `/quarters/{q}/leaders`. 게스트 판정은 `league_players.is_guest` 또는 이름에 '게스트' 포함(`roster/page.tsx:655` 의 규칙을 그대로 옮긴다).
- Produces: 없음(화면만).

- [ ] **Step 1: 현재 「팀별 선수 스탯」 섹션 위치·구조 파악** (`teams/page.tsx` 에서 `팀별 선수` 검색)
- [ ] **Step 2: 선수 줄 구성을 고정** — 이름 · 등번호 · 리더 왕관(`/quarters/{q}/leaders` 매칭) · 기존 스탯 컬럼. 포지션·참석률·인증회원은 **넣지 않는다**(Task 4 편집 모드 전용).
- [ ] **Step 3: 「게스트」 접이식 추가** — 「비정규 선수」 섹션 바로 아래. 기본 접힘, 열림 상태 localStorage 키 `league:{id}:teams:guestsOpen`. 게스트는 「비정규」 목록에서 빼서 여기로만 보낸다.
- [ ] **Step 4: 분기 `'all'` 일 때 동작** — 「팀별 선수」는 팀 정체성 목록이 이미 분기별로 나뉘므로 그대로. 「비정규」「게스트」는 전체일 때 현재 분기 기준으로 표시하고 섹션 제목 옆에 `(현재 분기)` 를 붙인다.
- [ ] **Step 5: `tsc`, 육안 375px·1024px** — 팀 카드 아래 선수 목록, 비정규·게스트 분리, 한 화면에서 팀 소속이 읽히는지.
- [ ] **Step 6: Commit** `feat(teams): 팀별 선수·게스트 섹션 정리`

---

### Task 4: 명단 편집 모드를 `RosterEditor` 로 분리해 팀 페이지로 이동

**Files:**
- Create: `src/app/league/[orgSlug]/[leagueId]/teams/_components/RosterEditor.tsx`
- Modify: `src/app/league/[orgSlug]/[leagueId]/teams/page.tsx` (헤더에 「명단 편집」 토글, 켜면 `<RosterEditor/>` 가 3·4·5번 섹션 자리를 대신함)
- Modify: `src/app/league/[orgSlug]/[leagueId]/roster/page.tsx` → 리다이렉트 한 줄
- Delete: `src/app/league/[orgSlug]/[leagueId]/roster/loading.tsx`

**Interfaces:**
- Produces: `RosterEditor({ leagueId, quarterId, teams, quarters }: { leagueId: string; quarterId: string; teams: TeamLite[]; quarters: QuarterLite[] })` — `TeamLite`/`QuarterLite` 는 teams 페이지가 이미 쓰는 팀·분기 타입을 그대로 export 해서 쓴다(새 타입 정의 금지).
- Consumes: `roster/page.tsx` 의 편집 권한 판정(운영자 여부), 선수 추가, 엑셀 일괄 등록, `updateMembership`(`POST /quarters/{q}/players`), 이전 분기 이어받기, 분기 관리, 카드(포지션·참석률·인증회원·분기 팀 칩). API 변경 없음.

- [ ] **Step 1: `roster/page.tsx` 를 읽고 편집 관련 코드(상태·핸들러·JSX·모달)와 권한 판정을 표시**
- [ ] **Step 2: `RosterEditor.tsx` 로 이동** — 회원 화면에 있던 포지션 필터·정렬·「인증회원만」 토글은 편집 모드 안으로 함께 옮긴다(운영진만 쓰므로). 게스트 접이식은 여기서도 유지.
- [ ] **Step 3: teams 헤더 토글** — 운영자에게만 「명단 편집」 버튼(lucide `Pencil` size 16, 44px 터치). 켜면 순위·전적 섹션은 그대로 두고 「팀별 선수」 이하를 `<RosterEditor/>` 로 교체. 상태는 URL `?edit=1` 로 유지(새로고침 시 보존).
- [ ] **Step 4: `roster/page.tsx` 교체**
  ```tsx
  import { redirect } from 'next/navigation'
  export default async function RosterRedirect({ params }: { params: Promise<{ orgSlug: string; leagueId: string }> }) {
    const { orgSlug, leagueId } = await params
    redirect(`/league/${orgSlug}/${leagueId}/teams?edit=1`)
  }
  ```
  `roster/loading.tsx` 삭제.
- [ ] **Step 5: `tsc`, 육안** — 운영자 로그인 상태에서 `/teams?edit=1`: 선수 추가·소속 변경·이어받기가 이전과 동일하게 동작. 비운영자에게 토글이 안 보임. `/roster` 리다이렉트.
- [ ] **Step 6: Commit** `feat(teams): 명단 편집을 RosterEditor 로 이동, /roster 리다이렉트`

---

### Task 5: 탭 2개로 축소 + 내부 링크 + 최종 검증

**Files:**
- Modify: `src/components/league/statsTabs.ts`
- Modify: `src/app/league/[orgSlug]/[leagueId]/_components/LeagueLayoutClient.tsx:333-340` (스탯 탭 활성 경로에서 `/awards` `/roster` 제거)
- Modify: `/awards` `/roster` 를 가리키는 내부 링크 전부 (`rg -n "/awards|/roster" src --glob '!**/api/**'` 결과)
- Test: `src/components/league/statsTabs.test.ts`
- Modify: `docs/onball-current-state.md` (스탯 탭 구조 갱신)

**Interfaces:**
- Produces:
  ```ts
  export type StatsTabKey = 'leaderboard' | 'teams'
  export function getStatsGroupTabs(base: string, active: StatsTabKey): LeagueGroupTab[]
  // [{href:`${base}/stats`,label:'리더보드'},{href:`${base}/teams`,label:'팀'}]
  ```

- [ ] **Step 1: 확인 코드(실패 확인)**
  ```ts
  import assert from 'node:assert/strict'
  import { getStatsGroupTabs } from './statsTabs'
  const tabs = getStatsGroupTabs('/league/o/l', 'teams')
  assert.equal(tabs.length, 2)
  assert.deepEqual(tabs.map(t => t.label), ['리더보드', '팀'])
  assert.equal(tabs[1].active, true)
  ```
- [ ] **Step 2: `statsTabs.ts` 축소** — 헤더 주석도 「2개(리더보드 · 팀)」로 갱신하고 어워즈·명단 흡수 날짜(2026-09-28) 한 줄 추가.
- [ ] **Step 3: 통과 확인**
- [ ] **Step 4: 레이아웃·내부 링크 갱신** — `LeagueLayoutClient.tsx` 활성 경로 2개로. 라커룸·설정·소셜카드 등에서 `/awards` → `/stats?mode=awards`, `/roster` → `/teams`(편집 의도면 `?edit=1`).
- [ ] **Step 5: 최종 검증**
  ```
  npx tsc --noEmit
  node scripts/verify-schema.mjs
  node scripts/verify-scoring.mjs
  ```
  Playwright 육안(375·1024): `/stats` 4모드, `/teams` 회원·편집, `/awards`·`/roster` 리다이렉트, 하단 「스탯」 탭이 두 화면 모두에서 활성.
- [ ] **Step 6: `docs/onball-current-state.md` 스탯 탭 절 갱신**
- [ ] **Step 7: Commit + push(master) + Vercel 배포 확인** `feat(stats): 스탯 탭 4→2 (리더보드 · 팀)`
