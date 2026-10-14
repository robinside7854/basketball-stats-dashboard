/**
 * 선수의 「마지막 출전일」 + 그 뒤로 빠진 경기일 수 (2026-10-14).
 *
 * 「뛴 날」 판정은 computePerDayStats 와 같다 — 그날 경기에 내 이벤트가 있거나
 * (`league_player_id`), 어시스트로 이름이 남은 날(`related_player_id`).
 *
 * ⚠ **친선전 날짜를 포함한다** — 이 지표는 성적이 아니라 「언제 나왔나(출석)」라서,
 *   친선일에 나와 뛴 사람을 「안 나왔다」고 하면 틀린다. 그래서 「빠진 경기일」도 같은 기준
 *   (친선 포함 · 기록이 시작된 날)으로 센다. 스탯·순위·출석률·연속 참석은 여전히 친선을 뺀다
 *   (computePerDayStats · computeAttendanceStreaks) — 이 함수는 점수를 계산하지 않는다.
 *
 * 경기는 `league_id` 로 거르므로 대회 묶음 기록이 리그 쪽에 섞이지 않는다(그 반대도).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface LastPlayed {
  /** 마지막으로 뛴 경기일 YYYY-MM-DD */
  date: string
  /** 그 뒤로 이 리그가 경기를 연 날(기록 시작된 날) 중 내가 안 뛴 날 수 = 연속 결장 경기일 */
  missed_game_days: number
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAGE = 1000

/** 출전 기록이 없으면 null. 조회 실패도 null — 부가 정보라 화면 전체를 막지 않는다. */
export async function computeLastPlayed(
  sb: SupabaseClient,
  leagueId: string,
  playerId: string,
): Promise<LastPlayed | null> {
  // .or() 필터 문자열에 그대로 들어가므로 형식을 먼저 확인한다(URL 경로값이 올 수 있다)
  if (!UUID_RE.test(playerId)) return null
  try {
    // 1) 이 리그의 기록 시작된 경기 → id → 날짜 (친선 포함)
    const dateByGame = new Map<string, string>()
    for (let p = 0; ; p++) {
      const { data, error } = await sb
        .from('league_games')
        .select('id, date')
        .eq('league_id', leagueId)
        .eq('is_started', true)
        .order('id', { ascending: true })
        .range(p * PAGE, (p + 1) * PAGE - 1)
      if (error) return null
      if (!data || data.length === 0) break
      for (const g of data as Array<{ id: string; date: string }>) dateByGame.set(g.id, g.date)
      if (data.length < PAGE) break
    }
    if (dateByGame.size === 0) return null

    // 2) 내 이벤트(직접 · 어시스트)의 경기 id — 선수 기준으로 읽고 이 리그 경기만 남긴다
    const playedDates = new Set<string>()
    for (let p = 0; ; p++) {
      const { data, error } = await sb
        .from('league_game_events')
        .select('league_game_id')
        .or(`league_player_id.eq.${playerId},related_player_id.eq.${playerId}`)
        // ⚠ 정렬 없이 나눠 읽으면 페이지 사이에서 줄이 빠지거나 겹친다
        .order('id', { ascending: true })
        .range(p * PAGE, (p + 1) * PAGE - 1)
      if (error) return null
      if (!data || data.length === 0) break
      for (const r of data as Array<{ league_game_id: string }>) {
        const d = dateByGame.get(r.league_game_id)
        if (d) playedDates.add(d)
      }
      if (data.length < PAGE) break
    }
    if (playedDates.size === 0) return null

    const last = [...playedDates].sort().at(-1)!
    const laterDays = new Set<string>()
    for (const d of dateByGame.values()) if (d > last) laterDays.add(d)
    return { date: last, missed_game_days: laterDays.size }
  } catch {
    return null
  }
}
