// 리그 분기 목록 — `GET /quarters` 와 리그 레이아웃(서버)이 같은 함수를 쓴다 (2026-10-12, 리뉴얼 5단계).
//
// 레이아웃이 이 값을 서버에서 받아 LeagueQuarterProvider 에 초기값으로 넘기면, 리그 화면 진입마다
// 나가던 `/quarters` 요청 하나가 사라진다. 두 경로가 갈라지면 같은 분기 목록이 화면마다 달라지므로
// 조회·「현재 분기」 깃발 보정은 여기 한 곳에만 둔다.
//
// ⚠ 권한 판정은 호출부의 몫이다 — 라우트는 canViewLeague, 레이아웃은 isLeaguePrivateGated 를 먼저 통과한 뒤 부른다.
// ⚠ 개인 데이터가 아니다(리그 공용 분기 표) — 레이아웃 초기값으로 실어도 된다.

import { cache } from 'react'
import { createClient } from '@/lib/supabase/admin'
import { pickCurrentQuarter } from '@/lib/league/currentQuarter'
import type { Quarter } from '@/types/league'

type Row = Omit<Quarter, 'is_current' | 'start_date' | 'end_date'> & { is_current: boolean | null; start_date: string | null; end_date: string | null }

/**
 * 분기 목록(대회 행 포함, year·quarter 순)을 읽고 「현재 분기」 깃발을 **날짜로 바로잡아** 돌려준다.
 * 깃발이 틀려 있으면 DB 도 함께 맞춘다(2026-10-11 — 깃발을 직접 읽는 서버 코드까지 같은 답을 보게).
 * 조회 실패 시 `{ error }`.
 */
export async function loadLeagueQuarters(
  supabase: ReturnType<typeof createClient>,
  leagueId: string,
): Promise<{ quarters: Quarter[]; error: null } | { quarters: null; error: string }> {
  const { data: quarters, error } = await supabase
    .from('league_quarters')
    .select('*')
    .eq('league_id', leagueId)
    .order('year').order('quarter')

  if (error) return { quarters: null, error: error.message }

  // 「현재 분기」 깃발을 **날짜로 바로잡는다** (2026-10-11).
  //   10월인데 설정·드래프트·팀 명단이 3분기를 「현재」로 보여줬다 — 홈·스탯은 날짜로 판정해
  //   4분기였는데, 깃발을 직접 읽는 화면들은 운영자가 깃발을 옮기기 전까지 옛 분기에 머물렀다.
  //   판정은 정본 `pickCurrentQuarter()`(① 오늘이 기간 안 ② 깃발 ③ 최근) 하나로 하고,
  //   DB 깃발도 그 결과로 맞춰 둔다 — 깃발을 직접 읽는 서버 코드까지 같은 답을 보게.
  const rows = (quarters ?? []) as Row[]
  const pick = pickCurrentQuarter(rows)
  if (pick && !pick.is_current) {
    const { error: fixErr } = await supabase.from('league_quarters').update({ is_current: false }).eq('league_id', leagueId).neq('id', pick.id)
    const { error: setErr } = fixErr ? { error: fixErr } : await supabase.from('league_quarters').update({ is_current: true }).eq('id', pick.id)
    // 깃발 쓰기가 실패해도 이번 응답은 날짜 기준으로 바로잡아 내보낸다.
    if (setErr) console.error('[quarters] is_current 동기화 실패', setErr.message)
  }
  return {
    quarters: rows.map(q => ({ ...q, is_current: pick ? q.id === pick.id : !!q.is_current })) as Quarter[],
    error: null,
  }
}

/**
 * 한 번의 서버 렌더 안에서 분기 목록을 나눠 쓴다(2026-10-27) — 레이아웃과 스탯 페이지가 같은 렌더에서
 * 각자 부르면 조회(와 깃발 보정 쓰기)가 두 번 났다. 요청이 바뀌면 다시 읽는다(React cache).
 */
export const getLeagueQuarters = cache((leagueId: string) => loadLeagueQuarters(createClient(), leagueId))
