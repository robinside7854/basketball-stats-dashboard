// 미라클 월렛 — 회원 본인 (마이그레이션 122, 2026-11-09)
//   GET                               → { enabled, name, bank, me: { balance, requests, ledger } | null }
//   POST { amount, depositor_name }   → 충전 요청(승인 회원 본인). 대기 중 요청은 한 사람당 하나.
//   DELETE ?requestId=                → 내 대기 중 요청 취소
//   본인 것만 본다 — 다른 회원의 잔액·내역은 어드민 라우트(/wallet/admin)에서만.
//   캐시 없음(돈이라 늘 최신 · ISR Reads 0).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { getApprovedSession } from '@/lib/auth/guard'
import { resolveTeamId } from '@/lib/league/teamScope'
import {
  loadWalletConfig, loadBalance, loadLedger, parseAmount, MAX_CHARGE, REQUEST_COLS,
  type ChargeRequestRow,
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
  const [balance, ledger, reqRes] = await Promise.all([
    loadBalance(teamId, session.pid),
    loadLedger(teamId, session.pid),
    sb.from('wallet_charge_requests').select(REQUEST_COLS)
      .eq('team_id', teamId).eq('league_player_id', session.pid)
      .order('created_at', { ascending: false }).limit(50),
  ])
  if (reqRes.error) return NextResponse.json({ error: reqRes.error.message }, { status: 500 })
  return NextResponse.json({
    enabled: true, name: config.name, bank: config.bank,
    me: { balance, ledger, requests: (reqRes.data ?? []) as ChargeRequestRow[] },
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  const session = await getApprovedSession(leagueId)
  if (!session) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
  const teamId = await resolveTeamId(leagueId)
  if (!(await loadWalletConfig(teamId))) return NextResponse.json({ error: '월렛이 꺼져 있어요' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { amount?: unknown; depositor_name?: unknown }
  const amount = parseAmount(body.amount)
  if (!amount) return NextResponse.json({ error: `금액은 1 ~ ${MAX_CHARGE.toLocaleString()}원 사이로 적어 주세요` }, { status: 400 })
  const depositor = typeof body.depositor_name === 'string' ? body.depositor_name.trim().slice(0, 40) : ''
  if (!depositor) return NextResponse.json({ error: '입금자명을 적어 주세요' }, { status: 400 })

  const { data, error } = await createClient().from('wallet_charge_requests').insert({
    team_id: teamId, league_player_id: session.pid, amount, depositor_name: depositor,
  }).select(REQUEST_COLS).single()
  if (error) {
    // 23505 = 대기 중 요청이 이미 있음(wallet_charge_requests_one_pending)
    if (error.code === '23505') return NextResponse.json({ error: '이미 확인을 기다리는 충전 요청이 있어요' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
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
