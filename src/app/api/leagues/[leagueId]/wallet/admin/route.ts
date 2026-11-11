// 미라클 월렛 — 팀 어드민(누구나) · CEO (마이그레이션 122, 2026-11-09 운영진 「충전 승인은 어드민 누구나」)
//   GET                     → { pending, recent, members: [{ player_id, name, balance }], total }
//   GET ?playerId=          → 그 회원의 장부 · 티켓 · 환불 가능 금액
//   GET ?count=1            → { pending: N } — 상단 톱니바퀴 빨간 배지용(가볍게 개수만)
//   GET ?history=YYYY-MM    → { rows } — 그 달(KST)에 처리된 충전·환불 요청 전부(이름 포함) · 어드민 「처리 내역」 월별 보기(2026-11-10)
//   GET ?bank=1             → { connected, created_at, last_used_at, events } — 카카오뱅크 자동 승인 연결 상태 · 최근 알림 20건(128)
//   POST { action:'bank_token' | 'bank_disconnect' }       — 연결 비밀번호 새로 만들기(원문은 이때 한 번만) · 끊기
//   GET ?passes=1           → { months: PassMonth[] } — 어드민 홈 「정규권 안 산 사람」 알림(이번 달 · 20일부터 다음 달)
//   GET ?home=1             → { months, sales, unmatched, stale } — 어드민 홈 알림 한 번에(정규권 · 판매 · 입금 매칭 불가 · 입금 알림 끊김)
//   GET ?sales=1            → { sales: [...판매, buyers] } — 정규권 판매(134) 칸
//   POST { action:'pass_sale', month, opens_at, closes_at, capacity }  — 정규권 판매 열기·고치기
//   POST { action:'pass_sale_close', month }                         — 지금 마감
//   POST { action:'bank_resolve', eventId, playerId? }  — 「짝 없음」 입금: playerId 면 그 사람에게 충전 · 없으면 「확인했어요」(알림에서 뺌)
//   POST { action:'review', requestId, decision:'approve'|'reject', note? }  — 충전이면 승인(+보너스), 환불이면 「송금했어요」
//   POST { action:'use_ticket', playerId, date, note? }      — 비정규 티켓 한 장 사용 처리(참가신청 전까지는 손으로)
//   POST { action:'return_ticket', ticketId, note }           — 티켓 돌려주기(포인트 환불 · 기록은 남는다)
//   POST { action:'adjust', playerId, amount(±), memo }   — 보정. 이유(memo) 필수, 장부에 남는다.
//   POST { action:'mimo_preview'|'mimo_apply', text }      — 미모바스켓 잔액 옮기기(붙여 넣은 「이름, 잔액, 비정규 티켓」) — CEO·어드민
//   누가 처리했는지(actor_label)는 감사 로그와 같은 판정(resolveAuditActor)으로 장부·요청에 남긴다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { resolveTeamId } from '@/lib/league/teamScope'
import { logAudit, resolveAuditActor } from '@/lib/audit'
import {
  loadWalletConfig, loadLedger, loadTickets, loadRefundable, walletErrorMessage, REQUEST_COLS, type ChargeRequestRow,
} from '@/lib/wallet/wallet'
import { parseMimoText, previewMimo, applyMimo } from '@/lib/wallet/mimoImport'
import { loadPassStatus } from '@/lib/wallet/passStatus'
import { hashToken, newToken, parseSenderName, type BankEvent } from '@/lib/wallet/bankAuto'
import { loadPassSales, loadPassBuyers } from '@/lib/wallet/passSales'

/** 충전 요청이 이만큼 기다리는데 그 뒤로 입금 알림이 하나도 없으면 「폰을 확인해 주세요」 */
const STALE_HOURS = 2

type Ctx = { params: Promise<{ leagueId: string }> }
const NO_STORE = { headers: { 'Cache-Control': 'no-store' } }

