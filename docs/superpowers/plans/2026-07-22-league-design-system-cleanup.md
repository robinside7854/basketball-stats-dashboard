# 리그 홈 디자인 시스템 정돈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 리그 홈(`/league/[orgSlug]/[leagueId]`)의 옐로우 남용·카드 파편화·프로그레스 바 색 로직 등 8개 UI 위계 문제를 3-Phase로 정돈해 완성도를 올린다.

**Architecture:** 신규 파일 최소(공용 카드 컴포넌트 1개) · 나머지는 기존 컴포넌트 in-place 수정. `globals.css` 에 4단계 폰트·여백·마일스톤 근접도·클러치 5단계 CSS 변수 승격 → 각 컴포넌트가 참조. 옐로우 실색상 위치를 8곳 → 1곳(이번 주 하이라이트 CTA) + 예외 1(편집중 버튼)으로 축소.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind 4 · shadcn/ui 패턴 · lucide-react · CSS variables

## Global Constraints

- **테스트 없음**: `npm run test` 스크립트 없음. 검증은 `npx tsc --noEmit` + Vercel 배포 후 육안 확인.
- **모든 커밋 후 자동 push**: master 브랜치 → Vercel 자동 배포 (사용자 규칙).
- **모바일 상시**: 375·414·768·1024·1440px 다섯 폭에서 파괴 없음. 터치 타겟 44×44px.
- **홈에 요약/KPI 카드 신설 금지**: 정보 구조 변경 없이 시각 정돈만.
- **정체성 SVG(농구공·골대·backdrop) 도입 금지**: 별도 스펙(보류) 대상.
- **옐로우 실색상 1곳 원칙**: 이번 주 하이라이트 CTA 1곳만. 편집중 버튼은 예외(편집 모드 임시 상태).
- **한 번에 한 커밋**: 각 Task 완료 시 반드시 `git add <files> && git commit && git push`.
- **파일 경로 규칙**: 모든 파일은 `basketball-stats-dashboard/` 프로젝트 루트 기준 상대 경로.
- **스펙 참조**: [docs/superpowers/specs/2026-07-21-league-design-system-cleanup.md](../specs/2026-07-21-league-design-system-cleanup.md)

## File Structure

**Create (1):**
- `src/components/league/ui/SectionCard.tsx` — 공용 섹션 카드 컴포넌트 (Task A1)

**Modify (10):**
- `src/app/globals.css` — 폰트·여백·마일스톤·클러치 CSS 변수 추가 (Task A2, A3, B9, B10)
- `src/components/league/nba/NbaLeaders.tsx` — B3, C 관련 (모바일 chip · 카테고리 라벨 · 1위 카드)
- `src/components/league/nba/NbaTeamStandings.tsx` — B2 (1위 배경 다운그레이드)
- `src/components/league/nba/NbaRoundsSummary.tsx` — B6 (1위 뱃지 · 하이라이트 링크 · 전체 CTA)
- `src/components/league/HighlightsHome.tsx` — B5, B10 (KIND_STYLE 리팩터 · 전체보기 링크 · +points 배지)
- `src/components/league/MilestoneFeed.tsx` — B4 (트로피 · 마일스톤 텍스트 · 재생 버튼 · 링크)
- `src/components/league/announcements/AnnouncementsHome.tsx` — B1 (카드 옐로우 · 헤더 옐로우 · 그림자)
- `src/components/league/auth/PersonalDashboard.tsx` — B8, B9, C1 (카드 그라디언트 · 아바타 · 뱃지 · SeasonSummary · MilestoneChaser)
- `src/app/league/[orgSlug]/[leagueId]/_components/LeagueLayoutClient.tsx` — B7, C2 (유저 칩 뉴트럴 · 5개 아이콘 버튼 통일)

## Note on TDD

이 프로젝트에는 테스트 인프라가 없다(package.json 확인). writing-plans 스킬의 TDD 원칙은 **`npx tsc --noEmit` 통과 + Vercel 배포 후 육안 확인**으로 대체한다. 각 Task 사이클:
1. 구현
2. `npx tsc --noEmit` 통과
3. `git add` + `git commit`
4. `git push`
5. Vercel 배포 후 사용자 확인 (Phase 완료 시)

---

## Phase A — Tokens & Rhythm

Phase B/C 가 참조할 토큰과 공용 컴포넌트를 먼저 정의한다. Phase A 완료 시 눈에 보이는 변화는 최소(카드가 공용 컴포넌트로 옮겨졌으나 스타일은 동일).

### Task A1: SectionCard 공용 컴포넌트 신설

**Files:**
- Create: `src/components/league/ui/SectionCard.tsx`

**Interfaces:**
- Produces: `<SectionCard variant?: 'stack' | 'standalone', emphasized?: boolean, dataTour?: string, className?: string, children>`
  - `variant='stack'` (기본): border 1px, borderTop 0, borderRadius 0 (NBA 4형제 스택 방식)
  - `variant='standalone'`: border 1px, borderRadius 6px (PersonalDashboard / MilestoneFeed / AnnouncementsHome 방식)
  - `emphasized=true`: border-top 을 3px `--mm-yellow-soft` 라인으로 (옐로우 실색상 대체 · Task B에서 활용)

- [ ] **Step 1: SectionCard 파일 생성**

Create `src/components/league/ui/SectionCard.tsx`:

```tsx
'use client'
// 리그 홈 · 서브 페이지 공통 섹션 카드
// - variant='stack': NBA 4형제 스택 방식 (borderTop 0, radius 0)
// - variant='standalone': 독립 카드 (radius 6px)
// - emphasized=true: 상단 3px 옐로우-soft 라인 (옐로우 실색상 대체)
import type { ReactNode } from 'react'

interface Props {
  variant?: 'stack' | 'standalone'
  emphasized?: boolean
  dataTour?: string
  ariaLabel?: string
  className?: string
  children: ReactNode
}

export default function SectionCard({
  variant = 'stack',
  emphasized = false,
  dataTour,
  ariaLabel,
  className = '',
  children,
}: Props) {
  const isStandalone = variant === 'standalone'
  return (
    <section
      data-tour={dataTour}
      aria-label={ariaLabel}
      className={`mm-brand ${className}`}
      style={{
        background: 'var(--mm-panel)',
        border: '1px solid var(--mm-rule)',
        borderTop: isStandalone ? '1px solid var(--mm-rule)' : (emphasized ? '3px solid var(--mm-yellow-soft)' : 0),
        borderRadius: isStandalone ? '6px' : 0,
        overflow: 'hidden',
      }}
    >
      {children}
    </section>
  )
}
```

- [ ] **Step 2: 타입 체크 통과 확인**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: 커밋 + push**

```bash
git add src/components/league/ui/SectionCard.tsx
git commit -m "feat(ui): 리그 공용 SectionCard 컴포넌트 신설 · stack/standalone variant

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task A2: 폰트 스케일 & tracking & 라벨 대비 토큰 추가

**Files:**
- Modify: `src/app/globals.css` (`@theme` 블록 확장)

**Interfaces:**
- Produces: CSS variables `--fs-hero`, `--fs-num`, `--fs-body`, `--fs-label`, `--track-label`
- Consumes: 없음 (전역 토큰)

- [ ] **Step 1: `@theme` 블록에 폰트 스케일 추가**

Find in `src/app/globals.css`, inside the `@theme { ... }` block (starting at line 40), just before the closing `}` at line 82, add:

```css
  /* ===== 폰트 스케일 위계 (2026-07-22 · 리그 디자인 시스템 정돈) =====
     각 컴포넌트가 인라인 clamp 대신 이 토큰 참조 */
  --fs-hero:  clamp(32px, 8vw, 42px);   /* 큰 숫자 (스탯 값 · 리더 값) */
  --fs-num:   clamp(20px, 5vw, 26px);   /* 중간 숫자 (승률 · 순위) */
  --fs-body:  clamp(14px, 3.6vw, 16px); /* 본문 텍스트 (신규 · 중간 단계) */
  --fs-label: 12px;                     /* 상단 라벨 (uppercase 카테고리) */
  --track-label: 0.14em;                /* 라벨 tracking 통일 (0.14 · 0.16 · 0.18 혼재 해소) */
```

- [ ] **Step 2: 라이트/다크 라벨 색 대비 재확인**

Find in `src/app/globals.css` line 30 (dark) and line 16 (light), verify:
- Light: `--mm-muted: #52525B` (zinc-600, WCAG AA 4.5:1 통과 확인)
- Dark: `--mm-muted: #B8B8BE` (다크에서 대비 부족 우려)

Change dark `--mm-muted` at line 30 from `#B8B8BE` to `#C4C4CB` (약 20% 밝기 상향):

Old:
```css
  --mm-muted: #B8B8BE;          /* 이전 A1A1AA → 더 밝게 (다크에서 뮤트 텍스트 가독성) */
```

New:
```css
  --mm-muted: #C4C4CB;          /* 2026-07-22 상향 (WCAG AA 4.5:1 · 라벨 대비 개선) */
```

- [ ] **Step 3: 타입 체크 + 커밋 + push**

```bash
npx tsc --noEmit
git add src/app/globals.css
git commit -m "feat(css): 폰트 스케일 4단계 토큰 · 라벨 tracking 통일 · 다크 mm-muted 대비 상향

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task A3: 여백 리듬 토큰 추가

**Files:**
- Modify: `src/app/globals.css` (`@theme` 블록 확장 · A2 뒤에 이어붙임)

**Interfaces:**
- Produces: `--pad-h-x`, `--pad-h-y`, `--pad-body-x`, `--pad-body-y`

- [ ] **Step 1: 여백 토큰 추가**

Find in `src/app/globals.css`, `@theme { ... }` block. Just after A2에서 추가한 폰트 토큰들 아래에 추가:

```css
  /* ===== 여백 리듬 토큰 (2026-07-22) =====
     헤더/본문 padding 을 4-step → 3-step 으로 축소 · clamp 로 반응형 */
  --pad-h-x:    clamp(16px, 4vw, 40px);  /* 섹션 헤더 좌우 (px-4 sm:px-6 md:px-10 대체) */
  --pad-h-y:    clamp(16px, 3vw, 20px);  /* 섹션 헤더 상하 (py-4 md:py-5 대체) */
  --pad-body-x: clamp(16px, 4vw, 40px);  /* 섹션 본문 좌우 */
  --pad-body-y: clamp(16px, 4vw, 40px);  /* 섹션 본문 상하 */
