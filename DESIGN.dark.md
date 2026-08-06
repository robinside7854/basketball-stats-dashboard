---
version: alpha
name: 미라클모닝 (Miracle Morning) — Dark
description: 농구팀 스탯 대시보드 캐주얼 브랜드(2026-08-06 전환). 노랑 / 검정 / 화이트. globals.css 의 .dark 토큰과 1:1 대응. 라이트와 토큰 이름이 동일해야 하며 값만 반전된다.
colors:
  # ── 표면 (surface) ──
  ground: "#191714"
  panel: "#221F1B"
  panel-alt: "#1F1D19"
  rule: "#332F29"
  # ── 전경 (foreground) ──
  ink: "#F2EEE6"
  ink-soft: "#D6D0C4"
  muted: "#A9A294"
  white: "#FFFFFF"
  # ── 키 컬러 (agent 자동생성 방지) ──
  primary: "#F2EEE6"
  secondary: "#F5C95C"
  tertiary: "#F97316"
  # ── 브랜드 옐로우 ──
  yellow: "#F5C95C"
  yellow-strong: "#F0CE78"
  yellow-soft: "rgba(245, 201, 92, 0.13)"
  black: "#100E0C"
  # ── 경기 결과 (텍스트 전용) ──
  live: "#F08A7E"
  live-bg: "#C4362B"
  positive: "#82D89D"
  negative: "#F5998C"
  neutral-strong: "#C9C3B6"
  # ── 의미색 배경/전경 쌍 (칩류가 소비, 2026-08-06 신규) ──
  positive-bg: "rgba(96, 196, 128, 0.15)"
  positive-fg: "#82D89D"
  negative-bg: "rgba(240, 120, 105, 0.15)"
  negative-fg: "#F5998C"
  neutral-bg: "rgba(255, 255, 255, 0.07)"
  neutral-fg: "#BBB5A8"
  # ── 농구 정체성 (캐주얼 전환 범위 밖 · 무변경) ──
  hoop-orange: "#FB923C"
  hoop-orange-deep: "#F97316"
  # ── 클러치샷 5단계 위기 강도 — 배경/전경 쌍 (2026-08-06 신규) ──
  clutch-1-dagger-bg: "rgba(148, 163, 184, 0.16)"
  clutch-1-dagger-fg: "#B4BDC7"
  clutch-2-chase-bg: "rgba(56, 178, 196, 0.16)"
  clutch-2-chase-fg: "#7ACFDD"
  clutch-3-tie-bg: "rgba(96, 165, 220, 0.16)"
  clutch-3-tie-fg: "#8FC2E8"
  clutch-4-reversal-bg: "rgba(96, 196, 128, 0.16)"
  clutch-4-reversal-fg: "#82D89D"
  clutch-5-winning-bg: "rgba(230, 140, 80, 0.16)"
  clutch-5-winning-fg: "#EFA579"
  # ── 마일스톤 근접도 3티어 — 배경/전경 쌍 (2026-08-06 신규) ──
  milestone-near-bg: "rgba(96, 196, 128, 0.16)"
  milestone-near-fg: "#82D89D"
  milestone-mid-bg: "rgba(245, 201, 92, 0.15)"
  milestone-mid-fg: "#F0CE78"
  milestone-far-bg: "rgba(255, 255, 255, 0.07)"
  milestone-far-fg: "#BBB5A8"
  # ── 순위 티어 — 배경/전경 쌍 (2026-08-06 신규, 이전에 없던 토큰) ──
  rank-1-bg: "rgba(245, 201, 92, 0.15)"
  rank-1-fg: "#F0CE78"
  rank-2-bg: "rgba(255, 255, 255, 0.08)"
  rank-2-fg: "#C6C9CE"
  rank-3-bg: "rgba(220, 130, 70, 0.15)"
  rank-3-fg: "#E2A277"
  rank-top-bg: "rgba(96, 196, 128, 0.16)"
  rank-top-fg: "#82D89D"
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
  ctl: 10px       # var(--mm-radius-ctl) — 버튼 · 인풋 · 작은 컨트롤 (라이트/다크 공통값)
  card: 14px      # var(--mm-radius-card) — 카드 · 섹션
  modal: 18px     # var(--mm-radius-modal) — 모달 · 시트
  chip: 999px     # var(--mm-radius-chip) — 알약형 칩 · 뱃지 · LIVE
  jersey-num: 6px # .jersey-num 유틸 고정값 — CSS 변수가 아니라 클래스 안 하드코딩
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
  announcement-link:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.yellow-strong}"
  jersey-num:
    backgroundColor: "{colors.yellow-soft}"
    textColor: "{colors.hoop-orange}"
    typography: "{typography.jersey-num}"
    rounded: "{rounded.jersey-num}"
  announcement-mark:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.black}"
  divider:
    backgroundColor: "{colors.rule}"
  announcement-quote:
    backgroundColor: "{colors.panel-alt}"
    textColor: "{colors.ink-soft}"
---

# DESIGN.md — 미라클모닝 농구 대시보드 (Dark)

