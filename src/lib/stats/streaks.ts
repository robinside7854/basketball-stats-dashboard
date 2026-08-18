/**
 * 리그 진행 중 연속 기록 (Streaks) 계산 유틸.
 * `/api/leagues/[id]/streaks` route 와 홈 SSR 프리페치가 공유.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/admin'
import { computePerDayStats, isDoubleDouble, fetchPlayerMeta } from './perDayStats'
import { fetchExternalTeamIds } from '@/lib/league/externalPlayers'

export type StreakCategory = 'pts10' | 'pts20' | 'tp1' | 'dd' | 'wins' | 'stlblk3'

export interface StreakEntry {
  player_id: string
  name: string
  number: number | null
  category: StreakCategory
  count: number
}

/**
 * 참여 스트릭 (Attendance Streak) — 개근/연속참여 항목.
 *
 * 스코프: 현재 시즌(leagueId) 전체
 * 대상  : 게스트(`league_players.is_guest`) 제외 · plus_one 포함
 * 라운드: 게임일(YYYY-MM-DD) 단위
 * 참여  : 그 선수의 소속 팀이 뛴 라운드에서 본인 이벤트가 1개 이상 있으면 참여
 * 정의:
 *   - current_streak: 최신 라운드부터 역방향으로 세는 진행 중 연속 참여 라운드 수
 *     (그 선수의 팀이 안 뛴 라운드는 스킵 · 0 참여 처리 안 됨)
 *   - longest_streak: 전체 시즌 내 최장 연속 참여 라운드 수 (과거 최장 포함)
 *
 * 소속팀 결정 우선순위: league_game_players (게임별 override) → league_player_quarters (분기별 정규)
 * (league_game_events 다수결이 아닌 "스케줄" 기반이라 사전 결번도 반영됨)
 */
export interface AttendanceStreakEntry {
  player_id: string
  name: string
  number: number | null
  current_streak: number
  longest_streak: number
}

export interface StreaksResult {
  streaks: StreakEntry[]
  /** 참여 스트릭 (개근/연속참여). current_streak desc → longest_streak desc → name. */
  attendance: AttendanceStreakEntry[]
}

export async function computeStreaks(
  supabase: SupabaseClient | null,
  leagueId: string,
  opts: { minStreak?: number } = {},
): Promise<StreaksResult> {
  const sb = supabase ?? createClient()
  const minStreak = Math.max(2, opts.minStreak ?? 2)

  const [{ dayStats, dayWL }, playerMeta] = await Promise.all([
    computePerDayStats(sb, leagueId),
    fetchPlayerMeta(sb, leagueId),
  ])

  const streaks: StreakEntry[] = []

  for (const [pid, byDate] of dayStats) {
    const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a))
    if (dates.length === 0) continue

    const cats: { key: StreakCategory; check: (date: string, stats: ReturnType<typeof byDate.get>) => boolean }[] = [
      { key: 'pts10',   check: (_, s) => (s?.pts ?? 0) >= 10 },
      { key: 'pts20',   check: (_, s) => (s?.pts ?? 0) >= 20 },
      { key: 'tp1',     check: (_, s) => (s?.fg3m ?? 0) >= 1 },
      { key: 'dd',      check: (_, s) => s ? isDoubleDouble(s) : false },
      { key: 'wins',    check: (date) => {
        const wl = dayWL.get(pid)?.get(date)
        return wl ? wl.wins > wl.losses : false
      }},
      { key: 'stlblk3', check: (_, s) => ((s?.stl ?? 0) + (s?.blk ?? 0)) >= 3 },
    ]

    for (const cat of cats) {
      let count = 0
      for (const date of dates) {
        const stats = byDate.get(date)
        if (cat.check(date, stats)) count++
        else break
      }
      if (count >= minStreak) {
        const meta = playerMeta[pid]
        streaks.push({
          player_id: pid,
          name: meta?.name ?? '알 수 없음',
          number: meta?.number ?? null,
          category: cat.key,
          count,
        })
      }
    }
  }

  streaks.sort((a, b) => b.count - a.count)

  // 참여 스트릭 계산 (동일 SB 연결 재사용)
  const attendance = await computeAttendanceStreaks(sb, leagueId)

  return { streaks, attendance }
}

/**
 * 참여 스트릭 계산 — 시즌 전체 기준.
 *
 * 반환 배열은 current_streak DESC → longest_streak DESC → name ASC 정렬.
 * current_streak == 0 && longest_streak == 0 인 선수는 배열에서 제외.
 */
