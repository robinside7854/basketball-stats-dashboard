// 배경 컬러 대비 자동 텍스트 컬러 결정 유틸
//
// 배경이 밝으면 검정 텍스트, 어두우면 흰색 텍스트 반환.
// 팀 컬러가 흰색·노란색 등 밝은 색인 경우 white-on-white 방지.

/** hex 컬러 (#rrggbb 또는 #rgb) → 상대 휘도 (WCAG luminance) 0~1 */
export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '').trim()
  if (!h) return 0
  let r: number, g: number, b: number
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16)
    g = parseInt(h[1] + h[1], 16)
    b = parseInt(h[2] + h[2], 16)
  } else if (h.length >= 6) {
    r = parseInt(h.slice(0, 2), 16)
    g = parseInt(h.slice(2, 4), 16)
    b = parseInt(h.slice(4, 6), 16)
  } else {
    return 0
  }
  const toLinear = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/** 배경 hex 로부터 최적 텍스트 컬러 (흰/검) 반환 */
export function textOnBg(bgHex: string | null | undefined): '#ffffff' | '#0a0a0a' {
  if (!bgHex) return '#ffffff'
  // 밝기 임계값 0.5 — 그 이상이면 어두운 텍스트
  return relativeLuminance(bgHex) > 0.5 ? '#0a0a0a' : '#ffffff'
}

/** 두 색의 WCAG 대비비 (1~21). 큰 값이 잘 읽힌다. */
export function contrastRatio(aHex: string, bHex: string): number {
  const la = relativeLuminance(aHex)
  const lb = relativeLuminance(bHex)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

// 이 앱의 패널 배경 실측값(globals.css `--mm-panel`). 인라인 style 로 나가는 색은 테마별로
// 갈라 쓸 수 없으므로 **두 테마 모두**에서 읽혀야 한다 — 한쪽만 보면 반대 테마에서 사라진다.
const PANEL_LIGHT = '#FFFFFF'
const PANEL_DARK = '#221F1B'
/** WCAG AA 본문 기준 */
const AA = 4.5

/**
 * 팀 컬러를 "그 색 자체"로 텍스트에 쓰는 자리(팀명 라벨 등)용 폴백.
 *
 * 팀 컬러는 동호회가 자유롭게 고른다. 그 색이 배경과 구분되지 않으면 이름이 사라진다.
 * 테마를 따라가는 --mm-ink 로 폴백해 라이트/다크 모두에서 대비를 확보한다.
 *
 * ⚠ 판정을 '휘도 임계값'에서 '실제 대비비'로 바꿨다 (2026-08-13).
 *   옛 방식(휘도 > 0.85)은 **순백만** 걸렀다. 실제 팀 컬러로 재보니:
 *     · 굿모닝 #ffea00 → 휘도 0.801 로 통과 → 흰 패널 위 **1.23:1**. 사실상 안 보였다.
 *     · 챗지피지기 #ff0000 → 4.00:1 로 AA(4.5) 미달.
 *     · 빅현욱 #ffffff → 1.000 이라 이것만 걸렸다.
 *   "밝으면 안 보인다"가 아니라 "배경과 대비가 없으면 안 보인다"가 맞는 기준이다.
 *   노랑처럼 밝은데 흰색은 아닌 색이 정확히 그 사이로 빠져나갔다.
 *
 * 색을 잃는 대신 읽히는 쪽을 택한다. 팀 정체성은 텍스트가 아니라 **테두리·바·틴트 배경**
 * 같은 비텍스트 요소로 전달한다(그쪽은 대비 기준이 3:1 이고 형태가 함께 구분해 준다).
 */
export function accentOrInk(hex: string | null | undefined): string {
  if (!hex) return 'var(--mm-ink)'
  const h = hex.trim()
  if (!h.startsWith('#')) return 'var(--mm-ink)'
  // 두 테마 모두 통과해야 그 색을 쓴다. 한쪽이라도 미달이면 ink.
  const ok = contrastRatio(h, PANEL_LIGHT) >= AA && contrastRatio(h, PANEL_DARK) >= AA
  return ok ? h : 'var(--mm-ink)'
}

/** 팀 컬러를 배경으로 쓰는 자리의 잉크 — 팀 컬러 위에 얹는 글자/테두리 한 벌. */
export interface TeamInk {
  /** 정규화된 배경(팀 컬러). 파싱 실패 시 중립 회색. */
  bg: string
  /** 그 배경 위에서 대비가 더 큰 쪽의 글자색. */
  fg: string
  /** 표면과 공이 붙어 보이지 않게 하는 가장자리. 밝은 색엔 어두운 선, 어두운 색엔 밝은 선. */
  border: string
}

const INK_DARK = '#0a0a0a'
const INK_LIGHT = '#ffffff'
const NEUTRAL_BG = '#6b7280'

/**
 * 팀 컬러 **배경** 위에 얹을 글자·테두리.
 *
 * ⚠ 휘도 임계값(0.5)으로 흑/백을 고르면 틀린다. 실측:
 *   · 챗지피지기 #ff0000 → Rec.601 휘도 0.299 라 "어두운 배경"으로 판정돼 **흰 글자**가 붙는데,
 *     실제 WCAG 대비는 흰 글자 4.00:1(AA 미달) · 검은 글자 4.97:1(통과). 판정이 정확히 거꾸로였다.
 * 그래서 임계값이 아니라 **두 잉크의 실제 대비비를 재서 큰 쪽**을 쓴다.
 *
 * border 는 대비 규칙이 아니라 형태 규칙이다 — 흰 팀 컬러 칩이 어두운 표면 위에서
 * 떠 보이도록(또는 검은 팀 컬러가 어두운 표면에 먹히지 않도록) 반대쪽 헤어라인을 준다.
 */
export function teamInk(hex: string | null | undefined): TeamInk {
  const h = typeof hex === 'string' ? hex.trim() : ''
  const bg = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h) ? h : NEUTRAL_BG
  const fg = contrastRatio(bg, INK_DARK) >= contrastRatio(bg, INK_LIGHT) ? INK_DARK : INK_LIGHT
  const border = relativeLuminance(bg) > 0.5 ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)'
  return { bg, fg, border }
}

