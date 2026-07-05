// 팀 정체성 (Franchise) 유틸
//
// 배경:
//   같은 team_id 라도 분기별로 override (name/color) 가 적용되면 사용자 관점에선
//   완전히 다른 프랜차이즈 (예: Q1-Q2 락다운 → Q3+ 굿모닝).
//   승패·누적 스탯은 identityKey 로 그룹핑되어야 함.
//
// identityKey 규칙:
//   `${team_id}::${display_name}` (null override 시 base team name 사용)
//   → 같은 team_id 여도 분기별 이름 다르면 별도 프랜차이즈로 취급
//   → 락다운 승수와 굿모닝 승수 완전 분리

import type { SupabaseClient } from '@supabase/supabase-js'

export interface TeamBase {
  id: string
  name: string
  color: string | null
}

export interface QuarterOverride {
  quarter_id: string
  team_id: string
  name: string | null
  color: string | null
}

export interface ResolvedIdentity {
  /** unique key for grouping — `${team_id}::${display_name}` */
  key: string
  team_id: string
  display_name: string
  color: string
}

/**
 * overrides + base teams 로부터 (team_id, quarter_id) → 프랜차이즈 정체성 해결
 *
 * @example
 *   const teams = [{ id: 'A', name: '팀A', color: '#f00' }]
 *   const overrides = [{ quarter_id: 'Q3', team_id: 'A', name: '굿모닝', color: null }]
 *   const resolver = makeIdentityResolver(teams, overrides)
 *   resolver('A', 'Q1') // → { key: 'A::팀A', display_name: '팀A' }
 *   resolver('A', 'Q3') // → { key: 'A::굿모닝', display_name: '굿모닝' }
 */
export function makeIdentityResolver(
  teams: TeamBase[],
  overrides: QuarterOverride[],
): (team_id: string | null | undefined, quarter_id: string | null | undefined) => ResolvedIdentity | null {
  const baseMap = new Map(teams.map(t => [t.id, t]))
  // quarter_id → team_id → override
  const overrideMap = new Map<string, Map<string, { name?: string; color?: string }>>()
  for (const o of overrides) {
    if (!overrideMap.has(o.quarter_id)) overrideMap.set(o.quarter_id, new Map())
    overrideMap.get(o.quarter_id)!.set(o.team_id, {
      name: o.name ?? undefined,
      color: o.color ?? undefined,
    })
  }

  return (team_id, quarter_id) => {
    if (!team_id) return null
    const base = baseMap.get(team_id)
    if (!base) return null
    const ov = quarter_id ? overrideMap.get(quarter_id)?.get(team_id) : undefined
    const display_name = ov?.name ?? base.name
    const color = ov?.color ?? base.color ?? '#9ca3af'
    return {
      key: `${team_id}::${display_name}`,
      team_id,
      display_name,
      color,
    }
  }
}

/**
 * DB 에서 teams + overrides 를 로드하여 resolver 생성 (편의 함수)
 */
export async function loadIdentityResolver(
  supabase: SupabaseClient,
  leagueId: string,
): Promise<ReturnType<typeof makeIdentityResolver>> {
  const [{ data: teamsRaw }, { data: overridesRaw }] = await Promise.all([
    supabase.from('league_teams').select('id, name, color').eq('league_id', leagueId),
    supabase.from('league_team_quarter_overrides').select('quarter_id, team_id, name, color').eq('league_id', leagueId),
  ])
  return makeIdentityResolver(
    (teamsRaw ?? []) as TeamBase[],
    (overridesRaw ?? []) as QuarterOverride[],
  )
}
