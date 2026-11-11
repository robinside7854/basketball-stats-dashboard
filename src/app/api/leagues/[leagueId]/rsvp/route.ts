// 주간 참가신청 — 회원 (마이그레이션 124, 2026-11-09 운영진)
//   GET            → { enabled, window, capacity, me, entries, isAdmin, teams, unanswered? }
//                    window = 지금 열린 주(월 00:00 ~ 금 23:59 신청, 토 마감 결과) — 일요일은 null.
//                    어드민은 ?date=YYYY-MM-DD 로 다른 주도 본다.
//   POST { answer: 'yes'|'no' } → 내 참/불(신청 기간에만). 정규는 「참」이면 이번 달 팀으로 자동 배치, 「불」이면 자동 배치를 푼다.
//                                 배치된 뒤 「불」 = 배치 해제 + 쓴 비정규 티켓 자동 반환(2026-11-09 운영진).
//   POST { action:'guest', name, age, position, height_cm } → 게스트 신청(2026-11-09 운영진 — 게스트를 부르는 회원이 직접).
//                                 게스트 선수(is_guest)를 만들거나(같은 이름 게스트가 있으면 다시 씀) 「참」으로 넣고 대기명단에 둔다.
//                                 팀 배치는 어드민이 한다. 나이는 「올해 − 나이」년 1월 1일 생년월일로 저장(선수 표에 나이 칸이 없다).
//   DELETE ?guestId= → 내가 부른 게스트 신청 취소(신청 기간에만 · 기록은 지운다 — 게스트는 이번 주 신청이 전부다)
//   회원도 참·불 명단을 본다(팀 카드의 ✓ / ? / ✕). 미응답 전체 목록(대신 넣기용)은 어드민만.
//   캐시 없음(ISR Reads 0) — 홈 카드가 매번 최신을 본다.
import { NextResponse } from 'next/server'
import { loadPassSales } from '@/lib/wallet/passSales'
import { positionGroupOf } from '@/lib/league/positionGroup'
import { createClient } from '@/lib/supabase/admin'
import { resolveTeamId } from '@/lib/league/teamScope'
import { getApprovedSession } from '@/lib/auth/guard'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { currentWindow, loadRsvpRules, loadRsvpBoard, autoPlaceRegular, AUTO_LABEL, inviterLabel, isMyGuest, placeEntry, loadClosure, closeWeek, rosterLocked, SATURDAY_CLOSE_LABEL, loadGuestPool, reinviteGuest, releaseGuestFee, prebuyTicketOnYes, settleAtClose, type RsvpRules } from '@/lib/rsvp/weekly'
import { loadWalletConfig, loadBalance } from '@/lib/wallet/wallet'
import { computeQuarterStandings } from '@/lib/stats/quarterStandings'
import { loadIdentityResolver } from '@/lib/stats/teamIdentity'

