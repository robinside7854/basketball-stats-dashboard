// 홈 「최근 라운드」 — 기간 창(최근 N주)이 아니라 "기록이 있는 최근 N일"로 고른다.
// 체육관 휴관으로 몇 주 비면 기간 창 방식은 섹션이 통째로 비었기 때문.
export const RECENT_ROUNDS = 4

/** 경기 목록 → 최신 날짜순 [date, 그날 경기들][] (하루 = 1라운드, 최대 n개). */
export function pickRecentRounds<T extends { date: string }>(games: T[], n = RECENT_ROUNDS): [string, T[]][] {
  const byDate = new Map<string, T[]>()
  for (const g of games) {
    const list = byDate.get(g.date)
    if (list) list.push(g)
    else byDate.set(g.date, [g])
  }
  return [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, n)
}
