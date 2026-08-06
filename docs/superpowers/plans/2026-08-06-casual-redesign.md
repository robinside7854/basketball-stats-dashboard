# 캐주얼 전환 실행 계획 (온볼)

시안: 클로드 아티팩트 `온볼 캐주얼 전환 시안`(2026-08-06).
복원 지점: git tag **`design-classic`** (= 클래식 버전, commit `b125c284`).
브랜치: `feat/design-casual` → 완료 후 master 병합 + push.

## Global Constraints (전 태스크 공통 · 위반 시 리뷰 실패)

1. **토큰 이름을 바꾸지 않는다.** 기존 `--mm-*` 이름은 전부 그대로 두고 값만 교체한다.
   새 토큰은 추가만 한다. (이미 토큰을 쓰는 130개 파일이 자동으로 따라와야 함)
2. **`globals.css` 126~261행은 건드리지 않는다.** (`--color-white` 반전 트릭 +
   `!important` 밴드에이드 블록). 제거는 이번 범위 밖 — 선행조건 미충족.
3. **데이터 코어의 밀도를 줄이지 않는다.** 스탯 테이블·박스스코어의 행 높이, 열 개수,
   `tabular-nums`, sticky 첫 열, 가로 스크롤 구조는 그대로 둔다.
4. **대비 4.5:1 미만을 만들지 않는다.** 이 계획의 색쌍은 전부 7:1 이상으로 검증됐다.
   임의로 다른 값을 쓰지 말고 아래 표의 값을 **그대로** 쓴다.
5. **데이터 로직 금지.** fetch / useState / useEffect / onClick / 계산식을 수정하지 않는다.
   스타일과 그에 직접 필요한 표현 코드만 만진다.
6. **하드코딩 hex 금지.** 새로 쓰는 색은 반드시 CSS 변수를 경유한다.
   (예외: 이미 DB에서 오는 팀 컬러 `t.color`)
7. **이모지를 UI에 쓰지 않는다.** 아이콘은 lucide-react 유지.
8. **작업 후 `npx tsc --noEmit` 통과 확인.** 실패 상태로 보고하지 않는다.
9. `prefers-reduced-motion` 존중 · 애니메이션은 `transform`/`opacity`만.

---

## Task 1 — 토큰 값 교체 및 신규 색쌍 추가

**파일: `src/app/globals.css` 단 하나.** 11~56행의 `:root` / `.dark` 블록과
59~121행 `@theme` 안의 `--milestone-*` · `--clutch-*` 만 수정한다.

### 1-A. `:root` (라이트) — 기존 변수 값 교체

| 변수 | 기존 | 신규 |
|---|---|---|
| `--mm-ground` | `#FFFEF7` | `#FAF7F0` |
| `--mm-panel` | `#FFFFFF` | `#FFFFFF` (유지) |
| `--mm-panel-alt` | `#FAF9F5` | `#F3EFE6` |
| `--mm-ink` | `#0A0A0A` | `#1C1A17` |
| `--mm-ink-soft` | `#27272A` | `#3D3A34` |
| `--mm-muted` | `#52525B` | `#6B665C` |
| `--mm-rule` | `#E5E7EB` | `#E7E1D5` |
| `--mm-yellow` | `#EAB308` | `#F2B53C` |
| `--mm-yellow-strong` | `#A16207` | `#8A6410` |
| `--mm-yellow-soft` | `#FEF3C7` | `#FDF3DC` |
| `--mm-black` | `#0A0A0A` | `#1C1A17` |
| `--mm-live` | `#DC2626` | `#C4362B` |
| `--mm-live-bg` | `#DC2626` | `#C4362B` |
| `--mm-positive` | `#047857` | `#2E6B3D` |
| `--mm-negative` | `#DC2626` | `#A33328` |
| `--mm-neutral-strong` | `#475569` | `#55534E` |

### 1-B. `:root` — 신규 추가 (텍스트 전용 변수는 위에 그대로 두고, 칩 배경용 쌍을 새로 만든다)

```
--mm-positive-bg: #E8F1E9;  --mm-positive-fg: #2E6B3D;
--mm-negative-bg: #FBEAE8;  --mm-negative-fg: #A33328;
--mm-neutral-bg:  #EEEDE9;  --mm-neutral-fg:  #55534E;
--mm-radius-card: 14px;
--mm-radius-ctl:  10px;
--mm-radius-chip: 999px;
--mm-radius-modal: 18px;
```

### 1-C. `.dark` — 기존 변수 값 교체