type Ctx = { params: Promise<{ leagueId: string }> }
const NO_STORE = { headers: { 'Cache-Control': 'no-store' } }
const YMD = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  const sb = createClient()
  const rules = await loadRsvpRules(sb, leagueId)
  if (!rules) return NextResponse.json({ enabled: false }, NO_STORE)

  const [session, isAdmin] = await Promise.all([getApprovedSession(leagueId), canEditLeague(req, leagueId)])
  if (!session && !isAdmin) return NextResponse.json({ enabled: true, window: null, me: null }, NO_STORE)

  const asked = new URL(req.url).searchParams.get('date')
  const win = currentWindow(rules)
  const gameDate = isAdmin && asked && YMD.test(asked) ? asked : win?.gameDate
  if (!gameDate) return NextResponse.json({ enabled: true, window: null, capacity: rules.capacity, me: null, isAdmin }, NO_STORE)

  let closure = await loadClosure(sb, leagueId, gameDate)
  // 경기일(토)이 됐는데 아직 마감 기록이 없으면 여기서 마감한다(정규 자동 배치 · 일정 넣기 · 빈 경기 칸).
  //   비정규·게스트는 대기명단 — 어드민이 배치. 마감 표가 없으면(126 전) closeWeek 가 실패하고 옛 동작(배치만)과 같다.
  if (win?.phase === 'closed' && win.gameDate === gameDate && !closure) {
    await closeWeek(sb, leagueId, gameDate, SATURDAY_CLOSE_LABEL)
    closure = await loadClosure(sb, leagueId, gameDate)
  }
  let board = await loadRsvpBoard(sb, leagueId, gameDate)
  // 이 기능 전에 「참」을 눌러 둔 정규 — 열어 볼 때 이번 달 팀으로 맞춘다(본인 줄만).
  const pending = session && board.entries.find(e => e.player_id === session.pid && e.answer === 'yes' && e.kind === 'regular' && !e.placed_team_id && e.suggested_team_id)
  if (pending && win?.gameDate === gameDate) {
    const tid = await autoPlaceRegular(sb, leagueId, gameDate, session!.pid, board)
    // 바뀐 건 내 줄 하나뿐 — 다시 읽지 않고 그 줄만 고친다(2026-11-10)
    if (tid) board = { ...board, entries: board.entries.map(e => e.player_id === session!.pid ? { ...e, placed_team_id: tid, approved: true } : e) }
  }
  const mine = session ? board.entries.find(e => e.player_id === session.pid) ?? null : null
  let myGuestIds: string[] = []
  let myLabel: string | null = null
  let myNameForGuests = ''
  if (session) {
    const { data: meRow } = await sb.from('league_players').select('name').eq('id', session.pid).maybeSingle()
    const myName = (meRow as { name?: string } | null)?.name ?? ''
    myLabel = inviterLabel(myName)
    myNameForGuests = myName
    myGuestIds = board.entries.filter(e => e.kind === 'guest' && isMyGuest({ invited_by: e.invited_by, label: e.answered_by }, { pid: session.pid, name: myName })).map(e => e.player_id)
  }
  // 지난 게스트(한 번 배치된 사람) — 어드민은 전부, 회원은 내가 부른 사람만
  const pool = await loadGuestPool(sb, leagueId, gameDate)
  // 게스트비를 포인트로 낼 때 보여 줄 가격·내 잔액(127)
  const walletTeam = await resolveTeamId(leagueId)
  const walletCfg = await loadWalletConfig(walletTeam)
  const guestPrice = walletCfg?.rules.guest_price ?? null
  const myBalance = session && walletCfg ? await loadBalance(walletTeam, session.pid) : null
  // 포인트 부족 미리 안내(「입금만 하면 자동 충전」 + 계좌) · 경기 달 정규권 판매 상태(134) — 2026-11-10 운영진
  const [hookRes, passSales] = session && walletCfg
    ? await Promise.all([sb.from('wallet_bank_hooks').select('team_id').eq('team_id', walletTeam).maybeSingle(), loadPassSales(sb, walletTeam)])
    : [null, []]
  const gameMonth = `${gameDate.slice(0, 7)}-01`
  const sale = passSales.find(x => x.month === gameMonth) ?? null
  const guestPool = isAdmin ? pool : session ? pool.filter(g => isMyGuest({ invited_by: g.inviter_id, label: g.inviter_label }, { pid: session.pid, name: myNameForGuests })) : []
  // 내 구분·티켓은 답하기 전에도 보여야 한다(「비정규 티켓이 없어요」 안내)
  let meKind: string | null = mine?.kind ?? null
  let meTickets = mine?.tickets_left ?? 0
  if (session && !mine) {
    const probe = await loadRsvpBoardProbe(sb, leagueId, gameDate, session.pid)
    meKind = probe.kind; meTickets = probe.tickets
  }

  const locked = await rosterLocked(sb, leagueId, gameDate)
  // 단톡방 공유 카드용 분기 성적(?standings=1 — 참가 명단 화면만. 홈 카드는 읽지 않는다)
  const standings = new URL(req.url).searchParams.get('standings') === '1'
    ? await loadIdentityResolver(sb, leagueId).then(r => computeQuarterStandings(sb, leagueId, gameDate, r)).catch(() => null)
    : null
  const thisWeek = !!win && win.gameDate === gameDate
  // 어드민이 마감했으면 신청 기간 안이어도 「마감」 — 홈 카드가 사라지고 회원은 참/불을 못 바꾼다.
  const phase = thisWeek && win!.phase === 'open' && !closure ? 'open' : 'closed'

  return NextResponse.json({
    enabled: true,
    window: thisWeek ? { ...win!, phase } : { gameDate, opensAt: null, closesAt: null, phase: 'closed' },
    closure,
    locked,
    // 마감 취소는 신청 기간 안 · 기록 전에만(토요일 자동 마감은 되돌릴 수 없다)
    can_reopen: isAdmin && !!closure && !locked && thisWeek && win!.phase === 'open',
    capacity: rules.capacity,
    isAdmin,
    me: session ? {
      answer: mine?.answer ?? null, approved: mine?.approved ?? false, placed_team_id: mine?.placed_team_id ?? null, kind: meKind, tickets_left: meTickets,
      // 이번 달 팀이 정해진 사람(정규권 유무와 무관) — 「팀은 있는데 정규권이 없어요」 안내용
      my_guest_ids: myGuestIds,
      month_team_id: mine?.suggested_team_id ?? board.unanswered.find(u => u.player_id === session.pid)?.suggested_team_id ?? null,
    } : null,
    // 회원도 「불」까지 받는다 — 팀 카드에서 정규 멤버의 ✕(불참)를 보여 주려고(2026-11-09 운영진).
    entries: board.entries,
    teams: board.teams,
    standings: standings ? { label: standings.label, teams: standings.teams.map(t => ({ team_id: t.team_id, W: t.W, L: t.L, D: t.D, rank: t.rank })) } : null,
    unanswered: isAdmin ? board.unanswered : undefined,
    guest_pool: guestPool,
    guest_price: guestPrice,
    my_balance: myBalance,
    ticket_price: walletCfg?.rules.non_regular_price ?? null,
    wallet_bank: session ? walletCfg?.bank ?? null : null,
    auto_charge: !!hookRes?.data,
    pass_sale: sale ? { month: sale.month, state: sale.state, sold: sale.sold, capacity: sale.capacity, opens_at: sale.opens_at, closes_at: sale.closes_at } : null,
  }, NO_STORE)
}

