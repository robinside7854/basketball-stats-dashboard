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

/**
 * 팀 컬러를 "그 색 자체"로 텍스트에 쓰는 자리(팀명 라벨 등, 배경도 같은 색의 옅은 틴트)용 폴백.
 * 팀 컬러가 흰색에 가까우면(예: #ffffff) 텍스트=배경이 거의 같은 색이 되어 라이트 모드에서
 * white-on-white 로 사라진다 — textOnBg 처럼 "반대색"을 고를 수 없는 자리(배경 자체가 그 색의
 * 옅은 틴트라 실질 배경은 페이지 배경에 가깝기 때문)이므로, 대신 테마를 따라가는
 * --mm-ink 로 폴백해 라이트/다크 모두에서 페이지 배경과 대비를 확보한다.
 * (2026-08-08 · 라이트모드 흰 팀컬러 이름 미표시 핫픽스)
 */
export function accentOrInk(hex: string | null | undefined, threshold = 0.85): string {
  if (!hex) return 'var(--mm-ink)'
  return relativeLuminance(hex) > threshold ? 'var(--mm-ink)' : hex
}
