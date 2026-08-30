// 경기 + 쿼터 → 그 장면이 담긴 영상. **판정은 여기 하나뿐이다.**
//
// 왜 정본을 따로 두는가
//   촬영본이 쿼터별로 쪼개진 경기(대회)에서는 "이 이벤트의 영상"이 이벤트마다 다르다.
//   이 판정을 클립·명경기·마일스톤·박스스코어에 각각 적어 넣으면, 하나만 빠뜨렸을 때
//   그 화면의 클립만 조용히 1쿼터 영상의 엉뚱한 지점을 가리킨다 — 숫자가 그럴듯해서
//   아무도 눈치채지 못한다. 플러스원 판정식이 28곳에 복붙돼 있던 것과 같은 병이다
//   (2026-08-23, scoring.ts 의 isPlusOneFor 로 모은 사건).
//
// 폴백 규칙
//   1. 그 경기의 그 쿼터 영상(league_game_videos)이 있으면 그것
//   2. 없으면 경기의 대표 영상(league_games.youtube_url) — 쿼터 영상이 0건인
//      기존 리그 경기 전부가 여기로 떨어져 종전과 100% 같게 동작한다.

import type { SupabaseClient } from '@supabase/supabase-js'

export type GameVideo = { url: string; startOffset: number }

/** 경기 대표 영상. 폴백 대상이자, 쿼터 영상을 저장할 때 함께 갱신되는 값. */
export type GameVideoFallback = {
  youtube_url: string | null
  youtube_start_offset?: number | null
}

/**
 * 경기 id → (쿼터 → 영상) 표.
 *
 * 클립 조립은 이벤트를 수백 건 순회하므로 이벤트마다 조회하면 안 된다 —
 * 경기 목록을 통째로 받아 한 번에 읽고, 아래 resolver 로 메모리에서 푼다.
 */
export async function fetchQuarterVideos(
  supabase: SupabaseClient,
  gameIds: string[],
): Promise<Map<string, Map<number, GameVideo>>> {
  const byGame = new Map<string, Map<number, GameVideo>>()
  if (gameIds.length === 0) return byGame

  const { data, error } = await supabase
    .from('league_game_videos')
    .select('league_game_id, quarter, youtube_url, start_offset')
    .in('league_game_id', gameIds)
  // 조용히 빈 표로 넘기면 전 클립이 대표 영상(=1쿼터)으로 폴백해, 2~4쿼터 클립이
  //   전부 1쿼터 영상의 엉뚱한 지점을 가리킨다. 재생은 되므로 오류로 보이지 않는다.
  if (error) throw new Error(`league_game_videos: 쿼터 영상 조회 실패 — ${error.message}`)

  for (const r of (data ?? []) as Array<{
    league_game_id: string; quarter: number; youtube_url: string; start_offset: number | null
  }>) {
    let m = byGame.get(r.league_game_id)
    if (!m) { m = new Map(); byGame.set(r.league_game_id, m) }
    m.set(r.quarter, { url: r.youtube_url, startOffset: r.start_offset ?? 0 })
  }
  return byGame
}

/**
 * fetchQuarterVideos 결과 + 경기 행 → 이 이벤트를 재생할 영상.
 *
 * @param quarter 이벤트의 쿼터. null/undefined 면 쿼터를 안 찍던 옛 기록이므로 대표 영상을 쓴다.
 *                (리그 이벤트 17,869건이 quarter=1 하드코딩이던 시절이 있다 — 2026-08-18)
 */
export function resolveGameVideo(
  quarterVideos: Map<string, Map<number, GameVideo>>,
  gameId: string,
  quarter: number | null | undefined,
  fallback: GameVideoFallback,
): GameVideo | null {
  if (quarter != null) {
    const hit = quarterVideos.get(gameId)?.get(quarter)
    if (hit) return hit
  }
  if (fallback.youtube_url) {
    return { url: fallback.youtube_url, startOffset: fallback.youtube_start_offset ?? 0 }
  }
  return null
}

/**
 * 대표 영상으로 쓸 쿼터를 고른다 — **가장 이른 쿼터**.
 *
 * league_games.youtube_url 을 비워 두면 안 되는 이유가 여기 있다: 하이라이트 로더 여러 곳이
 * `.not('youtube_url','is',null)` 로 "영상 있는 경기"를 거른다. 비우면 그 경기가 화면에서
 * 통째로 사라지고, 데이터가 지워진 것처럼 보인다.
 */
export function pickRepresentative(
  videos: Array<{ quarter: number; youtube_url: string; start_offset?: number | null }>,
): GameVideo | null {
  if (videos.length === 0) return null
  const first = [...videos].sort((a, b) => a.quarter - b.quarter)[0]
  return { url: first.youtube_url, startOffset: first.start_offset ?? 0 }
}
