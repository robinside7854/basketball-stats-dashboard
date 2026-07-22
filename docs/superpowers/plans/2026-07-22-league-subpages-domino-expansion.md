# 리그 서브 페이지 도미노 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈에서 확립된 시각 언어(SectionCard, 옐로우 실색상 1곳 원칙, 근접도 3티어, 클러치 5단계, 순위 티어링, 기능성 색상 토큰, 다크 모드 대비 규칙)를 리그 스탯/선수단/팀구성 3개 서브 페이지에 순차 확장한다.

**Architecture:** 신규 스펙 파일 없이 홈 스펙([2026-07-21-league-design-system-cleanup.md](../specs/2026-07-21-league-design-system-cleanup.md))의 규칙을 서브 페이지에 그대로 적용. 페이지 파일 3개(각 1100~1330라인)와 각 페이지 전용 컴포넌트 6개를 정돈. 스코프 밖: 파란날개(대회) 대시보드 · 리그 경기기록/스케줄/설정 페이지 · 어드민.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind 4 · CSS variables · lucide-react

## Global Constraints (verbatim from 홈 스펙 + 도미노 확장 규칙)

### 시각 언어 규칙 (홈에서 확립됨 · 서브 페이지에도 그대로 적용)

- **옐로우 실색상 1곳 원칙**: `--mm-yellow` 실색상은 프로젝트 전체에서 **딱 2곳**만 허용
  - HighlightCTA (PersonalDashboard `available=true` 상태)
  - 편집중 button (LeagueLayoutClient)
  - 나머지 모든 `--mm-yellow`/`--mm-yellow-strong` 실색상 사용은 다운그레이드
  - `--mm-yellow-soft` (subtle tint) 은 액센트로 병존 허용 (예: 1위 subtle 배경 + 좌측 3px `--mm-yellow-strong` 라인)
- **`focus-visible:ring-[color:var(--mm-yellow)]` 패턴 금지**: 모두 `--mm-rule` 로 다운그레이드
- **SectionCard 우선**: 페이지 최상위 섹션은 `<SectionCard variant='stack'|'standalone' emphasized? background? dataTour?>` 사용
  - variant 'stack': 연이은 카드 (borderTop 0, radius 0)
  - variant 'standalone': 독립 카드 (radius 6px)
  - background prop: 기본 `--mm-panel`, 필요 시 `--mm-panel-alt`
- **CSS 변수 토큰**:
  - 근접도 3티어: `--milestone-near` (>=80%) / `--milestone-mid` (60~80%) / `--milestone-far` (<60%)
  - 클러치 5단계: `--clutch-1~5` (dagger→chase→tie→reversal→winning, hoop-orange-600)
  - 기능성 색상: `--mm-positive` / `--mm-negative` / `--mm-neutral-strong` (승/패/중립 통용)
- **순위 티어링** (rankStyle 패턴):
  - 1위: 🥇 + `#0a0a0a` on `#D4A017` (gold)
  - 2위: 🥈 + `#0a0a0a` on `#94A3B8` (silver)
  - 3위: 🥉 + `#ffffff` on `#B45309` (bronze)
  - 4~10위: `#ffffff` on `var(--milestone-near)`
  - 11+: `var(--mm-muted)` on transparent

### 다크 모드 대비 규칙

- 금지 패턴: `background: 'var(--mm-black)'` + `color: 'var(--mm-panel)'` — 다크에서 `#000000` + `#171717` = **안 보임**
- 검정 배경 위 흰 텍스트는 `color: '#ffffff'` 하드코딩
- 자동 반전 OK 조합: `background: 'var(--mm-ink)'` + `color: 'var(--mm-panel)'` (라이트: 검정+흰, 다크: 흰+near-black)
- 회색 배경 + 회색 텍스트 → WCAG AA 4.5:1 이상 확보 (실측 후 조정)

### WCAG AA 접근성 (CLAUDE.md CRITICAL)

- 색상 대비 최소 4.5:1 (일반 텍스트 기준)
- 클러치/milestone-near 톤 (700 톤): 흰 텍스트 4.5:1+ 통과 확인됨
- 골드/실버 배경은 검정 텍스트, 브론즈만 흰 텍스트

