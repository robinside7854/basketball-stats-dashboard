// 참여신청의 대상 날짜와 팀 배정을 푼다.
//
// 이 파일이 존재하는 이유: "다음 경기가 언제인가"와 "이 사람은 어느 팀인가"를 화면마다
// 다시 구현하면 갈라진다. 특히 팀 배정 규칙(자동/대기/수동)은 한 곳에만 있어야 한다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadIdentityResolver } from '@/lib/stats/teamIdentity'

export interface UpcomingDate {
  id: string
  date: string
  /** 고정 대관을 반영한 최종 값 — 화면은 이것만 쓰면 된다. */
  start_time: string | null
  place: string | null
  capacity: number | null
  /** 이 날만의 예외인가(false = 리그 고정 대관을 그대로 따름). 편집 화면에서 구분용. */
  overridden: boolean
}

export interface VenueDefaults {
  start_time: string | null
  place: string | null
  capacity: number | null
}

/**
 * 고정 대관(리그 기본값)을 일정 값 위에 깐다.
 *
 * ⚠ 일정 행에 기본값을 복사 저장하지 않기 때문에 읽을 때 합친다. 복사해 뒀다면 체육관이
 *   바뀌었을 때 이미 만들어진 예정 일정이 옛 장소에 굳는다.
 */
export function applyVenueDefaults(
  row: { start_time?: string | null; place?: string | null; capacity?: number | null },
  defaults: VenueDefaults | null,
): { start_time: string | null; place: string | null; capacity: number | null; overridden: boolean } {
  const own = {
    start_time: row.start_time ?? null,
    place: row.place ?? null,
    capacity: row.capacity ?? null,
  }
  return {
    start_time: own.start_time ?? defaults?.start_time ?? null,
    place: own.place ?? defaults?.place ?? null,
    capacity: own.capacity ?? defaults?.capacity ?? null,
    overridden: !!(own.start_time || own.place || own.capacity),
  }
}

export async function loadVenueDefaults(
  sb: SupabaseClient,
  leagueId: string,
): Promise<VenueDefaults | null> {
  const { data } = await sb
    .from('leagues')
    .select('default_start_time, default_place, default_capacity')
    .eq('id', leagueId)
    .maybeSingle()
  if (!data) return null
  return {
    start_time: data.default_start_time ?? null,
    place: data.default_place ?? null,
    capacity: data.default_capacity ?? null,
  }
}

/** 로컬 기준 오늘 YYYY-MM-DD. 문자열 비교로 시간대 함정을 피한다. */
export function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 신청을 받을 다음 날짜.
 *
 * ⚠ `is_skipped` 인 날짜는 제외한다. 어드민이 '대관 없음'으로 지정한 주이거나 이미 안 모인 주다 —
 *    둘 다 신청을 받으면 안 된다. 오늘 날짜는 포함한다(당일 아침 경기에도 응답할 수 있어야 한다).
 */
export async function loadNextDate(
  sb: SupabaseClient,
  leagueId: string,
): Promise<UpcomingDate | null> {
  const [{ data }, defaults] = await Promise.all([
    sb
      .from('league_schedule_dates')
      .select('id, date, start_time, place, capacity, is_skipped')
      .eq('league_id', leagueId)
      .gte('date', todayYmd())
      .order('date', { ascending: true })
      .limit(10),
    loadVenueDefaults(sb, leagueId),
  ])
  const row = (data ?? []).find(d => !d.is_skipped)
  if (!row) return null
  return { id: row.id, date: row.date, ...applyVenueDefaults(row, defaults) }
}

/**
 * 그 날짜가 속한 분기.
 *
 * 1) 기간(start_date~end_date)에 들어가는 분기
 * 2) 없으면 is_current
 * 3) 그래도 없으면 가장 최근 분기
 *
 * 기간이 비어 있는 분기가 많아 1)만으로는 못 푼다. 신청은 늘 가까운 미래를 다루므로
 * 현재 분기로 떨어지는 게 맞다.
 */
export async function resolveQuarterForDate(
  sb: SupabaseClient,
  leagueId: string,
  date: string,
): Promise<{ id: string } | null> {
  const { data } = await sb
    .from('league_quarters')
    .select('id, year, quarter, start_date, end_date, is_current')
    .eq('league_id', leagueId)
    .order('year', { ascending: false })
    .order('quarter', { ascending: false })
  const rows = data ?? []
  const inRange = rows.find(q => q.start_date && q.end_date && date >= q.start_date && date <= q.end_date)
  if (inRange) return { id: inRange.id }
  const current = rows.find(q => q.is_current)
  if (current) return { id: current.id }
  return rows[0] ? { id: rows[0].id } : null
}

export interface Assignment {
  teamId: string | null
  teamName: string | null
  /** 팀이 정해지지 않음 — 운영진 회의로 배치될 대상. */
  waiting: boolean
  /** 운영진이 직접 배치했는가(자동 판정을 덮었는가). */
  manual: boolean
}

/**
 * 팀 배정을 푼다.
 *
 * 정규회원(그 분기 team_id 있음)은 자동으로 그 팀, 비정규회원은 대기.
 * 운영진이 직접 배치한 경우(`assigned_team_id`)만 그 값이 자동 판정을 덮는다.
 *
 * ⚠ 팀 이름은 반드시 (team_id, quarter_id) 로 푼다. 이 리그는 분기마다 팀을 새로 짜기 때문에
 *    league_teams 에서 바로 읽으면 다른 분기의 이름이 붙는다.
 */
/**
 * 그 분기의 소속 — `league_player_id → team_id`.
 *
 * team_id 가 있으면 **정규회원**, 없거나 행이 아예 없으면 **비정규회원**이다.
 * (`is_regular` 컬럼과 1:1로 일치하지만, 배정을 실제로 정하는 건 team_id 라서 이쪽을 본다.)
 *
 * 분기 전체를 한 번에 읽는다 — 20~30행이라 걸러 읽을 이유가 없고, 명단 화면은 어차피
 * 전원을 필요로 한다.
 */
export async function loadQuarterMembership(
  sb: SupabaseClient,
  leagueId: string,
  quarterId: string | null,
): Promise<Map<string, string | null>> {
  if (!quarterId) return new Map()
  const { data } = await sb
    .from('league_player_quarters')
    .select('league_player_id, team_id')
    .eq('league_id', leagueId)
    .eq('quarter_id', quarterId)
  return new Map((data ?? []).map(r => [r.league_player_id as string, (r.team_id as string | null) ?? null]))
}

export async function resolveAssignments(
  sb: SupabaseClient,
  leagueId: string,
  quarterId: string | null,
  entries: Array<{ playerId: string | null; assignedTeamId: string | null }>,
): Promise<Assignment[]> {
  const [resolve, membership] = await Promise.all([
    loadIdentityResolver(sb, leagueId),
    loadQuarterMembership(sb, leagueId, quarterId),
  ])

  return entries.map(e => {
    const auto = e.playerId ? membership.get(e.playerId) ?? null : null
    const teamId = e.assignedTeamId ?? auto
    return {
      teamId,
      teamName: teamId ? resolve(teamId, quarterId)?.display_name ?? null : null,
      waiting: !teamId,
      manual: !!e.assignedTeamId,
    }
  })
}
