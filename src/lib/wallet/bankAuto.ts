// 카카오뱅크 입금 알림 → 충전 요청 자동 승인 (2026-11-09 운영진, 마이그레이션 128)
//
//   카카오뱅크는 개인 통장 입금 내역을 넘겨주는 공식 통로가 없다. 그래서 통장 주인 폰(안드로이드)의
//   알림 자동화 앱이 알림 글을 그대로 보내 주고(POST /wallet/bank-notify), 여기서 짝을 짓는다.
//   알림 글 모양은 은행이 바꿀 수 있으므로 정해진 모양에 기대지 않는다 —
//     ① 「입금 N원」(없으면 입금 글 안의 첫 「N원」)에서 금액을 읽고
//     ② 기다리는 충전 요청 중 금액이 같고 입금자명이 글 안에 들어 있는 요청을 찾는다.
//   **딱 하나일 때만** 승인한다(동명이인·같은 금액이면 어드민 손으로). 승인은 지금처럼 wallet_review_charge — 보너스도 같이.
//   회원이 입금부터 하고 요청을 나중에 보내면 알림이 먼저 온다 → 못 짝지은 알림으로 남겨 두고, 요청을 만들 때 다시 짝짓는다.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { inviterLabel } from '@/lib/rsvp/weekly'
import { loadWalletConfig } from '@/lib/wallet/wallet'
import { hasReservedDepositor } from '@/lib/wallet/depositorName'

export const BANK_ACTOR = '자동(카카오뱅크 입금 알림)'
const NOTE = '카카오뱅크 입금 알림으로 자동 확인'
/** 입금이 먼저 온 경우, 요청을 이 시간 안에 보내면 짝짓는다 */
const LATE_REQUEST_HOURS = 48
/** 같은 알림이 두 번 오면(앱이 다시 보냄) 이 시간 안의 같은 글은 무시 */
const DUP_SECONDS = 120

export type BankEventStatus = 'matched' | 'unmatched' | 'ambiguous' | 'ignored' | 'charged' | 'guest_fee'
export type BankEvent = { id: string; raw_text: string; amount: number | null; status: BankEventStatus; request_id: string | null; created_at: string; note?: string | null; name?: string | null }

const squash = (s: string) => s.normalize('NFC').replace(/\s+/g, '')

/** 같은 사람이 짧은 시간 안에 두 번 충전되지 않게(2026-11-10 운영진) — 이 시간 안에 승인된 충전이 있으면 자동 충전하지 않는다. */
const RECENT_CHARGE_MINUTES = 10
async function chargedRecently(sb: SupabaseClient, teamId: string, playerId: string): Promise<boolean> {
  const since = new Date(Date.now() - RECENT_CHARGE_MINUTES * 60000).toISOString()
  const { data } = await sb.from('wallet_charge_requests').select('id')
    .eq('team_id', teamId).eq('league_player_id', playerId).eq('kind', 'charge').eq('status', 'approved')
    .gte('reviewed_at', since).limit(1)
  return (data ?? []).length > 0
}

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

type Pending = { id: string; amount: number; depositor_name: string; league_player_id?: string }

function pickMatch(pending: Pending[], amount: number, text: string): { one: Pending | null; many: boolean } {
  const body = squash(text)
  const hits = pending.filter(p => p.amount === amount && squash(p.depositor_name).length >= 2 && !hasReservedDepositor(p.depositor_name) && body.includes(squash(p.depositor_name)))
  return { one: hits.length === 1 ? hits[0] : null, many: hits.length > 1 }
}

async function approve(sb: SupabaseClient, teamId: string, requestId: string): Promise<boolean> {
  const { error } = await sb.rpc('wallet_review_charge', {
    p_team_id: teamId, p_request_id: requestId, p_action: 'approve', p_note: NOTE, p_actor: BANK_ACTOR,
  })
  if (error) console.error(`[bankAuto] 자동 승인 실패 ${requestId}: ${error.message}`)
  return !error
}

/** 알림에서 보낸 사람 이름 — 「… 2,000원 김로빈 → 모임통장(1363)」의 「김로빈」. 못 읽으면 null. */
export function parseSenderName(text: string): string | null {
  const m = text.normalize('NFC').match(/원\s*([^→\n\r]+?)\s*→/)
  const name = m?.[1]?.trim() ?? ''
  return name.length >= 2 && name.length <= 20 ? name : null
}

/** 게스트비(통장 입금)를 기다리는 게스트 — 게스트 본인 이름 또는 부른 회원 이름으로 보낸 입금이면 「입금 확인」.
 *  금액 = 게스트비 × N 이고 그 사람 앞으로 미확인 게스트가 정확히 N 명일 때만. */
