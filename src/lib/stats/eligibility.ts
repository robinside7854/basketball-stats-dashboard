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
