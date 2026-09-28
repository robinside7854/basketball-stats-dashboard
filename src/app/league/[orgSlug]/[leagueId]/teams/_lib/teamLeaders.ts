// 팀 내 1위(득점왕 등)는 그 분기 정규 명단에 있는 선수만 후보다.
// /stats?teamId= 는 실제로 뛴 팀 기준으로 경기를 귀속시켜서, 비정규가 1경기만 뛰어도
// 평균이 높으면 그 팀 1위를 차지했다(서동혁 사례).
// 동점이면 먼저 온 행 — 예전 `[...rows].sort(desc)[0]` 과 같은 결과.
export function pickTeamLeader<T extends { player_id: string }>(
  rows: readonly T[],
  regularIds: ReadonlySet<string>,
  score: (r: T) => number,
): T | undefined {
  let best: T | undefined
  for (const r of rows) {
    if (!regularIds.has(r.player_id)) continue
    if (!best || score(r) > score(best)) best = r
  }
  return best
}
