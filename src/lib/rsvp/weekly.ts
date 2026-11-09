// 주간 참가신청 정본 (마이그레이션 124, 2026-11-09 운영진)
//
//   · 대상 경기 = 그 주 토요일(rsvp_rules.game_weekday). 월요일 00:00 ~ 금요일 23:59(KST) 「신청 중」,
//     토요일은 「마감」(결과만 보인다), 일요일은 다음 주가 아직 안 열렸으므로 없음.
//   · 정규 = 경기 달의 정규권(wallet_tickets regular_pass, active·used) / 게스트 = league_players.is_guest / 나머지 비정규.
//   · 추천 팀 = 이번 달 정규 소속(명단 탭·홈 「이번 달 우리 팀」과 같은 규칙: 분기 정규 위에 달별 정규).
//   ⚠ 이 판정들을 화면·라우트에서 다시 쓰지 말 것 — 홈 카드와 관리 화면이 서로 다른 사람 수를 보이게 된다.
import { createClient } from '@/lib/supabase/admin'
import { resolveTeamId } from '@/lib/league/teamScope'
import { loadCurrentQuarter } from '@/lib/league/currentQuarter'
import { loadIdentityResolver } from '@/lib/stats/teamIdentity'
import { loadMonthRoster, monthOf } from '@/lib/league/monthlyRoster'

type SB = ReturnType<typeof createClient>

export interface RsvpRules { game_weekday: number; capacity: number }

export type RsvpPhase = 'open' | 'closed'
export interface RsvpWindow {
  gameDate: string        // YYYY-MM-DD (그 주 경기일)
  opensAt: string         // YYYY-MM-DD (월요일)
  closesAt: string        // YYYY-MM-DD (금요일 — 그날 23:59 까지)
  phase: RsvpPhase
}

export type RsvpKind = 'regular' | 'non_regular' | 'guest'

export interface RsvpEntry {
  player_id: string
  name: string
  photo_url: string | null
  kind: RsvpKind
  answer: 'yes' | 'no'
  approved: boolean
  placed_team_id: string | null
  ticket_used: boolean
  guest_paid: boolean
  tickets_left: number      // 비정규 티켓 남은 장수(배치 가능 여부 안내)
  suggested_team_id: string | null
  answered_at: string
}

const DAY = 86_400_000

function kstToday(now: Date): { ymd: string; weekday: number } {
  const ymd = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const weekday = new Date(`${ymd}T00:00:00Z`).getUTCDay()   // 0=일 … 6=토
  return { ymd, weekday }
}

function addDays(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
}

/**
 * 지금(KST) 열린 참가신청 창. 경기 요일이 토요일(6)이면
 * 월~금 = open, 토 = closed(그날 결과), 일 = null(다음 주는 월요일 00시에 열린다).
 */
export function currentWindow(rules: RsvpRules, now = new Date()): RsvpWindow | null {
  const { ymd, weekday } = kstToday(now)
  const gw = rules.game_weekday
  // 월요일(1)부터 경기 요일까지가 한 주기
  if (weekday === 0 || weekday > gw) return null
  const gameDate = addDays(ymd, gw - weekday)
  const opensAt = addDays(gameDate, 1 - gw)
  const closesAt = addDays(gameDate, -1)
  return { gameDate, opensAt, closesAt, phase: weekday < gw ? 'open' : 'closed' }
}

export async function loadRsvpRules(sb: SB, leagueId: string): Promise<RsvpRules | null> {
  const { data, error } = await sb.from('leagues').select('rsvp_rules').eq('id', leagueId).maybeSingle()
  if (error || !data) return null
  const r = (data as { rsvp_rules: Partial<RsvpRules> | null }).rsvp_rules
  if (!r) return null
  return { game_weekday: typeof r.game_weekday === 'number' ? r.game_weekday : 6, capacity: typeof r.capacity === 'number' ? r.capacity : 18 }
}

export interface RsvpBoard {
  entries: RsvpEntry[]
  /** 아직 답하지 않은 활동 선수 전원(구분 포함) — 어드민이 대신 눌러 주거나 게스트를 넣을 때 */
  unanswered: Array<{ player_id: string; name: string; kind: RsvpKind }>
  teams: Array<{ id: string; name: string; color: string }>
}

