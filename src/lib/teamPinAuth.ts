import { createClient } from '@/lib/supabase/admin'

/**
 * 팀 편집 PIN 검증 — 대회(파란날개) mutation API 가드.
 * 리그의 verifyLeaguePin 과 같은 구조. X-Team-Pin 헤더를 teams.edit_pin 과 대조한다.
 *
 * 불리언 대신 teams.id 를 돌려준다. 호출부가 핀 생성 시 team_id 를 채우거나
 * 리소스 소유권을 대조하는 데 그대로 쓰기 위함이다. 실패 시 null.
 */
export async function verifyTeamPin(req: Request, org: string, team: string): Promise<string | null> {
  const pin = req.headers.get('X-Team-Pin')
  if (!pin) return null
  const supabase = createClient()
  const { data } = await supabase
    .from('teams')
    .select('id')
    .eq('org_slug', org)
    .eq('sub_slug', team)
    .eq('edit_pin', pin)
    .maybeSingle()
  return (data?.id as string) ?? null
}

/**
 * 팀 편집 PIN 검증 — "이 리소스를 소유한 팀의 PIN 인가"를 한 번에 확인한다.
 *
 * 레거시(대회) 쓰기 라우트는 org/team 슬러그를 모르는 경우가 대부분(id/gameId 등 리소스
 * 참조로만 동작)이라 `verifyTeamPin(req, org, team)` 을 그대로 쓸 수 없다. 대신 라우트가
 * `resolveTeamIdFor*` 헬퍼로 리소스 소유 팀을 먼저 역산한 뒤, 그 teamId 로 이 함수를 호출해
 * PIN 이 "정확히 그 팀"의 것인지 대조한다. teamId 를 PIN 만으로 역산하지 않는 이유: 여러 팀이
 * 같은 PIN 을 쓸 수 있어 PIN → 팀 매핑이 모호해질 수 있기 때문이다.
 *
 * teamId 가 null 이면(소유 팀을 역산하지 못한 경우) 검증 대상이 없으므로 무조건 실패시킨다.
 */
export async function verifyTeamPinForTeam(req: Request, teamId: string | null): Promise<boolean> {
  if (!teamId) return false
  const pin = req.headers.get('X-Team-Pin')
  if (!pin) return false
  const supabase = createClient()
  const { data, error } = await supabase
    .from('teams')
    .select('id')
    .eq('id', teamId)
    .eq('edit_pin', pin)
    .maybeSingle()
  if (error) return false
  return !!data?.id
}

/** tournaments.team_id 직접 조회 */
export async function resolveTeamIdForTournament(tournamentId: string | null | undefined): Promise<string | null> {
  if (!tournamentId) return null
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tournaments')
    .select('team_id')
    .eq('id', tournamentId)
    .maybeSingle()
  if (error) return null
  return (data?.team_id as string) ?? null
}

/** games.tournament_id → tournaments.team_id 역산. games.team_type 은 신뢰하지 않는다. */
export async function resolveTeamIdForGame(gameId: string | null | undefined): Promise<string | null> {
  if (!gameId) return null
  const supabase = createClient()
  const { data, error } = await supabase
    .from('games')
    .select('tournament_id')
    .eq('id', gameId)
    .maybeSingle()
  if (error || !data?.tournament_id) return null
  return resolveTeamIdForTournament(data.tournament_id as string)
}

/** game_events.game_id → games → tournaments.team_id 역산 */
export async function resolveTeamIdForGameEvent(eventId: string | null | undefined): Promise<string | null> {
  if (!eventId) return null
  const supabase = createClient()
  const { data, error } = await supabase
    .from('game_events')
    .select('game_id')
    .eq('id', eventId)
    .maybeSingle()
  if (error || !data?.game_id) return null
  return resolveTeamIdForGame(data.game_id as string)
}

/** player_minutes.game_id → games → tournaments.team_id 역산 */
export async function resolveTeamIdForPlayerMinutes(minutesId: string | null | undefined): Promise<string | null> {
  if (!minutesId) return null
  const supabase = createClient()
  const { data, error } = await supabase
    .from('player_minutes')
    .select('game_id')
    .eq('id', minutesId)
    .maybeSingle()
  if (error || !data?.game_id) return null
  return resolveTeamIdForGame(data.game_id as string)
}

/** players.team_id 직접 조회. players.team_type 은 신뢰하지 않는다. */
export async function resolveTeamIdForPlayer(playerId: string | null | undefined): Promise<string | null> {
  if (!playerId) return null
  const supabase = createClient()
  const { data, error } = await supabase
    .from('players')
    .select('team_id')
    .eq('id', playerId)
    .maybeSingle()
  if (error) return null
  return (data?.team_id as string) ?? null
}
