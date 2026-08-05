import { createClient } from '@/lib/supabase/admin'

// 리그 운영 방식. leagues.mode 컬럼과 1:1 (075 마이그레이션에서 CHECK 로 제한).
//   league     — 동호회 내부 인원을 팀으로 나눠 시즌을 치른다 (미라클)
//   tournament — 외부 동호회와 대회를 치른다 (파란날개)
export type LeagueMode = 'league' | 'tournament'

// 서버 전용. 못 찾으면 'league' 로 떨어진다 — 기존 동작이 리그형이므로,
//   판정 실패 시 지금까지와 같게 구는 쪽이 안전하다.
export async function fetchLeagueMode(leagueId: string): Promise<LeagueMode> {
  const sb = createClient()
  const { data, error } = await sb.from('leagues').select('mode').eq('id', leagueId).maybeSingle()
  if (error) throw new Error(`leagues: leagueId=${leagueId} mode 조회 실패 — ${error.message}`)
  return data?.mode === 'tournament' ? 'tournament' : 'league'
}

// 세그먼트(league_quarters)를 사용자에게 뭐라고 부를지.
//   같은 테이블이지만 리그형에서는 시즌 안의 '분기' 고, 대회형에서는 개별 '대회' 다.
export function segmentLabel(mode: LeagueMode): string {
  return mode === 'tournament' ? '대회' : '분기'
}

// 드래프트는 내부 인원을 팀으로 나눌 때만 의미가 있다. 외부 팀과 붙는 대회형에는 없다.
export function hasDraft(mode: LeagueMode): boolean {
  return mode === 'league'
}
