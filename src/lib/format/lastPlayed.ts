/**
 * 「마지막 출전」 표기 — /me(PersonalDashboard) · 선수 카드(PlayerQuickViewModal) 공용.
 * 데이터는 `lib/stats/lastPlayed.ts` 의 computeLastPlayed (친선일 포함 — 출석 지표라서).
 */

export interface LastPlayedData {
  date: string
  missed_game_days: number
}

export interface LastPlayedLabel {
  /** 「마지막 출전 10.11 (토) · 3일 전」 / 「아직 출전 기록 없음」 */
  text: string
  /** 「이후 경기일 3번 결장」 — 결장이 없으면 null */
  missedText: string | null
  /** 연속 결장 경기일 3번 이상 → 부드러운 경고색(노랑) */
  warn: boolean
}

/** 연속 결장이 이만큼 이상이면 경고 톤 */
export const LAST_PLAYED_WARN_MISSED = 3

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** 한국 시간 기준 오늘 YYYY-MM-DD */
function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

/** YYYY-MM-DD 두 날짜의 날 수 차이 (b - a) — 둘 다 달력 날짜라 UTC 자정으로 비교 */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

/** 0 → 오늘 · 1~6 → N일 전 · 7~27 → N주 전 · 28+ → N개월 전(30일 = 1개월) */
export function relativeDaysLabel(days: number): string {
  if (days <= 0) return '오늘'
  if (days < 7) return `${days}일 전`
  if (days < 28) return `${Math.floor(days / 7)}주 전`
  return `${Math.max(1, Math.floor(days / 30))}개월 전`
}

/** 이만큼(일) 이상 출전이 없을 때만 「마지막 출전」을 보인다 (2026-10-16 사용자 피드백) */
export const LAST_PLAYED_SHOW_AFTER_DAYS = 28

/**
 * 「마지막 출전」 줄을 보일지 — 최근 28일 안에 출전했으면 숨긴다(최근에 나온 사람에게는 의미 없는 줄).
 *   출전 기록이 아예 없거나(null) 응답에 필드가 없으면(undefined) 그리지 않는다 — 「출전 기록 없음」은 새 회원에게 오해를 준다.
 *   선수 카드 · /me 공용 — 기준을 두 벌로 두지 않으려고 여기 한 곳에.
 */
export function shouldShowLastPlayed(lp: LastPlayedData | null | undefined, today: string = todayKst()): lp is LastPlayedData {
  if (!lp) return false
  return dayDiff(lp.date, today) >= LAST_PLAYED_SHOW_AFTER_DAYS
}

export function formatLastPlayed(lp: LastPlayedData | null | undefined, today: string = todayKst()): LastPlayedLabel {
  if (!lp) return { text: '아직 출전 기록 없음', missedText: null, warn: false }
  const [, m, d] = lp.date.split('-').map(Number)
  const wd = WEEKDAYS[new Date(`${lp.date}T00:00:00Z`).getUTCDay()]
  const rel = relativeDaysLabel(dayDiff(lp.date, today))
  const missed = lp.missed_game_days
  return {
    text: `마지막 출전 ${m}.${d} (${wd}) · ${rel}`,
    missedText: missed >= 1 ? `이후 경기일 ${missed}번 결장` : null,
    warn: missed >= LAST_PLAYED_WARN_MISSED,
  }
}