/** 드래프트 연출 화면의 실제 표면색(거의 검정). accentOrInk 의 패널과 다르다. */
export const DRAFT_SURFACE = '#0a0a0f'

/**
 * 팀 컬러를 **글자색**으로 어두운 표면 위에 쓸 때의 보정.
 *
 * accentOrInk 는 못 읽히면 테마 잉크(var(--mm-ink))로 **색을 버린다**. 드래프트 연출 화면은
 * 팀 컬러가 연출의 핵심이라 색을 버리면 화면이 죽는다 — 대신 **같은 색상(hue)을 유지한 채
 * 밝기만 올려** AA 를 맞춘다. 어두운 팀 컬러(예: 남색·자주)가 검은 배경에서 사라지는 것만 고친다.
 * 이미 충분히 밝으면 원색을 그대로 돌려준다.
 */
export function teamAccentOnDark(hex: string | null | undefined, surface: string = DRAFT_SURFACE): string {
  const h = typeof hex === 'string' ? hex.trim() : ''
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)) return '#e5e7eb'
  if (contrastRatio(h, surface) >= AA) return h
  const { hue, sat } = toHueSat(h)
  // 밝기만 2%씩 올린다. 채도 0(회색 계열)이어도 흰색 쪽으로 수렴하므로 항상 종료한다.
  for (let l = 0.5; l <= 1.0001; l += 0.02) {
    const cand = hslToHex(hue, sat, Math.min(1, l))
    if (contrastRatio(cand, surface) >= AA) return cand
  }
  return '#ffffff'
}

/** hex 색을 배경 위에 alpha 로 합성한 결과 hex — 브라우저가 실제로 그리는 색을 미리 계산한다. */
export function blendHex(fgHex: string, bgHex: string, alpha: number): string {
  const f = toRgb(fgHex), b = toRgb(bgHex)
  const m = (i: number) => Math.round(f[i] * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')
  return `#${m(0)}${m(1)}${m(2)}`
}

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ]
}

/**
 * 팀 컬러를 어두운 화면 전체에 틴트로 깔 때 **흰 글자가 AA 를 유지하는 최대 알파**.
 *
 * 어두운 팀 컬러는 설계값(max)을 그대로 쓰고, 흰색·노랑처럼 밝은 팀만 알파가 낮아진다.
 * "밝은 팀은 틴트를 아예 못 쓴다"가 아니라 "옅게 쓴다"로 끝내 연출을 살린다.
 */
export function maxTintAlphaForLightText(
  color: string | null | undefined,
  bg: string = '#0a0a0a',
  max = 0.7,
): number {
  const h = typeof color === 'string' ? color.trim() : ''
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)) return max
  for (let a = max; a > 0.02; a -= 0.02) {
    if (contrastRatio(blendHex(h, bg, a), INK_LIGHT) >= AA) return Math.round(a * 100) / 100
  }
  return 0.04
}

function toHueSat(hex: string): { hue: number; sat: number } {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { hue: 0, sat: 0 }
  const sat = d / (1 - Math.abs(2 * l - 1))
  let hue: number
  if (max === r) hue = ((g - b) / d) % 6
  else if (max === g) hue = (b - r) / d + 2
  else hue = (r - g) / d + 4
  return { hue: (hue * 60 + 360) % 360, sat: Math.min(1, sat) }
}

function hslToHex(hue: number, sat: number, light: number): string {
  const c = (1 - Math.abs(2 * light - 1)) * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = light - c / 2
  let r = 0, g = 0, b = 0
  if (hue < 60) [r, g, b] = [c, x, 0]
  else if (hue < 120) [r, g, b] = [x, c, 0]
  else if (hue < 180) [r, g, b] = [0, c, x]
  else if (hue < 240) [r, g, b] = [0, x, c]
  else if (hue < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

// accentOnSurface(비텍스트 3:1) 는 만들었다가 지웠다(2026-08-13).
// 3:1 로 낮춰도 흰색·노랑 팀 컬러는 흰 패널 위에서 여전히 통과하지 못했다 — 임계값 문제가
// 아니라 "밝은 색을 밝은 배경 위 얇은 선으로 쓰는 것" 자체가 안 되는 방법이었다.
// 팀 정체성은 **원색 채움 + 안쪽 1px 링**(--mm-rule)으로 낸다. 채움은 대비를 요구하지 않고
// 링이 경계를 만들어, 팀이 어떤 색을 골라도 형태가 남는다. NbaTeamStandings·팀 탭이 그 방식이다.