export async function GET(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  if (!(await canEditLeague(req, leagueId))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const teamId = await resolveTeamId(leagueId)
  if (!(await loadWalletConfig(teamId))) return NextResponse.json({ error: '월렛이 꺼져 있어요' }, { status: 404 })
  const sb = createClient()
  const sp = new URL(req.url).searchParams

  if (sp.get('count')) {
    const { count, error } = await sb.from('wallet_charge_requests')
      .select('id', { count: 'exact', head: true }).eq('team_id', teamId).eq('status', 'pending')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ pending: count ?? 0 }, NO_STORE)
  }

  const histMonth = sp.get('history')
  if (histMonth) {
    if (!/^\d{4}-\d{2}$/.test(histMonth)) return NextResponse.json({ error: 'history 는 YYYY-MM' }, { status: 400 })
    const [y, m] = histMonth.split('-').map(Number)
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
    const [rq, ps] = await Promise.all([
      sb.from('wallet_charge_requests').select(REQUEST_COLS).eq('team_id', teamId).neq('status', 'pending')
        .gte('reviewed_at', `${histMonth}-01T00:00:00+09:00`).lt('reviewed_at', `${next}-01T00:00:00+09:00`)
        .order('reviewed_at', { ascending: false }).limit(1000),
      sb.from('league_players').select('id, name').eq('team_id', teamId),
    ])
    if (rq.error) return NextResponse.json({ error: rq.error.message }, { status: 500 })
    const nm = new Map((ps.data ?? []).map(p => [p.id as string, p.name as string]))
    const rows = ((rq.data ?? []) as ChargeRequestRow[]).map(r => ({ ...r, name: nm.get(r.league_player_id) ?? '알 수 없음' }))
    return NextResponse.json({ rows }, NO_STORE)
  }

  if (sp.get('bank')) {
    const [hookRes, evRes] = await Promise.all([
      sb.from('wallet_bank_hooks').select('created_at, created_by, last_used_at').eq('team_id', teamId).maybeSingle(),
      sb.from('wallet_bank_events').select('id, raw_text, amount, status, request_id, note, created_at, resolved_at').eq('team_id', teamId)
        .order('created_at', { ascending: false }).limit(20),
    ])
    if (hookRes.error && /does not exist|schema cache/i.test(hookRes.error.message)) return NextResponse.json({ ready: false }, NO_STORE)
    const events = (evRes.data ?? []) as BankEvent[]
    const reqIds = events.map(e => e.request_id).filter(Boolean) as string[]
    const names = new Map<string, string>()
    if (reqIds.length) {
      const { data: rq } = await sb.from('wallet_charge_requests').select('id, league_player_id').in('id', reqIds)
      const pids = (rq ?? []).map(r => r.league_player_id as string)
      const { data: ps } = pids.length ? await sb.from('league_players').select('id, name').in('id', pids) : { data: [] }
      const pn = new Map((ps ?? []).map(p => [p.id as string, p.name as string]))
      for (const r of rq ?? []) names.set(r.id as string, pn.get(r.league_player_id as string) ?? '')
    }
    const hook = hookRes.data as { created_at: string; created_by: string | null; last_used_at: string | null } | null
    return NextResponse.json({
      ready: true, connected: !!hook, created_at: hook?.created_at ?? null, created_by: hook?.created_by ?? null,
      last_used_at: hook?.last_used_at ?? null,
      events: events.map(e => ({ ...e, name: e.request_id ? names.get(e.request_id) ?? null : null })),
    }, NO_STORE)
  }

  if (sp.get('home')) {
    const since = new Date(Date.now() - 60 * 86400_000).toISOString()
    const [months, sales, unRes, hookRes, oldestRes, lastEvRes] = await Promise.all([
      loadPassStatus(sb, leagueId, teamId),
      loadPassSales(sb, teamId),
      sb.from('wallet_bank_events').select('id', { count: 'exact', head: true }).eq('team_id', teamId)
        .in('status', ['unmatched', 'ambiguous']).not('amount', 'is', null).is('resolved_at', null).gte('created_at', since),
      sb.from('wallet_bank_hooks').select('team_id').eq('team_id', teamId).maybeSingle(),
      sb.from('wallet_charge_requests').select('created_at').eq('team_id', teamId).eq('kind', 'charge').eq('status', 'pending')
        .order('created_at').limit(1).maybeSingle(),
      sb.from('wallet_bank_events').select('created_at').eq('team_id', teamId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    // 입금 알림 끊김: 연결돼 있고 · 충전 요청이 2시간 넘게 기다리는데 · 그 요청 뒤로 받은 알림이 없다
    let stale: { hours: number } | null = null
    const oldest = (oldestRes.data as { created_at: string } | null)?.created_at
    const lastEv = (lastEvRes.data as { created_at: string } | null)?.created_at
    if (hookRes.data && oldest) {
      const waited = (Date.now() - Date.parse(oldest)) / 3600_000
      if (waited >= STALE_HOURS && (!lastEv || Date.parse(lastEv) < Date.parse(oldest))) {
        stale = { hours: Math.floor(lastEv ? (Date.now() - Date.parse(lastEv)) / 3600_000 : waited) }
      }
    }
    return NextResponse.json({ months, sales, unmatched: unRes.error ? 0 : unRes.count ?? 0, stale }, NO_STORE)
  }

  if (sp.get('sales')) {
    const sales = await loadPassSales(sb, teamId)
    const withBuyers = await Promise.all(sales.map(async x => ({ ...x, buyers: await loadPassBuyers(sb, leagueId, teamId, x.month) })))
    return NextResponse.json({ sales: withBuyers }, NO_STORE)
  }

  if (sp.get('passes')) {
    return NextResponse.json({ months: await loadPassStatus(sb, leagueId, teamId) }, NO_STORE)
  }

  const playerId = sp.get('playerId')
  if (playerId) {
    const [ledger, tickets, refundable] = await Promise.all([
      loadLedger(teamId, playerId), loadTickets(teamId, playerId), loadRefundable(teamId, playerId),
    ])
    return NextResponse.json({ ledger, tickets, refundable }, NO_STORE)
  }

  const thisMonth = `${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7)}-01`
  const [pendingRes, recentRes, playersRes, balRes, ticketRes, cfg] = await Promise.all([
    sb.from('wallet_charge_requests').select(REQUEST_COLS).eq('team_id', teamId).eq('status', 'pending')
      .order('created_at', { ascending: true }),
    sb.from('wallet_charge_requests').select(REQUEST_COLS).eq('team_id', teamId).neq('status', 'pending')
      .order('reviewed_at', { ascending: false }).limit(30),
    // 선수는 팀 소유 — league_id 로 찾으면 대회 묶음에서 0명(CLAUDE.md)
    sb.from('league_players').select('id, name, is_guest, is_active').eq('team_id', teamId),
    sb.from('wallet_balances').select('league_player_id, balance').eq('team_id', teamId),
    // 회원별 잔액 칸에 「남은 비정규 티켓 · 이번 달 정규권」(2026-11-11 운영진)
    sb.from('wallet_tickets').select('league_player_id, kind, month, status').eq('team_id', teamId)
      .or(`and(kind.eq.non_regular,status.eq.active),and(kind.eq.regular_pass,month.eq.${thisMonth},status.neq.returned)`),
    loadWalletConfig(teamId),
  ])
  const err = pendingRes.error ?? recentRes.error ?? playersRes.error ?? balRes.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })

  const players = (playersRes.data ?? []) as Array<{ id: string; name: string; is_guest: boolean | null; is_active: boolean | null }>
  const nameOf = new Map(players.map(p => [p.id, p.name]))
  const balOf = new Map(((balRes.data ?? []) as Array<{ league_player_id: string; balance: number }>).map(b => [b.league_player_id, b.balance]))
  const ticketsOf = new Map<string, number>()
  const passOf = new Set<string>()
  for (const t of (ticketRes.data ?? []) as Array<{ league_player_id: string; kind: string }>) {
    if (t.kind === 'regular_pass') passOf.add(t.league_player_id)
    else ticketsOf.set(t.league_player_id, (ticketsOf.get(t.league_player_id) ?? 0) + 1)
  }
  const withName = (r: ChargeRequestRow) => ({ ...r, name: nameOf.get(r.league_player_id) ?? '알 수 없음' })

  // 게스트는 포인트 계정이 없다(운영진 — 게스트비는 통장으로 따로) → 잔액이 있을 때만 보인다.
  const members = players
    .filter(p => balOf.has(p.id) || (!p.is_guest && p.is_active !== false))
    .map(p => ({ player_id: p.id, name: p.name, balance: balOf.get(p.id) ?? 0, tickets: ticketsOf.get(p.id) ?? 0, pass: passOf.has(p.id) }))
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, 'ko'))

  return NextResponse.json({
    pending: ((pendingRes.data ?? []) as ChargeRequestRow[]).map(withName),
    recent: ((recentRes.data ?? []) as ChargeRequestRow[]).map(withName),
    members,
    total: members.reduce((s, m) => s + m.balance, 0),
    // 「부족」 기준 = 비정규 한 번 값
    ticket_price: cfg?.rules.non_regular_price ?? null,
  }, NO_STORE)
}

