---
version: alpha
name: 미라클모닝 (Miracle Morning) — Light
description: 농구팀 스탯 대시보드 캐주얼 브랜드(2026-08-06 전환). 노랑 / 검정 / 화이트. globals.css 의 :root (라이트 모드) 토큰과 1:1 대응.
colors:
  # ── 표면 (surface) ──
  ground: "#FAF7F0"
  panel: "#FFFFFF"
  panel-alt: "#F3EFE6"
  rule: "#E7E1D5"
  # ── 전경 (foreground) ──
  ink: "#1C1A17"
  ink-soft: "#3D3A34"
  muted: "#6B665C"
  white: "#FFFFFF"
  # ── 키 컬러 (agent 자동생성 방지) ──
  primary: "#1C1A17"
  secondary: "#F2B53C"
  tertiary: "#EA580C"
  # ── 브랜드 옐로우 ──
  yellow: "#F2B53C"
  yellow-strong: "#8A6410"
  yellow-soft: "#FDF3DC"
  black: "#1C1A17"
  # ── 경기 결과 (텍스트 전용) ──
  live: "#C4362B"
  live-bg: "#C4362B"
  positive: "#2E6B3D"
  negative: "#A33328"
  neutral-strong: "#55534E"
  # ── 의미색 배경/전경 쌍 (칩류가 소비, 2026-08-06 신규) ──
  positive-bg: "#E8F1E9"
  positive-fg: "#2E6B3D"
  negative-bg: "#FBEAE8"
  negative-fg: "#A33328"
  neutral-bg: "#EEEDE9"
  neutral-fg: "#55534E"
  # ── 농구 정체성 (캐주얼 전환 범위 밖 · 무변경) ──
  hoop-orange: "#EA580C"
  hoop-orange-deep: "#C2410C"
  # ── 클러치샷 5단계 위기 강도 — 배경/전경 쌍 (2026-08-06 신규) ──
  clutch-1-dagger-bg: "#EDEFF1"
  clutch-1-dagger-fg: "#414B55"
  clutch-2-chase-bg: "#E2EFF1"
  clutch-2-chase-fg: "#125661"
  clutch-3-tie-bg: "#E5EDF5"
  clutch-3-tie-fg: "#175278"
  clutch-4-reversal-bg: "#E7F1EA"
  clutch-4-reversal-fg: "#25603D"
  clutch-5-winning-bg: "#FBEDE4"
  clutch-5-winning-fg: "#98401A"
  # ── 마일스톤 근접도 3티어 — 배경/전경 쌍 (2026-08-06 신규) ──
  milestone-near-bg: "#E7F1EA"
  milestone-near-fg: "#25603D"
  milestone-mid-bg: "#FBF0D8"
  milestone-mid-fg: "#8A6410"
  milestone-far-bg: "#EEEDE9"
  milestone-far-fg: "#55534E"
  # ── 순위 티어 — 배경/전경 쌍 (2026-08-06 신규, 이전에 없던 토큰) ──
  rank-1-bg: "#FBF0D8"
  rank-1-fg: "#8A6410"
  rank-2-bg: "#ECEDEF"
  rank-2-fg: "#4E555E"
  rank-3-bg: "#F6EAE1"
  rank-3-fg: "#8A4B22"
  rank-top-bg: "#E7F1EA"
  rank-top-fg: "#25603D"
typography:
  display-xl:
    fontFamily: Bebas Neue
    fontSize: 3rem
    fontWeight: 400
    lineHeight: 1
    letterSpacing: 0.01em
  jersey-num:
    fontFamily: Barlow Condensed
    fontSize: 1rem
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: 0.02em
  h1:
    fontFamily: Pretendard Variable
    fontSize: 1.5rem
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.01em
  h2:
    fontFamily: Pretendard Variable
    fontSize: 1.2rem
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: -0.01em
  body-md:
    fontFamily: Pretendard Variable
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0em
  prose:
    fontFamily: Pretendard Variable
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.7
  label-caps:
    fontFamily: Barlow Condensed
    fontSize: 0.75rem
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0.14em
  stat-num:
    fontFamily: ui-monospace
    fontSize: 1rem
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.02em
    fontFeature: "'tnum' 1"
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  touch-target: 44px
rounded:
  ctl: 10px       # var(--mm-radius-ctl) — 버튼 · 인풋 · 작은 컨트롤
  card: 14px      # var(--mm-radius-card) — 카드 · 섹션
  chip: 999px     # var(--mm-radius-chip) — 알약형 칩 · 뱃지 · LIVE