// 아직 답하지 않은 회원의 구분·티켓 — 보드와 같은 규칙(정규권 · 게스트 · 남은 비정규 티켓)
async function loadRsvpBoardProbe(sb: ReturnType<typeof createClient>, leagueId: string, gameDate: string, pid: string) {
  const month = `${gameDate.slice(0, 7)}-01`
  const [p, pass, tk] = await Promise.all([
    sb.from('league_players').select('is_guest, team_id').eq('id', pid).maybeSingle(),
    sb.from('wallet_tickets').select('id').eq('league_player_id', pid).eq('kind', 'regular_pass').eq('month', month).in('status', ['active', 'used']).limit(1),
    sb.from('wallet_tickets').select('id').eq('league_player_id', pid).eq('kind', 'non_regular').eq('status', 'active'),
  ])
  const guest = !!(p.data as { is_guest?: boolean } | null)?.is_guest
  return { kind: guest ? 'guest' : (pass.data ?? []).length > 0 ? 'regular' : 'non_regular', tickets: (tk.data ?? []).length }
}

export async function POST(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  const session = await getApprovedSession(leagueId)
  if (!session) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
  const sb = createClient()
  const rules = await loadRsvpRules(sb, leagueId)
  if (!rules) return NextResponse.json({ error: '참가신청을 쓰지 않는 리그예요' }, { status: 404 })
  const win = await openWindow(sb, leagueId, rules)
  if (!win) return NextResponse.json({ error: '참가신청이 마감됐어요 — 바꾸려면 어드민에게 말해 주세요' }, { status: 409 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  if (body.action === 'guest') return addGuest(sb, leagueId, win.gameDate, session.pid, body)
  if (body.action === 'guest_again') {
    // 지난 게스트 다시 부르기 — 내가 처음 부른 게스트만(2026-11-09 운영진)
    const guestId = typeof body.guestId === 'string' ? body.guestId : ''
    const { data: meRow } = await sb.from('league_players').select('name').eq('id', session.pid).maybeSingle()
    const myName = (meRow as { name?: string } | null)?.name ?? ''
    const label = inviterLabel(myName)
    const g = (await loadGuestPool(sb, leagueId, win.gameDate)).find(x => x.player_id === guestId)
    if (!g) return NextResponse.json({ error: '다시 부를 수 있는 게스트가 아니에요' }, { status: 404 })
    if (!isMyGuest({ invited_by: g.inviter_id, label: g.inviter_label }, { pid: session.pid, name: myName })) return NextResponse.json({ error: '내가 부른 게스트만 다시 부를 수 있어요' }, { status: 403 })
    const pay = body.pay === 'points' ? 'points' as const : 'bank' as const
    const res = await reinviteGuest(sb, leagueId, win.gameDate, guestId, label, { method: pay, payerId: pay === 'points' ? session.pid : null }, session.pid)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 409 })
    return NextResponse.json({ ok: true }, { status: 201 })
  }

  if (body.answer !== 'yes' && body.answer !== 'no') return NextResponse.json({ error: '참 또는 불을 골라 주세요' }, { status: 400 })

  const { data: prev } = await sb.from('weekly_rsvp').select('placed_team_id, ticket_id, placed_by_label')
    .eq('league_id', leagueId).eq('game_date', win.gameDate).eq('league_player_id', session.pid).maybeSingle()
  const pr = prev as { placed_team_id: string | null; ticket_id: string | null; placed_by_label: string | null } | null
  // 배치된 뒤에도 본인이 「불」로 취소할 수 있다(2026-11-09 운영진) — 배치를 풀고, 쓴 비정규 티켓은 내 월렛에 티켓으로 되돌려 둔다(2026-11-10).
  let ticketReturned = false
  if (body.answer === 'no' && pr?.placed_team_id && (pr.ticket_id || pr.placed_by_label !== AUTO_LABEL)) {
    const un = await placeEntry(sb, leagueId, win.gameDate, session.pid, null, '본인 취소', { returnTicket: true })
    if (!un.ok) return NextResponse.json({ error: un.error }, { status: un.status })
    ticketReturned = !!pr.ticket_id
  }
  const { error } = await sb.from('weekly_rsvp').upsert({
    league_id: leagueId, game_date: win.gameDate, league_player_id: session.pid,
    answer: body.answer, answered_by_label: '본인', answered_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: 'league_id,game_date,league_player_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const placed = await autoPlaceRegular(sb, leagueId, win.gameDate, session.pid)
  // 그사이 어드민이 마감했으면(마감과 참/불이 같은 순간) 마감 정산을 한 번 더 돌린다 — 여러 번 돌려도 한 번만 빠진다(2026-11-10 리뷰)
  if (await loadClosure(sb, leagueId, win.gameDate)) await settleAtClose(sb, leagueId, win.gameDate, SATURDAY_CLOSE_LABEL)
  // 비정규 「참」 = 포인트가 있으면 티켓을 미리 한 장 사 둔다(배치 때 그 티켓이 쓰인다)
  const ticketBought = body.answer === 'yes' ? await prebuyTicketOnYes(sb, leagueId, win.gameDate, session.pid) : false
  return NextResponse.json({ ok: true, placed_team_id: placed, ticket_returned: ticketReturned, ticket_bought: ticketBought })
}

/** 회원이 참/불·게스트를 바꿀 수 있는 창 — 신청 기간 안이고 어드민이 마감하지 않았을 때만. */
async function openWindow(sb: ReturnType<typeof createClient>, leagueId: string, rules: RsvpRules) {
  const win = currentWindow(rules)
  if (!win || win.phase !== 'open') return null
  if (await loadClosure(sb, leagueId, win.gameDate)) return null
  return win
}


async function addGuest(sb: ReturnType<typeof createClient>, leagueId: string, gameDate: string, inviterId: string, body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ').slice(0, 30) : ''
  const age = Number(body.age)
  const height = body.height_cm == null || body.height_cm === '' ? null : Number(body.height_cm)
  const pos = (Array.isArray(body.position) ? body.position : String(body.position ?? '').split(','))
    .map(p => positionGroupOf(String(p))).filter((p): p is NonNullable<typeof p> => !!p)   // 가드·포워드·센터 → G·F·C(옛 5코드도 묶어 받는다)
  if (!name) return NextResponse.json({ error: '게스트 이름을 적어 주세요' }, { status: 400 })
  if (!Number.isInteger(age) || age < 10 || age > 80) return NextResponse.json({ error: '나이를 숫자로 적어 주세요 (10~80)' }, { status: 400 })
  if (height != null && (!Number.isInteger(height) || height < 140 || height > 230)) return NextResponse.json({ error: '키는 cm 숫자로 적어 주세요 (140~230)' }, { status: 400 })
  if (pos.length === 0) return NextResponse.json({ error: '포지션을 하나 이상 골라 주세요' }, { status: 400 })

  const teamId = await resolveTeamId(leagueId)
  const year = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).slice(0, 4))
  const fields = { position: [...new Set(pos)].join(','), height_cm: height, birth_date: `${year - age}-01-01` }
  const [{ data: inviter }, { data: same }] = await Promise.all([
    sb.from('league_players').select('name').eq('id', inviterId).maybeSingle(),
    sb.from('league_players').select('id, is_guest').eq('team_id', teamId).eq('name', name).limit(1),
  ])
  const existing = (same ?? [])[0] as { id: string; is_guest: boolean } | undefined
  if (existing && !existing.is_guest) return NextResponse.json({ error: '같은 이름의 회원이 있어요 — 이름 뒤에 표시를 붙여 주세요(예: 홍길동G)' }, { status: 409 })

  // 이번 주에 이미 신청된 게스트면 정보를 고치기 전에 거절한다(2026-11-10 리뷰 — 종전엔 나이·키를 덮어쓴 뒤 409 를 냈다)
  if (existing) {
    const { data: already } = await sb.from('weekly_rsvp').select('answer')
      .eq('league_id', leagueId).eq('game_date', gameDate).eq('league_player_id', existing.id).maybeSingle()
    if ((already as { answer?: string } | null)?.answer === 'yes') return NextResponse.json({ error: '이 게스트는 이번 주에 이미 신청돼 있어요' }, { status: 409 })
  }
  let guestId = existing?.id
  if (guestId) {
    const { error } = await sb.from('league_players').update({ ...fields, is_active: true }).eq('id', guestId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { data, error } = await sb.from('league_players')
      .insert({ league_id: leagueId, team_id: teamId, name, is_guest: true, ...fields }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    guestId = (data as { id: string }).id
  }
  const { data: prev } = await sb.from('weekly_rsvp').select('id, answer')
    .eq('league_id', leagueId).eq('game_date', gameDate).eq('league_player_id', guestId).maybeSingle()
  const now = new Date().toISOString()
  const label = inviterLabel((inviter as { name?: string } | null)?.name ?? '회원')
  // 게스트비 — 통장 입금 / 내 포인트(배치될 때 빠짐, 127)
  const pay: 'bank' | 'points' = body.pay === 'points' ? 'points' : 'bank'
  const payer = pay === 'points' ? inviterId : null
  const pr = prev as { id: string; answer: string } | null
  if (pr?.answer === 'yes') return NextResponse.json({ error: '이 게스트는 이번 주에 이미 신청돼 있어요' }, { status: 409 })
  // 이번 주 기록이 「불」로 남아 있으면(취소가 삭제로 바뀌기 전에 취소한 것 등) 그 줄을 다시 「참」으로 살린다 — 2026-11-09 신고
  const { error } = pr
    ? await sb.from('weekly_rsvp').update({
        answer: 'yes', placed_team_id: null, ticket_id: null, guest_paid: false, guest_pay: pay, guest_payer_id: payer, guest_fee_ledger_id: null,
        answered_by_label: label, invited_by_player_id: inviterId, answered_at: now, updated_at: now,
      }).eq('id', pr.id)
    : await sb.from('weekly_rsvp').insert({
        league_id: leagueId, game_date: gameDate, league_player_id: guestId, answer: 'yes', guest_pay: pay, guest_payer_id: payer,
        answered_by_label: label, invited_by_player_id: inviterId, answered_at: now, updated_at: now,
      })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, guest_id: guestId }, { status: 201 })
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  const session = await getApprovedSession(leagueId)
  if (!session) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
  const guestId = new URL(req.url).searchParams.get('guestId')
  if (!guestId) return NextResponse.json({ error: 'guestId 필수' }, { status: 400 })
  const sb = createClient()
  const rules = await loadRsvpRules(sb, leagueId)
  const win = rules ? await openWindow(sb, leagueId, rules) : null
  if (!win) return NextResponse.json({ error: '신청이 마감돼 어드민에게 말해 주세요' }, { status: 409 })
  const [{ data: me }, { data: row }] = await Promise.all([
    sb.from('league_players').select('name').eq('id', session.pid).maybeSingle(),
    sb.from('weekly_rsvp').select('id, answered_by_label, invited_by_player_id, ticket_id, league_players!inner(is_guest)')
      .eq('league_id', leagueId).eq('game_date', win.gameDate).eq('league_player_id', guestId).maybeSingle(),
  ])
  const r = row as unknown as { id: string; answered_by_label: string | null; invited_by_player_id?: string | null; ticket_id: string | null; league_players: { is_guest: boolean } } | null
  if (!r || !r.league_players?.is_guest) return NextResponse.json({ error: '게스트 신청을 찾을 수 없어요' }, { status: 404 })
  if (!isMyGuest({ invited_by: r.invited_by_player_id, label: r.answered_by_label }, { pid: session.pid, name: (me as { name?: string } | null)?.name ?? '' })) {
    return NextResponse.json({ error: '내가 부른 게스트만 취소할 수 있어요' }, { status: 403 })
  }
  const rel = await releaseGuestFee(sb, leagueId, win.gameDate, guestId, '본인 취소')
  if (!rel.ok) return NextResponse.json({ error: rel.error }, { status: 409 })
  const { error } = await sb.from('weekly_rsvp').delete().eq('id', r.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