async function settleGuestFee(sb: SupabaseClient, leagueId: string, sender: string, amount: number, price: number | null): Promise<string | null> {
  if (!price || amount % price !== 0) return null
  const n = amount / price
  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const { data } = await sb.from('weekly_rsvp')
    .select('league_id, game_date, league_player_id, answered_by_label, league_players!weekly_rsvp_league_player_id_fkey(name, is_guest)')
    .eq('league_id', leagueId).eq('answer', 'yes').eq('guest_pay', 'bank').eq('guest_paid', false).gte('game_date', since)
  type Row = { game_date: string; league_player_id: string; answered_by_label: string | null; league_players: { name: string; is_guest: boolean | null } | { name: string; is_guest: boolean | null }[] }
  const who = squash(sender)
  const rows = ((data ?? []) as unknown as Row[]).filter(r => {
    const p = Array.isArray(r.league_players) ? r.league_players[0] : r.league_players
    if (!p?.is_guest) return false
    return squash(p.name) === who || squash(r.answered_by_label ?? '') === squash(inviterLabel(sender))
  })
  if (rows.length !== n) return null
  for (const r of rows) {
    await sb.from('weekly_rsvp').update({ guest_paid: true })
      .eq('league_id', leagueId).eq('game_date', r.game_date).eq('league_player_id', r.league_player_id)
  }
  const names = rows.map(r => (Array.isArray(r.league_players) ? r.league_players[0] : r.league_players)?.name).join(', ')
  return `게스트비 입금 확인 · ${names}`
}

/** 요청 없이 이름으로 충전 — 명단(게스트 아님·활동 중)에 그 이름이 딱 한 명일 때. 충전 요청 행을 만들고 승인한다(보너스 포함). */
async function chargeByName(sb: SupabaseClient, teamId: string, sender: string, amount: number): Promise<{ requestId: string; name: string } | null> {
  const { data } = await sb.from('league_players').select('id, name, is_guest, is_active').eq('team_id', teamId)
  const who = squash(sender)
  const hits = ((data ?? []) as { id: string; name: string; is_guest: boolean | null; is_active: boolean | null }[])
    .filter(p => !p.is_guest && p.is_active !== false && squash(p.name) === who)
  if (hits.length !== 1) return null
  if (await chargedRecently(sb, teamId, hits[0].id)) return null
  const { data: req, error } = await sb.from('wallet_charge_requests').insert({
    team_id: teamId, league_player_id: hits[0].id, kind: 'charge', amount, depositor_name: sender,
  }).select('id').single()
  if (error || !req) return null   // 23505 = 이 사람 앞으로 기다리는 요청이 이미 있음 → 어드민 손으로
  const id = (req as { id: string }).id
  const { error: e2 } = await sb.rpc('wallet_review_charge', {
    p_team_id: teamId, p_request_id: id, p_action: 'approve', p_note: '입금 자동 충전(요청 없이)', p_actor: BANK_ACTOR,
  })
  if (e2) {
    console.error(`[bankAuto] 이름 충전 승인 실패 ${id}: ${e2.message}`)
    await sb.from('wallet_charge_requests').delete().eq('id', id).eq('status', 'pending')
    return null
  }
  return { requestId: id, name: hits[0].name }
}

/** 알림 한 건을 받아 기록하고 처리한다.
 *  ① 기다리는 충전 요청과 짝(금액 같고 입금자명이 글에 있음)이 딱 하나 → 그 요청 승인
 *  ② 게스트비(통장)를 기다리는 게스트와 짝 → 게스트비 입금 확인
 *  ③ 보낸 사람 이름 = 명단의 한 사람 → 요청 없이 자동 충전(2026-11-10 운영진)
 *  ④ 나머지는 「짝 없음」으로 남겨 어드민이 본다. */