### 프로젝트 규칙 (변함 없음)

- 테스트 없음: validation은 `npx tsc --noEmit` + Vercel 배포 후 육안 확인
- 모든 커밋 후 자동 push: master branch → Vercel 자동 배포
- 모바일 상시: 375·414·768·1024·1440px 파괴 없음 · 터치 타겟 44×44px
- Working directory: `c:\Users\N_399\Desktop\ai_rob\basketball-stats-dashboard`

### 스코프 명시 (파란날개 · 경기기록 · 스케줄 · 어드민 절대 미터치)

- 이번 계획은 **리그(미라클) 하위 3개 페이지만**:
  - `src/app/league/[orgSlug]/[leagueId]/stats/`
  - `src/app/league/[orgSlug]/[leagueId]/roster/`
  - `src/app/league/[orgSlug]/[leagueId]/teams/`
- 그 외 `record/` `schedule/` `settings/` `draft/` `highlights/` `boxscore/` `archive/` 는 **스코프 밖**
- 대회 대시보드 `src/app/(main)/[org]/[team]/` 도 **스코프 밖**
- 공용 컴포넌트(예: `PlayerQuickViewModal.tsx`)는 스코프 밖이지만 각 Task 내 grep에서 발견되는 지점은 **서브 페이지 렌더 문맥에서만 접근되는 경우** 정돈 가능 (신중히 판단)

## File Structure

**수정 대상 (9 파일)**:

- `src/app/league/[orgSlug]/[leagueId]/stats/page.tsx` (1103 lines) — Task 1
- `src/components/league/nba/NbaSeasonHighs.tsx` (325 lines) — Task 2
- `src/components/league/stats/TopFiveSlot.tsx` (226 lines) — Task 2
- `src/components/league/StatCell.tsx` (118 lines) — Task 2
- `src/components/league/StatHeader.tsx` (41 lines) — Task 2
- `src/components/league/LeagueGroupTabs.tsx` (40 lines) — Task 2
- `src/app/league/[orgSlug]/[leagueId]/roster/page.tsx` (1113 lines) — Task 3
- `src/components/league/EmptyState.tsx` (80 lines) — Task 4
- `src/components/league/LeaderBadgePanel.tsx` (208 lines) — Task 4
- `src/app/league/[orgSlug]/[leagueId]/teams/page.tsx` (1330 lines) — Task 5
- `src/components/league/TeamInsights.tsx` (349 lines) — Task 6
- `src/components/league/LeagueSubTabs.tsx` (40 lines) — Task 7

**총 12 파일 · 4900+ 라인**. 각 Task는 grep 기반 규칙 적용 방식으로 진행. 실코드 인용 대신 규칙 준수 + 서브에이전트가 파일 읽고 판단.

## Note on TDD & 계획서 스타일

이 프로젝트는 테스트 인프라 없음. Validation은 `npx tsc --noEmit` + Vercel 배포 후 사용자 육안 확인. 홈 계획서와 동일 사이클: 구현 → tsc → git add + commit + push → Vercel 배포.

각 페이지 파일이 1100~1330 라인이라 계획서에 실코드 전체를 인용할 수 없다. 대신 각 Task는:
1. 대상 파일 명시
2. 적용할 규칙(위 Global Constraints) 명시
3. grep 기반 발견 지점 처리 지침
4. 예외로 유지할 지점 (`PlayerQuickViewModal` 공용 · 팀 컬러 등)

서브에이전트는 파일을 읽고 Global Constraints 규칙을 grep 결과에 적용한다.

---

## Phase D — 도미노 확장

### Task 1: stats/page.tsx 옐로우 감축 + SectionCard 도입

**Files:**
- Modify: `src/app/league/[orgSlug]/[leagueId]/stats/page.tsx`

**Interfaces:**
- Consumes: `<SectionCard>` (from Task 1 of 홈 계획), `--mm-positive`/`--mm-negative`/`--mm-neutral-strong` (from dark-mode audit), 순위 티어링 rankStyle 패턴 (from Task 15 of 홈 계획)
- Produces: 도미노 확장의 첫 페이지 · 이후 Task들의 참조 기준

