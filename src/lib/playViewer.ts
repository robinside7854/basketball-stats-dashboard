// 게임 로그 「플레이 뷰어」 — 이벤트 → 재생 구간 · 필터 칩 판정 (순수 함수)
//
//   검증: node scripts/verify-play-viewer.mjs
//
// 팀(대회) 경기는 경기당 영상이 하나(games.youtube_url)이고 video_timestamp 는 영상 절대 초다
// (youtube_start_offset 을 더하지 않는다). 그래서 구간은 이벤트 시각만으로 정해진다.
// ⚠ 확장자까지 쓴 상대 경로 — 검증 스크립트를 node 로 바로 돌리려면 별칭(@/)을 못 쓴다.
import { getClipBounds, isHighlightShot } from './highlights/clip.ts'

export type PlayChip = 'made' | 'missed' | 'ast' | 'reb' | 'stlblk' | 'tov' | 'foul' | 'sub'

// 칩 표시 순서 그대로. 교체는 기본으로 숨기고 이 칩을 눌러야 보인다.
export const PLAY_CHIPS: { key: PlayChip; label: string }[] = [
  { key: 'made', label: '득점' },
  { key: 'missed', label: '실패' },
  { key: 'ast', label: '어시' },
  { key: 'reb', label: '리바' },
  { key: 'stlblk', label: '스틸·블록' },
  { key: 'tov', label: '턴오버' },
  { key: 'foul', label: '파울' },
  { key: 'sub', label: '교체' },
]

type Ev = { type: string; result?: string | null; quarter: number; video_timestamp?: number | null; player_id?: string | null; related_player_id?: string | null }

/** 이 이벤트가 걸리는 칩(대표 하나). 상대 득점·쿼터 시작/종료는 어느 칩에도 안 걸린다(칩을 하나도 안 골랐을 때만 보임) */
export function chipOf(e: Pick<Ev, 'type' | 'result'>): PlayChip | null {
  if (isHighlightShot(e.type)) return e.result === 'made' ? 'made' : e.result === 'missed' ? 'missed' : null
  switch (e.type) {
    case 'assist': return 'ast'
    case 'oreb': case 'dreb': return 'reb'
    case 'steal': case 'block': return 'stlblk'
    case 'turnover': return 'tov'
    case 'foul': return 'foul'
    case 'sub_in': case 'sub_out': return 'sub'
    default: return null
  }
}

/** 재생 구간 — 성공 슛은 하이라이트와 같은 여유(앞 10초), 나머지는 앞 6초·뒤 3초. 시각 없으면 null(재생 불가) */
export function playWindow(e: Pick<Ev, 'type' | 'result' | 'video_timestamp'>): { start: number; end: number } | null {
  const t = e.video_timestamp
  // 쿼터 시작/종료는 시각이 0 이거나 중복이라 볼 장면이 아니다 — 재생 목록 첫 장면이 「0:00 쿼터 시작」이 되던 원인
  if (t == null || e.type === 'quarter_start' || e.type === 'quarter_end') return null
  if (chipOf(e) === 'made') return getClipBounds(e.type, t)
  return { start: Math.max(0, t - 6), end: t + 3 }
}

/** 걸리는 칩 전부 — 팀 기록은 어시스트를 따로 남기지 않고 성공 슛의 related_player_id 에 단다(EventInputPad).
 *  그래서 어시스트가 붙은 성공 슛은 「득점」과 「어시」 둘 다에 걸린다. (옛 assist 타입 이벤트도 「어시」) */
export function chipsOf(e: Pick<Ev, 'type' | 'result' | 'related_player_id'>): PlayChip[] {
  const c = chipOf(e)
  const out: PlayChip[] = c ? [c] : []
  if (c === 'made' && e.related_player_id) out.push('ast')
  return out
}

export type PlayFilter = { chips: ReadonlySet<PlayChip>; quarter: number | null; playerId: string }

/** 칩은 OR(고른 것 중 하나라도) · 칩이 비면 교체만 빼고 전부 · 선수는 본인 또는 관련 선수(어시스트 등) */
export function matchesFilter(e: Ev, f: PlayFilter): boolean {
  if (f.quarter != null && e.quarter !== f.quarter) return false
  if (f.playerId && e.player_id !== f.playerId && e.related_player_id !== f.playerId) return false
  const cs = chipsOf(e)
  if (f.chips.size === 0) return !cs.includes('sub')
  return cs.some(c => f.chips.has(c))
}

/** 쿼터 표기 — 5 이상은 연장 */
export function quarterLabel(q: number): string {
  return q > 4 ? `OT${q - 4}` : `Q${q}`
}