| 변수 | 기존 | 신규 |
|---|---|---|
| `--mm-ground` | `#0A0A0A` | `#191714` |
| `--mm-panel` | `#171717` | `#221F1B` |
| `--mm-panel-alt` | `#0F0F0F` | `#1F1D19` |
| `--mm-ink` | `#FAFAFA` | `#F2EEE6` |
| `--mm-ink-soft` | `#E4E4E7` | `#D6D0C4` |
| `--mm-muted` | `#C4C4CB` | `#A9A294` |
| `--mm-rule` | `#262626` | `#332F29` |
| `--mm-yellow` | `#FDE047` | `#F5C95C` |
| `--mm-yellow-strong` | `#FACC15` | `#F0CE78` |
| `--mm-yellow-soft` | `rgba(253,224,71,0.10)` | `rgba(245,201,92,0.13)` |
| `--mm-black` | `#000000` | `#191714` |
| `--mm-live` | `#EF4444` | `#F08A7E` |
| `--mm-live-bg` | `#DC2626` | `#C4362B` (유지 성격) |
| `--mm-positive` | `#34D399` | `#82D89D` |
| `--mm-negative` | `#F87171` | `#F5998C` |
| `--mm-neutral-strong` | `#CBD5E1` | `#C9C3B6` |

### 1-D. `.dark` — 신규 추가

```
--mm-positive-bg: rgba(96,196,128,0.15);  --mm-positive-fg: #82D89D;
--mm-negative-bg: rgba(240,120,105,0.15); --mm-negative-fg: #F5998C;
--mm-neutral-bg:  rgba(255,255,255,0.07); --mm-neutral-fg:  #BBB5A8;
```

라디우스 4종은 라이트/다크 공통이므로 `.dark` 에 다시 쓰지 않는다.

### 1-E. 클러치 5단계 — 단색에서 배경/전경 쌍으로

기존 `@theme` 안의 `--clutch-1` ~ `--clutch-5` 를 **삭제하고** 아래를 `:root` 와 `.dark` 에
각각 정의한다. (`@theme` 이 아니라 `:root`/`.dark` — 테마 반전이 필요하기 때문)

라이트:
```
--clutch-1-bg:#EDEFF1; --clutch-1-fg:#414B55;
--clutch-2-bg:#E2EFF1; --clutch-2-fg:#125661;
--clutch-3-bg:#E5EDF5; --clutch-3-fg:#175278;
--clutch-4-bg:#E7F1EA; --clutch-4-fg:#25603D;
--clutch-5-bg:#FBEDE4; --clutch-5-fg:#98401A;
```
다크:
```
--clutch-1-bg:rgba(148,163,184,0.16); --clutch-1-fg:#B4BDC7;
--clutch-2-bg:rgba(56,178,196,0.16);  --clutch-2-fg:#7ACFDD;
--clutch-3-bg:rgba(96,165,220,0.16);  --clutch-3-fg:#8FC2E8;
--clutch-4-bg:rgba(96,196,128,0.16);  --clutch-4-fg:#82D89D;
--clutch-5-bg:rgba(230,140,80,0.16);  --clutch-5-fg:#EFA579;
```

### 1-F. 마일스톤 3티어 — 동일하게 쌍으로

기존 `@theme` 의 `--milestone-near/mid/far` 를 삭제하고 `:root`/`.dark` 에 정의한다.

라이트:
```
--milestone-near-bg:#E7F1EA; --milestone-near-fg:#25603D;
--milestone-mid-bg:#FBF0D8;  --milestone-mid-fg:#8A6410;
--milestone-far-bg:#EEEDE9;  --milestone-far-fg:#55534E;
```
다크:
```
--milestone-near-bg:rgba(96,196,128,0.16); --milestone-near-fg:#82D89D;
--milestone-mid-bg:rgba(245,201,92,0.15);  --milestone-mid-fg:#F0CE78;
--milestone-far-bg:rgba(255,255,255,0.07); --milestone-far-fg:#BBB5A8;
```

### 1-G. 순위 티어 — 신규

라이트:
```
--rank-1-bg:#FBF0D8; --rank-1-fg:#8A6410;
--rank-2-bg:#ECEDEF; --rank-2-fg:#4E555E;
--rank-3-bg:#F6EAE1; --rank-3-fg:#8A4B22;
--rank-top-bg:#E7F1EA; --rank-top-fg:#25603D;
```
다크:
```
--rank-1-bg:rgba(245,201,92,0.15);  --rank-1-fg:#F0CE78;
--rank-2-bg:rgba(255,255,255,0.08); --rank-2-fg:#C6C9CE;
--rank-3-bg:rgba(220,130,70,0.15);  --rank-3-fg:#E2A277;
--rank-top-bg:rgba(96,196,128,0.16);--rank-top-fg:#82D89D;
```