**Scope details:**
- 이 파일은 1103 라인, `<div style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}>` 형태의 인라인 패널 다수. 이 패턴들을 `<SectionCard>` 로 대체.
- raw yellow 17건 (분기 chip 활성/서브탭 활성/비교 뱃지 등) → Global Constraint "옐로우 실색상 1곳" 원칙 적용:
  - 활성 chip: `background: var(--mm-yellow)` → `background: var(--mm-ink)` (자동 반전 · 검정/흰) + `color: var(--mm-panel)` (자동 반전)
  - 서브탭 active border: `border-[color:var(--mm-yellow)]` → `border-[color:var(--color-hoop-orange-500)]` (홈 Task 11 하단 탭 패턴과 통일)
  - 비교 뱃지: 옐로우 → 뉴트럴 · 필요 시 subtle yellow-soft tint
- `focus-visible:ring-[color:var(--mm-yellow)]` 발견 시 → `--mm-rule` 로 다운그레이드
- 순위 표시 지점 있으면 rankStyle 패턴 도입 (동일 티어링)
- 하드코딩 hex(`SHOT_MIX_COLORS`) 는 슛존 팔레트 → 기능성 색상 아님 → **KEEP**

- [ ] **Step 1: 파일 전수 읽기 + grep 매핑**

Read the whole file. Then grep patterns:
- `var(--mm-yellow)` (raw) — expect 17 hits
- `var(--mm-yellow-strong)` — count and note
- `focus-visible:ring-\[color:var\(--mm-yellow\)\]` — should downgrade
- `<div style=\{\{ background: 'var(--mm-panel)'` (인라인 패널 · SectionCard 후보) — count
- `#059669|#DC2626|#EA580C|#F59E0B` (기능성 색 하드코딩 · 토큰 치환 후보) — count and locations

- [ ] **Step 2: SectionCard 도입 · 인라인 패널 리팩터**

Add import: `import SectionCard from '@/components/league/ui/SectionCard'`

For each 인라인 카드 패널(`<div style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}>` 계열), 판단:
- 스택 방식(연이은 카드)이면 `<SectionCard variant="stack">`  
- 독립 카드면 `<SectionCard variant="standalone">`
- 배경이 다르면 (`--mm-panel-alt`) `background` prop 사용
- 상단 강조 (`emphasized`) 필요한지 판단

**중요**: 스타일이 wrap 이상으로 특수(그리드 오버레이/absolute 자식 등)하면 SectionCard 로 옮기지 말고 그대로 두되 border/background 규칙만 통일.

- [ ] **Step 3: 옐로우 다운그레이드 (17건)**

각 옐로우 지점에 대해:
- 활성 상태 표시(chip active, tab active, filter active): `--mm-yellow` → `--mm-ink` + text `--mm-panel` (자동 반전, 다크 대비 OK)
- 강조 라인(border-left, ring): `--mm-yellow` → `--color-hoop-orange-500` (홈 하단 탭 패턴과 통일)
- 1위 강조 배경: `--mm-yellow-soft` (subtle tint · KEEP if desired) + `--mm-yellow-strong` 3px 좌측 라인
- 비교 뱃지 등 정보성: 뉴트럴 (`--mm-panel-alt` 배경 + `--mm-ink-soft` 텍스트)

**금지 패턴 방지**: `background: var(--mm-black)` + `color: var(--mm-panel)` 조합 만들지 말 것. 검정 배경엔 `color: '#ffffff'` 하드코딩.

- [ ] **Step 4: focus-visible:ring 다운그레이드**

`focus-visible:ring-[color:var(--mm-yellow)]` → `focus-visible:ring-[color:var(--mm-rule)]` — 모든 발견 지점.

- [ ] **Step 5: tsc + commit + push**

