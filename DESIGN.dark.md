---
version: alpha
name: 미라클모닝 (Miracle Morning) — Dark
description: 농구팀 스탯 대시보드 E안 브랜드. 노랑 / 검정 / 화이트. globals.css 의 .dark 토큰과 1:1 대응. 라이트와 토큰 이름이 동일해야 하며 값만 반전된다.
colors:
  # ── 표면 (surface) ──
  ground: "#0A0A0A"
  panel: "#171717"
  panel-alt: "#0F0F0F"
  rule: "#262626"
  # ── 전경 (foreground) ──
  ink: "#FAFAFA"
  ink-soft: "#E4E4E7"
  muted: "#C4C4CB"
  white: "#FFFFFF"
  # ── 키 컬러 (agent 자동생성 방지) ──
  primary: "#FAFAFA"
  secondary: "#FDE047"
  tertiary: "#F97316"
  # ── 브랜드 옐로우 ──
  yellow: "#FDE047"
  yellow-strong: "#FACC15"
  yellow-soft: "#1A1608"
  black: "#000000"
  # ── 경기 결과 ──
  live: "#EF4444"
  live-bg: "#DC2626"
  positive: "#34D399"
  negative: "#F87171"
  neutral-strong: "#CBD5E1"
  # ── 농구 정체성 ──
  hoop-orange: "#FB923C"
  hoop-orange-deep: "#F97316"
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
    textColor: "{colors.hoop-orange}"
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

# DESIGN.md — 미라클모닝 농구 대시보드 (Dark)

## Overview

라이트 모드(`DESIGN.md`)의 **반전 대응본**이다. 미감을 새로 정의하지 않는다.
토큰 **이름은 라이트와 완전히 동일**하고 값만 뒤집힌다. 이름이 어긋나면 `designmd diff` 가
added/removed 로 잡아내며, 그건 곧 한쪽 테마에 정의가 빠졌다는 뜻이다.

## Colors

표면이 near-black(`#0A0A0A`)에서 시작하고 패널이 그보다 **밝아진다**(`#171717`).
라이트와 정확히 반대 방향의 계층이다.

- **yellow (#FDE047):** yellow-300. 라이트의 yellow-500 을 그대로 쓰면 어두운 배경에서 탁해진다.
- **yellow-soft:** 라이트에서는 크림(#FEF3C7)이지만 다크에서는 **거의 검정**으로 뒤집힌다. 이 위에 검정을 하드코딩하면 글자가 사라진다.
- **positive / negative / neutral-strong:** 400·300 톤으로 상향. 라이트의 600 톤은 근-흑 패널 위에서 1.9~3.4:1 로 무너진다.

다음 토큰들은 **라이트와 값이 같다** — 배경을 채우고 흰 텍스트를 올리는 방식이라 테마와 무관하기 때문이다.

- `clutch-1` ~ `clutch-5`
- `milestone-near` / `milestone-mid` / `milestone-far`

## Typography

라이트와 동일하다. 다크에서 폰트 두께를 낮추지 않는다 —
어두운 배경 위 밝은 글자는 번져 보이지만, 이 화면은 숫자 판독이 목적이라 굵기를 유지한다.

## Layout

라이트와 동일.

## Elevation & Depth

**그림자를 쓰지 않는다.** 근-흑 배경 위에서는 보이지 않는다.
계층은 `panel`(#171717) → `panel-alt`(#0F0F0F) 의 밝기 차와 `rule`(#262626) 테두리로만 만든다.

## Shapes

라이트와 동일.

## Components

- **result-chip:** 배경 rgba 틴트 12%, 텍스트는 400 톤 토큰. 고정 hex 를 쓰면 대비가 무너진다.
- **1위 강조 행:** `yellow-soft` 배경 위에 **일반 행과 동일한 테마 토큰**을 쓴다. 과거 여기에 검정 계열을 하드코딩해 다크에서 칩·숫자가 소실된 적이 있다.
- **clutch / milestone 뱃지:** 라이트와 동일한 채움색 + 흰 텍스트.

## Do's and Don'ts

**Do**

- 라이트에 토큰을 추가하면 **같은 이름으로 다크에도 추가**한다.
- 전경색은 항상 `ink` / `ink-soft` / `muted` 토큰으로 지정한다.

**Don't**

- **테마 반전 변수 위에 `#000` / `#fff` 를 하드코딩하지 않는다.** 이 프로젝트에서 실제로 두 번 사고가 났다.
- 다크에서 그림자로 계층을 만들려 하지 않는다.
- 라이트의 600 톤 결과색(emerald-600 등)을 다크에 그대로 쓰지 않는다.
