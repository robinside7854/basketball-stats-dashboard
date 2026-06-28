// 색상 대비 헬퍼 — 팀 컬러(헥스) 기준으로 어두운 텍스트/밝은 텍스트 선택
//
// 사용 예: 드래프트 본인 차례 배경 틴팅 시, 팀 색상 위에 얹는 텍스트의 가독성 보장.

/** "#rrggbb" 또는 "rrggbb" → { r, g, b }. 실패 시 null. */
export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  if (!hex) return null
  let s = hex.trim().replace(/^#/, '')
  if (s.length === 3) s = s.split('').map(ch => ch + ch).join('')
  if (s.length !== 6) return null
  const n = parseInt(s, 16)
  if (Number.isNaN(n)) return null
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

/** 표준 luminance (0~1). 0.299R + 0.587G + 0.114B (Rec. 601). */
export function relativeLuminance(hex: string): number {
  const c = parseHex(hex)
  if (!c) return 0
  return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255
}

/** 헥스 위에 얹을 텍스트의 권장 색상 모드. light = 밝은 텍스트, dark = 어두운 텍스트. */
export function getReadableTextColor(hex: string): 'light' | 'dark' {
  return relativeLuminance(hex) > 0.5 ? 'dark' : 'light'
}
