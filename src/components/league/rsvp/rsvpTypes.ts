// 주간 참가신청 화면 공용 타입·작은 함수 (API: /api/leagues/[leagueId]/rsvp)
export type RsvpKind = 'regular' | 'non_regular' | 'guest'

export interface RsvpEntryView {
  player_id: string
  name: string
  photo_url: string | null
  position: string | null
  kind: RsvpKind
  answer: 'yes' | 'no'
  approved: boolean
  placed_team_id: string | null
  ticket_used: boolean
  guest_paid: boolean
  tickets_left: number
  suggested_team_id: string | null
  answered_at: string
}

export interface RsvpRes {
  enabled: boolean
  window: { gameDate: string; opensAt: string | null; closesAt: string | null; phase: 'open' | 'closed' } | null
  capacity: number
  isAdmin?: boolean
  me: { answer: 'yes' | 'no' | null; approved: boolean; placed_team_id: string | null; kind: RsvpKind | null; tickets_left: number } | null
  entries?: RsvpEntryView[]
  teams?: Array<{ id: string; name: string; color: string; uniform: 'yellow' | 'white' | 'black' | null }>
  unanswered?: Array<{ player_id: string; name: string; kind: RsvpKind }>
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
