// 홈의 "지금 분기" 판정 — 순위표·리그 리더·최근 라운드가 **같은 분기**를 보게 한다 (2026-10-10).
//
// 배경: 4분기(10월)로 넘어가면서 홈 리더보드가 시즌 누적 그대로였고, 순위표는 `is_current` 하나에
//   기대고 있어 그 깃발을 늦게 옮기면 3분기 순위가 계속 떠 있었다.
//
// 고르는 순서
//   1. **오늘이 기간(start_date~end_date) 안에 드는 분기** — 운영자가 깃발을 안 옮겨도 날짜로 넘어간다
//   2. `is_current=true` 분기
//   3. 가장 최근 분기(year, quarter 내림차순)
//   대회(kind='tournament') 행은 분기가 아니므로 뺀다.
//
// 그 분기의 경기를 고를 때도 **기간이 있으면 날짜로** 고른다(`gameDateRange`).
//   경기의 quarter_id 는 기록 화면을 열 때 뒤늦게 채워지고, 4분기 행을 만들기 전에 기록한 경기는
//   `is_current`(=3분기)로 채워진다. 날짜는 틀릴 수가 없다.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface CurrentQuarter {
  id: string
  year: number
  quarter: number
  /** `26.4Q` */
  label: string
  start_date: string | null
  end_date: string | null
}

type Row = {
  id: string; year: number; quarter: number; is_current: boolean | null
  start_date: string | null; end_date: string | null; kind?: string | null
}

/** 한국 시간 기준 오늘 `YYYY-MM-DD` — 서버(UTC)에서 토요일 오전 경기가 금요일로 읽히지 않게 */
function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

/**
 * 분기 목록에서 지금 분기를 고른다 — 서버(홈)·클라이언트(스탯·팀 탭·분기 컨텍스트) 공용.
 * 순서는 파일 머리 주석. 대회 행은 뺀다. 정렬 순서와 무관하게 동작한다.
 */
export function pickCurrentQuarter<T extends {
  year: number; quarter: number; is_current?: boolean | null
  start_date?: string | null; end_date?: string | null; kind?: string | null
}>(all: T[], today: string = todayKst()): T | null {
  const rows = all.filter(q => q.kind !== 'tournament')
    .sort((a, b) => b.year - a.year || b.quarter - a.quarter)
  if (rows.length === 0) return null
  return rows.find(q => q.start_date && q.end_date && q.start_date <= today && today <= q.end_date)
    ?? rows.find(q => q.is_current)
    ?? rows[0]
}

export async function loadCurrentQuarter(
  supabase: SupabaseClient,
  leagueId: string,
): Promise<CurrentQuarter | null> {
  const { data } = await supabase
    .from('league_quarters')
    .select('id, year, quarter, is_current, start_date, end_date, kind')
    .eq('league_id', leagueId)
    .order('year', { ascending: false })
    .order('quarter', { ascending: false })
  const rows = ((data ?? []) as Row[]).filter(q => q.kind !== 'tournament')
  if (rows.length === 0) return null

  const pick = pickCurrentQuarter(rows)!

  return {
    id: pick.id,
    year: pick.year,
    quarter: pick.quarter,
    label: `${String(pick.year).slice(2)}.${pick.quarter}Q`,
    start_date: pick.start_date,
    end_date: pick.end_date,
  }
}

/** 기간이 둘 다 있으면 날짜 범위, 아니면 null(→ quarter_id 로 거른다). */
export function gameDateRange(q: CurrentQuarter): { from: string; to: string } | null {
  return q.start_date && q.end_date ? { from: q.start_date, to: q.end_date } : null
}
