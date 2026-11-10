// 미라클 월렛 — 회원 본인 (마이그레이션 122·123, 2026-11-09)
//   GET  → { enabled, name, bank, rules, months, me: { balance, refundable, ledger, requests, tickets } | null }
//   POST { action:'charge', amount, depositor_name }          → 충전 요청(5만원↑ 보너스는 승인 때 DB 가 붙인다)
//   POST { action:'refund', holder, account }                  → 환불 요청(금액은 서버가 계산 — 입금액 − 사용액)
//   POST { action:'buy', kind:'regular_pass'|'non_regular', month?, qty? } → 티켓 사기(가격은 DB 가 팀 규칙에서 읽는다)
//   DELETE ?requestId=  → 내 대기 중 요청 취소
//   본인 것만 본다. 캐시 없음(돈이라 늘 최신 · ISR Reads 0).
import { NextResponse } from 'next/server'
import { matchLateRequest, alreadyChargedByDeposit } from '@/lib/wallet/bankAuto'
import { hasReservedDepositor } from '@/lib/wallet/depositorName'
import { createClient } from '@/lib/supabase/admin'
import { getApprovedSession } from '@/lib/auth/guard'
import { resolveTeamId } from '@/lib/league/teamScope'
import {
  loadWalletConfig, loadBalance, loadLedger, loadTickets, loadRefundable, buyableMonths,
  parseAmount, walletErrorMessage, MAX_CHARGE, REQUEST_COLS, type ChargeRequestRow,
} from '@/lib/wallet/wallet'

