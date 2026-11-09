// 미라클 월렛(포인트 지갑) 서버 공용 — 마이그레이션 122 와 한 쌍 (2026-11-09)
//
//   ⚠ 잔액은 반드시 DB 함수(wallet_apply · wallet_review_charge) 로만 바꾼다.
//     여기서 wallet_balances 를 직접 UPDATE 하지 말 것 — 장부와 잔액이 갈라진다.
//   ⚠ 장부 행은 지우거나 고치지 않는다. 되돌리기는 반대 부호의 행(adjust · refund)을 하나 더 쓴다.
//   단위는 팀(teams.id) — 계정·선수와 같다. leagueId 는 resolveTeamId 로 푼다.
import { createClient } from '@/lib/supabase/admin'

export interface WalletConfig {
  teamId: string
  name: string
  bank: string | null
}

export interface LedgerRow {
  id: string
  kind: 'opening' | 'charge' | 'purchase' | 'refund' | 'adjust'
  amount: number
  balance_after: number
  memo: string | null
  created_at: string
}

export interface ChargeRequestRow {
  id: string
  league_player_id: string
  amount: number
  depositor_name: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  admin_note: string | null
  reviewed_by_label: string | null
  reviewed_at: string | null
  created_at: string
}

export const LEDGER_COLS = 'id, kind, amount, balance_after, memo, created_at'
export const REQUEST_COLS = 'id, league_player_id, amount, depositor_name, status, admin_note, reviewed_by_label, reviewed_at, created_at'

/** 충전 요청 한 번의 상한(DB CHECK 와 같다) */
export const MAX_CHARGE = 1_000_000

/** 이 팀에 월렛이 켜져 있으면 설정, 아니면 null(마이그레이션 전이어도 null). */
export async function loadWalletConfig(teamId: string): Promise<WalletConfig | null> {
  const { data, error } = await createClient()
    .from('teams').select('wallet_name, wallet_bank').eq('id', teamId).maybeSingle()
  if (error || !data) return null
  const row = data as { wallet_name: string | null; wallet_bank: string | null }
  if (!row.wallet_name) return null
  return { teamId, name: row.wallet_name, bank: row.wallet_bank }
}

export async function loadBalance(teamId: string, playerId: string): Promise<number> {
  const { data } = await createClient().from('wallet_balances')
    .select('balance').eq('team_id', teamId).eq('league_player_id', playerId).maybeSingle()
  return (data as { balance: number } | null)?.balance ?? 0
}

export async function loadLedger(teamId: string, playerId: string, limit = 200): Promise<LedgerRow[]> {
  const { data, error } = await createClient().from('wallet_ledger')
    .select(LEDGER_COLS).eq('team_id', teamId).eq('league_player_id', playerId)
    .order('created_at', { ascending: false }).limit(limit)
  if (error) throw new Error(`wallet_ledger 조회 실패 — ${error.message}`)
  return (data ?? []) as LedgerRow[]
}

/** DB 함수가 RAISE 한 「wallet: …」 문구를 화면용으로 꺼낸다. 다른 오류는 null. */
export function walletErrorMessage(message: string | undefined): string | null {
  if (!message) return null
  const i = message.indexOf('wallet: ')
  return i >= 0 ? message.slice(i + 'wallet: '.length) : null
}

/** 금액 입력 검사 — 1원 단위 정수, 0 초과 상한 이하 */
export function parseAmount(v: unknown, max = MAX_CHARGE): number | null {
  const n = typeof v === 'string' ? Number(v.replace(/[,\s]/g, '')) : v
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0 || n > max) return null
  return n
}