```

- [ ] **Step 2: `@layer utilities` 에 유틸리티 클래스 추가**

Find at the end of `src/app/globals.css`, add a new `@layer utilities` block (혹은 기존 `@layer utilities` 안에 추가):

```css
@layer utilities {
  .section-header-pad {
    padding-left: var(--pad-h-x);
    padding-right: var(--pad-h-x);
    padding-top: var(--pad-h-y);
    padding-bottom: var(--pad-h-y);
  }
  .section-body-pad {
    padding: var(--pad-body-y) var(--pad-body-x);
  }
}
```

- [ ] **Step 3: 타입 체크 + 커밋 + push**

```bash
npx tsc --noEmit
git add src/app/globals.css
git commit -m "feat(css): 여백 리듬 토큰 · section-header-pad / section-body-pad 유틸

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task A4: SectionCard 도입 리팩터 (5개 파일)

7개 컴포넌트 중 인라인 카드 스타일을 `<SectionCard>` 로 대체. 이 태스크는 시각적 변화 최소(스타일은 SectionCard 안에 그대로) — Phase B/C 진행 시 카드 스타일 변경이 한 곳에서 이뤄지도록 준비.

**Files:**
- Modify: `src/components/league/nba/NbaLeaders.tsx` (line 87-95)
- Modify: `src/components/league/nba/NbaTeamStandings.tsx` (line 30-37)
- Modify: `src/components/league/nba/NbaRoundsSummary.tsx` (line 45-53)
- Modify: `src/components/league/HighlightsHome.tsx` (line 100-108)
- Modify: `src/components/league/MilestoneFeed.tsx` (line 118-124)

**Interfaces:**
- Consumes: `<SectionCard variant='stack' | 'standalone' emphasized? dataTour? ariaLabel? className?>` from Task A1

- [ ] **Step 1: NbaLeaders 리팩터**

In `src/components/league/nba/NbaLeaders.tsx`:

Add import (top of file, after existing imports):
```tsx
import SectionCard from '@/components/league/ui/SectionCard'
```

Find lines 87-95:
```tsx
      <section
        className="mm-brand"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
          borderTop: 0,
        }}
      >
```

Replace with:
```tsx
      <SectionCard variant="stack">
```

Find the matching closing `</section>` tag (line 307) and replace with `</SectionCard>`.

- [ ] **Step 2: NbaTeamStandings 리팩터**

In `src/components/league/nba/NbaTeamStandings.tsx`:

Add import:
```tsx
import SectionCard from '@/components/league/ui/SectionCard'
```

Find lines 30-37:
```tsx
    <section
      data-tour="standings"
      className="mm-brand"
      style={{
        background: 'var(--mm-panel)',
        border: '1px solid var(--mm-rule)',
        borderTop: 0,
      }}
    >
```

Replace with:
```tsx
    <SectionCard variant="stack" dataTour="standings">
```

Find matching closing `</section>` (line 135) and replace with `</SectionCard>`.

- [ ] **Step 3: NbaRoundsSummary 리팩터**

In `src/components/league/nba/NbaRoundsSummary.tsx`:

Add import:
```tsx
import SectionCard from '@/components/league/ui/SectionCard'
```

Find lines 45-53:
```tsx
      <section
        data-tour="rounds"
        className="mm-brand"
        style={{
          background: 'var(--mm-panel-alt)',
          border: '1px solid var(--mm-rule)',
          borderTop: 0,
        }}
      >
```

Replace with:
```tsx
      <SectionCard variant="stack" dataTour="rounds" className="[&>section]:!bg-[color:var(--mm-panel-alt)]">
```

**Note**: NbaRoundsSummary 는 `--mm-panel-alt` 배경. SectionCard 는 `--mm-panel` 기본이므로 className override. 실은 SectionCard 에 background prop 추가하는 게 나음:

**Revise Step 3 approach — SectionCard 에 background prop 추가**:

Back to `src/components/league/ui/SectionCard.tsx`, replace Props interface and body:

```tsx
interface Props {
  variant?: 'stack' | 'standalone'
  emphasized?: boolean
  dataTour?: string
  ariaLabel?: string
  className?: string
  background?: string  // CSS color; default var(--mm-panel)
  children: ReactNode
}

export default function SectionCard({
  variant = 'stack',
  emphasized = false,
  dataTour,
  ariaLabel,
  className = '',
  background = 'var(--mm-panel)',
  children,
}: Props) {
  const isStandalone = variant === 'standalone'
  return (
    <section
      data-tour={dataTour}
      aria-label={ariaLabel}
      className={`mm-brand ${className}`}
      style={{
        background,
        border: '1px solid var(--mm-rule)',
        borderTop: isStandalone ? '1px solid var(--mm-rule)' : (emphasized ? '3px solid var(--mm-yellow-soft)' : 0),
        borderRadius: isStandalone ? '6px' : 0,
        overflow: 'hidden',
      }}
    >
      {children}
    </section>
  )
}
```

Then NbaRoundsSummary section replacement:

```tsx
<SectionCard variant="stack" dataTour="rounds" background="var(--mm-panel-alt)">
```

- [ ] **Step 4: HighlightsHome 리팩터**

In `src/components/league/HighlightsHome.tsx`:

Add import:
```tsx
import SectionCard from '@/components/league/ui/SectionCard'
```

Find lines 100-108:
```tsx
      <section
        data-tour="highlights-home"
        className="mm-brand"
        style={{
          background: 'var(--mm-panel-alt)',
          border: '1px solid var(--mm-rule)',
          borderTop: 0,
        }}
      >
```

Replace with:
```tsx
      <SectionCard variant="stack" dataTour="highlights-home" background="var(--mm-panel-alt)">
```

Find matching closing `</section>` (line 335) and replace with `</SectionCard>`.

- [ ] **Step 5: MilestoneFeed 리팩터**

In `src/components/league/MilestoneFeed.tsx`:

Add import:
```tsx
import SectionCard from '@/components/league/ui/SectionCard'
```

Find lines 118-124:
```tsx
      <section
        className="mm-brand"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
        }}
      >
```

**Note**: MilestoneFeed 는 `borderTop: 0` 이 빠져 있어 스택 파괴 상태였음. Spec 대로 standalone 으로 갈지 stack 으로 갈지 결정 필요. 스펙 A-1 은 "borderTop:0 스택 규칙" 이므로 stack 이 정답:

Replace with:
```tsx
      <SectionCard variant="stack">
```

Find matching closing `</section>` (line 294) and replace with `</SectionCard>`.

- [ ] **Step 6: 타입 체크 통과 확인**

Run: `npx tsc --noEmit`
Expected: 0 errors.

Run: `npm run lint`
Expected: 0 errors (or existing baseline).

- [ ] **Step 7: 커밋 + push**

```bash
git add src/components/league/ui/SectionCard.tsx src/components/league/nba/NbaLeaders.tsx src/components/league/nba/NbaTeamStandings.tsx src/components/league/nba/NbaRoundsSummary.tsx src/components/league/HighlightsHome.tsx src/components/league/MilestoneFeed.tsx
git commit -m "refactor(league): 5개 홈 섹션을 SectionCard 공용 컴포넌트로 통합

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task A5: AnnouncementsHome / PersonalDashboard 는 Phase B 에서 함께 처리

AnnouncementsHome (옐로우 헤더가 지금 시각적 정체성) 과 PersonalDashboard (그라디언트 카드) 는 스타일 자체를 손대야 SectionCard 로 옮길 수 있으므로 Task B1/B8 에서 함께.

---

## Phase B — Color System

### Task B1: AnnouncementsHome 옐로우 다운그레이드 + SectionCard 편입

**Files:**
- Modify: `src/components/league/announcements/AnnouncementsHome.tsx`

- [ ] **Step 1: SectionCard import 추가**

In `src/components/league/announcements/AnnouncementsHome.tsx`, add after existing imports (near top):

```tsx
import SectionCard from '@/components/league/ui/SectionCard'
```

- [ ] **Step 2: 카드 outer 섹션을 SectionCard 로 대체**

Find lines 160-166:
```tsx
    <section
      data-tour="announcements"
      className="mm-brand relative rounded-md overflow-hidden shadow-[0_10px_36px_-14px_rgba(202,138,4,0.35)]"
      style={{ background: 'var(--mm-panel)', border: '2px solid var(--mm-yellow)' }}
      aria-label="리그 공지"
    >
```

Replace with:
```tsx
    <SectionCard variant="standalone" dataTour="announcements" ariaLabel="리그 공지" emphasized>
```

Find matching `</section>` at end (near line 404) and replace with `</SectionCard>`.

- [ ] **Step 3: 헤더 배경 옐로우 → panel-alt, 텍스트 색 조정**

Find lines 167-170:
```tsx
      <header
        className="flex items-center justify-between gap-2 px-4 sm:px-6 md:px-10 py-3 sm:py-4"
        style={{ borderBottom: '1px solid var(--mm-rule)', background: 'var(--mm-yellow)' }}
      >
