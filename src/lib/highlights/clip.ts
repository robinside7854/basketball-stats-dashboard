// 하이라이트 클립 duration 계산 유틸
// video_timestamp 기준 앞뒤 여유 시간 (문맥 · 환호) — 슛 유형별 다르게

const HIGHLIGHT_SHOT_TYPES = new Set([
  'shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post',
  'and_one', 'ft_2pt', 'ft_3pt_1', 'ft_3pt_2', 'free_throw',
])

// { before, after } — timestamp 기준 앞뒤 초 여유 (2026-07-16 확장)
// before = 10초: 기록 지연 대비 + 공격 세팅 컨텍스트
// after  = 8초: 득점 후 환호 · 다음 플레이 시작 여유
// (자동재생 제거 후 clip_end 에서 pause 하지 않으므로 여유롭게 설정해도 부작용 없음)
const CLIP_BOUNDS: Record<string, { before: number; after: number }> = {
  shot_3p:       { before: 10, after: 8 },
  shot_2p_mid:   { before: 10, after: 8 },
  shot_layup:    { before: 10, after: 8 },
  shot_post:     { before: 10, after: 8 },
  and_one:       { before: 10, after: 8 },
  free_throw:    { before: 10, after: 6 },
  ft_2pt:        { before: 10, after: 6 },
  ft_3pt_1:      { before: 10, after: 6 },
  ft_3pt_2:      { before: 10, after: 6 },
}

export function isHighlightShot(type: string): boolean {
  return HIGHLIGHT_SHOT_TYPES.has(type)
}

export function getClipBounds(type: string, timestamp: number): { start: number; end: number } {
  const bounds = CLIP_BOUNDS[type] ?? { before: 10, after: 8 }
  return {
    start: Math.max(0, timestamp - bounds.before),
    end: timestamp + bounds.after,
  }
}

// 슛 유형 카테고리 매핑 (필터바에서 사용)
// 2점은 기록 단계에서 레이업/골밑/미들로 구분 입력하므로 필터도 동일하게 세분화
// 앤드원(and_one)은 파울과 함께 성공한 야투 상황(플러스 자유투) — 자유투와 구분되는 하이라이트
export type ShotCategory = 'threes' | 'layups' | 'posts' | 'mids' | 'freethrows' | 'andones'

// 필터바 칩 목록 (표시 순서 그대로)
export const SHOT_CATEGORY_OPTIONS: { key: ShotCategory; label: string }[] = [
  { key: 'threes',     label: '3점' },
  { key: 'layups',     label: '레이업' },
  { key: 'posts',      label: '골밑슛' },
  { key: 'mids',       label: '미들슛' },
  { key: 'freethrows', label: '자유투' },
  { key: 'andones',    label: '앤드원' },
]

// URL 쿼리 값 → ShotCategory (유효하지 않으면 null = 전체)
export function parseShotCategory(v: string | null): ShotCategory | null {
  return SHOT_CATEGORY_OPTIONS.some(o => o.key === v) ? (v as ShotCategory) : null
}

// 필터 UI 카테고리 — ShotCategory 에 'clutch' (경기 마지막 2분 & |홈-원정|≤3 접전 슛) 추가
// 클러치는 shot_type 이 아닌 컨텍스트(시간+점수차) 기반이라 categoryOfType 반환에는 포함 안 함
export type HighlightFilterCategory = ShotCategory | 'clutch'

/**
 * 클립의 카테고리. 앤드원이 흡수된 슛은 원래 유형(레이업 등)과 '앤드원' 양쪽에 걸린다 —
 * 흡수했다고 '앤드원' 필터에서 사라지면 그 필터가 늘 비게 된다.
 * 필터 쪽은 이 함수를 쓰고, 라벨 표기는 categoryOfType 을 그대로 쓴다.
 */
export function clipMatchesCategory(
  clip: { shot_type: string; has_and_one?: boolean },
  category: ShotCategory,
): boolean {
  if (category === 'andones') return clip.shot_type === 'and_one' || clip.has_and_one === true
  return categoryOfType(clip.shot_type) === category
}