## Overview

라이트 모드(`DESIGN.md`)의 **반전 대응본**이다. 미감을 새로 정의하지 않는다.
토큰 **이름은 라이트와 완전히 동일**하고 값만 뒤집힌다. 이름이 어긋나면 한쪽 테마에 정의가
빠졌다는 뜻이므로, 라이트에 토큰을 추가하면 반드시 같은 이름으로 여기도 추가한다.

2026-08-06 캐주얼 전환에서 라이트가 900 굵기·대문자·순백 표면에서 700 굵기·대소문자 유지·웜톤
표면으로 바뀌었고, 다크도 동일한 톤 변화를 따른다.

## Colors

표면이 near-black(`#191714`)에서 시작하고 패널이 그보다 **밝아진다**(`#221F1B`).
라이트와 정확히 반대 방향의 계층이다.

- **yellow (#F5C95C):** 라이트의 옐로우(`#F2B53C`)를 그대로 쓰면 어두운 배경에서 탁해지므로 더 밝은 톤을 쓴다.
- **yellow-soft (rgba(245,201,92,0.13)):** 라이트에서는 크림(`#FDF3DC`)이지만 다크에서는 **거의 검정에 가까운 반투명 노랑**으로 뒤집힌다. 이 위에 검정을 하드코딩하면 글자가 사라진다.
- **positive / negative / neutral-strong:** 밝은 톤(`#82D89D` / `#F5998C` / `#C9C3B6`)으로 상향. 라이트의 진한 톤을 그대로 쓰면 근-흑 패널 위에서 대비가 무너진다.

다음 토큰들은 **2026-08-06 전환 이후로는 라이트와 값이 다르다** — `clutch-1~5`, `milestone-near/mid/far`,
`rank-1/2/3/top` 은 전부 `-bg`/`-fg` 쌍이고 테마마다 반전되는 값이다(예: `clutch-1-bg` 라이트 `#EDEFF1` ↔
다크 `rgba(148,163,184,0.16)`). 전환 전에는 이 토큰들이 `@theme` 안의 단색 + 흰 텍스트 고정이라 테마와
무관하게 라이트·다크가 같은 값을 썼지만, 지금은 `:root`/`.dark` 에 각각 정의된 별개 값이다.

## Typography

라이트와 동일하다. 다크에서 폰트 두께를 낮추지 않는다 —
어두운 배경 위 밝은 글자는 번져 보이지만, 이 화면은 숫자 판독이 목적이라 굵기를 유지한다.

헤딩은 라이트와 마찬가지로 700(`font-bold`), 대문자 강제 없음(2026-08-06 전환).

## Layout

라이트와 동일.

## Elevation & Depth

**그림자를 쓰지 않는다.** 근-흑 배경 위에서는 보이지 않는다.
계층은 `panel`(#221F1B) → `panel-alt`(#1F1D19) 의 밝기 차와 `rule`(#332F29) 테두리로만 만든다.

## Shapes

라이트와 동일 — `--mm-radius-ctl`(10px) / `--mm-radius-card`(14px) / `--mm-radius-modal`(18px) /
`--mm-radius-chip`(999px)은 `:root`에만 정의되며 라이트/다크 공통값이다. `.jersey-num`의 6px 고정값도 동일.

## Components

- **card:** panel 배경 + rule 테두리 + 14px 반경. 그림자 대신 테두리로 계층을 만드는 원칙은 라이트와 다르다(위 Elevation 참고).
- **result-chip:** 배경은 의미색 `-bg` 토큰(다크에서는 대부분 15~16% 알파의 rgba 틴트), 텍스트는 대응하는 `-fg` 토큰(밝은 톤). 고정 hex 를 쓰면 대비가 무너진다.
- **1위 강조 행:** `yellow-soft` 배경 위에 **일반 행과 동일한 테마 토큰**을 쓴다. 과거 여기에 검정 계열을 하드코딩해 다크에서 칩·숫자가 소실된 적이 있다.
- **clutch / milestone / rank 뱃지:** 라이트와 **다른 값**의 배경/전경 쌍(테마별로 반전됨). 흰 텍스트 강제 없음 — 2026-08-06 전환 전에는 라이트와 동일한 채움색 + 흰 텍스트였다.

## Do's and Don'ts

**Do**

- 라이트에 토큰을 추가하면 **같은 이름으로 다크에도 추가**한다.
- 전경색은 항상 `ink` / `ink-soft` / `muted` 토큰으로 지정한다.
- 의미색은 라이트와 마찬가지로 틴트 배경(`-bg`) + 진한 전경(`-fg`)으로 표현한다. LIVE 배지만 예외.

**Don't**

- **테마 반전 변수 위에 `#000` / `#fff` 를 하드코딩하지 않는다.** 이 프로젝트에서 실제로 두 번 사고가 났다.
- 다크에서 그림자로 계층을 만들려 하지 않는다.
- 라이트의 진한 톤 결과색을 다크에 그대로 쓰지 않는다 — 근-흑 배경 위에서 대비가 무너진다.
