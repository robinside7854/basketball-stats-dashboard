/**
 * 외부(상대) 팀·선수 판별 — 유도 규칙을 한 곳에만 둔다.
 *
 * 진실은 `league_teams.is_external` 하나뿐이다. 선수에는 외부 플래그를 두지 않는다 —
 * 두 곳에 두면 반드시 어긋나고, 어긋나면 상대팀 기록이 우리 팀 통계에 섞인다.
 *
 * 선수의 외부 여부는 `league_game_players` 배정으로 유도한다:
 *   외부 팀에만 배정된 적이 있고, 내부 팀에 배정된 적이 없으면 외부 선수다.
 *   (우리 선수가 상대팀으로 뛰는 일은 없지만, 용병·게스트 운영을 감안해
 *    "내부 배정이 하나라도 있으면 내부 선수"로 판정한다 — 우리 기록을 잃지 않는 쪽으로 기운다)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export async function fetchExternalTeamIds(sb: SupabaseClient, leagueId: string): Promise<Set<string>> {
  const { data, error } = await sb
    .from('league_teams')
    .select('id')
    .eq('league_id', leagueId)
    .eq('is_external', true)
  if (error) throw new Error(`league_teams: leagueId=${leagueId} 외부 팀 조회 실패 — ${error.message}`)
  return new Set((data ?? []).map(r => r.id as string))
}

export async function fetchExternalPlayerIds(sb: SupabaseClient, leagueId: string): Promise<Set<string>> {
  const externalTeams = await fetchExternalTeamIds(sb, leagueId)
  if (externalTeams.size === 0) return new Set()

  const { data, error } = await sb
    .from('league_game_players')
    .select('league_player_id, team_id')
    .eq('league_id', leagueId)
  if (error) throw new Error(`league_game_players: leagueId=${leagueId} 배정 조회 실패 — ${error.message}`)

  const internal = new Set<string>()
  const external = new Set<string>()
  for (const r of (data ?? []) as Array<{ league_player_id: string | null; team_id: string | null }>) {
    if (!r.league_player_id || !r.team_id) continue
    if (externalTeams.has(r.team_id)) external.add(r.league_player_id)
    else internal.add(r.league_player_id)
  }
  for (const pid of internal) external.delete(pid)
  return external
}
