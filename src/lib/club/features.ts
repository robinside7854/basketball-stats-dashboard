// 동호회 기능 스위치 목록 — 화면(클라이언트)과 서버가 같이 쓴다(2026-11-10). 판정 정본은 settings.ts 의 buildClub.

export const FEATURE_KEYS = ['wallet', 'rsvp', 'draft', 'youtube', 'tournament', 'uniform_photos', 'bank_auto', 'monthly_roster'] as const
export type FeatureKey = typeof FEATURE_KEYS[number]
export type ClubFeatures = Record<FeatureKey, boolean>

export const FEATURE_LABELS: Record<FeatureKey, { label: string; desc: string }> = {
  wallet: { label: '월렛', desc: '포인트 충전·티켓·환불' },
  rsvp: { label: '주간 참가신청', desc: '참/불 · 팀 배치 · 마감' },
  draft: { label: '드래프트', desc: '분기 팀 뽑기' },
  youtube: { label: '영상 연동', desc: '유튜브 영상 자동 연결 · 하이라이트' },
  tournament: { label: '대회', desc: '외부 대회 기록 묶음' },
  uniform_photos: { label: '유니폼별 사진', desc: '달마다 팀 색 사진으로 바꾸기' },
  bank_auto: { label: '입금 자동 확인', desc: '은행 입금 알림으로 자동 충전' },
  monthly_roster: { label: '달별 정규 멤버', desc: '달마다 팀 소속 바꾸기' },
}


export interface ClubSettings {
  /** 경기 요일 0(일)~6(토) — 참가신청 창·마감·문구 */
  game_weekday: number
  /** 참가 정원 — null 이면 안내 안 함 */
  capacity: number | null
  /** 한 날 팀 수 */
  team_count: number
  /** 대진 자동 배정 방식 — winner_stays = 승자 잔류·2연속 휴식(미라클) · none = 손으로 */
  rotation: 'winner_stays' | 'none'
  /** 파울 기록 여부 */
  record_fouls: boolean
  /** 소속 방식 */
  roster_mode: Array<'quarter_draft' | 'monthly_regular' | 'fixed'>
  /** 입금자명에 쓸 수 없는 낱말(입금 알림 글에 늘 들어 있는 통장 이름 등) */
  bank_reserved_words: string[]
}

/** 지금 미라클 동작 = 기본값 */
export const DEFAULT_SETTINGS: ClubSettings = {
  game_weekday: 6,
  capacity: 18,
  team_count: 3,
  rotation: 'winner_stays',
  record_fouls: false,
  roster_mode: ['quarter_draft', 'monthly_regular'],
  bank_reserved_words: ['모임통장'],
}

/** 동호회를 모를 때(화면 기본값) — 종전처럼 전부 켬 */
export const ALL_FEATURES_ON: ClubFeatures = { wallet: true, rsvp: true, draft: true, youtube: true, tournament: true, uniform_photos: true, bank_auto: true, monthly_roster: true }
