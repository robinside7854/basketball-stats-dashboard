// 정규권 현황 — 어드민 홈 알림(2026-11-09 운영진 「정규권 알림은 어드민 홈에서」)
//   이번 달: 이번 달 정규인데 정규권이 없는 사람.
//   다음 달: 매달 20일(KST)부터. 다음 달 정규 명단(달별 정규 멤버)이 있으면 그것, 없으면 이번 달 정규로 어림한다.
//   정규 판정은 month-teams·참가신청과 같다 — 지금 분기 정규 소속 위에 그 달 행(마이그레이션 120)이 먼저.
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCurrentQuarter } from '@/lib/league/currentQuarter'
import { loadMonthRoster, monthOf } from '@/lib/league/monthlyRoster'
import { todayKst } from '@/lib/league/uniformPhoto'

export const NEXT_MONTH_FROM_DAY = 20

export type PassMonth = {
  month: string          // YYYY-MM-01
  label: string          // 「12월」
  estimated: boolean     // 다음 달 명단이 아직 없어 이번 달 정규로 어림했는지
  regulars: number
  bought: number
  missing: { id: string; name: string }[]
}

function addMonth(month: string): string {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7))
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

export async function loadPassStatus(sb: SupabaseClient, leagueId: string, teamId: string): Promise<PassMonth[]> {
  const today = todayKst()
  const thisMonth = monthOf(today)!
  const nextMonth = addMonth(thisMonth)
  const wantNext = Number(today.slice(8, 10)) >= NEXT_MONTH_FROM_DAY

  const q = await loadCurrentQuarter(sb, leagueId)
  const inQuarter = !!q && !!q.start_date && !!q.end_date && today >= q.start_date && today <= q.end_date
  const [playersRes, memRes, thisRows, nextRows, passRes] = await Promise.all([
    sb.from('league_players').select('id, name, is_guest, is_active').eq('team_id', teamId),
    q ? sb.from('league_player_quarters').select('league_player_id, team_id, is_regular').eq('quarter_id', q.id)
      : Promise.resolve({ data: [] as { league_player_id: string; team_id: string | null; is_regular: boolean | null }[] }),
    loadMonthRoster(sb, leagueId, inQuarter ? thisMonth : null),
    wantNext ? loadMonthRoster(sb, leagueId, nextMonth) : Promise.resolve(new Map()),
    sb.from('wallet_tickets').select('league_player_id, month').eq('team_id', teamId).eq('kind', 'regular_pass')
      .in('month', wantNext ? [thisMonth, nextMonth] : [thisMonth]).neq('status', 'returned'),
  ])

  const players = ((playersRes.data ?? []) as { id: string; name: string; is_guest: boolean | null; is_active: boolean | null }[])
    .filter(p => !p.is_guest && p.is_active !== false)
  const nameOf = new Map(players.map(p => [p.id, p.name]))

  const base = new Set<string>()
  for (const m of memRes.data ?? []) if (m.team_id && m.is_regular !== false) base.add(m.league_player_id)
  const apply = (rows: Map<string, { team_id: string | null; is_regular: boolean | null }>, set: Set<string>) => {
    for (const [pid, r] of rows) { if (r.team_id && r.is_regular) set.add(pid); else set.delete(pid) }
    return set
  }
  const thisSet = apply(thisRows, new Set(base))

  const passes = new Map<string, Set<string>>()
  for (const t of (passRes.data ?? []) as { league_player_id: string; month: string }[]) {
    const k = String(t.month).slice(0, 10)
    if (!passes.has(k)) passes.set(k, new Set())
    passes.get(k)!.add(t.league_player_id)
  }

  const build = (month: string, set: Set<string>, estimated: boolean): PassMonth => {
    const ids = [...set].filter(id => nameOf.has(id))
    const have = passes.get(month) ?? new Set()
    const missing = ids.filter(id => !have.has(id)).map(id => ({ id, name: nameOf.get(id)! }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    return { month, label: `${Number(month.slice(5, 7))}월`, estimated, regulars: ids.length, bought: ids.length - missing.length, missing }
  }

  const out = [build(thisMonth, thisSet, false)]
  if (wantNext) {
    const nr = nextRows as Map<string, { team_id: string | null; is_regular: boolean | null }>
    out.push(nr.size > 0 ? build(nextMonth, apply(nr, new Set(base)), false) : build(nextMonth, new Set(thisSet), true))
  }
  return out
}
