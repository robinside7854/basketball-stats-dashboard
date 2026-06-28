// 드래프트 픽 타이머 상수 (서버·클라이언트 공용)
export const PICK_SECONDS = 80        // 픽당 기본 제한 시간
export const EXTENSION_SECONDS = 15   // 추가 찬스 1회당 연장 시간
export const MAX_EXTENSIONS = 3       // 단장별 드래프트(세션)당 추가 찬스 횟수
export const AUTOPICK_GRACE_SECONDS = 10  // 만료 후 무작위 자동 픽까지의 유예 시간

/** 현재 시각 기준 픽 마감 ISO 문자열. seconds 인자로 세션별 픽 시간(league_drafts.pick_seconds) 전달 가능. */
export function newPickDeadline(fromMs: number = Date.now(), seconds: number = PICK_SECONDS): string {
  return new Date(fromMs + seconds * 1000).toISOString()
}

/** 현재 시각이 유예 시간(grace) 안에 있는지 — pick_deadline 이후 ~ pick_deadline + GRACE 초 사이 */
export function isInGrace(pickDeadline: string | null, now: number = Date.now()): boolean {
  if (!pickDeadline) return false
  const deadlineMs = new Date(pickDeadline).getTime()
  if (Number.isNaN(deadlineMs)) return false
  return now >= deadlineMs && now < deadlineMs + AUTOPICK_GRACE_SECONDS * 1000
}

/** 유예 시간 잔여 초. 유예 진입 전이면 GRACE 초, 진입 중이면 0~GRACE, 지나면 음수. */
export function graceRemaining(pickDeadline: string | null, now: number = Date.now()): number {
  if (!pickDeadline) return AUTOPICK_GRACE_SECONDS
  const deadlineMs = new Date(pickDeadline).getTime()
  if (Number.isNaN(deadlineMs)) return AUTOPICK_GRACE_SECONDS
  const elapsed = now - deadlineMs
  return Math.ceil((AUTOPICK_GRACE_SECONDS * 1000 - elapsed) / 1000)
}
