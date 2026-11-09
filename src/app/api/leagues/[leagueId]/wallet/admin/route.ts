// 미라클 월렛 — 팀 어드민(누구나) · CEO (마이그레이션 122, 2026-11-09 운영진 「충전 승인은 어드민 누구나」)
//   GET                     → { pending, recent, members: [{ player_id, name, balance }], total }
//   GET ?playerId=          → 그 회원의 장부 · 티켓 · 환불 가능 금액
//   GET ?count=1            → { pending: N } — 상단 톱니바퀴 빨간 배지용(가볍게 개수만)
//   GET ?passes=1           → { months: PassMonth[] } — 어드민 홈 「정규권 안 산 사람」 알림(이번 달 · 20일부터 다음 달)
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

  const [pendingRes, recentRes, playersRes, balRes] = await Promise.all([
    sb.from('wallet_charge_requests').select(REQUEST_COLS).eq('team_id', teamId).eq('status', 'pending')
      .order('created_at', { ascending: true }),
    sb.from('wallet_charge_requests').select(REQUEST_COLS).eq('team_id', teamId).neq('status', 'pending')
      .order('reviewed_at', { ascending: false }).limit(30),
    // 선수는 팀 소유 — league_id 로 찾으면 대회 묶음에서 0명(CLAUDE.md)
    sb.from('league_players').select('id, name, is_guest, is_active').eq('team_id', teamId),
    sb.from('wallet_balances').select('league_player_id, balance').eq('team_id', teamId),
  ])
  const err = pendingRes.error ?? recentRes.error ?? playersRes.error ?? balRes.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })

  const players = (playersRes.data ?? []) as Array<{ id: string; name: string; is_guest: boolean | null; is_active: boolean | null }>
  const nameOf = new Map(players.map(p => [p.id, p.name]))
  const balOf = new Map(((balRes.data ?? []) as Array<{ league_player_id: string; balance: number }>).map(b => [b.league_player_id, b.balance]))
  const withName = (r: ChargeRequestRow) => ({ ...r, name: nameOf.get(r.league_player_id) ?? '알 수 없음' })

  // 게스트는 포인트 계정이 없다(운영진 — 게스트비는 통장으로 따로) → 잔액이 있을 때만 보인다.
  const members = players
    .filter(p => balOf.has(p.id) || (!p.is_guest && p.is_active !== false))
    .map(p => ({ player_id: p.id, name: p.name, balance: balOf.get(p.id) ?? 0 }))
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, 'ko'))

  return NextResponse.json({
    pending: ((pendingRes.data ?? []) as ChargeRequestRow[]).map(withName),
    recent: ((recentRes.data ?? []) as ChargeRequestRow[]).map(withName),
    members,
    total: members.reduce((s, m) => s + m.balance, 0),
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
