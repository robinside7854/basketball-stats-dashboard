// 주소의 리그 밖 id 로 쓰기 막기 (2026-11-10 코드 리뷰) — canEditLeague 는 주소의 리그 권한만 본다.
//   그 뒤에 받은 분기·팀·선수 id 가 정말 이 리그 것인지 여기서 확인한다(남의 동호회 데이터를 못 바꾸게).
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveTeamId } from '@/lib/league/teamScope'

export async function scopeProblem(
  sb: SupabaseClient, leagueId: string,
  ids: { quarterId?: string | null; teamIds?: (string | null | undefined)[]; playerIds?: (string | null | undefined)[] },
): Promise<string | null> {
  if (ids.quarterId) {
    const { data } = await sb.from('league_quarters').select('id').eq('id', ids.quarterId).eq('league_id', leagueId).maybeSingle()
    if (!data) return '이 리그의 분기가 아니에요'
  }
  const teams = [...new Set((ids.teamIds ?? []).filter((x): x is string => !!x))]
  if (teams.length) {
    const { data } = await sb.from('league_teams').select('id').eq('league_id', leagueId).in('id', teams)
    if ((data ?? []).length !== teams.length) return '이 리그의 팀이 아니에요'
  }
  const players = [...new Set((ids.playerIds ?? []).filter((x): x is string => !!x))]
  if (players.length) {
    const teamId = await resolveTeamId(leagueId)
    const { data } = await sb.from('league_players').select('id').eq('team_id', teamId).in('id', players)
    if ((data ?? []).length !== players.length) return '이 리그의 선수가 아니에요'
  }
  return null
}
