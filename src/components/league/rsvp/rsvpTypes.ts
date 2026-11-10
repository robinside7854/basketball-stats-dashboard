// 주간 참가신청 화면 공용 타입·작은 함수 (API: /api/leagues/[leagueId]/rsvp)
export type RsvpKind = 'regular' | 'non_regular' | 'guest'

export interface RsvpEntryView {
  player_id: string
  name: string
  photo_url: string | null
  position: string | null
  age?: number | null
  height_cm?: number | null
  kind: RsvpKind
  answer: 'yes' | 'no'
  approved: boolean
  placed_team_id: string | null
  ticket_used: boolean
  guest_paid: boolean
  guest_pay?: 'bank' | 'points'
  guest_fee_charged?: boolean
  answered_by?: string | null
  tickets_left: number
  can_pay?: boolean
  suggested_team_id: string | null
  answered_at: string
}

export interface RsvpRes {
  enabled: boolean
  window: { gameDate: string; opensAt: string | null; closesAt: string | null; phase: 'open' | 'closed' } | null
  capacity: number
  isAdmin?: boolean
  /** 마감 기록(어드민 마감 · 경기일 자동 마감) — 126 */
  closure?: { closed_at: string; closed_by_label: string | null } | null
  /** 그날 기록이 시작돼 명단을 못 고침 */
  locked?: boolean
  can_reopen?: boolean
  me: { answer: 'yes' | 'no' | null; approved: boolean; placed_team_id: string | null; kind: RsvpKind | null; tickets_left: number; month_team_id?: string | null; my_guest_ids?: string[] } | null
  entries?: RsvpEntryView[]
  teams?: Array<{ id: string; name: string; color: string; uniform: 'yellow' | 'white' | 'black' | null; leader_id?: string | null; regulars?: Array<{ player_id: string; name: string; position: string | null }> }>
  guest_price?: number | null
  my_balance?: number | null
  /** 비정규 티켓값 — 티켓이 없으면 배치 때 포인트에서 자동 발행 */
  ticket_price?: number | null
  /** 입금 안내(계좌) · 입금만 하면 자동 충전되는지(129) */
  wallet_bank?: string | null
  auto_charge?: boolean
  /** 경기 달 정규권 판매(134) */
  pass_sale?: { month: string; state: 'upcoming' | 'open' | 'closed'; sold: number; capacity: number; opens_at: string; closes_at: string } | null
  guest_pool?: Array<{ player_id: string; name: string; age: number | null; position: string | null; height_cm: number | null; inviter_label: string | null; last_date: string }>
  unanswered?: Array<{ player_id: string; name: string; kind: RsvpKind; suggested_team_id?: string | null }>
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']

/** 2026-11-14 → 「11/14(토)」 */
export function dateLabel(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${DOW[d.getUTCDay()]})`
}

export function countByKind(rows: Array<{ kind: RsvpKind }>): Record<RsvpKind, number> {
  const c: Record<RsvpKind, number> = { regular: 0, non_regular: 0, guest: 0 }
  for (const r of rows) c[r.kind]++
  return c
}

export const KIND_LABEL: Record<RsvpKind, string> = { regular: '정규', non_regular: '비정규', guest: '게스트' }

/** 유니폼 색 칠 — 홈 「이번 달 우리 팀」과 같은 색(HomeMonthTeams) */
export const UNIFORM_FILL = { yellow: '#F2B705', white: '#ffffff', black: '#1a1a1a' } as const
export const UNIFORM_NAME = { yellow: '노랑', white: '흰색', black: '검정' } as const

/** 게스트 한 줄 — 「이름(나이) / 포지션 / 신장」(2026-11-09 운영진 포맷). 빈 칸은 뺀다. */
export function guestLine(e: { name: string; age?: number | null; position: string | null; height_cm?: number | null }): string {
  return [`${e.name}${e.age ? `(${e.age})` : ''}`, e.position, e.height_cm ? `${e.height_cm}cm` : null].filter(Boolean).join(' / ')
}
