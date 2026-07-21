# 리그 홈 디자인 시스템 정돈 (미라클모닝) — 스펙

**작성일**: 2026-07-21
**스코프**: `/league/[orgSlug]/[leagueId]` 홈 화면 · 로그인/비로그인 상태 공통 · 서브 페이지는 도미노 확장으로 후속 이터레이션
**방향**: `redesign-existing-projects` (Scan → Diagnose → Fix) · 재작성 금지 · 기존 브랜드 톤(mm-* 팔레트 · font-jersey · court-bg) 유지
**보류**: 정체성 SVG(농구공·골대·backdrop) 브레인스토밍은 별도 스펙으로 후속 재개 — 파일들은 `.superpowers/brainstorm/2286-*/` 에 그대로 남아 있음

---

## 1. 배경

사용자가 AI 화면 리뷰 기반의 8개 개선 항목을 제공했다. 실제 코드와 대조한 결과 **8개 항목 모두 실코드에 존재**한다 (일부는 로그인 후에만 노출되는 `PersonalDashboard`에 있어 초기 매핑에서 누락됐지만 재확인 완료).

정보 구조와 밀도는 그대로 유지한 채, **위계·규칙·토큰의 일관성**만 정돈해 완성도를 올린다. 화려한 시각 요소 추가가 아니라, 이미 있는 것들을 규칙화하는 작업이다.

## 2. 원칙 (재사용 가능한 정책)

정돈 결과가 앞으로도 유효하려면 값이 아니라 원칙을 기록해야 한다.

1. **위계 원칙**: 옐로우(`--mm-yellow`)는 **최상위 강조 1개** 위치에만 쓴다. 나머지는 다운그레이드.
2. **여백 원칙**: 섹션 헤더 padding 은 단일 토큰 세트로 통일. 4-step 브레이크 규칙은 하나만 유지.
3. **카드 원칙**: 홈 섹션 카드는 공통 컴포넌트 하나로 수렴. 예외는 명시된 케이스만.
4. **타이포 원칙**: 12px 라벨 → 32~42px 큰 숫자로 직행하는 갭을 없애고 **중간 단계**를 도입.
5. **색 원칙**: 하드코딩된 hex 는 CSS 변수로 승격. 색이 의미(위기 정도 · 근접도)를 표현해야 한다.
6. **모바일 원칙**: 375·414·768·1024·1440px 다섯 폭에서 모두 파괴 없음. 터치 타겟 44×44px. (사용자 상시 규칙 · `feedback_mobile_first`)
7. **홈 랜딩 원칙**: 홈에 요약 스트립·KPI 카드를 새로 추가하지 않는다. (사용자 확정 규칙 · `feedback_landing_summary_reject`)

## 3. 실행 순서 — 3-Phase

**의존성**: Phase A(토큰) 없이 B/C 하면 나중에 다시 손봐야 한다. 순서대로 진행 후 Phase 종료마다 commit + push → Vercel 자동 배포.

---

## Phase A — 토큰 & 리듬

기반 작업. Phase B/C 가 참조할 토큰을 먼저 정의한다.

### A-1. 카드 공통 컴포넌트 신설 (개선안 #4)