```

Replace with:
```tsx
      <header
        className="flex items-center justify-between gap-2 px-4 sm:px-6 md:px-10 py-3 sm:py-4"
        style={{ borderBottom: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}
      >
```

- [ ] **Step 4: 헤더 내부 텍스트/아이콘 색 조정 (검정 → mm-ink)**

Find line 172 (Megaphone icon):
```tsx
          <Megaphone size={18} className="text-[color:var(--mm-black)] shrink-0" aria-hidden />
```

Replace with:
```tsx
          <Megaphone size={18} className="text-[color:var(--mm-ink)] shrink-0" aria-hidden />
```

Find line 173-175 (공지 헤더 텍스트):
```tsx
          <h2 className="font-jersey font-black uppercase text-base sm:text-lg tracking-[0.14em]" style={{ color: 'var(--mm-black)' }}>
            공지
          </h2>
```

Replace `color: 'var(--mm-black)'` with `color: 'var(--mm-ink)'`.

Find lines 177-184 (NEW 뱃지):
```tsx
            <span
              className="text-[10px] font-black uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm inline-flex items-center gap-1"
              style={{ background: 'var(--mm-black)', color: 'var(--mm-yellow)' }}
              aria-label={`미확인 ${unreadCount}건`}
            >
              <Sparkles size={10} aria-hidden />
              NEW {unreadCount}
            </span>
```

Replace with:
```tsx
            <span
              className="text-[10px] font-black uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm inline-flex items-center gap-1"
              style={{ background: '#DC2626', color: '#ffffff' }}
              aria-label={`미확인 ${unreadCount}건`}
            >
              <Sparkles size={10} aria-hidden />
              NEW {unreadCount}
            </span>
```

**Rationale**: NEW 뱃지는 알람 성격 → 적색이 자연스럽고 헤더 뉴트럴화와 충돌 없음. Featured card 의 NEW 뱃지 (line 237-241) 이미 `#DC2626` 사용 중 → 일관성.

- [ ] **Step 5: "전체" 링크 색 조정**

Find lines 189-197:
```tsx
            <Link
              href={`/league/${orgSlug}/${leagueId}/archive/announcements`}
              className="min-h-[36px] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.10em] rounded-sm cursor-pointer transition-colors inline-flex items-center gap-1"
              style={{ background: 'transparent', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
              aria-label="공지 전체 보기"
            >
              전체
              <ChevronRight size={12} aria-hidden />
            </Link>
```

Replace `color: 'var(--mm-black)'` with `color: 'var(--mm-ink)'`. Replace `border: '1px solid var(--mm-black)'` with `border: '1px solid var(--mm-rule)'`.

- [ ] **Step 6: "새 공지" 버튼은 편집 상태 CTA → 검정+옐로우 유지**

Lines 199-210 유지 (편집 모드 CTA 는 시각적 강조 유지).

- [ ] **Step 7: Featured card "자세히 보기 →" 옐로우 링크 다운그레이드**

Find lines 268-273:
```tsx
                <span
                  className="inline-block mt-3 text-[11px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: 'var(--mm-yellow-strong)' }}
                >
                  자세히 보기 →
                </span>
```

Replace `color: 'var(--mm-yellow-strong)'` with `color: 'var(--mm-ink-soft)'`.

- [ ] **Step 8: Featured card 작성자 User 아이콘 옐로우 → ink-soft**

Find line 251:
```tsx
                      <User size={13} className="text-[color:var(--mm-yellow-strong)]" aria-hidden />
```

Replace `text-[color:var(--mm-yellow-strong)]` with `text-[color:var(--mm-ink-soft)]`.

Also line 338 (rest list User icon):
```tsx
                              <User size={10} className="text-[color:var(--mm-yellow-strong)]" aria-hidden />
```

Replace with `text-[color:var(--mm-ink-soft)]`.

- [ ] **Step 9: "고정" 뱃지 색 유지**

`background: 'var(--mm-black)', color: 'var(--mm-yellow)'` (lines 231-232, 331) 은 **유지** — "고정" 은 예외적 강조 필요.

- [ ] **Step 10: 타입 체크 + 커밋 + push**

```bash
npx tsc --noEmit
git add src/components/league/announcements/AnnouncementsHome.tsx
git commit -m "refactor(announcements): 옐로우 헤더 배경/보더 다운그레이드 · SectionCard 편입

- 카드 outer border 2px yellow → 1px rule (SectionCard emphasized)
- 헤더 배경 yellow → panel-alt · 아이콘/텍스트 색 ink 로 조정
- NEW 뱃지 검정+옐로우 → 적색+흰색 (일관성)
- 자세히 보기 · User 아이콘 yellow-strong → ink-soft
- 고정 뱃지 · 편집 CTA · 삭제 버튼 색은 예외 강조로 유지

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task B2: NbaTeamStandings 1위 옐로우 → subtle tint

**Files:**
- Modify: `src/components/league/nba/NbaTeamStandings.tsx`

- [ ] **Step 1: 1위 배경 색 다운그레이드**

Find lines 55-66:
```tsx
        {standings.map((t, idx) => {
          const isTop = idx === 0
          const rateColor = t.winRate >= 60 ? '#059669' : t.winRate >= 40 ? 'var(--mm-yellow-strong)' : '#DC2626'
          return (
            <div
              key={t.key}
              className="px-4 sm:px-6 md:px-8 py-3 sm:py-3.5"
              style={{
                background: isTop ? 'var(--mm-yellow)' : 'transparent',
                borderBottom: idx < standings.length - 1 ? '1px solid var(--mm-rule)' : 'none',
                color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)',
              }}
            >
```

Replace with:
```tsx
        {standings.map((t, idx) => {
          const isTop = idx === 0
          const rateColor = t.winRate >= 60 ? '#059669' : t.winRate >= 40 ? 'var(--mm-ink-soft)' : '#DC2626'
          return (
            <div
              key={t.key}
              className="px-4 sm:px-6 md:px-8 py-3 sm:py-3.5"
              style={{
                background: isTop ? 'var(--mm-yellow-soft)' : 'transparent',
                borderLeft: isTop ? '3px solid var(--mm-yellow-strong)' : '3px solid transparent',
                borderBottom: idx < standings.length - 1 ? '1px solid var(--mm-rule)' : 'none',
                color: 'var(--mm-ink)',
              }}
            >
```

**Rationale**: 
- `rateColor`: 40~60% 옐로우 → `--mm-ink-soft` (뉴트럴, 스펙 B-1)
- 1위 배경: 실색상 → soft tint (6% 정도)
- 좌측 3px 옐로우 라인으로 강조 유지 (실색상 위치는 아니고 액센트)
- 텍스트 색: isTop 흑 → ink 통일 (soft tint 위에서 잘 읽힘)

- [ ] **Step 2: 1위 팀의 개별 텍스트 색 정리**

Find lines 70-77 (순위 숫자):
```tsx
                <span
                  className="font-jersey font-black tabular-nums text-right leading-none"
                  style={{
                    fontSize: isTop ? 'clamp(20px, 5.5vw, 26px)' : 'clamp(18px, 5vw, 22px)',
                    color: isTop ? 'var(--mm-black)' : 'var(--mm-muted)',
                  }}
                >
                  {idx + 1}
                </span>
```

Change `color: isTop ? 'var(--mm-black)' : 'var(--mm-muted)'` to `color: isTop ? 'var(--mm-ink)' : 'var(--mm-muted)'`.

Find lines 84-97 (팀 이름):
```tsx
                <span
                  className="font-jersey uppercase min-w-0 break-keep"
                  style={{
                    fontSize: isTop ? 'clamp(16px, 4.6vw, 22px)' : 'clamp(14px, 3.8vw, 18px)',
                    fontWeight: 900,
                    letterSpacing: '-0.005em',
                    color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)',
                    lineHeight: 1.15,
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {t.name}
                </span>
```

Change `color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)'` to `color: 'var(--mm-ink)'` (통일).

Find lines 98-116 (승률 텍스트):
```tsx
                <span
                  className="font-jersey font-black tabular-nums leading-none"
                  style={{
                    fontSize: isTop ? 'clamp(18px, 5.2vw, 24px)' : 'clamp(16px, 4.6vw, 20px)',
                    color: isTop ? 'var(--mm-black)' : rateColor,
                    minWidth: '64px',
                    textAlign: 'right',
                    letterSpacing: '-0.01em',
                  }}
                  aria-label={`승률 ${t.winRate.toFixed(1)} 퍼센트`}
                >
                  {t.winRate.toFixed(1)}
                  <span
                    className="text-[13px] font-bold ml-0.5 align-baseline"
                    style={{ color: isTop ? 'rgba(0,0,0,0.6)' : 'var(--mm-muted)' }}
                  >
                    %
                  </span>
                </span>
```

Change:
- Outer `color: isTop ? 'var(--mm-black)' : rateColor` → `color: rateColor` (1위도 승률 기준 색 통일)
- Inner `color: isTop ? 'rgba(0,0,0,0.6)' : 'var(--mm-muted)'` → `color: 'var(--mm-muted)'`

- [ ] **Step 3: 타입 체크 + 커밋 + push**

```bash
npx tsc --noEmit
git add src/components/league/nba/NbaTeamStandings.tsx
git commit -m "refactor(standings): 1위 옐로우 배경 → soft tint + 좌측 3px 라인 강조

- background yellow → yellow-soft (6%) · 텍스트 흑→ink 통일
- 40-60% 승률 rate color yellow-strong → mm-ink-soft (뉴트럴)
- 1위 팀 텍스트 색 흑→ink 통일 (soft tint 위 가독성)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task B3: NbaLeaders 옐로우 다운그레이드

**Files:**
- Modify: `src/components/league/nba/NbaLeaders.tsx`

- [ ] **Step 1: 모바일 카테고리 chip active 옐로우 → 검정**

Find lines 119-140:
```tsx
            <div className="sm:hidden flex overflow-x-auto scrollbar-hide gap-1.5 px-4 py-3" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
              {CATEGORIES.map(cat => {
                const active = cat.key === selectedCatKey
                return (
                  <button
                    key={String(cat.key)}
                    type="button"
                    onClick={() => setSelectedCatKey(cat.key)}
                    className="shrink-0 min-h-[36px] px-3 py-1.5 text-xs font-black uppercase transition-colors cursor-pointer whitespace-nowrap"
                    style={{
                      background: active ? 'var(--mm-yellow)' : 'var(--mm-panel-alt)',
                      color: active ? 'var(--mm-black)' : 'var(--mm-ink-soft)',
                      border: `1px solid ${active ? 'var(--mm-black)' : 'var(--mm-rule)'}`,
                      borderRadius: '4px',
                      letterSpacing: '0.10em',
                    }}
                    aria-pressed={active}
                  >
                    {cat.term}
                  </button>
                )
              })}
            </div>
```

Change:
- `background: active ? 'var(--mm-yellow)' : 'var(--mm-panel-alt)'` → `background: active ? 'var(--mm-ink)' : 'var(--mm-panel-alt)'`
- `color: active ? 'var(--mm-black)' : 'var(--mm-ink-soft)'` → `color: active ? 'var(--mm-panel)' : 'var(--mm-ink-soft)'`
- `border: 1px solid ${active ? 'var(--mm-black)' : 'var(--mm-rule)'}` → `border: 1px solid ${active ? 'var(--mm-ink)' : 'var(--mm-rule)'}`

- [ ] **Step 2: 카테고리 라벨 옐로우 → ink-soft**

Find lines 168-173:
```tsx
                    <h4
                      className="font-black uppercase break-keep"
                      style={{ color: 'var(--mm-yellow-strong)', fontSize: '13px', letterSpacing: '0.18em', lineHeight: 1.3 }}
                    >
                      {cat.label}
                    </h4>
```

Change `color: 'var(--mm-yellow-strong)'` to `color: 'var(--mm-ink-soft)'`. Also change `letterSpacing: '0.18em'` to `letterSpacing: 'var(--track-label)'` (통일).

- [ ] **Step 3: 1위 카드 옐로우 배경 → soft tint**

Find lines 185-196 (button style for Top3):
```tsx
                        <button
                          key={p.player_id}
                          onClick={() => setQuickPlayer({ id: p.player_id, name: p.name })}
                          className="w-full grid gap-3 sm:gap-4 items-center transition-colors duration-200 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                          style={{
                            gridTemplateColumns: `auto minmax(0,auto) minmax(0,1fr) auto`,
                            padding: isTop ? '14px 12px' : '10px 12px',
                            background: isTop ? 'var(--mm-yellow)' : 'transparent',
                            color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)',
                          }}
                        >
```

Change:
- `background: isTop ? 'var(--mm-yellow)' : 'transparent'` → `background: isTop ? 'var(--mm-yellow-soft)' : 'transparent'`
- Add `borderLeft: isTop ? '3px solid var(--mm-yellow-strong)' : '3px solid transparent'`
- `color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)'` → `color: 'var(--mm-ink)'`

- [ ] **Step 4: 1위 순위 숫자·이니셜·이름·GP 색 통일**

Find line 201 (순위 숫자):
```tsx
                              color: isTop ? 'var(--mm-black)' : 'var(--mm-muted)',
```

Change to:
```tsx
                              color: isTop ? 'var(--mm-ink)' : 'var(--mm-muted)',
```

Find line 217 (아바타 보더):
```tsx
                              border: `${isTop ? 3 : 2}px solid ${isTop ? 'var(--mm-black)' : 'var(--mm-rule)'}`,
```

Change to:
```tsx
                              border: `${isTop ? 3 : 2}px solid ${isTop ? 'var(--mm-yellow-strong)' : 'var(--mm-rule)'}`,
```

Find line 233 (이니셜 색):
```tsx
                                  color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)',
```

Change to:
```tsx
                                  color: 'var(--mm-ink)',
```

Find line 247 (이름 색):
```tsx
                                color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)',
```

Change to:
```tsx
                                color: 'var(--mm-ink)',
```

Find line 261 (GP 라운드):
```tsx
                                color: isTop ? 'rgba(0,0,0,0.6)' : 'var(--mm-muted)',
```

Change to:
```tsx
                                color: 'var(--mm-muted)',
```

Find line 277 (값 큰 숫자):
```tsx
                                color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)',
```

Change to:
```tsx
                                color: 'var(--mm-ink)',
```

Find line 288 (subFormat 색):
```tsx
                                  color: isTop ? 'rgba(0,0,0,0.6)' : 'var(--mm-muted)',
```

Change to:
```tsx
                                  color: 'var(--mm-muted)',
```

- [ ] **Step 5: 타입 체크 + 커밋 + push**

```bash
npx tsc --noEmit
git add src/components/league/nba/NbaLeaders.tsx
git commit -m "refactor(leaders): 옐로우 남용 다운그레이드 · 8x1위 옐로우 블록 제거

- 모바일 chip active yellow → ink (뉴트럴 액티브)
- 카테고리 라벨 yellow-strong → ink-soft · tracking 토큰
- 1위 카드 배경 yellow → yellow-soft + 좌측 3px yellow-strong 라인
- 1위 아바타 보더 mm-black → yellow-strong (subtle 강조)
- 1위 텍스트 흑→ink 통일 (soft tint 위 가독성)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task B4: MilestoneFeed 옐로우 다운그레이드

**Files:**
- Modify: `src/components/league/MilestoneFeed.tsx`

- [ ] **Step 1: 트로피 아이콘 색 + "마일스톤" 텍스트 색**

Find lines 130-141:
```tsx
          <div className="flex items-center gap-2 min-w-0">
            <Trophy size={18} aria-hidden style={{ color: 'var(--mm-yellow-strong)' }} />
            <h3
              className="font-jersey font-black uppercase break-keep"
              style={{
                color: 'var(--mm-ink)',
                fontSize: '22px',
                letterSpacing: '-0.005em',
              }}
            >
              최근 <span style={{ color: 'var(--mm-yellow-strong)' }}>마일스톤</span>
            </h3>
          </div>
```

Change:
- Trophy `color: 'var(--mm-yellow-strong)'` → `color: 'var(--mm-ink-soft)'`
- `<span style={{ color: 'var(--mm-yellow-strong)' }}>마일스톤</span>` → `<span style={{ color: 'var(--mm-ink-soft)' }}>마일스톤</span>`

- [ ] **Step 2: 달성 수치 뱃지 옐로우 → ink-soft**

Find lines 211-220:
```tsx
                        <span
                          className="ml-1.5 tabular-nums"
                          style={{
                            color: 'var(--mm-yellow-strong)',
                            fontSize: 'clamp(15px, 4vw, 18px)',
                            fontWeight: 900,
                          }}
                        >
                          {r.target}
                        </span>
```

Change `color: 'var(--mm-yellow-strong)'` to `color: 'var(--mm-ink)'` (달성 수치는 본문과 통합, 강조는 볼드로).

- [ ] **Step 3: 재생 버튼 옐로우 배경 → 검정 (뉴트럴 CTA)**

Find lines 247-263:
```tsx
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (playable) setClip(r)
                    }}
                    disabled={!playable}
                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] shrink-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1 disabled:cursor-not-allowed"
                    style={{
                      background: playable ? 'var(--mm-yellow)' : 'var(--mm-panel)',
                      color: playable ? 'var(--mm-black)' : 'var(--mm-muted)',
                      border: `1px solid ${playable ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
                      borderRadius: '4px',
                      opacity: playable ? 1 : 0.5,
                    }}
                    aria-label={playable ? `${r.name} ${r.target} 달성 순간 재생` : '영상 없음'}
                    title={playable ? '그 순간 재생' : '영상 없음'}
                  >
                    <Play size={16} />
                  </button>
```

Change style:
- `background: playable ? 'var(--mm-yellow)' : 'var(--mm-panel)'` → `background: playable ? 'var(--mm-ink)' : 'var(--mm-panel)'`
- `color: playable ? 'var(--mm-black)' : 'var(--mm-muted)'` → `color: playable ? 'var(--mm-panel)' : 'var(--mm-muted)'`
- `border: 1px solid ${playable ? 'var(--mm-yellow)' : 'var(--mm-rule)'}` → `border: 1px solid ${playable ? 'var(--mm-ink)' : 'var(--mm-rule)'}`

- [ ] **Step 4: "전체 마일스톤 보기" 링크 옐로우 → ink-soft**

Find lines 279-291:
```tsx
            <Link
              href={milestonesHref}
              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] min-h-[36px] px-3 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
              style={{
                color: 'var(--mm-yellow-strong)',
                background: 'var(--mm-panel-alt)',
                border: '1px solid var(--mm-rule)',
                borderRadius: '4px',
              }}
            >
              전체 마일스톤 보기
              <ChevronRight size={12} />
            </Link>
```

Change `color: 'var(--mm-yellow-strong)'` to `color: 'var(--mm-ink-soft)'`.

- [ ] **Step 5: 타입 체크 + 커밋 + push**

```bash
npx tsc --noEmit
git add src/components/league/MilestoneFeed.tsx
git commit -m "refactor(milestones): 트로피/마일스톤/재생/링크 옐로우 4곳 → 뉴트럴

- 트로피 아이콘 + '마일스톤' 텍스트 yellow-strong → ink-soft
- 달성 수치 yellow-strong → ink (본문 통합, 볼드로 강조)
- 재생 버튼 yellow → ink 배경 (뉴트럴 CTA)
- 전체 마일스톤 링크 yellow-strong → ink-soft

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task B5: HighlightsHome 옐로우 다운그레이드 (부분)

`winning` 스타일과 위닝샷 카드 보더는 Task B10 (클러치 5단계 재정렬)에서 처리. 이 Task 는 나머지 옐로우 지점만.

**Files:**
- Modify: `src/components/league/HighlightsHome.tsx`

- [ ] **Step 1: "전체 보기" 링크 옐로우 → ink-soft**

Find lines 161-169:
```tsx
          <Link
            href={roundHref}
            className="inline-flex items-center gap-1 text-[11px] sm:text-[12px] font-black tracking-[0.14em] uppercase min-h-[36px] px-2 -mx-2 cursor-pointer transition-colors"
            style={{ color: 'var(--mm-yellow-strong)' }}
            aria-label="이번 라운드 하이라이트 전체 보기"
          >
            전체 보기
            <ChevronRight size={14} />
          </Link>
```

Change `color: 'var(--mm-yellow-strong)'` to `color: 'var(--mm-ink-soft)'`.

- [ ] **Step 2: "+points" 배지 옐로우 → 딥 오렌지 (클러치 스케일 정렬)**

Find lines 293-304:
```tsx
                    {c.points > 0 && (
                      <span
                        className="text-[11px] font-black px-1.5 py-0.5"
                        style={{
                          background: 'var(--mm-yellow)',
                          color: 'var(--mm-black)',
                          borderRadius: '3px',
                        }}
                      >
                        +{c.points}
                      </span>
                    )}
```

Change:
- `background: 'var(--mm-yellow)'` → `background: 'var(--color-hoop-orange-500)'`
- `color: 'var(--mm-black)'` → `color: '#ffffff'`

- [ ] **Step 3: PlayCircle 아이콘 노랑 유지**

Line 251 `<PlayCircle size={32} style={{ color: 'var(--mm-yellow)' }} fill="rgba(0,0,0,0.4)" />` **유지** — 재생 인터랙션 표시는 예외 강조 성격.

- [ ] **Step 4: 타입 체크 + 커밋 + push**

```bash
npx tsc --noEmit
git add src/components/league/HighlightsHome.tsx
git commit -m "refactor(highlights): '전체 보기' 링크 · +points 배지 옐로우 다운그레이드

- 전체 보기 링크 yellow-strong → ink-soft
- +points 배지 mm-yellow → hoop-orange-500 (클러치 스케일 정렬 · B10 준비)
- PlayCircle 호버 아이콘은 재생 인터랙션 표시로 옐로우 유지

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task B6: NbaRoundsSummary 옐로우 다운그레이드

**Files:**
- Modify: `src/components/league/nba/NbaRoundsSummary.tsx`

- [ ] **Step 1: 1위 팀 뱃지 옐로우 → soft tint**

Find lines 94-107:
```tsx
                  {topTeam && (
                    <span
                      className="text-[11px] font-black tracking-[0.14em] uppercase shrink-0 break-keep"
                      style={{
                        background: 'var(--mm-yellow)',
                        color: 'var(--mm-black)',
                        padding: '3px 8px',
                        maxWidth: '55%',
                        lineHeight: 1.2,
                      }}
                    >
                      1위 {topTeam.name}
                    </span>
                  )}
```

Change:
- `background: 'var(--mm-yellow)'` → `background: 'var(--mm-yellow-soft)'`
- `color: 'var(--mm-black)'` → `color: 'var(--mm-ink)'`
- Add `border: '1px solid var(--mm-yellow-strong)'`
- `borderRadius: '3px'` (add).

Full replacement:
```tsx
                  {topTeam && (
                    <span
                      className="text-[11px] font-black tracking-[0.14em] uppercase shrink-0 break-keep"
                      style={{
                        background: 'var(--mm-yellow-soft)',
                        color: 'var(--mm-ink)',
                        border: '1px solid var(--mm-yellow-strong)',
                        borderRadius: '3px',
                        padding: '3px 8px',
                        maxWidth: '55%',
                        lineHeight: 1.2,
                      }}
                    >
                      1위 {topTeam.name}
                    </span>
                  )}
```

- [ ] **Step 2: 하이라이트 링크 옐로우 → ink (뉴트럴 CTA)**

Find lines 173-186:
```tsx
                  <Link
                    href={`${base}/highlights/${r.date}`}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 text-[11px] font-black tracking-[0.14em] uppercase cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                    style={{
                      background: 'var(--mm-yellow)',
                      color: 'var(--mm-black)',
                      border: '1px solid var(--mm-black)',
                      borderRadius: '4px',
                    }}
                    aria-label={`${r.weekLabel} 득점 하이라이트 재생`}
                  >
                    <Film size={13} aria-hidden />
                    하이라이트
                  </Link>
```

Change style:
- `background: 'var(--mm-yellow)'` → `background: 'var(--mm-ink)'`
- `color: 'var(--mm-black)'` → `color: 'var(--mm-panel)'`
- `border: '1px solid var(--mm-black)'` → `border: '1px solid var(--mm-ink)'`

- [ ] **Step 3: 전체 CTA 옐로우 → 검정**

Find lines 193-210:
```tsx
        <div className="px-4 sm:px-6 md:px-8 lg:px-10 py-5 md:py-6 flex justify-center">
          <Link
            href={`/league/${resolvedOrgSlug}/${leagueId}/highlights`}
            className="mm-brand inline-flex items-center justify-center gap-2 font-jersey font-black uppercase min-h-[44px] px-6 sm:px-8 py-3 tracking-[0.14em] text-[13px] sm:text-[14px] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)] focus-visible:ring-offset-2 hover:brightness-95"
            style={{
              background: 'var(--mm-yellow)',
              color: 'var(--mm-black)',
              border: '2px solid var(--mm-black)',
              borderRadius: '4px',
              boxShadow: '0 4px 0 var(--mm-black)',
            }}
            aria-label="전체 라운드 하이라이트 보기"
          >
            전체 라운드 하이라이트 보기
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
```

Change style:
- `background: 'var(--mm-yellow)'` → `background: 'var(--mm-ink)'`
- `color: 'var(--mm-black)'` → `color: 'var(--mm-panel)'`
- `border: '2px solid var(--mm-black)'` → `border: '2px solid var(--mm-ink)'`
- `boxShadow: '0 4px 0 var(--mm-black)'` → `boxShadow: '0 4px 0 var(--mm-yellow-strong)'` (액센트로만 옐로우 유지)

- [ ] **Step 4: 타입 체크 + 커밋 + push**

```bash
npx tsc --noEmit
git add src/components/league/nba/NbaRoundsSummary.tsx
git commit -m "refactor(rounds): 1위 뱃지 · 하이라이트 링크 · 전체 CTA 옐로우 → 뉴트럴

- 1위 팀 뱃지 yellow → yellow-soft + yellow-strong 보더 (subtle 강조)
- 하이라이트 링크 · 전체 CTA 옐로우 배경 → ink 배경 (뉴트럴 CTA)
- 전체 CTA boxShadow 만 yellow-strong 액센트 유지

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task B7: LeagueLayoutClient 유저 칩 뉴트럴화

**Files:**
- Modify: `src/app/league/[orgSlug]/[leagueId]/_components/LeagueLayoutClient.tsx`

- [ ] **Step 1: 유저 칩 옐로우 강조 제거**

Find in `TabNav` function, the user chip block (around line 82-93 based on Explore report):

```tsx
            <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-bold text-[color:var(--mm-ink)] bg-[color:var(--mm-yellow-soft)] border border-[color:var(--mm-yellow)] rounded px-2 py-1.5 min-h-[44px]">
```

Change `bg-[color:var(--mm-yellow-soft)] border border-[color:var(--mm-yellow)]` to `bg-[color:var(--mm-panel-alt)] border border-[color:var(--mm-rule)]`.

**Note**: 정확한 라인/구문은 Explore report 기반이므로 실제 파일에서 grep 필요 — 서브에이전트가 실행할 때 확인.

- [ ] **Step 2: 편집중 버튼 옐로우 유지 (예외)**

편집중 버튼(line ~141-145) 은 예외 규칙 대상. 손대지 말 것.

- [ ] **Step 3: 하단 탭 액티브 라인 옐로우 유지**

하단 탭 액티브 표시(line ~246) 은 네비게이션 상시 요소. 이건 예외로 유지하되 → 사실 이거는 옐로우 실색상 위치가 하나 더 있는 셈. 스펙 원칙 "옐로우 1곳" 을 지키려면 여기도 조정해야 함.

**결정**: 하단 탭 액티브 라인은 하단 네비의 유일한 시각 신호. 옐로우 대신 `--color-hoop-orange-500` 으로 변경 → 클러치 스케일의 딥 오렌지와 통합해 브랜드 오렌지가 액티브 표시 역할.

Find hidden 탭 액티브 라인 (around line 246):
```tsx
                          background: 'var(--mm-yellow)',
```

If found in an active-tab indicator, change to:
```tsx
                          background: 'var(--color-hoop-orange-500)',
```

**Note**: 정확한 라인 위치는 subagent 가 grep `mm-yellow` 로 확인 후 편집.

- [ ] **Step 4: 타입 체크 + 커밋 + push**

```bash
npx tsc --noEmit
git add src/app/league/[orgSlug]/[leagueId]/_components/LeagueLayoutClient.tsx
git commit -m "refactor(nav): 유저 칩 옐로우 강조 제거 · 하단 탭 액티브 → 브랜드 오렌지

- 유저 칩 mm-yellow-soft/yellow 보더 → panel-alt/rule (다른 아이콘과 동일)
- 편집중 버튼 옐로우는 편집 상태 예외 강조로 유지
- 하단 탭 액티브 라인 mm-yellow → hoop-orange-500 (브랜드 오렌지 통합)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task B8: PersonalDashboard 옐로우 다운그레이드 + SectionCard 편입

**Files:**
- Modify: `src/components/league/auth/PersonalDashboard.tsx`

**Note**: 이번 주 하이라이트 CTA(`HighlightCTA` 함수, line 257-284) 는 **옐로우 실색상 유일 위치**로 유지.

- [ ] **Step 1: SectionCard import 및 outer section 리팩터**

Add import:
```tsx
import SectionCard from '@/components/league/ui/SectionCard'
```

Find lines 85-94:
```tsx
      <section
        className="mm-brand"
        style={{
          background: 'linear-gradient(135deg, var(--mm-panel) 0%, var(--mm-yellow-soft) 130%)',
          border: '1px solid var(--mm-yellow)',
          borderRadius: '6px',
          boxShadow: '0 12px 32px -12px rgba(202,138,4,0.25)',
          overflow: 'hidden',
        }}
      >
```

Replace with:
```tsx
      <SectionCard variant="standalone" emphasized>
```

Find closing `</section>` (line 148) and replace with `</SectionCard>`.

- [ ] **Step 2: 유저 아바타 보더 옐로우 → mm-rule**

Find lines 97-100:
```tsx
          <div
            className="relative w-12 h-12 md:w-14 md:h-14 shrink-0 rounded-full overflow-hidden flex items-center justify-center"
            style={{ background: 'var(--mm-panel-alt)', border: '2px solid var(--mm-yellow)' }}
            aria-hidden
          >
```

Change `border: '2px solid var(--mm-yellow)'` to `border: '2px solid var(--mm-rule)'`.

- [ ] **Step 3: Sparkles 아이콘 옐로우 → ink-soft**

Find line 114:
```tsx
              <Sparkles size={16} style={{ color: 'var(--mm-yellow-strong)' }} />
```

Change `color: 'var(--mm-yellow-strong)'` to `color: 'var(--mm-ink-soft)'`.

- [ ] **Step 4: 선수카드 버튼 옐로우 유지 → 뉴트럴 CTA**

Find lines 120-129:
```tsx
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 md:px-4 py-2 text-xs md:text-sm font-black uppercase min-h-[40px] md:min-h-[44px] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)]"
            style={{ background: 'var(--mm-black)', color: 'var(--mm-yellow)', border: '1px solid var(--mm-black)', borderRadius: '4px', letterSpacing: '0.12em' }}
            aria-label="선수카드 열기"
          >
            <IdCard size={14} />
            선수카드
          </button>
```

Change `color: 'var(--mm-yellow)'` to `color: 'var(--mm-panel)'` (검정 배경 위 흰 텍스트).

- [ ] **Step 5: SeasonSummary 헤더 "R 참석" 뱃지 옐로우 → 뉴트럴**

Find lines 174-179:
```tsx
        <span
          className="inline-flex items-center text-[12px] md:text-[13px] font-black px-2 py-0.5"
          style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '3px' }}
        >
          {season.attended_rounds}R 참석
        </span>
```

Change:
- `background: 'var(--mm-yellow)'` → `background: 'var(--mm-panel-alt)'`
- `color: 'var(--mm-black)'` → `color: 'var(--mm-ink)'`
- Add `border: '1px solid var(--mm-rule)'`.

- [ ] **Step 6: HighlightCTA 옐로우 실색상 유지 (이번 주 하이라이트 = 유일 옐로우 위치)**

Lines 257-284 (HighlightCTA function) 은 **손대지 않는다**. `available ? 'var(--mm-yellow)'` 유지. 이 위치가 스펙 B-1 "옐로우 실색상 1곳".

- [ ] **Step 7: MilestoneChaser 트로피 옐로우 → ink-soft**

Find line 291:
```tsx
        <Trophy size={16} style={{ color: 'var(--mm-yellow-strong)' }} />
```

Change to:
```tsx
        <Trophy size={16} style={{ color: 'var(--mm-ink-soft)' }} />
```

- [ ] **Step 8: 타입 체크 + 커밋 + push**

```bash
npx tsc --noEmit
git add src/components/league/auth/PersonalDashboard.tsx
git commit -m "refactor(dashboard): PersonalDashboard 옐로우 다운그레이드 + SectionCard 편입

- outer section → SectionCard emphasized (yellow-soft 3px 상단 라인만)
- 유저 아바타 보더 · Sparkles · 선수카드 텍스트 · R참석 뱃지 · 트로피 옐로우 → 뉴트럴
- 이번 주 하이라이트 CTA(HighlightCTA) 옐로우는 유일 실색상 위치로 유지

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task B9: MilestoneChaser 프로그레스 바 근접도 로직 통일

**Files:**
- Modify: `src/app/globals.css` (근접도 3티어 CSS 변수 추가)
- Modify: `src/components/league/auth/PersonalDashboard.tsx` (`MilestoneChaser` 컴포넌트)

- [ ] **Step 1: globals.css 근접도 변수 3티어 추가**

Find `@theme { ... }` block in `src/app/globals.css`, after Task A2/A3 tokens, add:

```css
  /* ===== 마일스톤 근접도 3티어 (2026-07-22) =====
     PersonalDashboard.MilestoneChaser 바·remaining 뱃지 색이 지표별 색이 아닌 목표 근접도 표현 */
  --milestone-near: #059669;   /* progressPct >= 80% (곧 달성 · emerald-600) */
  --milestone-mid:  #F59E0B;   /* 60~80% (가까움 · amber-500) */
  --milestone-far:  #64748B;   /* < 60% (아직 · slate-500 뉴트럴) */
```

- [ ] **Step 2: MilestoneChaser 색 결정 헬퍼 함수 추가**

In `src/components/league/auth/PersonalDashboard.tsx`, find the block after `METRIC_KOREAN` constant (line 48) and before `rankStyle` function (line 51). Add:

```tsx
// 근접도 3티어 · 프로그레스 바·remaining 뱃지 색 결정 (2026-07-22)
function proximityColor(progressPct: number): string {
  if (progressPct >= 80) return 'var(--milestone-near)'
  if (progressPct >= 60) return 'var(--milestone-mid)'
  return 'var(--milestone-far)'
}
```

- [ ] **Step 3: `MilestoneChaser` 함수에서 바·뱃지 색 근접도로 변경**

Find lines 302-325 in the `MilestoneChaser` function (map body):

```tsx
          {shown.map(c => (
            <div key={c.metric}>
              <div className="flex items-center justify-between text-[12px] md:text-[13px] mb-1">
                <span className="font-bold" style={{ color: METRIC_COLOR[c.metric] }}>
                  <b style={{ letterSpacing: '0.10em' }}>{c.metricLabel}</b>
                  <span className="ml-1.5" style={{ color: 'var(--mm-ink-soft)' }}>{METRIC_KOREAN[c.metric]}</span>
                </span>
                <span className="tabular-nums" style={{ color: 'var(--mm-ink)' }}>
                  <b>{c.current}</b> / {c.nextThreshold}
                  <span className="ml-1.5 text-[11px] font-black px-1.5 py-0.5" style={{ background: METRIC_COLOR[c.metric], color: '#fff', borderRadius: '2px' }}>
                    -{c.remaining}
                  </span>
                </span>
              </div>
              <div
                className="relative overflow-hidden"
                style={{ height: 8, background: 'var(--mm-panel-alt)', borderRadius: '4px', border: '1px solid var(--mm-rule)' }}
              >
                <div
                  style={{ width: `${Math.min(100, c.progressPct)}%`, height: '100%', background: METRIC_COLOR[c.metric] }}
                />
              </div>
            </div>
          ))}
```

Replace with:

```tsx
          {shown.map(c => {
            const proxColor = proximityColor(c.progressPct)
            return (
              <div key={c.metric}>
                <div className="flex items-center justify-between text-[12px] md:text-[13px] mb-1">
                  <span className="font-bold" style={{ color: METRIC_COLOR[c.metric] }}>
                    <b style={{ letterSpacing: '0.10em' }}>{c.metricLabel}</b>
                    <span className="ml-1.5" style={{ color: 'var(--mm-ink-soft)' }}>{METRIC_KOREAN[c.metric]}</span>
                  </span>
                  <span className="tabular-nums" style={{ color: 'var(--mm-ink)' }}>
                    <b>{c.current}</b> / {c.nextThreshold}
                    <span className="ml-1.5 text-[11px] font-black px-1.5 py-0.5" style={{ background: proxColor, color: '#fff', borderRadius: '2px' }}>
                      -{c.remaining}
                    </span>
                  </span>
                </div>
                <div
                  className="relative overflow-hidden"
                  style={{ height: 8, background: 'var(--mm-panel-alt)', borderRadius: '4px', border: '1px solid var(--mm-rule)' }}
                >
                  <div
                    style={{ width: `${Math.min(100, c.progressPct)}%`, height: '100%', background: proxColor }}
                  />
                </div>
              </div>
            )
          })}
```

**Rationale**: 지표 라벨(PTS/REB/…) 색은 METRIC_COLOR 유지(정체성) · 바·뱃지만 proxColor 로 통일.

- [ ] **Step 4: 타입 체크 + 커밋 + push**

```bash
npx tsc --noEmit
git add src/app/globals.css src/components/league/auth/PersonalDashboard.tsx
git commit -m "feat(milestones): 프로그레스 바/remaining 뱃지 색을 근접도 3티어로 통일

- globals.css --milestone-near/mid/far CSS 변수 신설
- PersonalDashboard.MilestoneChaser proximityColor() 헬퍼
- 바·뱃지 색: >=80% 초록 / 60-80% 앰버 / <60% 슬레이트
- 지표별 색(METRIC_COLOR) 라벨 텍스트에만 유지 (정체성)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task B10: 클러치샷 5단계 재정렬 + CSS 변수 승격 + 위닝샷 오렌지

**Files:**
- Modify: `src/app/globals.css` (클러치 5단계 CSS 변수)
- Modify: `src/components/league/HighlightsHome.tsx` (`KIND_STYLE`, `KIND_PRIORITY`, 위닝샷 카드 보더, 스트립 헤더 라벨)

- [ ] **Step 1: globals.css 클러치 5단계 CSS 변수 추가**

Add inside `@theme { ... }` after milestone tokens:

```css
  /* ===== 클러치샷 5단계 위기 강도 스케일 (2026-07-22)
     dagger < chase < tie < reversal < winning · 위기 강도 낮음 → 높음 순
     winning 은 옐로우 대신 브랜드 오렌지(hoop-orange-500)로 · 옐로우 실색상 자리 침범 방지 */
  --clutch-1: #64748B;  /* dagger (쐐기 · 이미 앞선 상태 · 슬레이트) */
  --clutch-2: #06B6D4;  /* chase (추격 · 시안) */
  --clutch-3: #0EA5E9;  /* tie (동점 · 스카이) */
  --clutch-4: #10B981;  /* reversal (역전 · 에메랄드) */
  --clutch-5: #EA580C;  /* winning (위닝샷 · 오렌지 최상 · 옐로우 대체) */
```

- [ ] **Step 2: HighlightsHome KIND_STYLE 을 CSS 변수 참조로 변경**

Find lines 28-34:
```tsx
const KIND_STYLE: Record<NonNullable<HighlightClip['clutch_kind']>, { bg: string; fg: string }> = {
  tie:      { bg: '#0891b2', fg: '#ffffff' },  // cyan-600 · 균형
  chase:    { bg: '#f97316', fg: '#ffffff' },  // orange-500 · 몰아붙임
  reversal: { bg: '#10b981', fg: '#ffffff' },  // emerald-500 · 반전
  winning:  { bg: 'var(--mm-yellow)', fg: 'var(--mm-black)' },  // 브랜드 골드 · 최상 등급
  dagger:   { bg: '#ef4444', fg: '#ffffff' },  // red-500 · 결정타
}
```

Replace with:
```tsx
// 클러치 5단계 · CSS 변수 승격 (2026-07-22 · 위기 강도 순 dagger→chase→tie→reversal→winning)
// winning 은 옐로우 대신 hoop-orange-500 (옐로우 실색상은 이번 주 하이라이트 CTA 전용)
const KIND_STYLE: Record<NonNullable<HighlightClip['clutch_kind']>, { bg: string; fg: string; level: number }> = {
  dagger:   { bg: 'var(--clutch-1)', fg: '#ffffff', level: 1 },
  chase:    { bg: 'var(--clutch-2)', fg: '#ffffff', level: 2 },
  tie:      { bg: 'var(--clutch-3)', fg: '#ffffff', level: 3 },
  reversal: { bg: 'var(--clutch-4)', fg: '#ffffff', level: 4 },
  winning:  { bg: 'var(--clutch-5)', fg: '#ffffff', level: 5 },
}
```

- [ ] **Step 3: KIND_PRIORITY 재정렬 (위기 강도 순 · 정렬은 유지)**

**Note**: KIND_PRIORITY 는 정렬(sort) 용 값. "가치 순" 정렬은 사용자 기존 규칙(위닝샷 우선)이므로 정렬 순서 자체는 유지. `level` 프로퍼티는 시각 표시용.

Lines 37-43 (`KIND_PRIORITY`) 은 **손대지 않는다** — 위닝샷 카드가 상단 노출되는 정렬 규칙은 UX 원칙.

- [ ] **Step 4: 위닝샷 카드 보더 옐로우 → 오렌지**

Find lines 191-197 (button style):
```tsx
                  style={{
                    background: 'var(--mm-panel)',
                    border: isWinning ? '2px solid var(--mm-yellow-strong)' : '1px solid var(--mm-rule)',
                    borderRadius: '4px',
                    minHeight: 220,
                  }}
```

Change `isWinning ? '2px solid var(--mm-yellow-strong)'` to `isWinning ? '2px solid var(--clutch-5)'`.

- [ ] **Step 5: 스트립 헤더에 단계 라벨 추가 (Lv1~5)**

Find lines 199-217:
```tsx
                  {kindStyle && kindLabel ? (
                    <div
                      className="flex items-center justify-center gap-1 py-1.5 text-[12px] sm:text-[13px] font-black tracking-[0.14em] uppercase"
                      style={{ background: kindStyle.bg, color: kindStyle.fg }}
                    >
                      {isWinning && <span aria-hidden>★</span>}
                      {kindLabel}
                      {isWinning && <span aria-hidden>★</span>}
                    </div>
                  ) : (
                    <div
                      className="flex items-center justify-center gap-1 py-1.5 text-[12px] font-black tracking-[0.14em] uppercase"
                      style={{ background: '#ef4444', color: '#fff' }}
                    >
                      <HeartCrack size={12} aria-hidden />
                      클러치
                    </div>
                  )}
```

Replace with:
```tsx
                  {kindStyle && kindLabel ? (
                    <div
                      className="flex items-center justify-center gap-1 py-1.5 text-[12px] sm:text-[13px] font-black tracking-[0.14em] uppercase"
                      style={{ background: kindStyle.bg, color: kindStyle.fg }}
                    >
                      {isWinning && <span aria-hidden>★</span>}
                      <span aria-hidden style={{ opacity: 0.75, fontSize: '0.85em' }}>Lv{kindStyle.level}</span>
                      <span>·</span>
                      {kindLabel}
                      {isWinning && <span aria-hidden>★</span>}
                    </div>
                  ) : (
                    <div
                      className="flex items-center justify-center gap-1 py-1.5 text-[12px] font-black tracking-[0.14em] uppercase"
                      style={{ background: 'var(--clutch-1)', color: '#ffffff' }}
                    >
                      <HeartCrack size={12} aria-hidden />
                      클러치
                    </div>
                  )}
```

- [ ] **Step 6: 타입 체크 + 커밋 + push**

```bash
npx tsc --noEmit
git add src/app/globals.css src/components/league/HighlightsHome.tsx
git commit -m "feat(clutch): 5단계 위기 강도 CSS 변수 승격 · winning 옐로우 → 오렌지

- globals.css --clutch-1~5 신설 (dagger<chase<tie<reversal<winning)
- KIND_STYLE 하드코딩 hex → CSS 변수 · level 프로퍼티 추가
- winning yellow → hoop-orange-500 (옐로우 실색상 자리 침범 방지)
- 위닝샷 카드 보더 yellow-strong → clutch-5
- 스트립 헤더에 Lv1~5 단계 표시

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

## Phase C — Individual Components

### Task C1: 스탯 카드 (SeasonSummary) 통일

**Files:**
- Modify: `src/components/league/auth/PersonalDashboard.tsx` (`SeasonSummary`, `StatCard`)

- [ ] **Step 1: `StatCard` 상단 색 라인 제거 및 배경 통일**

Find lines 196-216 (StatCard 함수 시작 및 style):
```tsx
function StatCard({ metricKey, value, rank }: { metricKey: Chaser['metric']; value: number; rank?: RankInfo }) {
  const color = METRIC_COLOR[metricKey]
  const rs = rank ? rankStyle(rank.rank, rank.total) : null
  const isTop3 = rank && rank.rank <= 3 && rank.total > 0
  return (
    <div
      className="relative flex flex-col items-center justify-between overflow-hidden"
      style={{
        background: `${color}12`,          // 12 = ~7% opacity
        border: `1.5px solid ${color}55`,  // 55 = ~33% opacity
        borderRadius: '6px',
        padding: '10px 4px 8px',
        minHeight: 96,
      }}
    >
      {/* 상단 색 라인 (metric 컬러 강조) */}
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0"
        style={{ height: 3, background: color }}
      />
```

Replace with:
```tsx
function StatCard({ metricKey, value, rank }: { metricKey: Chaser['metric']; value: number; rank?: RankInfo }) {
  const rs = rank ? rankStyle(rank.rank, rank.total) : null
  const isTop3 = rank && rank.rank <= 3 && rank.total > 0
  return (
    <div
      className="relative flex flex-col items-center justify-between overflow-hidden"
      style={{
        background: 'var(--mm-panel-alt)',
        border: '1px solid var(--mm-rule)',
        borderRadius: '6px',
        padding: '10px 4px 8px',
        minHeight: 96,
      }}
    >
```

**Note**: `color` 변수 참조가 남는 곳들 정리 필요.

- [ ] **Step 2: 지표 라벨 색 뉴트럴화**

Find lines 217-223 (지표 라벨):
```tsx
      {/* 지표 라벨 */}
      <div
        className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.14em] mt-0.5"
        style={{ color }}
      >
        {METRIC_LABEL[metricKey]}
      </div>
```

Change `style={{ color }}` to `style={{ color: 'var(--mm-muted)' }}`.

- [ ] **Step 3: `rankStyle` 함수 4-10위 근접도 색 참조로 변경**

Find lines 51-58:
```tsx
function rankStyle(rank: number, total: number): { badge?: string; color: string } {
  if (total <= 0) return { color: 'var(--mm-muted)' }
  if (rank === 1) return { badge: '🥇', color: '#059669' }
  if (rank === 2) return { badge: '🥈', color: '#059669' }
  if (rank === 3) return { badge: '🥉', color: '#059669' }
  if (rank <= 10) return { color: '#059669' }
  return { color: 'var(--mm-muted)' }
}
```

Replace with:
```tsx
// 순위 뱃지 스타일 · 1-3위 메달 + 골드/실버/브론즈 배경 · 4-10위 milestone-near · 11위+ 뉴트럴
// (2026-07-22 · rank 티어링 · '—' 제거)
function rankStyle(rank: number, total: number): { badge?: string; color: string; bg?: string } {
  if (total <= 0) return { color: 'var(--mm-muted)' }
  if (rank === 1) return { badge: '🥇', color: '#ffffff', bg: '#D4A017' }  // gold
  if (rank === 2) return { badge: '🥈', color: '#ffffff', bg: '#94A3B8' }  // silver
  if (rank === 3) return { badge: '🥉', color: '#ffffff', bg: '#B45309' }  // bronze
  if (rank <= 10) return { color: '#ffffff', bg: 'var(--milestone-near)' }
  return { color: 'var(--mm-muted)', bg: 'transparent' }
}
```

- [ ] **Step 4: `StatCard` 순위 뱃지 로직 통일 · '—' 제거**

Find lines 236-252 (rank 뱃지 렌더):
```tsx
      {/* 랭킹 뱃지 · 메달 or 초록 or 회색 */}
      {rank && rank.total > 0 && rs ? (
        <div
          className="inline-flex items-center gap-0.5 text-[11px] md:text-[12px] font-black tabular-nums px-1.5 py-0.5"
          style={{
            color: isTop3 ? '#fff' : rs.color,
            background: isTop3 ? rs.color : 'transparent',
            borderRadius: '3px',
            letterSpacing: '-0.005em',
          }}
          title={`${rank.rank}위 / ${rank.total}명`}
        >
          {rs.badge && <span aria-hidden style={{ fontSize: '13px' }}>{rs.badge}</span>}
          <span>{rank.rank}위</span>
        </div>
      ) : (
        <div className="text-[10px] font-bold" style={{ color: 'var(--mm-muted)' }}>—</div>
      )}
```

Replace with:
```tsx
      {/* 랭킹 뱃지 · 통일 규칙 (2026-07-22)
          1-3위: 메달 + N위 · 골드/실버/브론즈 배경 · 흰 텍스트
          4-10위: N위 · milestone-near 배경 · 흰 텍스트
          11위+: N위 · 뉴트럴 텍스트 · 배경 없음
          랭킹 정보 없음: 렌더 안 함 (— 제거) */}
      {rank && rank.total > 0 && rs && (
        <div
          className="inline-flex items-center gap-0.5 text-[11px] md:text-[12px] font-black tabular-nums px-1.5 py-0.5"
          style={{
            color: rs.color,
            background: rs.bg ?? 'transparent',
            borderRadius: '3px',
            letterSpacing: '-0.005em',
          }}
          title={`${rank.rank}위 / ${rank.total}명`}
        >
          {rs.badge && <span aria-hidden style={{ fontSize: '13px' }}>{rs.badge}</span>}
          <span>{rank.rank}위</span>
        </div>
      )}
```

**Note**: 랭킹 정보 없는 경우 (`rank.total === 0` 등) 는 카드에 뱃지가 아예 렌더되지 않음 → `—` 삭제.

- [ ] **Step 5: 사용 안 하는 `color` 변수 참조 제거 및 lint 확인**

`StatCard` 안에 `const color = METRIC_COLOR[metricKey]` 이 남아 있으면 unused variable 이 됨. 지운다:

Find (after Step 1 modification):
```tsx
function StatCard({ metricKey, value, rank }: { metricKey: Chaser['metric']; value: number; rank?: RankInfo }) {
  const rs = rank ? rankStyle(rank.rank, rank.total) : null
```

이미 `color` 삭제됨. `METRIC_COLOR` import/const 는 `MilestoneChaser` 에서 여전히 사용 → 유지.

- [ ] **Step 6: 타입 체크 + 커밋 + push**

```bash
npx tsc --noEmit
git add src/components/league/auth/PersonalDashboard.tsx
git commit -m "refactor(stat-card): SeasonSummary 5개 카드 통일 · 무지개 색 제거 · 순위 뱃지 티어링

- 상단 3px 지표색 라인 제거 · 배경 tint 제거 → panel-alt/rule 통일
- 지표 라벨 색 지표별 색 → mm-muted 뉴트럴
- rankStyle: 1-3위 메달+골드/실버/브론즈 · 4-10위 milestone-near · 11위+ 뉴트럴
- '—' 폴백 제거 (랭킹 없으면 뱃지 미렌더)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

### Task C2: 네비 아이콘 5개 크기·툴팁 통일

**Files:**
- Modify: `src/app/league/[orgSlug]/[leagueId]/_components/LeagueLayoutClient.tsx`

- [ ] **Step 1: 5개 아이콘 버튼 크기 통일**

TabNav 내 우측 액션 그룹의 5개 버튼 (로그아웃/검색/테마/도움말/로그인/편집)에서:

- `p-1.5` / `px-2.5 py-1.5` / `px-3 py-1.5` 혼재 → **모두 `p-2`** (icon-only) 또는 `px-2.5 py-2` (with text label)
- `size={12}` / `size={13}` / `size={14}` 혼재 → **모두 `size={16}`**
- `rounded` 혼재 → **모두 `rounded-md`**
- `min-h-[44px] min-w-[44px]` (icon-only) / `min-h-[44px]` (with text) 유지

**Note**: 정확한 라인은 파일 수정 시 grep. 서브에이전트가 수행할 때 `size={12}`, `size={13}`, `size={14}` 를 각각 grep 하여 위치 확인 후 일괄 변경.

- [ ] **Step 2: `title` 속성 추가 (툴팁)**

각 아이콘 전용 버튼(`aria-label` 있는 것들)에 `title` 속성 병기:
- 로그아웃 → `title="로그아웃"`
- 검색 → `title="선수/게임 검색"`
- 테마 → `title="라이트/다크 전환"`
- 도움말 → `title="도움말"`
- 로그인 → `title="로그인"` (텍스트 라벨 있으면 생략 가능)
- 편집 → `title="편집 모드 진입"`

- [ ] **Step 3: 유저 칩(Task B7 완료됨) 은 아이콘 크기 통일에서 예외 처리**

유저 이름 칩은 아이콘 없이 텍스트만 → 크기 규칙 다름. B7 결과 유지.

- [ ] **Step 4: 타입 체크 + 커밋 + push**

```bash
npx tsc --noEmit
git add src/app/league/[orgSlug]/[leagueId]/_components/LeagueLayoutClient.tsx
git commit -m "refactor(nav): 5개 아이콘 버튼 크기·패딩·아이콘 크기 통일 + 툴팁

- padding: p-1.5/px-2.5/px-3 혼재 → p-2 (icon-only) / px-2.5 py-2 (with text)
- icon size: 12/13/14 → 16 통일
- rounded → rounded-md
- title 속성으로 툴팁 병기 (검색/테마/도움말/편집)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin master
```

---

## Self-Review Notes

**Spec coverage check** (스펙 8개 항목 → Task 매핑):
- **#1 옐로우 남용**: Task B1(Announcements) · B2(Standings) · B3(Leaders) · B4(Milestones) · B5(Highlights) · B6(Rounds) · B7(Layout) · B8(Dashboard). 8지점 모두 커버. ✓
- **#2 스탯 카드**: Task C1 (SeasonSummary). ✓
- **#3 프로그레스 바**: Task B9 (MilestoneChaser). ✓
- **#4 카드 스타일**: Task A1(SectionCard 신설) · A4(5개 리팩터) · B1/B8(나머지 2개 편입). ✓
- **#5 타이포 위계**: Task A2 (globals.css 토큰). 실제 각 컴포넌트가 새 토큰 참조로 변경되는 것은 Phase B/C 진행 중 발생하는 것이 아니라 이 스펙의 후속 이터레이션 대상. **주의**: 이 계획에서 개별 컴포넌트의 `clamp(...)` 인라인을 `var(--fs-hero)` 로 옮기는 태스크가 명시적으로 없음. → 판단: 위계 갭 해소가 최우선이므로 토큰 정의만 이 계획에 포함, 실제 참조 교체는 컴포넌트별 리팩터 시 자연스럽게 진행. **Task A4/B/C 각 태스크에서 관련 인라인 폰트 인라인이 눈에 띌 경우 옆에서 함께 수정 가능**하도록 남겨둠. 스펙과 불일치는 아님 (스펙: "구현 시 결정").
- **#6 클러치샷**: Task B10. ✓
- **#7 네비 아이콘**: Task C2. ✓
- **#8 여백 리듬**: Task A3 (globals.css 토큰). 실제 각 컴포넌트의 `px-4 sm:px-6 md:px-10 py-4 md:py-5` 를 `section-header-pad` 로 옮기는 것은 A4 리팩터 진행 중 함께 정리 가능하나 별도 태스크는 아님. #5 와 동일 판단.

**Placeholder scan**:
- Task B7 Step 1/3 에 "정확한 라인/구문은 실제 파일에서 grep 필요" 문구 있음. 이는 파일이 매우 커서 이 계획에서 라인 인용을 다 못했기 때문. **서브에이전트가 실행 시 grep `mm-yellow` 로 위치 확인 후 편집** 하도록 명시 → placeholder 가 아니라 실행 가이드.
- Task C2 Step 1 도 유사. 아이콘 사이즈 grep 방식 명시.
- 나머지 태스크는 실제 라인/코드 인용 완비.

**Type consistency**:
- `SectionCard` Props 는 A1→A4 사이에 Step 3에서 `background` prop 추가. 최종 시그니처:
  `<SectionCard variant?: 'stack' | 'standalone', emphasized?: boolean, dataTour?: string, ariaLabel?: string, className?: string, background?: string, children>`
  이후 A4/B1/B8 에서 이 시그니처 참조.
- `KIND_STYLE` 타입에 `level: number` 추가됨(B10 Step 2). B10 Step 5 에서 `kindStyle.level` 참조. 타입 일치. ✓
- `rankStyle` 반환 타입에 `bg?: string` 추가됨(C1 Step 3). C1 Step 4 에서 `rs.bg` 참조. 타입 일치. ✓
- `proximityColor` 함수 (B9 Step 2) → B9 Step 3 에서 참조. ✓

**Ambiguity check**:
- Task A4 Step 3 에서 SectionCard 인터페이스 재수정 (background prop 추가) 은 A1 뒤에 발생하는 리비전 → 실행 흐름상 명확. ✓
- Task B5 Step 3 에서 PlayCircle 아이콘 옐로우 유지는 예외로 명시. ✓
- Task B7 에서 편집중 버튼 옐로우 유지 · 하단 탭 액티브는 브랜드 오렌지로 이동. 스펙 "옐로우 1곳" 원칙을 유지하기 위해 하단 탭 액티브가 오렌지가 됨. **스펙에는 이 결정이 없음** → 스펙 원칙에 맞춰 계획서에서 결정. 스펙과 모순 없음.

**Missing task check**:
- 각 Task 종료 시 `npx tsc --noEmit` 명시됨. ✓
- Vercel 배포 후 육안 확인은 각 Phase 종료 시점에 사용자 몫으로 명시됨. ✓
- Phase 순서 A → B → C 순차 진행. ✓

**최종 Task 개수**: A(4개 · A1/A2/A3/A4) + B(10개 · B1~B10) + C(2개 · C1/C2) = **16 Task, 총 커밋 16회**.

각 Task 는 독립적으로 리뷰 가능 (커밋별 배포 → 육안 확인 가능). Phase 끝에는 시각적 회귀 검토를 위해 사용자에게 전체 홈 화면 확인 요청.

---

## Execution Handoff

계획서 저장 완료 · self-review 통과. 다음 단계:
- **subagent-driven-development** 스킬로 전환 → Fresh subagent per Task + two-stage review.
- 사용자 지시("서브에이전트 주도")에 따라 이 방식 자동 선택.
- 첫 Task = **Task A1 (SectionCard 신설)**.
