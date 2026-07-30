---
version: alpha
name: 미라클모닝 (Miracle Morning) — Light
description: 농구팀 스탯 대시보드 E안 브랜드. 노랑 / 검정 / 화이트. globals.css 의 :root (라이트 모드) 토큰과 1:1 대응.
colors:
  # ── 표면 (surface) ──
  ground: "#FFFEF7"
  panel: "#FFFFFF"
  panel-alt: "#FAF9F5"
  rule: "#E5E7EB"
  # ── 전경 (foreground) ──
  ink: "#0A0A0A"
  ink-soft: "#27272A"
  muted: "#52525B"
  white: "#FFFFFF"
  # ── 키 컬러 (agent 자동생성 방지) ──
  primary: "#0A0A0A"
  secondary: "#EAB308"
  tertiary: "#EA580C"
  # ── 브랜드 옐로우 ──
  yellow: "#EAB308"
  yellow-strong: "#A16207"
  yellow-soft: "#FEF3C7"
  black: "#0A0A0A"
  # ── 경기 결과 ──
  live: "#DC2626"
  live-bg: "#DC2626"
  positive: "#047857"
  negative: "#DC2626"
  neutral-strong: "#475569"
  # ── 농구 정체성 ──
  hoop-orange: "#EA580C"
  hoop-orange-deep: "#C2410C"
  # ── 마일스톤 근접도 3티어 ──
  milestone-near: "#047857"
  milestone-mid: "#B45309"
  milestone-far: "#64748B"
  # ── 클러치샷 5단계 위기 강도 ──
  clutch-1-dagger: "#64748B"
  clutch-2-chase: "#0E7490"
  clutch-3-tie: "#0369A1"
  clutch-4-reversal: "#047857"
  clutch-5-winning: "#C2410C"
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
    fontWeight: 900
    lineHeight: 1.3
    letterSpacing: -0.01em
  h2:
    fontFamily: Pretendard Variable
    fontSize: 1.2rem
    fontWeight: 900
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
  sm: 6px
  md: 8px
  lg: 10px
  xl: 14px
  2xl: 18px
  full: 9999px
components:
  page-body:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
  card-meta:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.muted}"
    typography: "{typography.label-caps}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.md}"
    height: "{spacing.touch-target}"
  button-accent:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.black}"
    rounded: "{rounded.md}"
    height: "{spacing.touch-target}"
  result-chip-win:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.positive}"
    rounded: "{rounded.sm}"
  result-chip-loss:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.negative}"
    rounded: "{rounded.sm}"
  result-chip-draw:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.neutral-strong}"
    rounded: "{rounded.sm}"
  live-badge:
    backgroundColor: "{colors.live-bg}"
    textColor: "{colors.white}"
    rounded: "{rounded.full}"
  live-text:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.live}"
  clutch-1-dagger:
    backgroundColor: "{colors.clutch-1-dagger}"
    textColor: "{colors.white}"
  clutch-2-chase:
    backgroundColor: "{colors.clutch-2-chase}"
    textColor: "{colors.white}"
  clutch-3-tie:
    backgroundColor: "{colors.clutch-3-tie}"
    textColor: "{colors.white}"
  clutch-4-reversal:
    backgroundColor: "{colors.clutch-4-reversal}"
    textColor: "{colors.white}"
  clutch-5-winning:
    backgroundColor: "{colors.clutch-5-winning}"
    textColor: "{colors.white}"
  milestone-near-badge:
    backgroundColor: "{colors.milestone-near}"
    textColor: "{colors.white}"
  milestone-mid-badge:
    backgroundColor: "{colors.milestone-mid}"
    textColor: "{colors.white}"
  milestone-far-badge:
    backgroundColor: "{colors.milestone-far}"
    textColor: "{colors.white}"
  announcement-link:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.yellow-strong}"
  jersey-num:
    backgroundColor: "{colors.yellow-soft}"
    textColor: "{colors.hoop-orange-deep}"
    typography: "{typography.jersey-num}"
    rounded: "{rounded.sm}"
  announcement-mark:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.black}"
  divider:
    backgroundColor: "{colors.rule}"
  announcement-quote:
    backgroundColor: "{colors.panel-alt}"
    textColor: "{colors.ink-soft}"
---

# DESIGN.md — 미라클모닝 농구 대시보드 (Light)

## Overview

**Architectural Sports Editorial.** NBA.com 의 정보 밀도와 스포츠 매거진의 대비감을 합친 톤이다.
매일 열어보는 업무형 대시보드이므로 화려함보다 **판독 속도**가 최우선이다.
장식 효과(글래스·WebGL·브루탈리즘)는 이 제품에 적용하지 않는다.

브랜드는 **노랑 / 검정 / 화이트** 3색으로 고정된다. 노랑은 강조 1개소에만 쓰고,
정보의 위계는 색이 아니라 **굵기와 크기**로 만든다.