```bash
npx tsc --noEmit
git add src/app/league/[orgSlug]/[leagueId]/stats/page.tsx
git commit -m "refactor(stats): SectionCard 도입 · 옐로우 다운그레이드 · 리그 홈 시각 언어 도미노 확장

- 인라인 패널 → SectionCard variant=stack/standalone
- raw yellow 17건 → hoop-orange (active) · yellow-soft (subtle) · 뉴트럴 (info)
- focus-visible:ring yellow → rule
- 스코프: 이 파일 내부만 · 공용 모달/타 페이지 미터치

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task 2: stats 전용 컴포넌트 5개 정돈

**Files:**
- Modify: `src/components/league/nba/NbaSeasonHighs.tsx` (325 lines)
- Modify: `src/components/league/stats/TopFiveSlot.tsx` (226 lines)
- Modify: `src/components/league/LeagueGroupTabs.tsx` (40 lines)
- Modify: `src/components/league/StatHeader.tsx` (41 lines)
- Modify: `src/components/league/StatCell.tsx` (118 lines)

**Interfaces:**
- Consumes: 동일 규칙 (Global Constraints)
- Note: `BasketballIcons.tsx` · `PlayerQuickViewModal.tsx` · `PlayerCompareModal.tsx` 는 이번 스코프 밖 (공용/모달 · 별도 판단)

**Scope details:**
- 각 컴포넌트에서 grep 기반 옐로우/hex/rounded 파편 발견 → 규칙 적용
- `LeagueGroupTabs.tsx`, `StatHeader.tsx` 는 소형 (40~41 라인) · 통일 규칙 준수
- `TopFiveSlot.tsx` 는 헤더 클릭 시 뜨는 TOP5 팝오버 · SectionCard variant=standalone 적합

- [ ] **Step 1: 5개 파일 순차 grep + fix**

각 파일에 대해 Task 1과 동일 절차:
1. Read 전문
2. Grep `var(--mm-yellow)` · `focus-visible:ring.*yellow` · 하드코딩 hex
3. 규칙 적용:
   - SectionCard 후보면 도입 (팝오버 → variant=standalone)
   - 옐로우 다운그레이드
   - 다크 대비 확인

- [ ] **Step 2: tsc + commit + push**

```bash
npx tsc --noEmit
git add src/components/league/nba/NbaSeasonHighs.tsx src/components/league/stats/TopFiveSlot.tsx src/components/league/LeagueGroupTabs.tsx src/components/league/StatHeader.tsx src/components/league/StatCell.tsx
git commit -m "refactor(stats-components): 5개 컴포넌트 도미노 확장 · SectionCard · 옐로우 다운그레이드

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task 3: roster/page.tsx 옐로우 감축 + SectionCard 도입

**Files:**
- Modify: `src/app/league/[orgSlug]/[leagueId]/roster/page.tsx` (1113 lines)

**Scope details:**
- raw yellow **27건 · 이번 스코프 최다**
- 정렬 chip · 필터 chip · 게스트 토글 · +1 뱃지 · 카드 accent 등 다수
- `rounded-*` 33건 파편화 · Task 1과 다르게 이 파일은 모서리 통일까지 처리
- 팀 컬러(플레이어 카드 좌측 세로 바 등)는 DB에서 오므로 유지

- [ ] **Step 1: 파일 전수 읽기 + grep 매핑**

- [ ] **Step 2: SectionCard 도입 (인라인 패널 → 카드)**

- [ ] **Step 3: 옐로우 27건 다운그레이드**

각 지점 판단:
- chip active: `--mm-ink` bg + `--mm-panel` text
- 필터 활성 border: `--color-hoop-orange-500`
- 게스트 토글: 상태 표시라 `--color-hoop-orange-500` 톤
- +1 뱃지: 뉴트럴 (`--mm-panel-alt` bg + `--mm-ink` text) or `--milestone-near` (긍정 강조)
- 카드 accent (선수 highlight): `--mm-yellow-soft` subtle tint 유지

- [ ] **Step 4: rounded 파편 통일**

`rounded-sm` (2px) / `rounded` (4px) / `rounded-md` (6px) / `rounded-lg` (8px) 혼재 → 계층별 결정:
- chip · badge · 아이콘 버튼: `rounded-md`
- 카드 · 패널: `rounded-md` (SectionCard 는 이미 규정됨 · standalone=6px)
- 이미지 · 아바타 원형: `rounded-full` 유지
- 내부 서브 요소 (진행바 등): `rounded-sm` 유지

- [ ] **Step 5: focus-visible:ring · 다크 대비 확인**

- [ ] **Step 6: tsc + commit + push**

