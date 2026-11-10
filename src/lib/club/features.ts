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

