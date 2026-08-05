import { createClient } from '@/lib/supabase/admin'

// 경기묶음(leagues 행) → 그 묶음이 속한 팀.
//   명단과 계정이 팀에 매달리면서 거의 모든 조회가 이 값을 먼저 필요로 한다.
//   요청마다 같은 값을 다시 묻게 되므로 짧게 캐시한다 — 팀 소속은 사실상 바뀌지 않는다.
const cache = new Map<string, { teamId: string; expiresAt: number }>()
const TTL_MS = 5 * 60 * 1000

export async function resolveTeamId(leagueId: string): Promise<string> {
  const hit = cache.get(leagueId)
  if (hit && Date.now() < hit.expiresAt) return hit.teamId

  const sb = createClient()
  const { data, error } = await sb
    .from('leagues')
    .select('team_id')
    .eq('id', leagueId)
    .maybeSingle()
  if (error) throw new Error(`leagues: leagueId=${leagueId} team_id 조회 실패 — ${error.message}`)
  // 팀을 못 찾으면 빈 값으로 넘기지 않는다 — 그러면 호출부가 "팀이 없는 명단" 을
  //   조회하게 되고, 조건에 안 맞아 빈 결과가 나와 "선수가 없다" 로 읽힌다.
  if (!data?.team_id) throw new Error(`leagues: leagueId=${leagueId} 에 team_id 가 없다`)

  cache.set(leagueId, { teamId: data.team_id, expiresAt: Date.now() + TTL_MS })
  return data.team_id
}
