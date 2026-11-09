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
import { ensureDateSlots } from '@/lib/league/videoSchedule'
import { loadWalletConfig } from '@/lib/wallet/wallet'

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
  /** 게스트 정보 — 나이(생년월일의 해로 계산) · 키 */
  age: number | null
  height_cm: number | null
  kind: RsvpKind
  answer: 'yes' | 'no'
  approved: boolean
  placed_team_id: string | null
  ticket_used: boolean
  guest_paid: boolean
  /** 게스트비를 어떻게 내나 — 통장 입금 / 부른 회원 포인트(127) */
  guest_pay: 'bank' | 'points'
  /** 포인트로 이미 빠졌나(배치 때 빠진다) */
  guest_fee_charged: boolean
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
  /** leader_id = 그 분기 팀장(league_team_quarter_leaders) — 팀 카드 맨 위 · 왕관 */
  teams: Array<{ id: string; name: string; color: string; uniform: Uniform | null; leader_id: string | null; regulars: Array<{ player_id: string; name: string; position: string | null }> }>
}

/** 그 날짜의 신청 현황 전부 — 홈 카드 · 관리 화면 공용. */
export async function loadRsvpBoard(sb: SB, leagueId: string, gameDate: string): Promise<RsvpBoard> {
  const teamId = await resolveTeamId(leagueId)
  const month = monthOf(gameDate)!
  const q = await loadCurrentQuarter(sb, leagueId)
  const inQuarter = !!q?.start_date && !!q?.end_date && gameDate >= q.start_date && gameDate <= q.end_date

  const [rowsRes, playersRes, passRes, nonRegRes, memRes, monthMap, resolve, teamsRes, uniforms, leadersRes] = await Promise.all([
    sb.from('weekly_rsvp').select('league_player_id, answer, approved, placed_team_id, ticket_id, guest_paid, guest_pay, guest_fee_ledger_id, answered_at, answered_by_label')
      .eq('league_id', leagueId).eq('game_date', gameDate),
    // 선수는 팀 소유 — league_id 로 찾지 않는다(CLAUDE.md)
    sb.from('league_players').select('id, name, photo_url, position, birth_date, height_cm, is_guest, is_active').eq('team_id', teamId),
    sb.from('wallet_tickets').select('league_player_id').eq('team_id', teamId).eq('kind', 'regular_pass')
      .eq('month', month).in('status', ['active', 'used']),
    sb.from('wallet_tickets').select('league_player_id').eq('team_id', teamId).eq('kind', 'non_regular').eq('status', 'active'),
    q ? sb.from('league_player_quarters').select('league_player_id, team_id, is_regular').eq('quarter_id', q.id)
      : Promise.resolve({ data: [] as { league_player_id: string; team_id: string | null; is_regular: boolean | null }[] }),
    loadMonthRoster(sb, leagueId, inQuarter ? month : null),
    loadIdentityResolver(sb, leagueId),
    sb.from('league_teams').select('id').eq('league_id', leagueId).is('exhibition_date', null).eq('is_external', false),
    loadMonthUniforms(sb, leagueId, month),
    q ? sb.from('league_team_quarter_leaders').select('team_id, leader_player_id').eq('quarter_id', q.id)
      : Promise.resolve({ data: [] as { team_id: string; leader_player_id: string }[] }),
  ])
  if (rowsRes.error) throw new Error(`weekly_rsvp 조회 실패 — ${rowsRes.error.message}`)
  if (playersRes.error) throw new Error(`league_players 조회 실패 — ${playersRes.error.message}`)

  const players = new Map(((playersRes.data ?? []) as Array<{ id: string; name: string; photo_url: string | null; position: string | null; birth_date: string | null; height_cm: number | null; is_guest: boolean | null; is_active: boolean | null }>).map(p => [p.id, p]))
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

  const thisYear = Number(gameDate.slice(0, 4))
  const ageOf = (pid: string) => { const b = players.get(pid)?.birth_date; return b ? thisYear - Number(b.slice(0, 4)) : null }
  const kindOf = (pid: string): RsvpKind => players.get(pid)?.is_guest ? 'guest' : passHolders.has(pid) ? 'regular' : 'non_regular'

  const entries: RsvpEntry[] = ((rowsRes.data ?? []) as Array<{ league_player_id: string; answer: 'yes' | 'no'; approved: boolean; placed_team_id: string | null; ticket_id: string | null; guest_paid: boolean; guest_pay: 'bank' | 'points' | null; guest_fee_ledger_id: string | null; answered_at: string; answered_by_label: string | null }>)
    .map(r => {
      const p = players.get(r.league_player_id)
      const kind = kindOf(r.league_player_id)
      return {
        player_id: r.league_player_id, name: p?.name ?? '알 수 없음', photo_url: p?.photo_url ?? null, position: p?.position ?? null,
        age: ageOf(r.league_player_id), height_cm: p?.height_cm ?? null,
        kind, answer: r.answer,
        approved: kind === 'regular' ? r.answer === 'yes' : r.approved,
        placed_team_id: r.placed_team_id, ticket_used: !!r.ticket_id, guest_paid: r.guest_paid, guest_pay: r.guest_pay ?? 'bank', guest_fee_charged: !!r.guest_fee_ledger_id, answered_by: r.answered_by_label,
        tickets_left: ticketsLeft.get(r.league_player_id) ?? 0,
        suggested_team_id: regularTeam.get(r.league_player_id) ?? null,
        answered_at: r.answered_at,
      }
    })
    .sort((a, b) => a.answered_at.localeCompare(b.answered_at))

  const answered = new Set(entries.map(e => e.player_id))
  const unanswered = [...players.values()]
    // 게스트는 빼 둔다 — 게스트는 부르는 회원이 「게스트 신청」으로만 넣는다(2026-11-09 운영진)
    .filter(p => !answered.has(p.id) && p.is_active !== false && !p.is_guest)
    .map(p => ({ player_id: p.id, name: p.name, kind: kindOf(p.id), suggested_team_id: regularTeam.get(p.id) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  const teams = ((teamsRes.data ?? []) as Array<{ id: string }>)
    .map(t => resolve(t.id, q?.id ?? null))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .map(x => ({
      id: x.team_id, name: x.display_name, color: x.color, uniform: uniforms.get(x.team_id) ?? null,
      leader_id: ((leadersRes.data ?? []) as Array<{ team_id: string; leader_player_id: string }>).find(l => l.team_id === x.team_id)?.leader_player_id ?? null,
      // 이번 달 이 팀 정규 멤버 — 답하지 않은 사람(?)·불참(X)까지 팀 카드에 보이게(2026-11-09 운영진)
      regulars: [...regularTeam.entries()]
        .filter(([pid, tid]) => tid === x.team_id && players.get(pid) && players.get(pid)!.is_active !== false && !players.get(pid)!.is_guest)
        .map(([pid]) => ({ player_id: pid, name: players.get(pid)!.name, position: players.get(pid)!.position ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    }))
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
  const { data: row } = await sb.from('weekly_rsvp').select('answer, ticket_id, guest_pay, guest_payer_id, guest_fee_ledger_id')
    .eq('league_id', leagueId).eq('game_date', gameDate).eq('league_player_id', playerId).maybeSingle()
  const r = row as { answer: string; ticket_id: string | null; guest_pay: string | null; guest_payer_id: string | null; guest_fee_ledger_id: string | null } | null
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
  // 게스트비를 포인트로 — 배치되는 순간 부른 회원 잔액에서 뺀다(모자라면 배치를 막는다, 2026-11-09 운영진)
  let feeLedger = r.guest_fee_ledger_id
  if (targetTeam && !feeLedger && r.guest_pay === 'points' && r.guest_payer_id) {
    const res = await chargeGuestFee(sb, teamId, gameDate, playerId, r.guest_payer_id, actor)
    if (!res.ok) return { ok: false, error: res.error, status: 409 }
    feeLedger = res.ledgerId
    ticket = `게스트비 ${res.price.toLocaleString()}P — ${res.payerName} 님 포인트에서 냈어요`
  }
  if (!targetTeam && feeLedger) {
    const res = await refundGuestFee(sb, teamId, gameDate, playerId, feeLedger, actor)
    if (!res.ok) return { ok: false, error: res.error, status: 409 }
    feeLedger = null
    ticket = '게스트비 포인트 돌려줌'
  }
  if (!targetTeam && ticketId && opts.returnTicket) {
    const { error } = await sb.rpc('wallet_return_ticket', { p_team_id: teamId, p_ticket_id: ticketId, p_note: `${gameDate} 배치 취소`, p_actor: actor })
    if (error) return { ok: false, error: error.message, status: 409 }
    ticketId = null
    ticket = '비정규 티켓 돌려줌'
  }
  const { error } = await sb.from('weekly_rsvp').update({
    placed_team_id: targetTeam, ticket_id: ticketId, ...(targetTeam ? { approved: true } : {}),
    ...(r.guest_pay === 'points' ? { guest_fee_ledger_id: feeLedger, guest_paid: !!feeLedger } : {}),
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

/** 게스트를 부른 회원 표시 — 신청 기록의 answered_by_label. 본인 취소 판정에도 쓴다. */
export function inviterLabel(name: string): string {
  return `${name} 초대`
}

// ── 마감 (마이그레이션 126, 2026-11-09 운영진) ─────────────────────────────
//   어드민이 「마감」을 누르거나 경기일(토)이 되면 마감. 마감 = 회원 참/불 끝 · 홈 카드 사라짐 ·
//   정규 자동 배치 · 그 날짜를 일정에 넣고 빈 경기 칸 깔기. 명단 고치기는 일정 탭에서(기록 시작 전까지).

export interface RsvpClosure { closed_at: string; closed_by_label: string | null }

/** 그 주 마감 기록. 표가 없으면(마이그레이션 전) null — 시각 규칙만 쓴다. */
export async function loadClosure(sb: SB, leagueId: string, gameDate: string): Promise<RsvpClosure | null> {
  const { data, error } = await sb.from('weekly_rsvp_closures').select('closed_at, closed_by_label')
    .eq('league_id', leagueId).eq('game_date', gameDate).maybeSingle()
  if (error || !data) return null
  return data as RsvpClosure
}

/** 그날 기록이 시작됐는가 — 그러면 참가 명단은 잠긴다(기록 명단이 이 명단을 따른다). */
export async function rosterLocked(sb: SB, leagueId: string, gameDate: string): Promise<boolean> {
  const { data } = await sb.from('league_games').select('id').eq('league_id', leagueId).eq('date', gameDate).eq('is_started', true).limit(1)
  return (data ?? []).length > 0
}

export const SATURDAY_CLOSE_LABEL = '자동(경기일)'

/**
 * 마감하기 — 여러 번 불러도 같다(이미 마감이면 기록만 그대로 두고 일정·배치를 다시 맞춘다).
 * 돌려준 값: 이번에 자동 배치한 정규 수 · 일정 칸 생성 실패 여부.
 */
export async function closeWeek(sb: SB, leagueId: string, gameDate: string, label: string): Promise<{ ok: boolean; placed: number; error?: string }> {
  const { error } = await sb.from('weekly_rsvp_closures')
    .upsert({ league_id: leagueId, game_date: gameDate, closed_by_label: label }, { onConflict: 'league_id,game_date', ignoreDuplicates: true })
  // 마감 표가 없어도(126 전) 정규 자동 배치·일정 넣기는 한다 — 결과에 실패만 알린다.
  const closeErr = error?.message
  const placed = await autoPlaceAtClose(sb, leagueId, gameDate)
  // 일정 넣기 + 빈 경기 칸(정규일정 당 경기 수만큼). 이미 있으면 빠진 번호만 채운다.
  await sb.from('league_schedule_dates').upsert({ league_id: leagueId, date: gameDate, is_skipped: false }, { onConflict: 'league_id,date' })
  const { data: lg } = await sb.from('leagues').select('games_per_round').eq('id', leagueId).maybeSingle()
  try {
    await ensureDateSlots(sb, leagueId, gameDate, (lg as { games_per_round?: number | null } | null)?.games_per_round ?? 10)
  } catch (e) {
    return { ok: !closeErr, placed, error: closeErr ?? (e instanceof Error ? e.message : '경기 칸을 만들지 못했어요') }
  }
  return closeErr ? { ok: false, placed, error: closeErr } : { ok: true, placed }
}

/** 마감 취소 — 기록 전에만. 일정·배치는 그대로 둔다(다시 마감하면 이어서 맞춘다). */
export async function reopenWeek(sb: SB, leagueId: string, gameDate: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.from('weekly_rsvp_closures').delete().eq('league_id', leagueId).eq('game_date', gameDate)
  return error ? { ok: false, error: error.message } : { ok: true }
}

// ── 지난 게스트 다시 부르기 (2026-11-09 운영진) ─────────────────────────────
//   한 번 팀에 배치된(= 승인된) 게스트는 목록에 남아 다음 주에 한 번에 다시 신청할 수 있다.
//   부른 회원(신청 기록의 「OO 초대」) 또는 어드민만. 다시 부를 때도 처음 부른 회원 이름표를 그대로 쓴다.

export interface GuestPoolItem {
  player_id: string
  name: string
  age: number | null
  position: string | null
  height_cm: number | null
  /** 처음 부른 회원 이름표 — 「김로빈 초대」 */
  inviter_label: string | null
  last_date: string
}

export async function loadGuestPool(sb: SB, leagueId: string, gameDate: string): Promise<GuestPoolItem[]> {
  const teamId = await resolveTeamId(leagueId)
  const [{ data: guests }, { data: rows }] = await Promise.all([
    sb.from('league_players').select('id, name, position, birth_date, height_cm').eq('team_id', teamId).eq('is_guest', true),
    sb.from('weekly_rsvp').select('league_player_id, game_date, placed_team_id, answered_by_label, answer')
      .eq('league_id', leagueId).lte('game_date', gameDate).order('game_date', { ascending: false }).limit(2000),
  ])
  const g = new Map(((guests ?? []) as Array<{ id: string; name: string; position: string | null; birth_date: string | null; height_cm: number | null }>).map(x => [x.id, x]))
  const thisWeek = new Set<string>()
  const last = new Map<string, { date: string; label: string | null }>()
  for (const r of (rows ?? []) as Array<{ league_player_id: string; game_date: string; placed_team_id: string | null; answered_by_label: string | null; answer: string }>) {
    if (!g.has(r.league_player_id)) continue
    if (r.game_date === gameDate) { thisWeek.add(r.league_player_id); continue }
    if (!r.placed_team_id || last.has(r.league_player_id)) continue
    last.set(r.league_player_id, { date: r.game_date, label: r.answered_by_label })
  }
  const year = Number(gameDate.slice(0, 4))
  return [...last.entries()].filter(([pid]) => !thisWeek.has(pid)).map(([pid, v]) => {
    const p = g.get(pid)!
    return {
      player_id: pid, name: p.name, position: p.position, height_cm: p.height_cm,
      age: p.birth_date ? year - Number(p.birth_date.slice(0, 4)) : null,
      inviter_label: v.label, last_date: v.date,
    }
  }).sort((a, b) => b.last_date.localeCompare(a.last_date) || a.name.localeCompare(b.name, 'ko'))
}

/** 그 주 「참」으로 다시 넣는다(대기명단). 「불」로 남은 줄이 있으면 살린다. */
export async function reinviteGuest(sb: SB, leagueId: string, gameDate: string, guestId: string, label: string | null, pay: { method: 'bank' | 'points'; payerId: string | null } = { method: 'bank', payerId: null }): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString()
  const { data: prev } = await sb.from('weekly_rsvp').select('id, answer')
    .eq('league_id', leagueId).eq('game_date', gameDate).eq('league_player_id', guestId).maybeSingle()
  const pr = prev as { id: string; answer: string } | null
  if (pr?.answer === 'yes') return { ok: false, error: '이번 주에 이미 신청돼 있어요' }
  const { error } = pr
    ? await sb.from('weekly_rsvp').update({ answer: 'yes', placed_team_id: null, ticket_id: null, guest_paid: false, guest_pay: pay.method, guest_payer_id: pay.payerId, guest_fee_ledger_id: null, answered_by_label: label, answered_at: now, updated_at: now }).eq('id', pr.id)
    : await sb.from('weekly_rsvp').insert({ league_id: leagueId, game_date: gameDate, league_player_id: guestId, answer: 'yes', guest_pay: pay.method, guest_payer_id: pay.payerId, answered_by_label: label, answered_at: now, updated_at: now })
  return error ? { ok: false, error: error.message } : { ok: true }
}

// ── 게스트비 포인트 (마이그레이션 127, 2026-11-09 운영진) ────────────────────
//   부른 회원이 「내 포인트」로 고른 게스트 — 배치 때 빼고, 배치가 풀리거나 취소되면 돌려준다.
//   장부는 지우지 않는다: 낼 때 purchase(−), 돌려줄 때 refund(+). 잔액은 wallet_apply 로만.

function walletMsg(m: string | undefined): string | null {
  if (!m) return null
  const i = m.indexOf('wallet: ')
  return i >= 0 ? m.slice(i + 8) : null
}

async function chargeGuestFee(sb: SB, teamId: string, gameDate: string, guestId: string, payerId: string, actor: string):
  Promise<{ ok: true; ledgerId: string; price: number; payerName: string } | { ok: false; error: string }> {
  const cfg = await loadWalletConfig(teamId)
  const price = cfg?.rules.guest_price ?? 0
  if (!cfg || price <= 0) return { ok: false, error: '게스트비(포인트) 가격이 정해지지 않았어요' }
  const { data: ps } = await sb.from('league_players').select('id, name').in('id', [guestId, payerId])
  const nameOf = (id: string) => ((ps ?? []) as Array<{ id: string; name: string }>).find(p => p.id === id)?.name ?? ''
  const { data, error } = await sb.rpc('wallet_apply', {
    p_team_id: teamId, p_player_id: payerId, p_kind: 'purchase', p_amount: -price,
    p_memo: `게스트비 · ${nameOf(guestId)} · ${gameDate}`, p_ref_type: 'guest_fee', p_ref_id: guestId, p_actor: actor,
  })
  if (error) {
    const m = walletMsg(error.message)
    return { ok: false, error: m ? `${nameOf(payerId)} 님 ${m} — 충전하거나 통장 입금으로 바꾼 뒤 배치해요` : error.message }
  }
  return { ok: true, ledgerId: (data as { id: string }).id, price, payerName: nameOf(payerId) }
}

async function refundGuestFee(sb: SB, teamId: string, gameDate: string, guestId: string, ledgerId: string, actor: string):
  Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: led } = await sb.from('wallet_ledger').select('league_player_id, amount').eq('id', ledgerId).maybeSingle()
  const l = led as { league_player_id: string; amount: number } | null
  if (!l || l.amount >= 0) return { ok: true }
  const { data: g } = await sb.from('league_players').select('name').eq('id', guestId).maybeSingle()
  const { error } = await sb.rpc('wallet_apply', {
    p_team_id: teamId, p_player_id: l.league_player_id, p_kind: 'refund', p_amount: -l.amount,
    p_memo: `게스트비 돌려받음 · ${(g as { name?: string } | null)?.name ?? ''} · ${gameDate}`, p_ref_type: 'guest_fee', p_ref_id: guestId, p_actor: actor,
  })
  return error ? { ok: false, error: walletMsg(error.message) ?? error.message } : { ok: true }
}

/** 게스트 신청 행을 지우기 전에 — 포인트로 낸 게스트비가 있으면 돌려준다. */
export async function releaseGuestFee(sb: SB, leagueId: string, gameDate: string, guestId: string, actor: string): Promise<{ ok: boolean; error?: string }> {
  const { data } = await sb.from('weekly_rsvp').select('guest_fee_ledger_id')
    .eq('league_id', leagueId).eq('game_date', gameDate).eq('league_player_id', guestId).maybeSingle()
  const ledgerId = (data as { guest_fee_ledger_id?: string | null } | null)?.guest_fee_ledger_id
  if (!ledgerId) return { ok: true }
  const res = await refundGuestFee(sb, await resolveTeamId(leagueId), gameDate, guestId, ledgerId, actor)
  return res.ok ? { ok: true } : { ok: false, error: res.error }
}
