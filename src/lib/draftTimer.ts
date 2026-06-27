// 드래프트 픽 타이머 상수 (서버·클라이언트 공용)
export const PICK_SECONDS = 80        // 픽당 기본 제한 시간
export const EXTENSION_SECONDS = 15   // 추가 찬스 1회당 연장 시간
export const MAX_EXTENSIONS = 3       // 단장별 드래프트(세션)당 추가 찬스 횟수
export const AUTOPICK_GRACE_SECONDS = 5  // 만료 후 자동 선택까지 카운트다운

/** 현재 시각 기준 픽 마감 ISO 문자열. seconds 인자로 세션별 픽 시간(league_drafts.pick_seconds) 전달 가능. */
export function newPickDeadline(fromMs: number = Date.now(), seconds: number = PICK_SECONDS): string {
  return new Date(fromMs + seconds * 1000).toISOString()
}