type Ctx = { params: Promise<{ leagueId: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { leagueId } = await params
  const teamId = await resolveTeamId(leagueId)
  const config = await loadWalletConfig(teamId)
  if (!config) return NextResponse.json({ enabled: false })

  const session = await getApprovedSession(leagueId)
  if (!session) return NextResponse.json({ enabled: true, name: config.name, bank: null, me: null })

  const sb = createClient()
  const [balance, ledger, tickets, refundable, reqRes, hookRes] = await Promise.all([
    loadBalance(teamId, session.pid),
    loadLedger(teamId, session.pid),
    loadTickets(teamId, session.pid),
    loadRefundable(teamId, session.pid),
    sb.from('wallet_charge_requests').select(REQUEST_COLS)
      .eq('team_id', teamId).eq('league_player_id', session.pid)
      .order('created_at', { ascending: false }).limit(50),
    // 카카오뱅크 입금 알림이 연결돼 있으면 「입금만 하면 자동 충전」 화면(2026-11-10 운영진)
    sb.from('wallet_bank_hooks').select('team_id').eq('team_id', teamId).maybeSingle(),
  ])
  if (reqRes.error) return NextResponse.json({ error: reqRes.error.message }, { status: 500 })
  return NextResponse.json({
    enabled: true, name: config.name, bank: config.bank, rules: config.rules, months: buyableMonths(),
    auto_charge: !!hookRes.data,
    me: { balance, refundable, ledger, tickets, requests: (reqRes.data ?? []) as ChargeRequestRow[] },
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  const session = await getApprovedSession(leagueId)
  if (!session) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
  const teamId = await resolveTeamId(leagueId)
  if (!(await loadWalletConfig(teamId))) return NextResponse.json({ error: '월렛이 꺼져 있어요' }, { status: 404 })
  const sb = createClient()

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const action = body.action ?? 'charge'
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

  if (action === 'buy') {
    const kind = body.kind
    if (kind !== 'regular_pass' && kind !== 'non_regular') return NextResponse.json({ error: '티켓 종류를 골라 주세요' }, { status: 400 })
    let month: string | null = null
    let qty = 1
    if (kind === 'regular_pass') {
      month = typeof body.month === 'string' ? body.month : ''
      if (!buyableMonths().includes(month)) return NextResponse.json({ error: '이번 달·다음 달 정규권만 살 수 있어요' }, { status: 400 })
    } else {
      qty = Number(body.qty)
      if (!Number.isInteger(qty) || qty < 1 || qty > 10) return NextResponse.json({ error: '비정규 티켓은 한 번에 1~10장이에요' }, { status: 400 })
    }
    const { data, error } = await sb.rpc('wallet_buy_ticket', {
      p_team_id: teamId, p_player_id: session.pid, p_kind: kind, p_month: month, p_qty: qty,
      p_actor: `본인 ${session.loginId}`,
    })
    if (error) {
      const msg = walletErrorMessage(error.message)
      return NextResponse.json({ error: msg ?? error.message }, { status: msg ? 409 : 500 })
    }
    return NextResponse.json({ ok: true, qty: data }, { status: 201 })
  }

  if (action === 'refund') {
    const holder = str(body.holder, 40)
    const account = str(body.account, 80)
    if (!holder || !account) return NextResponse.json({ error: '받을 계좌(은행·번호)와 예금주를 적어 주세요' }, { status: 400 })
    const refundable = await loadRefundable(teamId, session.pid)
    if (refundable <= 0) return NextResponse.json({ error: '지금은 환불받을 금액이 없어요' }, { status: 400 })
    const { data, error } = await sb.from('wallet_charge_requests').insert({
      team_id: teamId, league_player_id: session.pid, kind: 'refund', amount: refundable,
      depositor_name: holder, refund_account: account,
    }).select(REQUEST_COLS).single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: '이미 확인을 기다리는 요청이 있어요' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data, { status: 201 })
  }

  if (action !== 'charge') return NextResponse.json({ error: 'action 은 charge · refund · buy' }, { status: 400 })
  const amount = parseAmount(body.amount)
  if (!amount) return NextResponse.json({ error: `금액은 1 ~ ${MAX_CHARGE.toLocaleString()}원 사이로 적어 주세요` }, { status: 400 })
  const depositor = str(body.depositor_name, 40)
  if (!depositor) return NextResponse.json({ error: '입금자명을 적어 주세요' }, { status: 400 })
  if (hasReservedDepositor(depositor)) return NextResponse.json({ error: '입금자명에 「모임통장」은 쓸 수 없어요' }, { status: 400 })

  // 입금만으로 이미 자동 충전된 돈이면 요청을 받지 않는다 — 어드민이 또 승인하면 두 번 충전된다(2026-11-10)
  if (await alreadyChargedByDeposit(sb, teamId, session.pid, amount)) {
    return NextResponse.json({ error: `이미 입금으로 ${amount.toLocaleString()}원이 자동 충전됐어요 — 포인트를 확인해 보세요` }, { status: 409 })
  }
  const { data, error } = await sb.from('wallet_charge_requests').insert({
    team_id: teamId, league_player_id: session.pid, kind: 'charge', amount, depositor_name: depositor,
  }).select(REQUEST_COLS).single()
  if (error) {
    // 23505 = 대기 중 요청이 이미 있음(wallet_charge_requests_one_pending)
    if (error.code === '23505') return NextResponse.json({ error: '이미 확인을 기다리는 요청이 있어요' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // 입금부터 하고 요청을 나중에 보낸 경우 — 먼저 와 있던 카카오뱅크 입금 알림과 짝지어 바로 승인(마이그레이션 128)
  const row = { ...(data as unknown as { id: string; amount: number; depositor_name: string }), league_player_id: session.pid }
  if (await matchLateRequest(sb, teamId, row)) {
    const { data: fresh } = await sb.from('wallet_charge_requests').select(REQUEST_COLS).eq('id', row.id).single()
    return NextResponse.json({ ...(fresh ?? data), auto_approved: true }, { status: 201 })
  }
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  const session = await getApprovedSession(leagueId)
  if (!session) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
  const requestId = new URL(req.url).searchParams.get('requestId')
  if (!requestId) return NextResponse.json({ error: 'requestId 필수' }, { status: 400 })
  const teamId = await resolveTeamId(leagueId)
  // 본인 것 · 대기 중일 때만 — 조건을 UPDATE 에 그대로 걸어 승인과 겹쳐도 하나만 이긴다.
  const { data, error } = await createClient().from('wallet_charge_requests')
    .update({ status: 'cancelled', reviewed_at: new Date().toISOString(), reviewed_by_label: '본인 취소' })
    .eq('id', requestId).eq('team_id', teamId).eq('league_player_id', session.pid).eq('status', 'pending')
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: '이미 처리된 요청이에요' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