/** 그 날짜의 신청 현황 전부 — 홈 카드 · 관리 화면 공용. */
export async function loadRsvpBoard(sb: SB, leagueId: string, gameDate: string): Promise<RsvpBoard> {
  const teamId = await resolveTeamId(leagueId)
  const month = monthOf(gameDate)!
  const q = await loadCurrentQuarter(sb, leagueId)
  const inQuarter = !!q?.start_date && !!q?.end_date && gameDate >= q.start_date && gameDate <= q.end_date

  const [rowsRes, playersRes, passRes, nonRegRes, memRes, monthMap, resolve, teamsRes] = await Promise.all([
    sb.from('weekly_rsvp').select('league_player_id, answer, approved, placed_team_id, ticket_id, guest_paid, answered_at')
      .eq('league_id', leagueId).eq('game_date', gameDate),
    // 선수는 팀 소유 — league_id 로 찾지 않는다(CLAUDE.md)
    sb.from('league_players').select('id, name, photo_url, is_guest, is_active').eq('team_id', teamId),
    sb.from('wallet_tickets').select('league_player_id').eq('team_id', teamId).eq('kind', 'regular_pass')
      .eq('month', month).in('status', ['active', 'used']),
    sb.from('wallet_tickets').select('league_player_id').eq('team_id', teamId).eq('kind', 'non_regular').eq('status', 'active'),
    q ? sb.from('league_player_quarters').select('league_player_id, team_id, is_regular').eq('quarter_id', q.id)
      : Promise.resolve({ data: [] as { league_player_id: string; team_id: string | null; is_regular: boolean | null }[] }),
    loadMonthRoster(sb, leagueId, inQuarter ? month : null),
    loadIdentityResolver(sb, leagueId),
    sb.from('league_teams').select('id').eq('league_id', leagueId).is('exhibition_date', null).eq('is_external', false),
  ])
  if (rowsRes.error) throw new Error(`weekly_rsvp 조회 실패 — ${rowsRes.error.message}`)
  if (playersRes.error) throw new Error(`league_players 조회 실패 — ${playersRes.error.message}`)

  const players = new Map(((playersRes.data ?? []) as Array<{ id: string; name: string; photo_url: string | null; is_guest: boolean | null; is_active: boolean | null }>).map(p => [p.id, p]))
  const passHolders = new Set(((passRes.data ?? []) as Array<{ league_player_id: string }>).map(r => r.league_player_id))
  const ticketsLeft = new Map<string, number>()
  for (const r of (nonRegRes.data ?? []) as Array<{ league_player_id: string }>) ticketsLeft.set(r.league_player_id, (ticketsLeft.get(r.league_player_id) ?? 0) + 1)

  // 이번 달 정규 소속(추천 팀) — month-teams 라우트와 같은 규칙
  const regularTeam = new Map<string, string>()
  for (const m of memRes.data ?? []) if (m.team_id && m.is_regular !== false) regularTeam.set(m.league_player_id, m.team_id)
  for (const [pid, m] of monthMap) {
    if (m.team_id && m.is_regular) regularTeam.set(pid, m.team_id)
    else regularTeam.delete(pid)
  }

  const kindOf = (pid: string): RsvpKind => players.get(pid)?.is_guest ? 'guest' : passHolders.has(pid) ? 'regular' : 'non_regular'

  const entries: RsvpEntry[] = ((rowsRes.data ?? []) as Array<{ league_player_id: string; answer: 'yes' | 'no'; approved: boolean; placed_team_id: string | null; ticket_id: string | null; guest_paid: boolean; answered_at: string }>)
    .map(r => {
      const p = players.get(r.league_player_id)
      const kind = kindOf(r.league_player_id)
      return {
        player_id: r.league_player_id, name: p?.name ?? '알 수 없음', photo_url: p?.photo_url ?? null,
        kind, answer: r.answer,
        approved: kind === 'regular' ? r.answer === 'yes' : r.approved,
        placed_team_id: r.placed_team_id, ticket_used: !!r.ticket_id, guest_paid: r.guest_paid,
        tickets_left: ticketsLeft.get(r.league_player_id) ?? 0,
        suggested_team_id: regularTeam.get(r.league_player_id) ?? null,
        answered_at: r.answered_at,
      }
    })
    .sort((a, b) => a.answered_at.localeCompare(b.answered_at))

  const answered = new Set(entries.map(e => e.player_id))
  const unanswered = [...players.values()]
    .filter(p => !answered.has(p.id) && p.is_active !== false)
    .map(p => ({ player_id: p.id, name: p.name, kind: kindOf(p.id) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  const teams = ((teamsRes.data ?? []) as Array<{ id: string }>)
    .map(t => resolve(t.id, q?.id ?? null))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .map(x => ({ id: x.team_id, name: x.display_name, color: x.color }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  return { entries, unanswered, teams }
}

export function rsvpKindLabel(k: RsvpKind): string {
  return k === 'regular' ? '정규' : k === 'guest' ? '게스트' : '비정규'
}