### 1-H. `.jersey-num` 유틸 (globals.css 517~535행) 라디우스만 4px → 6px.

**주의:** 이 태스크에서 `--clutch-*` / `--milestone-*` 를 지우면 소비 파일이 깨진 색을 갖게 된다.
컴파일은 통과하므로(CSS 변수라 타입 에러 없음) Task 2 가 반드시 이어져야 한다.
Task 1 커밋 메시지에 그 사실을 적는다.

---

## Task 2 — 의미색 소비처를 배경/전경 쌍으로 전환

**대상 파일 (5개, 다른 태스크와 겹치지 않음):**

- `src/components/league/HighlightsHome.tsx` — `--clutch-1~5` 소비. 배경 채움 + 흰 텍스트를
  `var(--clutch-N-bg)` + `var(--clutch-N-fg)` 로. 흰색 하드코딩(`#ffffff`, `text-white`) 제거.
  칩 라디우스는 `var(--mm-radius-chip)`.
- `src/app/league/[orgSlug]/[leagueId]/stats/page.tsx` — 두 곳.
  ① `rankTier()` (110행 부근): 하드코딩 `#0a0a0a`/`#D4A017`/`#B45309`/`#ffffff` 를
     `--rank-1-bg/fg`, `--rank-2-bg/fg`, `--rank-3-bg/fg`, `--rank-top-bg/fg` 로 교체.
     11위 이상은 기존대로 `transparent` + `var(--mm-muted)`.
  ② `--milestone-*` 참조를 `-bg`/`-fg` 쌍으로.
  **테이블 열·행 구조는 절대 건드리지 말 것** (Global Constraint 3).
- `src/components/league/auth/PersonalDashboard.tsx` — `rankStyle` + `MilestoneChaser` 의
  `--milestone-*` 를 쌍으로. 바(bar) 색은 `-fg` 를 쓴다.
- `src/components/league/player/DynamicDuoPanel.tsx` — 메달 하드코딩을 `--rank-*` 로.
- `src/components/league/nba/RecordDisplay.tsx` — `ResultChips` 의 승/패/무 칩을
  `--mm-positive-bg`/`-fg`, `--mm-negative-bg`/`-fg`, `--mm-neutral-bg`/`-fg` 로.
  칩 라디우스 `var(--mm-radius-chip)`. `ScoreTable` 의 diff 텍스트 색은
  기존 `--mm-positive`/`--mm-negative`(텍스트용) 를 **그대로 둔다**.

---

## Task 3 — 헤딩 서체: 방송 그래픽 톤 해제

**정확한 문자열 치환.** `className` 안의 연속 문자열
`font-jersey font-black uppercase` → `font-bold`
전체 코드베이스에서 **135곳 / 56파일**. 아래를 지킨다:

- 치환 대상은 위 3개 클래스가 **연속으로 붙어 있는 경우만**이다.
- `font-jersey font-black tabular-nums` 처럼 `uppercase` 가 없는 조합은 **건드리지 않는다**
  (스코어보드 숫자 — Bebas/Barlow 유지가 의도).
- `font-display` 를 쓰는 곳은 **건드리지 않는다**.
- 치환 후 같은 요소에 `tracking-[0.14em]` 류의 넓은 자간이 남아 있으면 제거한다
  (대문자가 아니게 되었으므로 넓은 자간은 한글 가독성을 해친다).
  단 `tracking-[...]` 가 별도의 작은 라벨 요소에 붙어 있는 경우는 유지.
- 치환으로 `font-black`(900)이 `font-bold`(700)이 되는 것이 이 태스크의 목적이다.

`npx tsc --noEmit` 과 `npm run build` 를 모두 통과시킨다.

---

## Task 4 — 형태: 카드 라디우스 · 간격 · 홈 히어로 테마 추종

**4-A. `src/components/league/ui/SectionCard.tsx`**
- `stack` 변형: `borderRadius: 0` → `var(--mm-radius-card)`, `borderTop: 0` → 일반 1px `--mm-rule`.
- `standalone` 변형: `6px` → `var(--mm-radius-card)`.
- `emphasized`: 상단 3px 옐로우-soft 라인은 그대로 유지(라디우스와 무관).

**4-B. `src/app/league/[orgSlug]/[leagueId]/page.tsx`**
- 헤더(411~431행): `court-bg` + `text-white` 고정 다크 배너를 **테마 추종 카드**로 바꾼다.
  배경 `var(--mm-panel)`, 테두리 1px `var(--mm-rule)`, 라디우스 `var(--mm-radius-card)`,
  제목 `var(--mm-ink)`, 캡션 `var(--mm-ink-soft)`, 메타 `var(--mm-muted)`.
  `text-white/70`, `text-white/45` 같은 흰색 알파는 전부 제거한다.
  제목의 `font-jersey ... uppercase` 는 Task 3 규칙과 동일하게 `font-bold`.
  메타 줄의 대문자 tracking 도 해제한다.
