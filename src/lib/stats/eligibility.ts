// 리더보드 출전 자격 분리 — 자격(gp >= minRounds)과 미달(1 <= gp < minRounds)로 나눈다.
// gp 0 은 어느 쪽에도 넣지 않는다: 「전체 명단 보기」에서도 한 번도 안 뛴 선수는 표에 올릴 기록이 없다.
export function splitEligible<T extends { gp: number }>(players: T[], minRounds: number) {
  const eligible: T[] = []
  const ineligible: T[] = []
  for (const p of players) {
    if (p.gp >= minRounds) eligible.push(p)
    else if (p.gp >= 1) ineligible.push(p)
  }
  return { eligible, ineligible }
}

/**
 * 홈 「리그 리더」의 최소 출전(일) — 정본. 홈 리더(NbaLeaders)와 개인 대시보드(/me 순위)가 같이 쓴다.
 *   평소엔 3일 이상(하루 반짝한 선수가 1위에 앉지 않게), 최다 출전자의 절반 이상.
 *   분기 초에는 아무도 3일을 못 채워 카드가 통째로 비므로, 지금까지 최다 출전 일수까지 낮춘다.
 *   ⚠ 두 화면이 각자 식을 쓰면 「홈에선 2위인데 내 기록에선 순위 없음」이 된다.
 */
export function leaderMinRounds(players: ReadonlyArray<{ gp: number }>): number {
  const maxGP = players.reduce((m, p) => Math.max(m, p.gp), 0)
  return Math.max(1, Math.min(3, maxGP), Math.ceil(maxGP / 2))
}
