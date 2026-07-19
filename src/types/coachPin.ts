// 코치 핀 — 코치가 경기 영상 임의 지점에 꽂은 수비 장면 마커
export interface CoachPin {
  id: string
  game_id: string
  video_timestamp: number
  label: string
  created_at: string
}

// 모아보기용 — 경기 정보 조인
export interface CoachPinWithGame extends CoachPin {
  game: {
    id: string
    date: string
    opponent: string
    youtube_url: string | null
  }
}

export interface LabelOption {
  label: string
  count: number
}

// 핀 클립 길이 — 코치는 장면이 끝나는 순간에 핀을 꽂으므로 앞쪽을 길게 잡는다
export const PIN_CLIP_BEFORE = 12
export const PIN_CLIP_AFTER = 6

export function pinClipBounds(ts: number): { start: number; end: number } {
  return { start: Math.max(0, ts - PIN_CLIP_BEFORE), end: ts + PIN_CLIP_AFTER }
}

export const LABEL_MAX_LEN = 20
