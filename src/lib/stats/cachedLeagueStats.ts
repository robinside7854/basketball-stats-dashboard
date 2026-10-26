// computeLeagueStats 의 캐시판 — 스탯 탭(/stats 라우트)과 선수 카드(detail·career)가 **같은 캐시 항목**을 쓴다.
//
// 왜: 선수 카드를 열 때마다 detail·career 가 리그 전체 이벤트 집계를 새로 돌렸다(2026-10-14 「선수 숫자는 한 벌」
//   이후 정본이 computeLeagueStats 하나가 되면서 생긴 비용). 스탯 탭은 이미 unstable_cache 로 감싸 두었으므로
//   같은 키·같은 콜백으로 감싸면 같은 기간이면 한 번 계산한 결과를 서로 재사용한다.
//   ⚠ unstable_cache 의 키에는 콜백 소스도 들어간다 — 콜백을 이 파일 한 곳에만 두어야 두 경로가 키를 공유한다.
//
// 무효화: `league-{id}-games` 태그 — 경기·이벤트 mutation API 들의 기존 revalidateTag 로 자동으로 풀린다.
// 키에는 리그 id 와 기간·필터만 들어간다(개인 정보 없음 — 요청자와 무관한 리그 전체 집계다).

import { unstable_cache } from 'next/cache'
import { computeLeagueStats, type LeagueStatsResult, type LeagueStatsUnit } from './leagueStats'

export type CachedStatOpts = {
  quarterId?: string | null
  quarterIds?: string[] | null
  teamId?: string | null
  playerId?: string | null
  from?: string | null
  to?: string | null
  unit?: LeagueStatsUnit
}

export function getCachedLeagueStats(leagueId: string, raw: CachedStatOpts = {}): Promise<LeagueStatsResult> {
  // 빈 값을 null 로 맞춰야 { } 와 { quarterId: undefined } 가 같은 키가 된다.
  const opts = {
    quarterId: raw.quarterId ?? null,
    quarterIds: raw.quarterIds && raw.quarterIds.length > 0 ? raw.quarterIds : null,
    teamId: raw.teamId ?? null,
    playerId: raw.playerId ?? null,
    from: raw.from ?? null,
    to: raw.to ?? null,
    unit: raw.unit ?? ('round' as LeagueStatsUnit),
  }
  return unstable_cache(
    async () => computeLeagueStats(null, leagueId, opts),
    [
      'api-league-stats', leagueId,
      opts.quarterId ?? '', (opts.quarterIds ?? []).join(','),
      opts.teamId ?? '', opts.playerId ?? '', opts.from ?? '', opts.to ?? '', opts.unit,
    ],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`], revalidate: 3600 },
  )()
}
