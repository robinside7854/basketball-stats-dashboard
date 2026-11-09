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
import { loadMonthUniforms, type Uniform } from '@/lib/league/uniformPhoto'

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
  position: string | null
  kind: RsvpKind
  answer: 'yes' | 'no'
  approved: boolean
  placed_team_id: string | null
  ticket_used: boolean
  guest_paid: boolean
  /** 「본인」 · 「OO 초대」(게스트) · 대신 눌러 준 어드민 */
  answered_by: string | null
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
  unanswered: Array<{ player_id: string; name: string; kind: RsvpKind; suggested_team_id: string | null }>
  /** uniform = 그 달 유니폼 색(어드민이 「달별 정규 멤버」에서 고른 것, 없으면 null = 기본 노랑) */
  teams: Array<{ id: string; name: string; color: string; uniform: Uniform | null }>
}

/** 그 날짜의 신청 현황 전부 — 홈 카드 · 관리 화면 공용. */
export async function loadRsvpBoard(sb: SB, leagueId: string, gameDate: string): Promise<RsvpBoard> {
  const teamId = await resolveTeamId(leagueId)
  const month = monthOf(gameDate)!
  const q = await loadCurrentQuarter(sb, leagueId)
  const inQuarter = !!q?.start_date && !!q?.end_date && gameDate >= q.start_date && gameDate <= q.end_date

  const [rowsRes, playersRes, passRes, nonRegRes, memRes, monthMap, resolve, teamsRes, uniforms] = await Promise.all([
    sb.from('weekly_rsvp').select('league_player_id, answer, approved, placed_team_id, ticket_id, guest_paid, answered_at, answered_by_label')
      .eq('league_id', leagueId).eq('game_date', gameDate),
    // 선수는 팀 소유 — league_id 로 찾지 않는다(CLAUDE.md)
    sb.from('league_players').select('id, name, photo_url, position, is_guest, is_active').eq('team_id', teamId),
    sb.from('wallet_tickets').select('league_player_id').eq('team_id', teamId).eq('kind', 'regular_pass')
      .eq('month', month).in('status', ['active', 'used']),
    sb.from('wallet_tickets').select('league_player_id').eq('team_id', teamId).eq('kind', 'non_regular').eq('status', 'active'),
    q ? sb.from('league_player_quarters').select('league_player_id, team_id, is_regular').eq('quarter_id', q.id)
      : Promise.resolve({ data: [] as { league_player_id: string; team_id: string | null; is_regular: boolean | null }[] }),
    loadMonthRoster(sb, leagueId, inQuarter ? month : null),
    loadIdentityResolver(sb, leagueId),
    sb.from('league_teams').select('id').eq('league_id', leagueId).is('exhibition_date', null).eq('is_external', false),
    loadMonthUniforms(sb, leagueId, month),
  ])
  if (rowsRes.error) throw new Error(`weekly_rsvp 조회 실패 — ${rowsRes.error.message}`)
  if (playersRes.error) throw new Error(`league_players 조회 실패 — ${playersRes.error.message}`)

  const players = new Map(((playersRes.data ?? []) as Array<{ id: string; name: string; photo_url: string | null; position: string | null; is_guest: boolean | null; is_active: boolean | null }>).map(p => [p.id, p]))
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

  const entries: RsvpEntry[] = ((rowsRes.data ?? []) as Array<{ league_player_id: string; answer: 'yes' | 'no'; approved: boolean; placed_team_id: string | null; ticket_id: string | null; guest_paid: boolean; answered_at: string; answered_by_label: string | null }>)
    .map(r => {
      const p = players.get(r.league_player_id)
      const kind = kindOf(r.league_player_id)
      return {
        player_id: r.league_player_id, name: p?.name ?? '알 수 없음', photo_url: p?.photo_url ?? null, position: p?.position ?? null,
        kind, answer: r.answer,
        approved: kind === 'regular' ? r.answer === 'yes' : r.approved,
        placed_team_id: r.placed_team_id, ticket_used: !!r.ticket_id, guest_paid: r.guest_paid, answered_by: r.answered_by_label,
        tickets_left: ticketsLeft.get(r.league_player_id) ?? 0,
        suggested_team_id: regularTeam.get(r.league_player_id) ?? null,
        answered_at: r.answered_at,
      }
    })
    .sort((a, b) => a.answered_at.localeCompare(b.answered_at))

  const answered = new Set(entries.map(e => e.player_id))
  const unanswered = [...players.values()]
    .filter(p => !answered.has(p.id) && p.is_active !== false)
    .map(p => ({ player_id: p.id, name: p.name, kind: kindOf(p.id), suggested_team_id: regularTeam.get(p.id) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  const teams = ((teamsRes.data ?? []) as Array<{ id: string }>)
    .map(t => resolve(t.id, q?.id ?? null))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .map(x => ({ id: x.team_id, name: x.display_name, color: x.color, uniform: uniforms.get(x.team_id) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  return { entries, unanswered, teams }
}

export function rsvpKindLabel(k: RsvpKind): string {
  return k === 'regular' ? '정규' : k === 'guest' ? '게스트' : '비정규'
}

/**
 * 정규(정규권 있음)가 「참」이면 이번 달 팀으로 자동 배치, 「불」이면 자동 배치를 푼다 (2026-11-09 운영진 —
 * 「나는 이미 락다운이라서 참을 누르면 자동으로 팀 배정이 되어야 한다」).
 * 티켓을 쓴 배치(비정규)나 어드민이 다른 팀으로 옮긴 배치는 건드리지 않는다 — 자동 배치(placed_by_label '자동')만 푼다.
 * 돌려준 값: 배치된 팀 id(없으면 null).
 */
export async function autoPlaceRegular(sb: SB, leagueId: string, gameDate: string, playerId: string): Promise<string | null> {
  const board = await loadRsvpBoard(sb, leagueId, gameDate)
  const e = board.entries.find(x => x.player_id === playerId)
  if (!e) return null
  const now = new Date().toISOString()
  if (e.answer === 'yes' && e.kind === 'regular' && !e.placed_team_id && e.suggested_team_id) {
    await sb.from('weekly_rsvp').update({ placed_team_id: e.suggested_team_id, approved: true, placed_by_label: AUTO_LABEL, updated_at: now })
      .eq('league_id', leagueId).eq('game_date', gameDate).eq('league_player_id', playerId)
    return e.suggested_team_id
  }
  if (e.answer === 'no' && e.placed_team_id && !e.ticket_used) {
    await sb.from('weekly_rsvp').update({ placed_team_id: null, placed_by_label: AUTO_LABEL, updated_at: now })
      .eq('league_id', leagueId).eq('game_date', gameDate).eq('league_player_id', playerId).eq('placed_by_label', AUTO_LABEL)
    return null
  }
  return e.placed_team_id
}

export const AUTO_LABEL = '자동(이번 달 팀)'

/**
 * 한 사람을 팀에 배치하거나(targetTeam) 배치를 푼다(null) — 어드민 「팀 배치」와 마감 자동 배치가 같은 한 벌을 쓴다.
 *   · 비정규(정규권 없음·게스트 아님)를 처음 배치할 때 비정규 티켓 1장(wallet_use_ticket) → ticket_id.
 *   · 이미 티켓을 쓴 사람은 팀을 옮겨도 다시 빠지지 않는다.
 *   · 배치를 풀 때 returnTicket 이면 티켓을 돌려준다(포인트 환불 · 기록은 남는다).
 * 실패하면 { error, status } — 화면에 그대로 보여 줄 문구다.
 */
export async function placeEntry(
  sb: SB, leagueId: string, gameDate: string, playerId: string,
  targetTeam: string | null, actor: string, opts: { returnTicket?: boolean; label?: string } = {},
): Promise<{ ok: true; ticket: string | null } | { ok: false; error: string; status: number }> {
  const teamId = await resolveTeamId(leagueId)
  const { data: row } = await sb.from('weekly_rsvp').select('answer, ticket_id')
    .eq('league_id', leagueId).eq('game_date', gameDate).eq('league_player_id', playerId).maybeSingle()
  const r = row as { answer: string; ticket_id: string | null } | null
  if (!r) return { ok: false, error: '신청 기록이 없어요', status: 404 }
  if (targetTeam && r.answer !== 'yes') return { ok: false, error: '「참」인 사람만 배치할 수 있어요', status: 409 }

  let ticketId = r.ticket_id
  let ticket: string | null = null
  if (targetTeam && !ticketId) {
    const board = await loadRsvpBoard(sb, leagueId, gameDate)
    const e = board.entries.find(x => x.player_id === playerId)
    if (e?.kind === 'non_regular') {
      const { data, error } = await sb.rpc('wallet_use_ticket', {
        p_team_id: teamId, p_player_id: playerId, p_date: gameDate, p_note: '참가 배치', p_actor: actor,
      })
      if (error) {
        const i = error.message.indexOf('wallet: ')
        const msg = i >= 0 ? error.message.slice(i + 8) : null
        return { ok: false, error: msg ? `${msg} — 비정규 티켓을 사야 배치할 수 있어요` : error.message, status: msg ? 409 : 500 }
      }
      ticketId = (data as { id: string }).id
      ticket = '비정규 티켓 1장 사용'
    }
  }
  if (!targetTeam && ticketId && opts.returnTicket) {
    const { error } = await sb.rpc('wallet_return_ticket', { p_team_id: teamId, p_ticket_id: ticketId, p_note: `${gameDate} 배치 취소`, p_actor: actor })
    if (error) return { ok: false, error: error.message, status: 409 }
    ticketId = null
    ticket = '비정규 티켓 돌려줌'
  }
  const { error } = await sb.from('weekly_rsvp').update({
    placed_team_id: targetTeam, ticket_id: ticketId, ...(targetTeam ? { approved: true } : {}),
    placed_by_label: opts.label ?? actor, updated_at: new Date().toISOString(),
  }).eq('league_id', leagueId).eq('game_date', gameDate).eq('league_player_id', playerId)
  if (error) return { ok: false, error: error.message, status: 500 }
  return { ok: true, ticket }
}

export const CLOSE_AUTO_LABEL = '자동(마감 배치)'

/**
 * 마감 자동 배치 — **정규만** (2026-11-09 운영진: 「비정규·게스트는 각 팀 수요에 맞춰 어드민이 배치한다 — 자동으로 채우면 안 된다」).
 * 신청이 닫힌 뒤(토요일) 처음 화면이 열릴 때 한 번 돈다. 「참」인데 아직 팀이 없는 정규만 이번 달 팀으로.
 * 비정규·게스트는 대기명단에 남아 어드민이 끌어다 놓는다. 정원과 무관(정규는 자리가 정해져 있다).
 * 돌려준 값: 이번에 배치한 사람 수.
 */
export async function autoPlaceAtClose(sb: SB, leagueId: string, gameDate: string): Promise<number> {
  const board = await loadRsvpBoard(sb, leagueId, gameDate)
  let placed = 0
  for (const e of board.entries) {
    if (e.answer !== 'yes' || e.placed_team_id || e.kind !== 'regular' || !e.suggested_team_id) continue
    const res = await placeEntry(sb, leagueId, gameDate, e.player_id, e.suggested_team_id, CLOSE_AUTO_LABEL)
    if (res.ok) placed++
  }
  return placed
}
