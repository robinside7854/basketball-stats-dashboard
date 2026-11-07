// 달 단위 정규 소속 (마이그레이션 120, 2026-11-07 운영진 요청)
//
// 분기 소속(league_player_quarters) 위에 「이 달만 다르게」를 덮어쓰는 층이다.
//   판정 = 경기 날짜의 달에 행이 있으면 그 행, 없으면 분기 소속.
//   행이 하나도 없으면(또는 표가 아직 없으면) 이 표가 생기기 전과 똑같이 동작한다.
//
// ⚠ 순위·팀 이름·스탯은 계속 분기 단위다. 이 표는 기록 화면의 「누가 이 팀 정규인가」만 바꾼다.
//   이미 기록된 경기는 이벤트마다 team_id 가 저장돼 있어 박스스코어가 달라지지 않는다.
import type { SupabaseClient } from '@supabase/supabase-js'

/** 'YYYY-MM-DD' 또는 'YYYY-MM' → 'YYYY-MM-01'. 모양이 틀리면 null. */
export function monthOf(value: string | null | undefined): string | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})/.exec(value)
  if (!m) return null
  const mm = Number(m[2])
  if (mm < 1 || mm > 12) return null
  return `${m[1]}-${m[2]}-01`
}

/** 'YYYY-MM-01' → '11월' (같은 해) 또는 '2027년 1월' */
export function monthLabel(month: string, refYear?: number): string {
  const y = Number(month.slice(0, 4))
  const mm = Number(month.slice(5, 7))
  return refYear && refYear === y ? `${mm}월` : `${y}년 ${mm}월`
}

/** 기간 안의 달 목록(양 끝 포함). 날짜가 없으면 빈 배열. */
export function monthsBetween(start: string | null | undefined, end: string | null | undefined): string[] {
  const a = monthOf(start)
  const b = monthOf(end)
  if (!a || !b || a > b) return []
  const out: string[] = []
  let y = Number(a.slice(0, 4))
  let m = Number(a.slice(5, 7))
  for (let i = 0; i < 24; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}-01`
    if (key > b) break
    out.push(key)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}

export type MonthRosterRow = {
  league_player_id: string
  team_id: string | null
  is_regular: boolean
}

/**
 * 그 달의 덮어쓰기 행을 선수 id → 행 으로 돌려준다.
 * 표가 아직 없거나(마이그레이션 전) 조회가 실패하면 빈 Map — 분기 소속 그대로 동작한다.
 */
export async function loadMonthRoster(
  supabase: SupabaseClient,
  leagueId: string,
  month: string | null,
): Promise<Map<string, MonthRosterRow>> {
  const out = new Map<string, MonthRosterRow>()
  if (!month) return out
  const { data, error } = await supabase
    .from('league_player_months')
    .select('league_player_id, team_id, is_regular')
    .eq('league_id', leagueId)
    .eq('month', month)
  if (error) {
    if (!/does not exist|schema cache/i.test(error.message)) {
      console.error(`[monthlyRoster] ${leagueId} ${month} 조회 실패: ${error.message}`)
    }
    return out
  }
  for (const r of (data ?? []) as MonthRosterRow[]) out.set(r.league_player_id, r)
  return out
}