motion:
  fast: 100ms     # var(--mm-motion-fast) — 즉시 반응(호버 색 · 포커스 링)
  base: 200ms     # var(--mm-motion-base) — 상태 변경 알림(탭 활성 · 화면 진입)
  slow: 420ms     # var(--mm-motion-slow) — 값 변화 표현(진행바 차오름)
  tell: 760ms     # var(--mm-motion-tell) — 누적 숫자 카운트업(JS 전용)
  ease-out: cubic-bezier(0.22, 1, 0.36, 1)   # var(--mm-ease-out) — 기본. 빠르게 나가 부드럽게 안착
  ease-inout: cubic-bezier(0.4, 0, 0.2, 1)   # var(--mm-ease-inout) — 양방향 전환
components:
  page-body:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
  card-meta:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.muted}"
    typography: "{typography.label-caps}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.ctl}"
    height: "{spacing.touch-target}"
  button-accent:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.black}"
    rounded: "{rounded.ctl}"
    height: "{spacing.touch-target}"
  result-chip-win:
    backgroundColor: "{colors.positive-bg}"
    textColor: "{colors.positive-fg}"
    rounded: "{rounded.chip}"
  result-chip-loss:
    backgroundColor: "{colors.negative-bg}"
    textColor: "{colors.negative-fg}"
    rounded: "{rounded.chip}"
  result-chip-draw:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.neutral-fg}"
    rounded: "{rounded.chip}"
  live-badge:
    backgroundColor: "{colors.live-bg}"
    textColor: "{colors.white}"
    rounded: "{rounded.chip}"
  live-text:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.live}"
  clutch-1-dagger:
    backgroundColor: "{colors.clutch-1-dagger-bg}"
    textColor: "{colors.clutch-1-dagger-fg}"
    rounded: "{rounded.chip}"
  clutch-2-chase:
    backgroundColor: "{colors.clutch-2-chase-bg}"
    textColor: "{colors.clutch-2-chase-fg}"
    rounded: "{rounded.chip}"
  clutch-3-tie:
    backgroundColor: "{colors.clutch-3-tie-bg}"
    textColor: "{colors.clutch-3-tie-fg}"
    rounded: "{rounded.chip}"
  clutch-4-reversal:
    backgroundColor: "{colors.clutch-4-reversal-bg}"
    textColor: "{colors.clutch-4-reversal-fg}"
    rounded: "{rounded.chip}"
  clutch-5-winning:
    backgroundColor: "{colors.clutch-5-winning-bg}"
    textColor: "{colors.clutch-5-winning-fg}"
    rounded: "{rounded.chip}"
  milestone-near-badge:
    backgroundColor: "{colors.milestone-near-bg}"
    textColor: "{colors.milestone-near-fg}"
    rounded: "{rounded.chip}"
  milestone-mid-badge:
    backgroundColor: "{colors.milestone-mid-bg}"
    textColor: "{colors.milestone-mid-fg}"
    rounded: "{rounded.chip}"
  milestone-far-badge:
    backgroundColor: "{colors.milestone-far-bg}"
    textColor: "{colors.milestone-far-fg}"
    rounded: "{rounded.chip}"
  rank-1-badge:
    backgroundColor: "{colors.rank-1-bg}"
    textColor: "{colors.rank-1-fg}"
  rank-2-badge:
    backgroundColor: "{colors.rank-2-bg}"
    textColor: "{colors.rank-2-fg}"
  rank-3-badge:
    backgroundColor: "{colors.rank-3-bg}"
    textColor: "{colors.rank-3-fg}"
  rank-top-badge:
    backgroundColor: "{colors.rank-top-bg}"
    textColor: "{colors.rank-top-fg}"
  divider:
    backgroundColor: "{colors.rule}"
---

