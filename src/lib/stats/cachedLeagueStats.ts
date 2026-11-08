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

function normalize(raw: CachedStatOpts) {
  // 빈 값을 null 로 맞춰야 { } 와 { quarterId: undefined } 가 같은 키가 된다.
  return {
    quarterId: raw.quarterId ?? null,
    quarterIds: raw.quarterIds && raw.quarterIds.length > 0 ? raw.quarterIds : null,
    teamId: raw.teamId ?? null,
    playerId: raw.playerId ?? null,
    from: raw.from ?? null,
    to: raw.to ?? null,
    unit: raw.unit ?? ('round' as LeagueStatsUnit),
  }
}
type Opts = ReturnType<typeof normalize>
const keyOf = (o: Opts) => [o.quarterId ?? '', (o.quarterIds ?? []).join(','), o.teamId ?? '', o.playerId ?? '', o.from ?? '', o.to ?? '', o.unit]

export function getCachedLeagueStats(leagueId: string, raw: CachedStatOpts = {}): Promise<LeagueStatsResult> {
  const opts = normalize(raw)
  return unstable_cache(
    async () => computeLeagueStats(null, leagueId, opts),
    [
      // v2 (2026-11): 속공 fb_pts·fbpg 추가 · v3 (2026-11-04): 더블더블 dd2·td3 추가 · v4 (2026-11-08): 속공에 상대 득점 뒤 7초 추가 — 옛 항목에는 없어서 키를 바꿨다
      'api-league-stats', 'v4', leagueId, ...keyOf(opts),
    ],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`], revalidate: 3600 },
  )()
}

/**
 * 여러 기간·필터를 **캐시 항목 하나**로 (2026-11-03 — Vercel ISR Reads 줄이기).
 *   Vercel 은 unstable_cache 를 읽을 때마다 1회로 센다. 한 요청이 분기마다 하나씩 N번 읽으면 N회 — 10월에 무료 한도
 *   100만 회를 넘겨 사이트가 멈췄다. 같이 쓰는 조합(선수 탭 전체+분기 · 팀 탭 정체성 12개 · 선수 카드 분기표)은
 *   이걸로 한 번에 읽는다. 안에서는 computeLeagueStats 를 병렬로 돌리고, 항목은 조합 순서까지 포함한 키 하나다.
 *   ⚠ 결과 배열 순서 = 입력 순서. 개별 항목(getCachedLeagueStats)과는 **다른 캐시 항목**이라 서로 재사용되지 않는다 —
 *   그래서 한 화면에서 둘을 섞어 부르지 말고, 한 화면이면 이것 하나로 다 받는다.
 */
export function getCachedLeagueStatsMany(leagueId: string, raws: CachedStatOpts[]): Promise<LeagueStatsResult[]> {
  const list = raws.map(normalize)
  if (list.length === 0) return Promise.resolve([])
  if (list.length === 1) return getCachedLeagueStats(leagueId, list[0]).then(r => [r])
  return unstable_cache(
    async () => Promise.all(list.map(o => computeLeagueStats(null, leagueId, o))),
    ['api-league-stats-many', 'v4', leagueId, String(list.length), ...list.flatMap(keyOf)],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`], revalidate: 3600 },
  )()
}