이 문서는 라이트 모드다. 다크 모드는 `DESIGN.dark.md` 를 따르며, 두 파일은 **토큰 이름이 완전히 동일**해야 한다.

## Colors

표면은 순백이 아닌 **웜 아이보리(`#FFFEF7`)** 에서 시작한다. 순백은 실내 체육관 조명 아래 사진과 붙었을 때
차갑게 튄다. 패널만 순백으로 올려 카드가 배경 위로 떠 보이게 한다.

- **ground (#FFFEF7):** 페이지 바탕. 따뜻한 아이보리.
- **panel (#FFFFFF):** 카드·모달. 바탕보다 한 단계 밝아 계층이 생긴다.
- **ink (#0A0A0A):** 헤드라인·본문. 순수 검정보다 살짝 눌러 눈부심을 줄였다.
- **muted (#52525B):** 라벨·메타. zinc-600 — 흰 배경에서 4.5:1 을 넘기는 최소선이다.
- **yellow (#EAB308):** 브랜드 옐로우. **배경으로만** 쓴다.
- **yellow-strong (#A16207):** 옐로우를 텍스트로 써야 할 때의 대체색. 링크·리스트 마커.

> 노랑을 흰 배경 위 **텍스트로 쓰면 대비 1.9:1** 로 즉시 실패한다. 텍스트가 필요하면 반드시 `yellow-strong` 을 쓴다.

승/패/무는 emerald-600 / red-600 / slate-600 을 쓴다. 클러치샷 5단계는 위기 강도가
낮음→높음(dagger → chase → tie → reversal → winning) 순으로 올라가며, 최고 단계는
옐로우 대신 **hoop-orange-deep** 을 써서 브랜드 옐로우의 자리를 침범하지 않는다.

## Typography

한글이 1급 시민이다. **Pretendard Variable** 이 sans 스택 최상단에 온다.
농구 정체성은 라틴/숫자 전용 폰트 2종으로만 표현한다.

- **Bebas Neue (display-xl):** 스코어보드, MVP 큰 숫자. 한글에는 쓰지 않는다.
- **Barlow Condensed (jersey-num, label-caps):** 등번호·헤더 라벨.
- **Pretendard (h1~body):** 나머지 전부.

본문 `line-height` 는 1.6, `letter-spacing` 은 **0** 이다. 한글은 자간을 벌리면 오히려 읽기 어려워진다.
자간을 넓히는 건 라틴 대문자 라벨(`label-caps`, 0.14em)뿐이다.

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

기본 반경 10px(`rounded.lg`). 칩·뱃지는 6px, 카드는 14px, 모달은 18px.
`full`(9999px)은 LIVE 뱃지처럼 상태를 알리는 알약형에만 쓴다.

## Components

- **card:** panel 배경 + rule 테두리 + 14px 반경. 호버 시 `translateY(-2px)` 만, 크기 변화 금지(레이아웃 이동 유발).
- **button-primary:** ink 배경 + ground 텍스트. 최소 높이 44px.
- **result-chip:** 배경은 항상 panel, 색은 텍스트로만 표현한다. 칩 배경을 채우면 테이블이 시끄러워진다.
- **live-badge:** live 배경 + 흰 텍스트 + pulse-red 애니메이션. **경기 진행 중(`is_started && !is_complete`)에만** 사용하며 다른 요소에 전용 금지.
- **clutch-1~5:** 배경 채움 + 흰 텍스트 11~13px bold. 700 톤을 쓰는 이유는 흰 글씨로 4.5:1 을 확보하기 위해서다.
- **jersey-num:** hoop-orange 10% 배경 + 35% 테두리. 라이트에서는 텍스트를 `hoop-orange-deep` 으로 내린다.

## Do's and Don'ts

**Do**

- 아이콘은 SVG(lucide-react)로. 24×24 viewBox 고정.
- 클릭 가능한 모든 요소에 `cursor-pointer` 와 포커스 링.
- 색 외에 형태·텍스트로도 정보를 중복 전달한다(승/패는 색 + 글자).
- `prefers-reduced-motion` 을 모든 애니메이션에서 존중한다.

**Don't**

- **테마 반전 변수 위에 검정/흰색을 하드코딩하지 않는다.** `--mm-yellow-soft` 는 라이트=크림, 다크=near-black 으로 뒤집히므로, 그 위의 전경은 반드시 `ink` 계열 토큰으로 지정한다. 하드코딩하면 다크에서 텍스트가 사라진다.
- 이모지를 UI 아이콘으로 쓰지 않는다.
- 홈 화면에 요약 스트립·KPI 카드를 추가하지 않는다.
- 노랑을 흰 배경 위 텍스트로 쓰지 않는다.
- 마이크로 인터랙션에 `width`/`height` 를 애니메이트하지 않는다. `transform`/`opacity` 만.