**현 위치**:
- 파편 6종: [NbaLeaders.tsx:92-95](src/components/league/nba/NbaLeaders.tsx#L92) · [NbaTeamStandings.tsx:33-37](src/components/league/nba/NbaTeamStandings.tsx#L33) · [NbaRoundsSummary.tsx:48-52](src/components/league/nba/NbaRoundsSummary.tsx#L48) · [HighlightsHome.tsx:103-107](src/components/league/HighlightsHome.tsx#L103) · [MilestoneFeed.tsx:119-123](src/components/league/MilestoneFeed.tsx#L119) · [AnnouncementsHome.tsx:163-164](src/components/league/announcements/AnnouncementsHome.tsx#L163)

**문제**:
- 4개(NBA 4형제)는 `borderTop:0` 스택 방식 (연이은 카드가 상단 보더를 공유)
- MilestoneFeed 는 `borderTop:0` 이 빠져 스택 파괴
- AnnouncementsHome 은 완전히 다른 규칙 (`rounded-md` + 옐로우 그림자 + 2px 옐로우 보더)
- 내부 서브 카드 라운딩 파편화: `borderRadius: '3px'` / `'4px'` 혼용

**결정**:
- 공용 컴포넌트 신설: `<SectionCard>` — `src/components/league/ui/SectionCard.tsx`
- Props: `variant='stack' | 'standalone'`, `emphasized?: boolean`
- 스택 규칙: `border: 1px --mm-rule`, `borderTop: 0` (스택 첫 카드만 `borderTop: 1px`), `borderRadius: 0`
- Standalone 규칙 (PersonalDashboard 등): `border: 1px --mm-rule`, `borderRadius: 6px`
- 내부 서브 라운딩: 3px 로 통일 (배지·chip 계열)
- **AnnouncementsHome 옐로우 헤더는 Phase B(#1)에서 함께 다운그레이드** — A 에서는 컴포넌트 통합만

**결정 미정 (구현 시)**: 컴포넌트 이름 최종형(`SectionCard` vs `PanelCard` vs `HomeSection`), 라운딩 값 정확치(3px vs 4px)

### A-2. 타이포 위계 (개선안 #5)

**현 위치**:
- 큰 숫자 인라인 스타일: [NbaLeaders.tsx:275-282](src/components/league/nba/NbaLeaders.tsx#L275) · [NbaTeamStandings.tsx:98-116](src/components/league/nba/NbaTeamStandings.tsx#L98) · [NbaRoundsSummary.tsx:87-88](src/components/league/nba/NbaRoundsSummary.tsx#L87) · [PersonalDashboard.tsx:229](src/components/league/auth/PersonalDashboard.tsx#L229)
- 저채도 라벨 반복: `text-[11px]` / `text-[12px]` + `tracking-[0.14em]` / `[0.16em]` / `[0.18em]` + `color: var(--mm-muted)` (다수 지점)
- 헤더 h3: 4개 컴포넌트가 동일 인라인 반복 `clamp(22px, 6vw, 28px), letterSpacing: -0.005em, lineHeight: 1.1`

**문제**:
- 스케일 갭: 12px 라벨 → clamp(24~42px) 큰 숫자로 직행. 14~16px 중간 본문이 없다.
- tracking 값 3종(0.14/0.16/0.18) 혼재 — 규칙 없음
- 저채도 라벨(`--mm-muted`)이 다크 배경에서 대비 부족

**결정**:
- `globals.css` 에 폰트 스케일 토큰 4단계 신설:
  - `--fs-hero` (큰 숫자용, `clamp(32px, 8vw, 42px)`)
  - `--fs-num` (중간 숫자용, `clamp(18px, 3.5vw, 24px)`) ← **신규**
  - `--fs-body` (본문 14~15px) ← **신규 · 중간 단계**
  - `--fs-label` (라벨 11~12px, tracking 통일)
- tracking 토큰 단일화: `--track-label: 0.14em` (label 계열 단일)
- 라벨 색 대비 상향: `--mm-muted` 다크 값 재조정 (WCAG AA 4.5:1 통과 확인)
- 헤더 h3 유틸리티 클래스 추출: `.section-h3`

**결정 미정**: 정확한 폰트 크기 값(스펙에선 방향만) · CSS 변수 이름 최종형

### A-3. 여백 리듬 (개선안 #8)

**현 위치**:
- 홈 페이지 컨테이너: [page.tsx:377](src/app/league/[orgSlug]/[leagueId]/page.tsx#L377) `space-y-5 lg:space-y-4`
- 헤더 padding 4개 통일: [NbaLeaders.tsx:98](src/components/league/nba/NbaLeaders.tsx#L98) 외 3곳 `px-4 sm:px-6 md:px-10 py-4 md:py-5`
- 이탈: [MilestoneFeed.tsx:127](src/components/league/MilestoneFeed.tsx#L127) `px-5 md:px-8 py-4 md:py-5` (md 브레이크만 다름) · [AnnouncementsHome.tsx:168](src/components/league/announcements/AnnouncementsHome.tsx#L168) `py-3 sm:py-4` (더 얕음)
- 내부 그리드 padding 파편화: 각 컴포넌트마다 4-step 브레이크가 다름

**결정**:
- 헤더 padding 토큰: `--pad-h-x: clamp(16px, 4vw, 40px)`, `--pad-h-y: clamp(16px, 3vw, 20px)`
- 내부 그리드 padding 토큰: `--pad-body-x`, `--pad-body-y`
- 브레이크는 3-step 으로 축소 (sm/md 만 유지, lg 는 md 값 승계)
- MilestoneFeed / AnnouncementsHome / PersonalDashboard 를 새 토큰 규칙에 맞춤
- 홈 페이지 컨테이너 space-y 규칙 재검토 — 5·4·lg 반전 제거

**결정 미정**: 정확한 clamp 값(스펙에선 원칙만)

---

## Phase B — 컬러 시스템

토큰이 잡히면 색을 재분배한다.

### B-1. 옐로우 남용 종식 (개선안 #1)

**현 위치 전수조사 (8개 지점)**:
- [AnnouncementsHome.tsx:164, 169](src/components/league/announcements/AnnouncementsHome.tsx#L164) — 카드 전체 옐로우 배경 + 그림자 (**가장 시끄러움**)
- [NbaTeamStandings.tsx:57, 63](src/components/league/nba/NbaTeamStandings.tsx#L57) — 1위 배경 옐로우 + 40~60% 승률 텍스트 강조
- [NbaLeaders.tsx:170, 193](src/components/league/nba/NbaLeaders.tsx#L170) — 카테고리 라벨 + 1위 배경 옐로우 (**8개 카테고리 × 1위 = 옐로우 블록 8개**)
- [MilestoneFeed.tsx:131, 140, 214, 283](src/components/league/MilestoneFeed.tsx#L131) — 헤더 아이콘/제목/달성 수치/CTA 4곳
- [HighlightsHome.tsx:32, 193](src/components/league/HighlightsHome.tsx#L32) — winning 클러치 옐로우 + 위닝샷 카드 2px 옐로우 보더
- [NbaRoundsSummary.tsx:98, 177, 199](src/components/league/nba/NbaRoundsSummary.tsx#L98) — 1위 뱃지, 하이라이트 링크, CTA 버튼 (**한 카드에서 두 번 반복**)
- [LeagueLayoutClient.tsx:88, 143, 246](src/app/league/[orgSlug]/[leagueId]/_components/LeagueLayoutClient.tsx#L88) — 유저 칩 · 편집중 버튼 · 하단탭 액티브 라인
- [PersonalDashboard.tsx:88-91, 176, 263-266, 291](src/components/league/auth/PersonalDashboard.tsx#L88) — 카드 배경 그라디언트 · "R 참석" 뱃지 · 하이라이트 CTA · 트로피 아이콘

**결정 — 옐로우는 정확히 하나에만**:
- **최상위 강조 자리**: **"이번 주 하이라이트 CTA"** ([PersonalDashboard.tsx:263-266](src/components/league/auth/PersonalDashboard.tsx#L263)) — 유저별로 최대 주 1회 노출되는 액션, 진짜 "지금 눌러야 할" 위치
- 나머지 다운그레이드 매핑:
  - AnnouncementsHome 카드 헤더 옐로우 → 뉴트럴(`--mm-panel-alt`) + 상단 3px 액센트 라인만 옐로우 대신 `--mm-ink-soft`
  - NbaTeamStandings 1위 → subtle tint (`--mm-yellow-soft` 6% 배경 + 옐로우 좌측 3px 라인)
  - NbaLeaders 1위 카드 → subtle tint (동일 패턴)
  - MilestoneFeed 트로피/제목/CTA → `--mm-ink-soft` (뉴트럴 강조)
  - HighlightsHome winning 클러치 카드 보더 → Phase B-3 (클러치 스케일)에서 함께 처리
  - NbaRoundsSummary CTA 버튼 → `--mm-black` + 흰 텍스트 (뉴트럴 CTA)
  - LeagueLayoutClient 유저 칩 → 옐로우 보더 제거, 나머지 아이콘 버튼과 동일 스타일
  - LeagueLayoutClient 편집중 버튼 → 옐로우 유지 (편집 모드 = 예외적 강조 상태)
  - PersonalDashboard 카드 배경 그라디언트 → subtle (`--mm-panel` → `--mm-yellow-soft` 대신 `--mm-panel-alt`)

**옐로우 원칙 명료화** (Self-review 반영):
- "옐로우 1개" = **진하고 큰 옐로우 실색상**(`--mm-yellow`)이 쓰이는 위치는 **이번 주 하이라이트 CTA 1곳**
- Subtle tint (`--mm-yellow-soft` 6~10% opacity + 옐로우 좌측 3px 라인)는 "옐로우 남용"에 포함하지 않음 — 다른 강조 톤과 병존 가능
- 편집중 버튼 옐로우는 **예외** (편집 모드라는 임시 상태 표시 · 상시 노출이 아니라 예외 규칙 적용)

**결정 미정**: NbaLeaders 1위 카드의 subtle tint 정확한 opacity 값(6% vs 8% vs 10%) — 다크/라이트 대비 확인 후 결정

### B-2. 마일스톤 프로그레스 바 색 로직 통일 (개선안 #3)

**현 위치**: [PersonalDashboard.tsx:302-325](src/components/league/auth/PersonalDashboard.tsx#L302) — `MilestoneChaser` 컴포넌트

**현 코드**:
```
METRIC_COLOR = { pts:#F59E0B, reb:#F97316, ast:#06B6D4, stl:#10B981, blk:#EF4444 }
// 바 색 = METRIC_COLOR[metric]
// -remaining 뱃지 색 = METRIC_COLOR[metric]
```

**문제**: 색이 지표(득점/리바운드/…)에 따라 달라진다. 사용자는 "목표까지 남은 값"이 크면 나쁜지 좋은지 색만 봐선 모른다. 지표별 정체성 색은 카드에도 이미 있어서 프로그레스 바까지 지표색을 쓸 필요가 없다.

**결정 — 근접도 그라데이션**:
- 바 색·`-{remaining}` 뱃지 색을 **`progressPct` 임계값** 기반으로 결정:
  - `>= 80%` → `--emerald-500` (초록 · "곧 달성")
  - `60~80%` → `--amber-500` (노랑 · "가까움")
  - `< 60%` → `--mm-muted` (뉴트럴 · "아직 멀음")
- 지표 라벨(PTS/REB/…)만 지표색 유지, 바·뱃지는 근접도색으로 통일
- 임계값·색 3티어를 CSS 변수로 승격: `--milestone-near`, `--milestone-mid`, `--milestone-far`

**결정 미정**: 임계값 정확치(60/80 vs 50/75 vs 70/90) — 실제 데이터 분포 보고 미세조정

### B-3. 클러치샷 컬러 스케일 (개선안 #6)

**현 위치**: [HighlightsHome.tsx:21-43](src/components/league/HighlightsHome.tsx#L21) · [line 199-217](src/components/league/HighlightsHome.tsx#L199)

**현 코드**:
```
KIND_LABEL = { tie, chase, reversal, winning, dagger }  // 5단계
KIND_STYLE = 하드코딩 hex 5색
KIND_PRIORITY = winning > reversal > tie > chase > dagger
```

**문제**: 5색이 신호등처럼 섞여 위기 강도가 안 읽힌다. 색이 우선순위 순서와 상관없다.

**결정**:
- 5단계 유지 (사용자 개선안은 "4단계"라 했으나 실코드는 5단계 — 정보성 유지)
- 위기 강도(=클러치 무게) 순 재정렬: `dagger < chase < tie < reversal < winning`
  - 이유: dagger(쐐기) = 이미 승리 굳히기, winning(위닝샷) = 게임을 뒤집는 결정타
- 5단계를 하나의 색 스케일로 표현 (그레이 → 오렌지 → 딥오렌지 → 옐로우 → 옐로우-강)
- CSS 변수 승격: `--clutch-1` ~ `--clutch-5`
- 상단 스트립 헤더는 색 + 단계 라벨 병기 ("Lv3 · 동점")

**결정 미정**: 정확한 5색 (다크/라이트 각각 확인) · winning 이 옐로우면 B-1 원칙(옐로우 1개만)과 충돌 → **winning 은 `--color-hoop-orange-500`(가죽공 오렌지)로 재조정** (이미 팔레트에 존재하는 브랜드 색). 클러치 스케일 최상위 = 오렌지 딥톤, 옐로우와 완전 분리.

---

## Phase C — 개별 컴포넌트 정돈

토큰·색이 잡히면 개별 컴포넌트를 다듬는다.

### C-1. 스탯 카드 통일 (개선안 #2)

**현 위치**: [PersonalDashboard.tsx:162-255](src/components/league/auth/PersonalDashboard.tsx#L162) — `SeasonSummary` + `StatCard`

**현 코드**:
- 5개 카드 각각 지표색 상단 3px 라인 ([line 211-216](src/components/league/auth/PersonalDashboard.tsx#L211))
- 배경 tint: `${color}12` (7% opacity)
- 순위 뱃지 3분기: 🥇🥈🥉 + 초록 배경 (top3) / 초록 텍스트 (4-10위) / "—" (그 외)
- 큰 숫자 clamp(24~40px), 카드마다 미세 편차

**문제**:
- 상단 5색 라인이 무지개처럼 산만 — 지표별 정체성 강조라기엔 색이 너무 강함
- 배경 tint 도 다섯 색 — 옐로우 남용(B-1)과 같은 맥락으로 위계가 무너짐
- 순위 뱃지: top3 는 흰 텍스트 + 색 배경 · 4-10 은 초록 텍스트만 · 그 외는 "—" — 3단계가 시각적으로 정렬 안 맞음

**결정**:
- 상단 라인 → **뉴트럴 통일** (`--mm-rule`) 또는 제거. 지표 정체성은 라벨 색으로만.
- 배경 tint → **완전 제거** (`--mm-panel-alt` 통일). Top3 만 subtle 옐로우 tint (B-1 원칙과 맞물림)
- 순위 뱃지 규칙 통일:
  - 항상 "N위 / 총N명" 텍스트 노출 (총명 있으면)
  - 1~3위는 메달 이모지 + 텍스트 (동일 컨테이너 · 흰 텍스트 + 골드/실버/브론즈 배경)
  - 4~10위는 텍스트 + `--milestone-near` 초록 tint 배경 (B-2 와 같은 근접도 색)
  - 11위+는 텍스트 (뉴트럴 tint) · "—" 제거
- 큰 숫자는 A-2 의 `--fs-hero` 토큰 참조로 통일 · 카드마다 편차 제거

**결정 미정**: 메달 이모지 사용 유지 여부 (SVG 아이콘 대체 검토는 정체성 SVG 별도 스펙에서)

### C-2. 네비 아이콘 크기·툴팁 (개선안 #7)

**현 위치**: [LeagueLayoutClient.tsx:82-152](src/app/league/[orgSlug]/[leagueId]/_components/LeagueLayoutClient.tsx#L82) — `TabNav` 우측

**현 코드**:
- 로그아웃/테마/도움말: `p-1.5 rounded border` + icon `size={14}`
- 검색: `px-2.5 py-1.5` + icon `size={13}`
- 로그인/편집 버튼: `px-3 py-1.5` + icon `size={12}`
- 유저 칩: 옐로우 배경 + 옐로우 보더 강조 · min-h-[44px]
- 편집중 버튼: 옐로우 배경 + 옐로우 보더

**문제**: 5개 아이콘 버튼이 3종 다른 패딩·아이콘 크기(12/13/14). 시각적 크기 불균일.

**결정**:
- 단일 사이즈: `p-2 rounded-md min-h-[44px] min-w-[44px]`
- 아이콘 크기 통일: `size={16}` (lucide 기본)
- 텍스트 있는 버튼(로그인/편집)은 `gap-1.5` 로 아이콘 + 텍스트 정렬
- Tooltip 신설: 아이콘 전용 버튼에 hover/focus 시 짧은 라벨 (예: "검색", "테마 전환", "도움말")
- 유저 칩 옐로우 강조 → 제거 (B-1). 이름은 유지, 스타일은 다른 아이콘 버튼과 동일 뉴트럴
- 편집중 버튼 옐로우 → 유지 (편집 = 예외적 강조 상태, B-1 예외로 명시)

**결정 미정**: Tooltip 구현 방식(shadcn/ui 에 이미 있으면 그거 · 없으면 Radix Primitive) — 프로젝트에 `sonner`(toast)는 있으므로 확인 필요

---

## 4. 대상 파일 (총 9개)

- `src/app/globals.css` — 새 토큰 정의 (Phase A · B 공통)
- `src/components/league/ui/SectionCard.tsx` — **신규** (Phase A-1)
- `src/components/league/auth/PersonalDashboard.tsx` — Phase A/B/C 전방위
- `src/components/league/announcements/AnnouncementsHome.tsx` — A/B
- `src/components/league/MilestoneFeed.tsx` — A/B
- `src/components/league/HighlightsHome.tsx` — A/B
- `src/components/league/nba/NbaLeaders.tsx` — A/B/C
- `src/components/league/nba/NbaTeamStandings.tsx` — A/B
- `src/components/league/nba/NbaRoundsSummary.tsx` — A/B
- `src/app/league/[orgSlug]/[leagueId]/_components/LeagueLayoutClient.tsx` — C-2 · B-1

## 5. 성공 기준

Phase 별로 사용자가 실제로 확인 가능한 형태로 끊는다.

- **Phase A 완료 시점**:
  - `SectionCard` 컴포넌트 존재 · 6개 지점 리팩터
  - 폰트 스케일 4토큰 (`--fs-hero/--fs-num/--fs-body/--fs-label`) 존재 · 6+ 지점 적용
  - 여백 토큰 존재 · MilestoneFeed / AnnouncementsHome 정합화
  - `npx tsc --noEmit` 통과 · 375/414/768/1024 화면 파괴 없음
- **Phase B 완료 시점**:
  - 옐로우 사용처 8 → 1 (이번 주 하이라이트 CTA만) + 예외 1 (편집중 버튼)
  - MilestoneChaser 바·뱃지 색이 근접도 로직 3티어로 결정
  - 클러치 5단계가 위기 강도 순 그라데이션 · CSS 변수 승격
- **Phase C 완료 시점**:
  - 스탯 카드 5개가 시각적으로 동일한 카드 (상단 라인 색 무지개 사라짐)
  - 네비 아이콘 5개가 동일한 크기 · 툴팁 부착 · 유저 칩 뉴트럴화
- **전 Phase 공통**:
  - Lighthouse 접근성 스코어 유지 or 향상
  - WCAG AA 4.5:1 대비 통과 (라벨 색 재조정 검증)
  - 프로덕션 배포 후 사용자 확인 컷 (로그인·비로그인 각 1회)

## 6. 스코프 밖 (명시)

- 리그 홈 이외 페이지(스탯/선수단/경기 기록/스케줄) — 도미노 확장은 후속 이터레이션
- 정체성 SVG(농구공·골대·백보드 backdrop) 도입 — 별도 스펙으로 후속 진행
- 정보 구조 변경 (섹션 추가·삭제·순서 변경) — 이번 스펙은 시각 정돈만
- 새 KPI 카드·요약 스트립 (사용자 확정 규칙 · [feedback_landing_summary_reject])

## 7. 관련 자료

- 사용자 AI 개선안 원문 (대화 로그)
- 관련 피드백 메모리:
  - `feedback_mobile_first` — 모바일 최적화 상시 규칙
  - `feedback_landing_summary_reject` — 홈에 요약 카드 신설 금지
  - `feedback_auto_deploy` — master push 시 Vercel 자동 배포 흐름 유지
- 보류된 브레인스토밍 mockup: `.superpowers/brainstorm/2286-1784615112/content/` (home-approach.html · svg-style.html · header-layout.html · home-full-map.html)