# DESIGN.md — 미라클모닝 농구 대시보드 (Light)

## Overview

**캐주얼 스포츠 대시보드 (2026-08-06 전환).** 이전 버전("Architectural Sports Editorial")은
방송 그래픽 톤 — 순백 표면, 900 굵기 대문자 헤딩, 클러치/마일스톤을 단색 채움 + 흰 텍스트로
찍어 누르는 방식이었다. 지금은 웜 아이보리 표면과 700 굵기 헤딩으로 톤을 낮췄다.

바뀐 것은 **표면 처리와 서체 중량감뿐**이다. 매일 열어보는 업무형 대시보드라는 성격은 그대로이므로
**판독 속도는 여전히 최우선**이다 — 정보 위계, 데이터 밀도(스탯 테이블 행 높이·열 개수·`tabular-nums`·
sticky 첫 열), 레이아웃 구조는 이번 전환에서 건드리지 않았다. 껍데기만 캐주얼해졌고 데이터 코어는
무변경이다. 장식 효과(글래스·WebGL·브루탈리즘)는 여전히 이 제품에 적용하지 않는다.

브랜드는 **노랑 / 검정 / 화이트** 3색으로 고정된다. 정보의 위계는 색이 아니라 **굵기와 크기**로 만든다.
노랑 실색상 예산에 대해서는 아래 [Do's and Don'ts](#dos-and-donts)를 반드시 읽을 것 — 2026-08-06
전환으로 노랑을 쓰는 방식이 두 층으로 나뉘었다.

이 문서는 라이트 모드다. 다크 모드는 `DESIGN.dark.md` 를 따르며, 두 파일은 **토큰 이름이 완전히 동일**해야 한다.
전환 전 버전은 `DESIGN.classic.md` 에 그대로 보존되어 있다.

## Colors

표면은 순백이 아닌 **웜 아이보리(`#FAF7F0`)** 에서 시작한다. 순백은 실내 체육관 조명 아래 사진과 붙었을 때
차갑게 튄다. 패널만 순백(`#FFFFFF`)으로 올려 카드가 배경 위로 떠 보이게 한다.

- **ground (#FAF7F0):** 페이지 바탕. 따뜻한 아이보리.
- **panel (#FFFFFF):** 카드·모달. 바탕보다 밝아 계층이 생긴다.
- **panel-alt (#F3EFE6):** 서브 카드·리스트 안.
- **ink (#1C1A17):** 헤드라인·본문. 순수 검정보다 눌러 눈부심을 줄였다.
- **ink-soft (#3D3A34):** 서브 텍스트.
- **muted (#6B665C):** 라벨·메타. 웜톤 뮤트, 흰 배경에서 4.5:1 이상 확보된 값이다.
- **rule (#E7E1D5):** 라인·카드 테두리.
- **yellow (#F2B53C):** 브랜드 옐로우. **배경으로만** 쓴다.
- **yellow-strong (#8A6410):** 옐로우를 텍스트로 써야 할 때의 대체색. 링크·리스트 마커.
- **yellow-soft (#FDF3DC):** 옐로우의 옅은 틴트. 강조 라인·hover 배경 전용(아래 참고).

> 노랑을 흰 배경 위 **텍스트로 쓰지 않는다.** 텍스트가 필요하면 반드시 `yellow-strong` 을 쓴다.

승/패/무는 텍스트로 쓸 때 `--mm-positive`(#2E6B3D) / `--mm-negative`(#A33328) / `--mm-neutral-strong`(#55534E)
를, 칩처럼 배경을 채워야 할 때는 대응하는 `-bg`/`-fg` 쌍(`--mm-positive-bg`/`-fg` 등, 옅은 틴트 + 진한
전경)을 쓴다. 채움+흰글씨 방식은 2026-08-06 전환으로 폐기했다 — 자세한 내용은
[Components](#components)와 [Do's and Don'ts](#dos-and-donts) 참고.

클러치샷 5단계는 위기 강도가 낮음→높음(dagger → chase → tie → reversal → winning) 순으로 올라가며,
각 단계는 옅은 틴트 배경 + 진한 전경 텍스트 쌍이다. 최고 단계(winning)의 전경(`#98401A`, 번트오렌지 계열)은
브랜드 옐로우가 아닌 색으로 골라 노랑의 예산을 침범하지 않는다.

## Typography

한글이 1급 시민이다. **Pretendard Variable** 이 sans 스택 최상단에 온다.
농구 정체성은 라틴/숫자 전용 폰트 2종으로만 표현한다.

- **Bebas Neue (display-xl):** 스코어보드, MVP 큰 숫자 전용. 한글에는 쓰지 않는다.
- **Barlow Condensed (jersey-num):** 등번호 전용.
- **Pretendard (h1~body):** 나머지 전부.

**헤딩은 900이 아니라 700(`font-bold`)이며 대문자를 강제하지 않는다** (2026-08-06 전환 — 방송 그래픽
톤이던 `font-jersey font-black uppercase` 조합 135곳을 `font-bold` 로 교체하며 대소문자를 원문 그대로
남겼다). 단 `font-jersey font-black tabular-nums`(대문자가 없는 스코어보드 숫자 조합)는 예외로
그대로 남는다 — 스코어 숫자는 여전히 Barlow Condensed 굵은 조판을 쓴다.

본문 `line-height` 는 1.6, `letter-spacing` 은 **0** 이다. 한글은 자간을 벌리면 오히려 읽기 어려워진다.
자간을 넓히는 건 라틴 대문자 라벨(`label-caps`, 0.14em)처럼 여전히 대문자인 작은 라벨뿐이다 — 헤딩이
`font-bold`로 바뀌며 대문자가 아니게 된 자리에는 넓은 자간을 남기지 않는다.

루트 폰트 크기는 모바일 17px / 태블릿 17.5px / 데스크톱 18px 로 올려 잡는다 —
40~50대 사용자가 체육관에서 서서 보는 화면이기 때문이다.

숫자 셀은 `tabular-nums` 를 강제해 열이 흔들리지 않게 한다.

## Layout

모바일 우선. 스탯 테이블은 **가로 스크롤 컨테이너 안에서만** 스크롤되며 페이지 본문은 절대 가로로 밀리지 않는다.

간격은 8px 배수다. 모든 인터랙티브 요소는 **최소 44×44px**(`spacing.touch-target`)을 확보한다 —
경기 중 손가락으로 기록하는 화면이라 이건 미감이 아니라 기능이다.

검증 폭: 375 / 768 / 1024 / 1440.

## Elevation & Depth

라이트 모드에서만 그림자를 쓴다. 카드는 `0 4px 20px rgba(0,0,0,0.08)`,
모달은 `0 20px 60px rgba(0,0,0,0.18)` 로 두 단계만 둔다. 중간 단계를 늘리지 않는다.

다크 모드에서는 그림자가 보이지 않으므로 **테두리(`rule`)로 계층을 만든다.**

## Shapes

기본 컨트롤 반경 10px(`--mm-radius-ctl` — 버튼·인풋·작은 액션 요소), 카드는 14px(`--mm-radius-card`),
칩·뱃지·LIVE 알약형은 999px(`--mm-radius-chip`)로 **`SectionCard` 등 공용 컴포넌트와 신규 작업의
정본**이다(2026-08-06 캐주얼 전환).

⚠ **일괄 전환 미완료(2026-08-07 리뷰 확인)**: 기존 Tailwind `rounded-*` 유틸(`rounded-lg` 184건 /
`rounded-xl` 153건 / `rounded-sm` 137건 / `rounded-2xl` 58건)이 코드베이스 전반에 아직 그대로 남아 있다.
이 캐주얼 전환 브랜치는 공용 컴포넌트(`SectionCard` 등)와 신규 작업의 반경 토큰화까지만 다뤘고, 기존
`rounded-*` 사용처의 전수 전환은 다음 단계로 이월한다. 모달 반경 토큰(`--mm-radius-modal`)은 소비처가
0건이라 2026-08-10 에 삭제했다 — 모달을 실제로 전환할 때 쓰는 곳과 함께 다시 만든다.

## Motion

모션은 **네 가지 목적** 중 하나를 수행할 때만 넣는다(2026-08-10 신설). 해당 없으면 넣지 않는다.
위계 설명 · 동작 확인(피드백) · 주의 유도 · 연속성 유지.

토큰은 **길이가 아니라 목적으로 고른다** — `fast`(즉시 반응) / `base`(상태 변경) / `slow`(값 변화) /
`tell`(누적 숫자, JS 전용). 하드코딩된 `duration-200` 을 새로 추가하지 않는다.
easing 은 `--mm-ease-out` 이 기본이며, **되튐(bounce/back) easing 은 쓰지 않는다** — 기록 대시보드에서
숫자가 출렁이면 장난스러워진다.

- **화면 진입:** `.mm-view-enter` — 8px 상승 + 페이드, `base`. 리그 본문 컨테이너가 경로 변경 시 사용.
- **진행바:** `GrowBar` — 0에서 목표까지 `slow`. width 는 인라인 transition 으로만 다룬다.
- **누적 숫자:** `CountUp` — `tell`, ease-out cubic. **누적/시즌 기록에만** 쓴다. 실시간 스코어나
  표 안의 행별 수치에 붙이면 읽는 것을 방해한다. 여러 개를 나란히 굴릴 때는 40~60ms 씩 밀어 순서를 만든다.
- **콘텐츠 등장:** `.mm-fade-in` — 스켈레톤이 실제 내용으로 바뀔 때. **위치 이동 없이 밝기만** 든다
  (상승을 같이 주면 스켈레톤이 잡아둔 자리와 어긋나 예약해 둔 공간의 의미가 사라진다).
  같은 엘리먼트에 클래스만 붙이면 재생되지 않으므로 `key` 를 로딩 상태로 바꿔 리마운트시킨다.
- **모달 등장:** `.mm-modal-in` — 0.97 → 1 스케일 + 페이드, `base`. 0.9 처럼 크게 잡으면 텍스트가
  한순간 흐려 보여 싸구려가 된다.
- **승리 스탬프:** `.mm-stamp-in` — 1.6배에서 도장 찍듯 제자리로, `slow`. **회전을 넣지 않는다** —
  표 안에서 기울어진 아이콘은 정렬이 깨져 보인다.
- **활성 탭 인디케이터:** 탭마다 그리지 않고 **하나를 옮긴다**. 따로 그리면 한쪽이 사라지고 다른 쪽이
  나타나 '점프'로 보인다. 하단 5탭이 동일 폭이라 `인덱스 × 100%` 로 맞는다 — 탭 개수를 바꾸면 같이 본다.
- **무한 반복은 두 곳만:** LIVE 배지(`pulse-red`)와 진행 중 스트릭 불꽃(`.mm-flicker`). 둘 다
  **"지금 진행 중"이라는 상태 자체**를 나타내므로 정당하다. 그 외에는 쓰지 않는다.
  불꽃은 투명도만 흔든다 — 크기를 흔들면 옆 숫자가 밀린다.

⚠ **미전환 잔여**: `PlayerQuickViewModal` · `PlayerBadgeDetailModal` 은 tailwindcss-animate 의
`animate-in fade-in zoom-in-95` 를 쓴다. 전자는 모바일에서 의도적인 바텀시트 슬라이드라 일반 스케일로
바꾸면 오히려 나빠진다. 데스크톱 상단 탭 인디케이터도 탭 폭이 가변이라 슬라이드 미적용(측정 필요).

⚠ **하지 않는 것:** 스크롤 리빌(매일 쓰는 도구에서 재방문자에게 방해) · WebGL/3D 배경 ·
데이터 표 행 stagger(지연이 "느려짐"으로 읽힌다) · 무한 루프 애니메이션 남발.

`prefers-reduced-motion` 은 `globals.css` 의 전역 블록 **한 곳**이 `!important` 로 일괄 차단한다.
소비처마다 `@media` 를 다시 쓰지 않는다. 단, **JS 로 값을 바꾸는 것(카운트업)은 CSS 가 못 막으므로**
컴포넌트가 직접 `matchMedia` 로 확인한다.

## Components

- **card:** panel 배경 + rule 테두리 + 14px 반경(`--mm-radius-card`). `SectionCard` 컴포넌트의 `stack`/
  `standalone` 두 변형이 이제 동일한 반경을 쓴다 — 전환 전에는 `stack` 이 반경 0 + 위 테두리 0으로
  다른 카드와 이어 붙는 방식이었다. `emphasized`(공지·개인화 대시보드·게이트 등 신호 카드)는 상단
  3px `--mm-yellow-soft` 라인을 추가로 얹는다. 호버 시 `translateY(-2px)` 만, 크기 변화 금지(레이아웃 이동 유발).
- **button-primary:** ink 배경 + ground 텍스트. 반경 10px(`--mm-radius-ctl`). 최소 높이 44px.
- **result-chip:** 배경은 의미색의 옅은 틴트(`-bg`), 텍스트는 진한 전경(`-fg`) — 2026-08-06 전환으로
  "배경 panel 고정 + 텍스트만 색" 방식에서 "틴트 배경 + 진한 텍스트" 방식으로 바뀌었다. 반경은 칩
  공통값 999px(`--mm-radius-chip`).
- **live-badge:** live 배경 + 흰 텍스트 + pulse-red 애니메이션. **경기 진행 중(`is_started && !is_complete`)에만**
  사용하며 다른 요소에 전용 금지. 의미색 칩과 달리 채움+흰글씨를 그대로 유지하는 유일한 예외다 —
  실시간 알림 성격이라 눈에 띄어야 하기 때문.
- **clutch-1~5:** 옅은 틴트 배경 + 진한 전경 텍스트 쌍(2026-08-06 전환, 이전에는 단색 채움 + 흰 텍스트
  11~13px bold였다). 반경은 칩 공통값 999px.
- **milestone-near/mid/far:** clutch와 동일하게 틴트 배경 + 진한 전경 쌍으로 전환.
- **rank-1/2/3/top (신규):** 순위 티어 배경/전경 쌍. 스탯 테이블 `rankTier()`, `PersonalDashboard` 개인
  순위 카드, `DynamicDuoPanel` 메달 배지가 함께 소비한다. 순위는 숫자·색상만으로 표현하며
  이모지(🥇🥈🥉)는 쓰지 않는다.

## Do's and Don'ts

**Do**

- 아이콘은 SVG(lucide-react)로. 24×24 viewBox 고정.
- 클릭 가능한 모든 요소에 `cursor-pointer` 와 포커스 링.
- 색 외에 형태·텍스트로도 정보를 중복 전달한다(승/패는 색 + 글자).
- `prefers-reduced-motion` 을 모든 애니메이션에서 존중한다.
- **의미색(승/패/무·클러치·마일스톤·순위)은 채움+흰글씨가 아니라 틴트 배경(`-bg`) + 진한 전경(`-fg`)
  텍스트로 표현한다.** LIVE 배지만 예외(실시간 알림 성격이라 채움+흰글씨 유지).
- **카드가 호버로 떠오르면 카드 전체가 링크여야 한다. 카드 전체가 링크가 아니면 떠오르지 않는다.**
  리프트는 "누를 수 있다"는 신호이지 장식이 아니다.

**Don't**

- **테마 반전 변수 위에 검정/흰색을 하드코딩하지 않는다.** `--mm-yellow-soft` 는 라이트=크림, 다크=near-black 으로 뒤집히므로, 그 위의 전경은 반드시 `ink` 계열 토큰으로 지정한다. 하드코딩하면 다크에서 텍스트가 사라진다.
- 이모지를 UI 아이콘으로 쓰지 않는다.
- 홈 화면에 요약 스트립·KPI 카드를 추가하지 않는다.
- 노랑을 흰 배경 위 텍스트로 쓰지 않는다.
- 마이크로 인터랙션에 `width`/`height` 를 애니메이트하지 않는다. `transform`/`opacity` 만.

옐로우는 두 층으로 쓴다. **실색상(`--mm-yellow`)은 화면당 한 곳**이라는 기존 원칙을 유지하되,
`--mm-yellow-soft` 3px 상단 라인(SectionCard `emphasized`)은 **신호 카드**(공지·개인화 대시보드·게이트)에
반복 사용하는 별개 패턴이다. 둘을 같은 예산으로 세지 않는다.