- 시즌 전환 칩(434~446행): `border-gray-700`/`text-gray-400` 레거시 팔레트를
  `var(--mm-rule)`/`var(--mm-muted)` 로. 라디우스는 `var(--mm-radius-chip)` 유지.
- 섹션 간 간격: 최상위 `space-y-5 lg:space-y-4` → `space-y-3` (카드가 개별 객체로 읽히도록
  12px 간격. Tailwind `space-y-3` = 0.75rem × 루트 17px ≈ 12.75px).

**4-D. 메달 이모지 제거 (Task 2 구현자가 발견 · 범위 추가)**
- `src/components/league/auth/PersonalDashboard.tsx` 의 `rankStyle()` 이 순위 표시에
  이모지 🥇🥈🥉 를 쓰고 있다. Global Constraint 7(이모지 금지) 위반이며 디자인 시스템의
  "이모지를 UI 아이콘으로 쓰지 않는다" 규칙과도 어긋난다.
- 이모지를 지우고 Task 2 가 만든 `--rank-1/2/3-bg`·`-fg` 배지(숫자 1·2·3)로 표현한다.
  같은 파일의 다른 순위 배지와 형태를 맞춘다. 새 아이콘 라이브러리를 도입하지 않는다.
- 같은 파일 안에 다른 UI 이모지가 더 있으면 함께 정리한다. 단 **사용자가 입력한 본문
  텍스트(공지·댓글 등)의 이모지는 건드리지 않는다** — UI 아이콘으로 쓰인 것만 대상이다.

**4-C. `src/components/layout/TabNav.tsx`**
- 활성 탭 밑줄 색 `--mm-yellow-strong` 유지. 편집 버튼 라디우스 `rounded-lg` →
  `var(--mm-radius-ctl)`. 팀 배지의 `bg-blue-500/20` 계열 레거시 색은 이번 범위 밖이므로 유지.

---

## Task 5 — 문서 정본 통합

- **`DESIGN.classic.md` 신설**: 현행 `DESIGN.md` 를 그대로 복사해 파일명만 바꾸고,
  최상단에 "클래식(전환 전) 버전. 복원은 `git checkout design-classic -- <경로>` 또는
  태그 전체 복원." 한 줄을 붙인다. **내용은 수정하지 않는다.**
- **`DESIGN.md` 갱신**: frontmatter 의 colors/rounded 를 Task 1 의 신규 값으로 맞추고,
  본문에서 아래를 반영한다.
  - Overview 의 "Architectural Sports Editorial" → 캐주얼 전환 후 톤 서술로 교체.
    핵심 문장: 판독 속도 최우선은 **유지**, 껍데기만 캐주얼(층 분리).
  - Typography: 헤딩은 900/대문자가 아니라 **700 + 대소문자 유지**. Bebas Neue 는
    스코어 숫자 전용. Barlow Condensed 는 등번호 전용.
  - Shapes: 카드 14px / 칩 999px / 모달 18px / 컨트롤 10px 로 **단일 정본**.
  - Components 의 클러치·마일스톤·result-chip 을 배경/전경 쌍 서술로.
  - Do's and Don'ts 에 "의미색은 채움+흰글씨가 아니라 틴트+진한글씨" 항목 추가.
- **`DESIGN.dark.md`**: 토큰 이름은 라이트와 완전히 동일해야 하므로 신규 토큰
  (`*-bg`/`*-fg`, `--mm-radius-*`, `--rank-*`)을 다크 값으로 전부 반영한다.
- **`docs/mm-brand-style.md`**: radius 규칙이 DESIGN.md 와 충돌(0/4px vs 14px)하므로
  해당 절을 DESIGN.md 를 가리키도록 고치고, 충돌하던 문장은 삭제한다.
  "정본은 DESIGN.md" 를 문서 최상단에 명시한다.
- **`docs/onball-current-state.md`**: "최근 결정" 성격의 줄 추가 —
  캐주얼 전환 적용 · 클래식은 `design-classic` 태그로 복원 가능.

---

## 완료 기준

- `npx tsc --noEmit` exit 0
- `npm run build` 성공
- `node scripts/verify-schema.mjs` · `node scripts/verify-scoring.mjs` 둘 다 exit 0
  (데이터 불변 확인 — 디자인 작업이라 영향 없어야 정상)
- master 병합 + push 완료 (Vercel 자동 배포)
