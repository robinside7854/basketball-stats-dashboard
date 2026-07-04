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
