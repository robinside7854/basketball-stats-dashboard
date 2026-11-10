// 카카오뱅크 입금 알림 → 충전 요청 자동 승인 (2026-11-09 운영진, 마이그레이션 128)
//
//   카카오뱅크는 개인 통장 입금 내역을 넘겨주는 공식 통로가 없다. 그래서 통장 주인 폰(안드로이드)의
//   알림 자동화 앱이 알림 글을 그대로 보내 주고(POST /wallet/bank-notify), 여기서 짝을 짓는다.
//   알림 글 모양은 은행이 바꿀 수 있으므로 정해진 모양에 기대지 않는다 —
//     ① 「입금 N원」(없으면 입금 글 안의 첫 「N원」)에서 금액을 읽고
//     ② 기다리는 충전 요청 중 금액이 같고 입금자명이 글 안에 들어 있는 요청을 찾는다.
//   **딱 하나일 때만** 승인한다(동명이인·같은 금액이면 어드민 손으로). 승인은 지금처럼 wallet_review_charge — 보너스도 같이.
//   회원이 입금부터 하고 요청을 나중에 보내면 알림이 먼저 온다 → 못 짝지은 알림으로 남겨 두고, 요청을 만들 때 다시 짝짓는다.
import { createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export const BANK_ACTOR = '자동(카카오뱅크 입금 알림)'
const NOTE = '카카오뱅크 입금 알림으로 자동 확인'
/** 입금이 먼저 온 경우, 요청을 이 시간 안에 보내면 짝짓는다 */
const LATE_REQUEST_HOURS = 48
/** 같은 알림이 두 번 오면(앱이 다시 보냄) 이 시간 안의 같은 글은 무시 */
const DUP_SECONDS = 120

export type BankEventStatus = 'matched' | 'unmatched' | 'ambiguous' | 'ignored'
export type BankEvent = { id: string; raw_text: string; amount: number | null; status: BankEventStatus; request_id: string | null; created_at: string; name?: string | null }

const squash = (s: string) => s.normalize('NFC').replace(/\s+/g, '')

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newToken(): string {
  return randomBytes(24).toString('base64url')
}

/** 알림 글에서 입금액. 입금 알림이 아니면 null.
 *  「입금 50,000원」·「홍길동님이 50,000원을 입금했어요」(모임통장) 둘 다 읽는다 — 「잔액 N원」은 건너뛰고
 *  「입금」 글자에 가장 가까운 금액을 고른다. */
export function parseDepositAmount(text: string): number | null {
  const t = text.normalize('NFC')
  const at = t.indexOf('입금')
  if (at < 0) return null
  const re = /([\d,]{3,}|\d+)\s*원/g
  let best: { v: number; d: number } | null = null
  for (let m = re.exec(t); m; m = re.exec(t)) {
    if (/잔액\s*$/.test(t.slice(Math.max(0, m.index - 6), m.index))) continue
    const v = Number(m[1].replace(/,/g, ''))
    if (!v) continue
    const d = Math.abs(m.index - at)
    if (!best || d < best.d) best = { v, d }
  }
  return best?.v ?? null
}

type Pending = { id: string; amount: number; depositor_name: string }

function pickMatch(pending: Pending[], amount: number, text: string): { one: Pending | null; many: boolean } {
  const body = squash(text)
  const hits = pending.filter(p => p.amount === amount && squash(p.depositor_name).length >= 2 && body.includes(squash(p.depositor_name)))
  return { one: hits.length === 1 ? hits[0] : null, many: hits.length > 1 }
}

async function approve(sb: SupabaseClient, teamId: string, requestId: string): Promise<boolean> {
  const { error } = await sb.rpc('wallet_review_charge', {
    p_team_id: teamId, p_request_id: requestId, p_action: 'approve', p_note: NOTE, p_actor: BANK_ACTOR,
  })
  if (error) console.error(`[bankAuto] 자동 승인 실패 ${requestId}: ${error.message}`)
  return !error
}

/** 알림 한 건을 받아 기록하고, 짝이 딱 하나면 승인한다. */
export async function handleBankNotification(sb: SupabaseClient, teamId: string, raw: string): Promise<{ status: BankEventStatus; requestId: string | null; amount: number | null }> {
  const text = raw.normalize('NFC').trim().slice(0, 1000)
  const amount = parseDepositAmount(text)

  const since = new Date(Date.now() - DUP_SECONDS * 1000).toISOString()
  const { data: dup } = await sb.from('wallet_bank_events').select('id').eq('team_id', teamId).eq('raw_text', text).gte('created_at', since).limit(1)
  let status: BankEventStatus = 'unmatched'
  let requestId: string | null = null

  if ((dup ?? []).length > 0 || amount == null) {
    status = 'ignored'
  } else {
    const { data } = await sb.from('wallet_charge_requests').select('id, amount, depositor_name')
      .eq('team_id', teamId).eq('status', 'pending').eq('kind', 'charge')
    const { one, many } = pickMatch((data ?? []) as Pending[], amount, text)
    if (one && await approve(sb, teamId, one.id)) { status = 'matched'; requestId = one.id }
    else if (many) status = 'ambiguous'
  }

  await sb.from('wallet_bank_events').insert({ team_id: teamId, raw_text: text, amount, status, request_id: requestId })
  return { status, requestId, amount }
}

/** 충전 요청이 새로 생겼을 때 — 먼저 와 있던 못 짝지은 입금 알림과 짝짓는다. 승인했으면 true. */
export async function matchLateRequest(sb: SupabaseClient, teamId: string, req: Pending): Promise<boolean> {
  const since = new Date(Date.now() - LATE_REQUEST_HOURS * 3600 * 1000).toISOString()
  const { data, error } = await sb.from('wallet_bank_events').select('id, raw_text, amount')
    .eq('team_id', teamId).eq('status', 'unmatched').eq('amount', req.amount).gte('created_at', since)
  if (error) return false   // 표가 없으면(마이그레이션 전) 조용히 건너뛴다
  const name = squash(req.depositor_name)
  if (name.length < 2) return false
  const hits = ((data ?? []) as { id: string; raw_text: string }[]).filter(e => squash(e.raw_text).includes(name))
  if (hits.length !== 1) return false
  if (!(await approve(sb, teamId, req.id))) return false
  await sb.from('wallet_bank_events').update({ status: 'matched', request_id: req.id }).eq('id', hits[0].id)
  return true
}

/** 토큰으로 팀 찾기 — 맞으면 last_used_at 갱신 */
export async function teamForToken(sb: SupabaseClient, teamId: string, token: string | null): Promise<boolean> {
  if (!token) return false
  const { data } = await sb.from('wallet_bank_hooks').select('token_hash').eq('team_id', teamId).maybeSingle()
  const ok = !!data && (data as { token_hash: string }).token_hash === hashToken(token)
  if (ok) await sb.from('wallet_bank_hooks').update({ last_used_at: new Date().toISOString() }).eq('team_id', teamId)
  return ok
}
