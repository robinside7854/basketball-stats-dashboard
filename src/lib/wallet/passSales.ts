// 정규권 판매 기간 · 정원 (2026-11-10 운영진, 마이그레이션 130)
//   정규권은 인기가 많아 운영진이 달마다 「오픈」을 알리고, 정해진 기간에 정원(18명)까지만 판다.
//   · 판매가 열려 있을 때만 회원이 정규권을 산다(정원 검사는 DB 함수 wallet_buy_regular_pass 가 판매 행을 잠그고 한다).
//   · 산 사람이 **전 달 정규로 팀에 배정돼 있었으면 같은 팀으로 그 달 정규 자동 배정**(league_player_months).
//     그 달 행이 이미 있으면(어드민이 정해 둠) 건드리지 않는다. 전 달 정규가 아니면 어드민이 달별 정규 멤버에서 정한다.
//   · 남은 비정규 티켓은 정규권 값에서 장당 비정규 가격만큼 깎는다(정규권 값을 넘지 않게).
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadMonthRoster } from '@/lib/league/monthlyRoster'
import { applyMonthlyPhotos, todayKst } from '@/lib/league/uniformPhoto'
import { loadIdentityResolver } from '@/lib/stats/teamIdentity'

export type PassSaleState = 'upcoming' | 'open' | 'closed'
export type PassSale = {
  id: string; month: string; opens_at: string; closes_at: string; capacity: number
  closed_early_at: string | null; sold: number; state: PassSaleState
}
export type PassBuyer = { player_id: string; name: string; team_id: string | null; team_name: string | null; bought_at: string }

const SALE_COLS = 'id, month, opens_at, closes_at, capacity, closed_early_at'

export function saleState(s: { opens_at: string; closes_at: string; closed_early_at: string | null }, now = Date.now()): PassSaleState {
  if (s.closed_early_at || now >= Date.parse(s.closes_at)) return 'closed'
  if (now < Date.parse(s.opens_at)) return 'upcoming'
  return 'open'
}

export function addMonth(month: string, d = 1): string {
  let y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)) + d
  while (m > 12) { m -= 12; y += 1 }
  while (m < 1) { m += 12; y -= 1 }
  return `${y}-${String(m).padStart(2, '0')}-01`
}

/** 이번 달 이후(이번 달 포함) 판매 — 팔린 장수 포함 */
export async function loadPassSales(sb: SupabaseClient, teamId: string): Promise<PassSale[]> {
  const thisMonth = `${todayKst().slice(0, 7)}-01`
  const { data, error } = await sb.from('wallet_pass_sales').select(SALE_COLS)
    .eq('team_id', teamId).gte('month', thisMonth).order('month')
  if (error) return []   // 130 실행 전이면 판매 없음
  const rows = (data ?? []) as Omit<PassSale, 'sold' | 'state'>[]
  if (rows.length === 0) return []
  const { data: t } = await sb.from('wallet_tickets').select('month').eq('team_id', teamId)
    .eq('kind', 'regular_pass').neq('status', 'returned').in('month', rows.map(r => r.month))
  const sold = new Map<string, number>()
  for (const r of (t ?? []) as { month: string }[]) { const k = String(r.month).slice(0, 10); sold.set(k, (sold.get(k) ?? 0) + 1) }
  return rows.map(r => ({ ...r, month: String(r.month).slice(0, 10), sold: sold.get(String(r.month).slice(0, 10)) ?? 0, state: saleState(r) }))
}

/** 그 달 1일이 든 리그 분기 */
async function quarterOfMonth(sb: SupabaseClient, leagueId: string, month: string): Promise<{ id: string } | null> {
  const { data } = await sb.from('league_quarters').select('id, start_date, end_date, kind').eq('league_id', leagueId)
  return ((data ?? []) as { id: string; start_date: string | null; end_date: string | null; kind: string | null }[])
    .find(x => x.kind !== 'tournament' && x.start_date && x.end_date && x.start_date <= month && month <= x.end_date) ?? null
}