export async function computeAttendanceStreaks(
  supabase: SupabaseClient | null,
  leagueId: string,
): Promise<AttendanceStreakEntry[]> {
  const sb = supabase ?? createClient()

  // 1) 게임 · 선수 · 팀 배정 · 게임별 override 병렬 조회
  const [
    { data: games },
    { data: players },
    { data: memberships },
    { data: gpRows },
  ] = await Promise.all([
    sb
      .from('league_games')
      .select('id, date, quarter_id, home_team_id, away_team_id')
      .eq('league_id', leagueId)
      .eq('is_started', true)
      // 친선전(비공식 라운드)은 집계에서 제외한다. 연속 기록은 "정규 라운드가 이어졌는가"가 뜻이라 비공식 경기가 끼면 끊김·이어짐이 왜곡된다.
      .eq('is_exhibition', false),
    sb
      .from('league_players')
      .select('id, name, number, is_guest')
      .eq('league_id', leagueId),
    sb
      .from('league_player_quarters')
      .select('league_player_id, quarter_id, team_id')
      .eq('league_id', leagueId),
    sb
      .from('league_game_players')
      .select('league_player_id, league_game_id, team_id')
      .eq('league_id', leagueId),
  ])

  type GameRow = { id: string; date: string; quarter_id: string | null; home_team_id: string | null; away_team_id: string | null }
  type PlayerRow = { id: string; name: string; number: number | null; is_guest: boolean | null }
  type MembershipRow = { league_player_id: string; quarter_id: string; team_id: string }
  type GpRow = { league_player_id: string; league_game_id: string; team_id: string }

  const gameRows = (games ?? []) as GameRow[]
  const nonGuest = ((players ?? []) as PlayerRow[]).filter(p => !p.is_guest)
  if (gameRows.length === 0 || nonGuest.length === 0) return []

  const gameById = new Map<string, GameRow>(gameRows.map(g => [g.id, g]))
  const gameIds = gameRows.map(g => g.id)

  // 외부(상대) 팀 배정은 참여 스트릭 대상이 아니다 — 상대 선수가 자기 팀(외부 팀) 경기에
  // 이벤트를 남겼다는 이유로 "연속 참여"로 집계되면 안 된다.
  const externalTeamIds = await fetchExternalTeamIds(sb, leagueId)

  // 2) 이벤트 페이지네이션 → 선수 × 참여일 집합
  //    (스탯 값 필요 없으므로 최소 컬럼만)
  const PAGE = 1000
  const attendedByPlayer = new Map<string, Set<string>>()
  for (let p = 0; ; p++) {
    const { data: chunk } = await sb
      .from('league_game_events')
      .select('league_player_id, league_game_id')
      .in('league_game_id', gameIds)
      .not('league_player_id', 'is', null)
      .order('id', { ascending: true })
      .range(p * PAGE, (p + 1) * PAGE - 1)
    if (!chunk || chunk.length === 0) break
    for (const e of chunk as Array<{ league_player_id: string | null; league_game_id: string }>) {
      const pid = e.league_player_id
      if (!pid) continue
      const g = gameById.get(e.league_game_id)
      if (!g) continue
      let set = attendedByPlayer.get(pid)
      if (!set) { set = new Set<string>(); attendedByPlayer.set(pid, set) }
      set.add(g.date)
    }
    if (chunk.length < PAGE) break
  }

  // 3) playerId → Map<quarter_id, team_id> (정규) / playerId → Map<game_id, team_id> (override)
  const qTeamByPlayer = new Map<string, Map<string, string>>()
  for (const m of (memberships ?? []) as MembershipRow[]) {
    let q = qTeamByPlayer.get(m.league_player_id)
    if (!q) { q = new Map(); qTeamByPlayer.set(m.league_player_id, q) }
    q.set(m.quarter_id, m.team_id)
  }
  const gpTeamByPlayer = new Map<string, Map<string, string>>()
  for (const r of (gpRows ?? []) as GpRow[]) {
    let g = gpTeamByPlayer.get(r.league_player_id)
    if (!g) { g = new Map(); gpTeamByPlayer.set(r.league_player_id, g) }
    g.set(r.league_game_id, r.team_id)
  }

  // 4) 각 선수별로 scheduled dates 계산 → current/longest 스트릭
  const results: AttendanceStreakEntry[] = []

  for (const p of nonGuest) {
    const pid = p.id
    const qTeam = qTeamByPlayer.get(pid)
    const gpTeam = gpTeamByPlayer.get(pid)
    if (!qTeam && !gpTeam) continue  // 배정 이력 전무 → 참여 대상 아님

    const scheduledSet = new Set<string>()
    for (const g of gameRows) {
      // 우선순위: 게임별 override > 분기별 정규
      const teamId = gpTeam?.get(g.id) ?? (g.quarter_id ? qTeam?.get(g.quarter_id) : undefined)
      if (!teamId) continue
      if (externalTeamIds.has(teamId)) continue
      if (g.home_team_id === teamId || g.away_team_id === teamId) {
        scheduledSet.add(g.date)
      }
    }
    if (scheduledSet.size === 0) continue

    const scheduled = [...scheduledSet].sort()  // asc
    const attended = attendedByPlayer.get(pid) ?? new Set<string>()

    // current_streak: 최신부터 역순 walk · 미참여 만나면 중단
    let current = 0
    for (let i = scheduled.length - 1; i >= 0; i--) {
      if (attended.has(scheduled[i])) current++
      else break
    }

    // longest_streak: 전 구간 walk · 연속 참여 run 의 최대치
    let longest = 0, run = 0
    for (const d of scheduled) {
      if (attended.has(d)) {
        run++
        if (run > longest) longest = run
      } else {
        run = 0
      }
    }

    if (current > 0 || longest > 0) {
      results.push({
        player_id: pid,
        name: p.name,
        number: p.number ?? null,
        current_streak: current,
        longest_streak: longest,
      })
    }
  }

  results.sort((a, b) => {
    if (b.current_streak !== a.current_streak) return b.current_streak - a.current_streak
    if (b.longest_streak !== a.longest_streak) return b.longest_streak - a.longest_streak
    return a.name.localeCompare(b.name)
  })

  return results
}