export async function handleBankNotification(sb: SupabaseClient, teamId: string, leagueId: string, raw: string): Promise<{ status: BankEventStatus; requestId: string | null; amount: number | null }> {
  const text = raw.normalize('NFC').trim().slice(0, 1000)
  const amount = parseDepositAmount(text)

  const since = new Date(Date.now() - DUP_SECONDS * 1000).toISOString()
  const { data: dup } = await sb.from('wallet_bank_events').select('id').eq('team_id', teamId).eq('raw_text', text).gte('created_at', since).limit(1)
  let status: BankEventStatus = 'unmatched'
  let requestId: string | null = null
  let note: string | null = null

  if ((dup ?? []).length > 0 || amount == null) {
    status = 'ignored'
    // 2분 안에 글자까지 똑같은 알림 = 폰이 같은 알림을 두 번 보낸 것으로 본다. 정말 두 번 입금했다면 어드민이 손으로(2026-11-10 리뷰 — 안내를 남긴다)
    if (amount != null) note = '2분 안에 같은 알림이 또 와서 건너뛰었어요 — 실제로 두 번 입금했다면 손으로 처리해 주세요'
  } else {
    const { data } = await sb.from('wallet_charge_requests').select('id, amount, depositor_name, league_player_id')
      .eq('team_id', teamId).eq('status', 'pending').eq('kind', 'charge')
    const { one, many } = pickMatch((data ?? []) as Pending[], amount, text)
    if (one && one.league_player_id && await chargedRecently(sb, teamId, one.league_player_id)) { status = 'unmatched'; note = '방금 충전된 사람이라 자동 처리하지 않았어요' }
    else if (one && await approve(sb, teamId, one.id)) { status = 'matched'; requestId = one.id }
    else if (many) status = 'ambiguous'
    else {
      const sender = parseSenderName(text)
      if (sender) {
        const cfg = await loadWalletConfig(teamId)
        const fee = await settleGuestFee(sb, leagueId, sender, amount, cfg?.rules.guest_price ?? null)
        if (fee) { status = 'guest_fee'; note = fee }
        else {
          const c = await chargeByName(sb, teamId, sender, amount)
          if (c) { status = 'charged'; requestId = c.requestId; note = `${c.name} 님 자동 충전` }
        }
      }
    }
  }

  // 입금이 아닌 알림(출금 등)은 글을 남기지 않는다 — 개인 통장 출금·잔액이 어드민 화면에 보였다(2026-11-10)
  const stored = amount == null ? '(입금 알림 아님 — 내용 저장 안 함)' : text
  const row = { team_id: teamId, raw_text: stored, amount, status, request_id: requestId, note }
  const { error } = await sb.from('wallet_bank_events').insert(row)
  if (error && /note|check constraint/i.test(error.message)) {
    // 129 실행 전 — 새 상태·메모 칸이 없으면 옛 모양으로라도 남긴다
    await sb.from('wallet_bank_events').insert({ team_id: teamId, raw_text: stored, amount, status: status === 'charged' || status === 'guest_fee' ? 'matched' : status, request_id: requestId })
  }
  return { status, requestId, amount }
}

/** 회원이 충전 요청을 보내려는데, 같은 금액이 최근 48시간 안에 이미 「입금만으로 자동 충전」됐으면 true — 두 번 충전되지 않게. */
export async function alreadyChargedByDeposit(sb: SupabaseClient, teamId: string, playerId: string, amount: number): Promise<boolean> {
  const since = new Date(Date.now() - LATE_REQUEST_HOURS * 3600 * 1000).toISOString()
  const { data, error } = await sb.from('wallet_bank_events').select('request_id').eq('team_id', teamId).eq('status', 'charged').eq('amount', amount).gte('created_at', since)
  if (error || !data?.length) return false
  const ids = data.map(d => d.request_id as string).filter(Boolean)
  if (!ids.length) return false
  const { data: rq } = await sb.from('wallet_charge_requests').select('id').in('id', ids).eq('league_player_id', playerId).limit(1)
  return (rq ?? []).length > 0
}

/** 충전 요청이 새로 생겼을 때 — 먼저 와 있던 못 짝지은 입금 알림과 짝짓는다. 승인했으면 true. */
export async function matchLateRequest(sb: SupabaseClient, teamId: string, req: Pending): Promise<boolean> {
  const since = new Date(Date.now() - LATE_REQUEST_HOURS * 3600 * 1000).toISOString()
  const { data, error } = await sb.from('wallet_bank_events').select('id, raw_text, amount')
    .eq('team_id', teamId).eq('status', 'unmatched').eq('amount', req.amount).gte('created_at', since)
  if (error) return false   // 표가 없으면(마이그레이션 전) 조용히 건너뛴다
  const name = squash(req.depositor_name)
  if (name.length < 2 || hasReservedDepositor(req.depositor_name)) return false
  if (req.league_player_id && await chargedRecently(sb, teamId, req.league_player_id)) return false
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
  // 해시끼리도 상수시간 비교(2026-11-10 리뷰)
  const stored = Buffer.from(String((data as { token_hash?: string } | null)?.token_hash ?? ''))
  const given = Buffer.from(hashToken(token))
  const ok = !!data && stored.length === given.length && timingSafeEqual(stored, given)
  if (ok) await sb.from('wallet_bank_hooks').update({ last_used_at: new Date().toISOString() }).eq('team_id', teamId)
  return ok
}