/** 그 달 정규 팀 — 그 달이 든 리그 분기의 정규 소속 위에 그 달 행(120)이 먼저(month-teams 와 같은 규칙) */
export async function regularTeamInMonth(sb: SupabaseClient, leagueId: string, playerId: string, month: string): Promise<string | null> {
  const [q, rows] = await Promise.all([quarterOfMonth(sb, leagueId, month), loadMonthRoster(sb, leagueId, month)])
  const row = rows.get(playerId)
  if (row) return row.team_id && row.is_regular ? row.team_id : null
  if (!q) return null
  const { data } = await sb.from('league_player_quarters').select('team_id, is_regular')
    .eq('quarter_id', q.id).eq('league_player_id', playerId).maybeSingle()
  const m = data as { team_id: string | null; is_regular: boolean | null } | null
  return m?.team_id && m.is_regular !== false ? m.team_id : null
}

/** 정규권을 산 뒤 — 전 달 정규 팀으로 그 달 정규 자동 배정. 돌려주는 값 = 그 달 팀(없으면 null) · 어떻게 정해졌는지 */
export async function autoAssignAfterPass(
  sb: SupabaseClient, leagueId: string, playerId: string, month: string,
): Promise<{ team_id: string | null; how: 'already' | 'auto' | 'none' }> {
  const existing = (await loadMonthRoster(sb, leagueId, month)).get(playerId)
  if (existing) return { team_id: existing.team_id && existing.is_regular ? existing.team_id : null, how: 'already' }
  const prev = await regularTeamInMonth(sb, leagueId, playerId, addMonth(month, -1))
  if (!prev) return { team_id: null, how: 'none' }
  const { error } = await sb.from('league_player_months').upsert({
    league_id: leagueId, month, league_player_id: playerId, team_id: prev, is_regular: true, updated_at: new Date().toISOString(),
  }, { onConflict: 'league_id,month,league_player_id' })
  if (error) { console.error(`[passSales] 자동 배정 실패 ${playerId} ${month}: ${error.message}`); return { team_id: null, how: 'none' } }
  if (month === `${todayKst().slice(0, 7)}-01`) await applyMonthlyPhotos(sb, leagueId)
  return { team_id: prev, how: 'auto' }
}

/** 그 달 정규권을 산 사람 + 그 달 정규 팀(어드민 판매 칸) */
export async function loadPassBuyers(sb: SupabaseClient, leagueId: string, teamId: string, month: string): Promise<PassBuyer[]> {
  const [tRes, pRes, rows, resolve, q] = await Promise.all([
    sb.from('wallet_tickets').select('league_player_id, created_at').eq('team_id', teamId)
      .eq('kind', 'regular_pass').eq('month', month).neq('status', 'returned').order('created_at'),
    sb.from('league_players').select('id, name').eq('team_id', teamId),
    loadMonthRoster(sb, leagueId, month),
    loadIdentityResolver(sb, leagueId),
    quarterOfMonth(sb, leagueId, month),
  ])
  const nm = new Map((pRes.data ?? []).map(p => [p.id as string, p.name as string]))
  return ((tRes.data ?? []) as { league_player_id: string; created_at: string }[]).map(t => {
    const r = rows.get(t.league_player_id)
    const team = r?.team_id && r.is_regular ? r.team_id : null
    return { player_id: t.league_player_id, name: nm.get(t.league_player_id) ?? '알 수 없음', team_id: team, team_name: team ? resolve(team, q?.id)?.display_name ?? null : null, bought_at: t.created_at }
  })
}

/** 그 달의 팀 이름(그 분기 정체성 — 미라클은 분기마다 팀 이름이 바뀐다) */
export async function teamNameInMonth(sb: SupabaseClient, leagueId: string, teamId: string, month: string): Promise<string | null> {
  const [resolve, q] = await Promise.all([loadIdentityResolver(sb, leagueId), quarterOfMonth(sb, leagueId, month)])
  return resolve(teamId, q?.id)?.display_name ?? null
}
