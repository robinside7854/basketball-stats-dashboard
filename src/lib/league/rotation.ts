// 3팀 킹오브더코트 대진 자동 편성.
//
// ## 이 리그의 실제 규칙 (2026-08-10 사용자 확인)
//
// 팀은 셋이고 코트에는 둘만 선다. 1경기는 현장에서 **가위바위보**로 정하므로 사람이 넣는다.
// 그다음부터는 두 규칙이 순서를 결정한다:
//
//   · 이긴 팀이 남는다 (승자 잔류)
//   · 단, **2경기 연속 뛴 팀은 이겼더라도 무조건 쉰다**
//
// ## 결과: 1경기 승자만 알면 나머지 8경기가 전부 정해진다
//
// 매 경기 한 팀만 교체되므로 "2연속" 에 걸리는 팀은 항상 하나다. 그래서 2경기 이후로는
// 승패와 무관하게 순서가 고정된다. W=1경기 승자, L=1경기 패자, R=1경기를 쉰 팀이라 하면:
//
//   2경기 W vs R   (W 잔류, R 투입)
//   3경기 R vs L   (W 는 2연속이라 강제 휴식 → 쉬던 L 이 들어온다)
//   4경기 L vs W   (R 이 2연속이라 휴식)
//   5경기 W vs R   ← 2경기와 같음. 이후 3경기 주기로 반복
//
// 사용자가 든 예시(A vs B 에서 A 승 → A vs C → B vs C)와 일치한다.
//
// ⚠ 좌우(홈/어웨이)는 현장에서 무작위로 정해지므로 여기서 맞출 수 없다.
// 아래는 한쪽으로 배정만 하고, 화면에서 좌우를 한 번에 뒤집을 수 있게 해 두었다.

export interface Matchup {
  homeTeamId: string
  awayTeamId: string
}

/**
 * 1경기 결과로 이후 슬롯의 대진을 만든다.
 *
 * @param winnerId  1경기 승자 팀 id
 * @param loserId   1경기 패자 팀 id
 * @param restingId 1경기를 쉰 팀 id
 * @param count     만들 대진 수 (예: 슬롯 2~9 이면 8)
 */
export function generateRotation(
  winnerId: string,
  loserId: string,
  restingId: string,
  count: number,
): Matchup[] {
  // 2경기부터의 3주기 — 위 주석의 W/R, R/L, L/W
  const cycle: [string, string][] = [
    [winnerId, restingId],
    [restingId, loserId],
    [loserId, winnerId],
  ]
  const out: Matchup[] = []
  for (let i = 0; i < count; i++) {
    const [a, b] = cycle[i % cycle.length]
    out.push({ homeTeamId: a, awayTeamId: b })
  }
  return out
}

/**
 * 1경기의 팀·점수로 승자/패자/쉰 팀을 가려낸다.
 * 무승부이거나 점수가 없으면 null — 그때는 자동 편성을 할 수 없다(어느 팀이 남는지 모른다).
 */
export function resolveFirstGame(
  homeTeamId: string | null,
  awayTeamId: string | null,
  homeScore: number | null,
  awayScore: number | null,
  allTeamIds: string[],
): { winnerId: string; loserId: string; restingId: string } | null {
  if (!homeTeamId || !awayTeamId) return null
  if (homeScore == null || awayScore == null) return null
  if (homeScore === awayScore) return null
  const restingId = allTeamIds.find(id => id !== homeTeamId && id !== awayTeamId)
  if (!restingId) return null
  return homeScore > awayScore
    ? { winnerId: homeTeamId, loserId: awayTeamId, restingId }
    : { winnerId: awayTeamId, loserId: homeTeamId, restingId }
}