```bash
npx tsc --noEmit
git add src/app/league/[orgSlug]/[leagueId]/roster/page.tsx
git commit -m "refactor(roster): SectionCard 도입 · 옐로우 27건 다운그레이드 · rounded 파편 통일

- 정렬/필터/게스트 chip 옐로우 → hoop-orange · 뉴트럴
- +1 뱃지 · 카드 accent 다운그레이드
- rounded-* 33건 → 계층별 규칙 통일
- 팀 컬러(DB) 유지 · PlayerQuickViewModal 미터치

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task 4: roster 전용 컴포넌트 2개 정돈

**Files:**
- Modify: `src/components/league/EmptyState.tsx` (80 lines)
- Modify: `src/components/league/LeaderBadgePanel.tsx` (208 lines)

**Scope details:**
- `EmptyState` 는 소형 · 옐로우 액센트 있으면 다운그레이드
- `LeaderBadgePanel` 은 각 선수 옆 미니 리더 뱃지 표시 · 순위 티어링 적용 후보

- [ ] **Step 1: 두 파일 순차 grep + fix**

- [ ] **Step 2: LeaderBadgePanel 에 순위 티어링 도입 (있으면)**

각 리더 뱃지가 순위 정보를 담고 있으면 rankStyle 규칙 적용:
- 1-3위: 메달 + 색 배경
- 4-10위: `--milestone-near` 배경 흰 텍스트
- 11+: 뉴트럴

- [ ] **Step 3: tsc + commit + push**

```bash
git add src/components/league/EmptyState.tsx src/components/league/LeaderBadgePanel.tsx
git commit -m "refactor(roster-components): EmptyState · LeaderBadgePanel 도미노 확장

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task 5: teams/page.tsx SectionCard + hex 토큰 치환 + 옐로우 감축

**Files:**
- Modify: `src/app/league/[orgSlug]/[leagueId]/teams/page.tsx` (1330 lines)

**Scope details:**
- **하드코딩 hex 23건** — 이번 스코프 최다 파편 · 우선 토큰화
  - `#DC2626` (실점 · 부정) → `var(--mm-negative)`
  - `#059669` (득점 · 긍정) → `var(--mm-positive)`
  - `#0F766E` (eFG · teal) → 판단: 스탯 정체성 색 → **KEEP** (구분자 역할)
  - `#7C3AED` (STL+BLK · purple) → 판단: 스탯 정체성 색 → **KEEP**
  - `#2563EB` (3P · blue) → 판단: 스탯 정체성 색 → **KEEP**
  - `SHOOTING_COLS` 8색 barColor 팔레트 → 슛존 정체성 → **KEEP**
- raw yellow 12건 → 다운그레이드
- 이 파일은 `StatsTable + TeamDetailPanel + Page` 3 컴포넌트가 병존 · **파일 분할은 스코프 밖** · 각 컴포넌트 안에서 지점별 수정

- [ ] **Step 1: 파일 전수 읽기 + grep 매핑**

Grep:
- `#DC2626` · `#059669` (positive/negative 치환 대상) — expect ~2-4 hits total
- `#0F766E` · `#7C3AED` · `#2563EB` (KEEP · 스탯 정체성)
- `SHOOTING_COLS` (KEEP · 슛존 팔레트)
- `var(--mm-yellow)` (raw) — expect 12 hits
- `<div style=\{\{ background: 'var(--mm-panel)'` — SectionCard 후보

- [ ] **Step 2: SectionCard 도입 · 인라인 패널 리팩터**

- [ ] **Step 3: 하드코딩 hex 치환**

- `#DC2626` → `'var(--mm-negative)'`
- `#059669` → `'var(--mm-positive)'`
- 나머지 스탯 정체성 색은 유지

- [ ] **Step 4: 옐로우 12건 다운그레이드**

- [ ] **Step 5: focus-visible:ring · 다크 대비 확인**

- [ ] **Step 6: tsc + commit + push**

