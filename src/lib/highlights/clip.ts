// 하이라이트 클립 duration 계산 유틸
// video_timestamp 기준 앞뒤 여유 시간 (문맥 · 환호) — 슛 유형별 다르게

const HIGHLIGHT_SHOT_TYPES = new Set([
  'shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive',
  'and_one', 'ft_2pt', 'ft_3pt_1', 'ft_3pt_2', 'free_throw',
])

// { before, after } — timestamp 기준 앞뒤 초 여유
// before = 7초: 기록 지연 대비 (기록자가 득점 후 몇 초 뒤에 입력하는 경우 실 상황 놓치지 않게)
const CLIP_BOUNDS: Record<string, { before: number; after: number }> = {
  shot_3p:       { before: 7, after: 5 },
  shot_2p_mid:   { before: 7, after: 4 },
  shot_layup:    { before: 7, after: 4 },
  shot_post:     { before: 7, after: 4 },
  shot_2p_drive: { before: 7, after: 4 },
  and_one:       { before: 7, after: 5 },
  free_throw:    { before: 7, after: 3 },
  ft_2pt:        { before: 7, after: 3 },
  ft_3pt_1:      { before: 7, after: 3 },
  ft_3pt_2:      { before: 7, after: 3 },
}

export function isHighlightShot(type: string): boolean {
  return HIGHLIGHT_SHOT_TYPES.has(type)
}

export function getClipBounds(type: string, timestamp: number): { start: number; end: number } {
  const bounds = CLIP_BOUNDS[type] ?? { before: 7, after: 4 }
  return {
    start: Math.max(0, timestamp - bounds.before),
    end: timestamp + bounds.after,
  }
}

// 3점 / 2점 / 자유투 / 앤드원 카테고리 매핑 (필터바에서 사용)
// 앤드원(and_one)은 파울과 함께 성공한 야투 상황(플러스 자유투) — 자유투와 구분되는 하이라이트
export type ShotCategory = 'threes' | 'twos' | 'freethrows' | 'andones'

export function categoryOfType(type: string): ShotCategory | null {
  if (type === 'shot_3p') return 'threes'
  if (type === 'shot_2p_mid' || type === 'shot_layup' || type === 'shot_post' || type === 'shot_2p_drive') return 'twos'
  if (type === 'and_one') return 'andones'
  if (type === 'ft_2pt' || type === 'ft_3pt_1' || type === 'ft_3pt_2' || type === 'free_throw') return 'freethrows'
  return null
}

// 어시스트 표시가 유의미한 슛 유형만 true (자유투/앤드원은 제외 — 파울 상황이라 어시스트 개념 없음)
export function shouldShowAssist(type: string): boolean {
  const cat = categoryOfType(type)
  return cat === 'threes' || cat === 'twos'
}

export const SHOT_TYPE_LABEL: Record<string, string> = {
  shot_3p:       '3점슛',
  shot_2p_mid:   '미들슛',
  shot_layup:    '레이업',
  shot_post:     '골밑슛',
  shot_2p_drive: '드라이브',
  and_one:       '앤드원',
  ft_2pt:        '2P파울 FT',
  ft_3pt_1:      '3P파울 FT',
  ft_3pt_2:      '3P파울 FT',
  free_throw:    '자유투',
}