export async function POST(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  if (!(await canEditLeague(req, leagueId))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const teamId = await resolveTeamId(leagueId)
  if (!(await loadWalletConfig(teamId))) return NextResponse.json({ error: '월렛이 꺼져 있어요' }, { status: 404 })
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const actor = (await resolveAuditActor(req, { leagueId })).label
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) || null : null
  const sb = createClient()

  const fail = (error: { message: string }) => {
    const msg = walletErrorMessage(error.message)
    return NextResponse.json({ error: msg ?? error.message }, { status: msg ? 409 : 500 })
  }

  if (body.action === 'bank_token') {
    const token = newToken()
    const { error } = await sb.from('wallet_bank_hooks').upsert({
      team_id: teamId, token_hash: hashToken(token), created_at: new Date().toISOString(), created_by: actor, last_used_at: null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit({ req, action: 'wallet.bank.connect', targetTable: 'wallet_bank_hooks', leagueId, teamId })
    return NextResponse.json({ token, url: `${new URL(req.url).origin}/api/leagues/${leagueId}/wallet/bank-notify` })
  }
  if (body.action === 'bank_disconnect') {
    const { error } = await sb.from('wallet_bank_hooks').delete().eq('team_id', teamId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit({ req, action: 'wallet.bank.disconnect', targetTable: 'wallet_bank_hooks', leagueId, teamId })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'pass_sale') {
    const month = typeof body.month === 'string' && /^\d{4}-\d{2}-01$/.test(body.month) ? body.month : null
    const opens = typeof body.opens_at === 'string' ? Date.parse(body.opens_at) : NaN
    const closes = typeof body.closes_at === 'string' ? Date.parse(body.closes_at) : NaN
    const capacity = Number(body.capacity)
    if (!month || !Number.isFinite(opens) || !Number.isFinite(closes)) return NextResponse.json({ error: '달 · 여는 때 · 닫는 때를 확인해 주세요' }, { status: 400 })
    if (closes <= opens) return NextResponse.json({ error: '닫는 때가 여는 때보다 뒤여야 해요' }, { status: 400 })
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200) return NextResponse.json({ error: '정원은 1~200명' }, { status: 400 })
    const { error } = await sb.from('wallet_pass_sales').upsert({
      team_id: teamId, month, opens_at: new Date(opens).toISOString(), closes_at: new Date(closes).toISOString(),
      capacity, closed_early_at: null, opened_by_label: actor, updated_at: new Date().toISOString(),
    }, { onConflict: 'team_id,month' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit({ req, action: 'wallet.pass_sale.open', targetTable: 'wallet_pass_sales', leagueId, teamId, detail: { month, capacity } })
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'pass_sale_close') {
    const month = typeof body.month === 'string' && /^\d{4}-\d{2}-01$/.test(body.month) ? body.month : null
    if (!month) return NextResponse.json({ error: 'month 필수' }, { status: 400 })
    const { error } = await sb.from('wallet_pass_sales').update({ closed_early_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('team_id', teamId).eq('month', month)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit({ req, action: 'wallet.pass_sale.close', targetTable: 'wallet_pass_sales', leagueId, teamId, detail: { month } })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'bank_resolve') {
    if (typeof body.eventId !== 'string') return NextResponse.json({ error: 'eventId 필수' }, { status: 400 })
    const { data: ev } = await sb.from('wallet_bank_events').select('id, raw_text, amount, status, resolved_at')
      .eq('id', body.eventId).eq('team_id', teamId).maybeSingle()
    const e = ev as { id: string; raw_text: string; amount: number | null; status: string; resolved_at: string | null } | null
    if (!e) return NextResponse.json({ error: '알림을 찾을 수 없어요' }, { status: 404 })
    if (e.resolved_at || !['unmatched', 'ambiguous'].includes(e.status)) return NextResponse.json({ error: '이미 처리된 입금이에요' }, { status: 409 })
    if (typeof body.playerId === 'string') {
      if (!e.amount) return NextResponse.json({ error: '금액을 읽지 못한 알림이에요' }, { status: 400 })
      const { data: p } = await sb.from('league_players').select('id, name').eq('id', body.playerId).eq('team_id', teamId).maybeSingle()
      if (!p) return NextResponse.json({ error: '이 팀 회원이 아니에요' }, { status: 404 })
      const name = (p as { name: string }).name
      const { data: rq, error: e1 } = await sb.from('wallet_charge_requests').insert({
        team_id: teamId, league_player_id: body.playerId, kind: 'charge', amount: e.amount,
        depositor_name: parseSenderName(e.raw_text) ?? name,
      }).select('id').single()
      if (e1) return NextResponse.json({ error: e1.code === '23505' ? `${name} 님 앞으로 기다리는 요청이 있어요 — 그 요청을 먼저 처리해 주세요` : e1.message }, { status: e1.code === '23505' ? 409 : 500 })
      const reqId = (rq as { id: string }).id
      const { error: e2 } = await sb.rpc('wallet_review_charge', {
        p_team_id: teamId, p_request_id: reqId, p_action: 'approve', p_note: '입금 알림 손으로 짝지음', p_actor: actor,
      })
      if (e2) { await sb.from('wallet_charge_requests').delete().eq('id', reqId).eq('status', 'pending'); return fail(e2) }
      await sb.from('wallet_bank_events').update({
        status: 'charged', request_id: reqId, note: `${name} 님 충전 (${actor})`, resolved_at: new Date().toISOString(), resolved_by_label: actor,
      }).eq('id', e.id)
      await logAudit({ req, action: 'wallet.bank.resolve', targetTable: 'wallet_bank_events', targetId: e.id, leagueId, teamId, detail: { player: body.playerId, amount: e.amount } })
      return NextResponse.json({ ok: true, name })
    }
    await sb.from('wallet_bank_events').update({ resolved_at: new Date().toISOString(), resolved_by_label: actor, note: `확인함 (${actor})` }).eq('id', e.id)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'review') {
    const decision = body.decision
    if (typeof body.requestId !== 'string' || (decision !== 'approve' && decision !== 'reject')) {
      return NextResponse.json({ error: 'requestId · decision 필수' }, { status: 400 })
    }
    const { data: found } = await sb.from('wallet_charge_requests').select('kind').eq('id', body.requestId).eq('team_id', teamId).maybeSingle()
    if (!found) return NextResponse.json({ error: '요청을 찾을 수 없어요' }, { status: 404 })
    const isRefund = (found as { kind: string }).kind === 'refund'
    const { data, error } = await sb.rpc(isRefund ? 'wallet_review_refund' : 'wallet_review_charge', {
      p_team_id: teamId, p_request_id: body.requestId, p_action: decision, p_note: note, p_actor: actor,
    })
    if (error) return fail(error)
    const row = data as ChargeRequestRow
    await logAudit({
      req,
      action: isRefund
        ? (decision === 'approve' ? 'wallet.refund.approve' : 'wallet.refund.reject')
        : (decision === 'approve' ? 'wallet.charge.approve' : 'wallet.charge.reject'),
      targetTable: 'wallet_charge_requests', targetId: row.id, leagueId, teamId,
      detail: { amount: row.amount, player: row.league_player_id },
    })
    return NextResponse.json(row)
  }

  if (body.action === 'use_ticket') {
    const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null
    if (typeof body.playerId !== 'string' || !date) return NextResponse.json({ error: '회원 · 날짜를 확인해 주세요' }, { status: 400 })
    const { data, error } = await sb.rpc('wallet_use_ticket', {
      p_team_id: teamId, p_player_id: body.playerId, p_date: date, p_note: note, p_actor: actor,
    })
    if (error) return fail(error)
    await logAudit({ req, action: 'wallet.ticket.use', targetTable: 'wallet_tickets', targetId: (data as { id: string }).id, leagueId, teamId, detail: { date } })
    return NextResponse.json(data)
  }

  if (body.action === 'return_ticket') {
    if (typeof body.ticketId !== 'string') return NextResponse.json({ error: 'ticketId 필수' }, { status: 400 })
    if (!note) return NextResponse.json({ error: '돌려주는 이유를 적어 주세요 — 기록에 남아요' }, { status: 400 })
    const { data, error } = await sb.rpc('wallet_return_ticket', {
      p_team_id: teamId, p_ticket_id: body.ticketId, p_note: note, p_actor: actor,
    })
    if (error) return fail(error)
    await logAudit({ req, action: 'wallet.ticket.return', targetTable: 'wallet_tickets', targetId: body.ticketId, leagueId, teamId })
    return NextResponse.json(data)
  }

  if (body.action === 'adjust') {
    const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount)
    const memo = typeof body.memo === 'string' ? body.memo.trim().slice(0, 200) : ''
    if (typeof body.playerId !== 'string' || !Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) {
      return NextResponse.json({ error: '회원 · 금액(0 아닌 정수)을 확인해 주세요' }, { status: 400 })
    }
    if (!memo) return NextResponse.json({ error: '보정 이유를 적어 주세요 — 회원도 내역에서 봅니다' }, { status: 400 })
    // 다른 팀 선수에게 쓰지 못하게 팀 소속을 확인한다.
    const { data: p } = await sb.from('league_players').select('id').eq('id', body.playerId).eq('team_id', teamId).maybeSingle()
    if (!p) return NextResponse.json({ error: '이 팀 회원이 아니에요' }, { status: 404 })
    const { data, error } = await sb.rpc('wallet_apply', {
      p_team_id: teamId, p_player_id: body.playerId, p_kind: 'adjust', p_amount: amount,
      p_memo: memo, p_ref_type: null, p_ref_id: null, p_actor: actor,
    })
    if (error) return fail(error)
    await logAudit({
      req, action: 'wallet.adjust', targetTable: 'wallet_ledger',
      targetId: (data as { id: string }).id, leagueId, teamId, detail: { amount, player: body.playerId },
    })
    return NextResponse.json(data)
  }

  if (body.action === 'mimo_preview' || body.action === 'mimo_apply') {
    const rows = parseMimoText(typeof body.text === 'string' ? body.text.slice(0, 200_000) : '')
    if (rows.length === 0) return NextResponse.json({ error: '「이름, 잔액, 비정규 티켓」 줄을 붙여 넣어 주세요' }, { status: 400 })
    if (body.action === 'mimo_preview') return NextResponse.json({ rows: await previewMimo(sb, teamId, rows) })
    const res = await applyMimo(sb, teamId, rows, actor)
    await logAudit({ req, action: 'wallet.import', targetTable: 'wallet_ledger', targetId: null, leagueId, teamId, detail: res })
    return NextResponse.json({ ...res, rows: await previewMimo(sb, teamId, rows) })
  }

  return NextResponse.json({ error: 'action 은 review · adjust · use_ticket · return_ticket · mimo_preview · mimo_apply' }, { status: 400 })
}