export function categoryOfType(type: string): ShotCategory | null {
  if (type === 'shot_3p') return 'threes'
  if (type === 'shot_layup') return 'layups'
  if (type === 'shot_post') return 'posts'
  if (type === 'shot_2p_mid') return 'mids'
  if (type === 'and_one') return 'andones'
  if (type === 'ft_2pt' || type === 'ft_3pt_1' || type === 'ft_3pt_2' || type === 'free_throw') return 'freethrows'
  return null
}

/**
 * 앤드원 클립을 그 원인이 된 슛 클립에 합친다.
 *
 * ## 왜
 * 앤드원은 **이미 들어간 슛에 파울이 겹쳐 얻은 추가 1점**이다. 같은 장면인데 기록상 이벤트가
 * 둘로 남아 클립도 둘로 만들어졌다 — 모아보기에서 같은 플레이가 연달아 두 번 재생됐다.
 *
 * ## 어떻게 짝을 찾나 (실측 근거, 2026-08-14)
 * 처음엔 "바로 직전 이벤트"로 잡으려 했는데 **105건 중 3건만** 맞았다. 기록 순서(id)에는
 * 상대 팀 이벤트나 리바운드가 사이에 끼기 때문이다. 그래서 **영상 시각**으로 짝을 찾는다:
 *   같은 경기 · 같은 선수 · 성공한 슛(앤드원 제외) 중 video_timestamp 가 가장 가까운 것.
 * 실측 분포 — 98/104 는 슛이 앤드원보다 앞서고(평균 2.4초), 2초 이내 71 · 5초 이내 93 ·
 * 10초 이내 99건. 최대 격차는 16초였다.
 *
 * ## 창(window)을 두는 이유
 * 짝을 못 찾은 앤드원까지 억지로 붙이면 **엉뚱한 앞선 득점**에 합쳐진다. 창 밖이면 합치지 않고
 * 지금처럼 단독 클립으로 남긴다 — 틀리게 합치는 것보다 낫다.
 */
const AND_ONE_MATCH_WINDOW = 15   // 초. 실측 최대 격차 16초를 거의 덮되 무한정 넓히지 않는다

export function mergeAndOneClips<T extends {
  event_id: string; game_id: string; player_id: string | null
  shot_type: string; points: number; video_timestamp: number
  has_and_one?: boolean
}>(clips: T[]): T[] {
  const andOnes = clips.filter(c => c.shot_type === 'and_one')
  if (andOnes.length === 0) return clips

  const absorbed = new Set<string>()   // 흡수된 앤드원 클립의 event_id
  const bonus = new Map<string, number>()  // 슛 클립 event_id → 더할 점수

  for (const ao of andOnes) {
    let best: T | null = null
    let bestGap = Infinity
    for (const c of clips) {
      if (c.shot_type === 'and_one') continue
      if (c.game_id !== ao.game_id || c.player_id !== ao.player_id) continue
      const gap = Math.abs(c.video_timestamp - ao.video_timestamp)
      if (gap < bestGap) { bestGap = gap; best = c }
    }
    if (!best || bestGap > AND_ONE_MATCH_WINDOW) continue   // 못 찾으면 단독 유지
    absorbed.add(ao.event_id)
    bonus.set(best.event_id, (bonus.get(best.event_id) ?? 0) + ao.points)
  }

  return clips
    .filter(c => !absorbed.has(c.event_id))
    .map(c => bonus.has(c.event_id)
      ? { ...c, points: c.points + (bonus.get(c.event_id) ?? 0), has_and_one: true }
      : c)
}

// 어시스트 표시가 유의미한 슛 유형만 true (자유투/앤드원은 제외 — 파울 상황이라 어시스트 개념 없음)
export function shouldShowAssist(type: string): boolean {
  const cat = categoryOfType(type)
  return cat !== null && cat !== 'freethrows' && cat !== 'andones'
}

export const SHOT_TYPE_LABEL: Record<string, string> = {
  shot_3p:       '3점슛',
  shot_2p_mid:   '미들슛',
  shot_layup:    '레이업',
  shot_post:     '골밑슛',
  and_one:       '앤드원',
  ft_2pt:        '2P파울 FT',
  ft_3pt_1:      '3P파울 FT',
  ft_3pt_2:      '3P파울 FT',
  free_throw:    '자유투',
}