```bash
npx tsc --noEmit
git add src/app/league/[orgSlug]/[leagueId]/teams/page.tsx
git commit -m "refactor(teams): SectionCard 도입 · #DC2626/#059669 → mm-negative/positive 토큰 · 옐로우 12건 다운그레이드

- 하드코딩 hex 23건 중 기능성 색 2종 토큰화 · 스탯 정체성 색 유지
- SectionCard 도입 (StatsTable · TeamDetailPanel 각 섹션)
- raw yellow 12건 → hoop-orange/뉴트럴
- 파일 분할은 후속 리팩터 (이 스코프 밖)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task 6: teams 전용 컴포넌트 (TeamInsights) 정돈

**Files:**
- Modify: `src/components/league/TeamInsights.tsx` (349 lines)

**Scope details:**
- Four Factors · Advanced 하이라이트 표시
- 지표별 색 파편 가능성 → 판단 (스탯 정체성 vs 기능성)

- [ ] **Step 1: grep + fix**

Grep:
- raw yellow
- 하드코딩 hex (positive/negative 치환 대상 여부 판단)
- SectionCard 후보

- [ ] **Step 2: tsc + commit + push**

```bash
git add src/components/league/TeamInsights.tsx
git commit -m "refactor(teams-components): TeamInsights 도미노 확장

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task 7: 공용 서브탭 (LeagueSubTabs) 정돈

**Files:**
- Modify: `src/components/league/LeagueSubTabs.tsx` (40 lines)

**Scope details:**
- 서브 페이지 3개(stats/roster/teams)가 공유하는 서브탭 컴포넌트
- 이번에 함께 정돈 · 옐로우 발견 시 하단 탭 active 패턴과 통일

- [ ] **Step 1: grep + fix**

- [ ] **Step 2: tsc + commit + push**

```bash
git add src/components/league/LeagueSubTabs.tsx
git commit -m "refactor(subtabs): LeagueSubTabs 도미노 확장 · 하단 탭 패턴과 통일

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

## Self-Review Notes

**Spec coverage check** (Global Constraints → Task 매핑):
- **옐로우 1곳 원칙**: Task 1(17건) + Task 2 · Task 3(27건) + Task 4 · Task 5(12건) + Task 6 · Task 7. 총 ~60건 다운그레이드 대상.
- **SectionCard 도입**: Task 1, 3, 5 (진입점 3개) + Task 2, 4, 6 (필요 시)
- **하드코딩 hex 토큰화**: Task 5 (teams 23건 최다)
- **rounded 파편 통일**: Task 3 (roster 33건)
- **focus-visible:ring 다운그레이드**: 모든 Task
- **다크 모드 대비 방지**: 모든 Task
- **순위 티어링**: Task 4 (LeaderBadgePanel)

**Placeholder scan**: 
- 각 Task에 정확한 grep 패턴과 규칙이 명시됨
- 실코드 인용 대신 파일 전문 read + 규칙 적용 방식 채택 (계획서 크기 압축)
- 이는 홈 Task 5/7/11 fix 서브에이전트가 성공적으로 grep 기반 처리한 패턴과 동일

**Type consistency**:
- SectionCard 시그니처는 홈 Task 4에서 확립된 대로 (`variant?, emphasized?, dataTour?, ariaLabel?, className?, background?, children`)
- rankStyle 반환 타입: `{ badge?: string; color: string; bg?: string }`
- CSS 변수 이름 모두 확정 (`--mm-positive`/`--mm-negative`/`--mm-neutral-strong`/`--milestone-near`/`--clutch-5` 등)

**Scope check**:
- 12 파일 · 7 Task · 스코프 명확
- 파란날개/경기기록/스케줄/어드민 완전 제외
- 공용 `PlayerQuickViewModal.tsx` 는 별도 판단 (이번 스코프 밖으로 처리)

**Ambiguity check**:
- "스탯 정체성 색" vs "기능성 색" 구분 필요할 때 Task 5 Step 3에서 명시적 KEEP 목록 제공
- rounded 파편 통일은 Task 3에서만 (다른 파일은 이미 규칙적일 가능성 · 필요 시 각 Task grep에서 판단)

## Execution Handoff

계획서 저장 완료 · self-review 통과. 다음 단계:
- **subagent-driven-development** 스킬로 전환 → Fresh subagent per Task + two-stage review.
- 사용자 지시("실행")에 따라 자동 진행.
- 첫 Task = **Task 1 (stats/page.tsx)**.
