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

// accentOnSurface(비텍스트 3:1) 는 만들었다가 지웠다(2026-08-13).
// 3:1 로 낮춰도 흰색·노랑 팀 컬러는 흰 패널 위에서 여전히 통과하지 못했다 — 임계값 문제가
// 아니라 "밝은 색을 밝은 배경 위 얇은 선으로 쓰는 것" 자체가 안 되는 방법이었다.
// 팀 정체성은 **원색 채움 + 안쪽 1px 링**(--mm-rule)으로 낸다. 채움은 대비를 요구하지 않고
// 링이 경계를 만들어, 팀이 어떤 색을 골라도 형태가 남는다. NbaTeamStandings·팀 탭이 그 방식이다.
