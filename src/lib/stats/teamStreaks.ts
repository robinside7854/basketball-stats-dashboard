// 팀 탭 「승패 흐름」 (2026-10-25 운영진) — 경기 단위 승·무·패 줄 + 최장 연승·연패. 순수 함수.
//   · 마감된 정규전만(친선 제외 — 순위와 같은 원칙). 점수가 같으면 무.
//   · 순서 = 날짜 → slot_num(그날 몇 번째 경기).
//   · 연승·연패는 무승부에서 끊긴다(무는 승도 패도 아니다).
//   · 팀은 정체성 키로 묶는다 — 호출부가 (team_id, 분기)를 정체성으로 풀어 넘긴다(teamIdentity 규칙).

export type StreakGame = {
  date: string
  slot: number
  home: string | null      // 정체성 키
  away: string | null
  home_score: number
  away_score: number
}
export type Outcome = 'W' | 'D' | 'L'
export type TeamGameMark = { date: string; slot: number; result: Outcome; opp: string | null; for: number; against: number }
export type StreakSummary = {
  marks: TeamGameMark[]
  longestWin: number
  longestLoss: number
  /** 지금 이어지는 흐름 — 마지막 경기 결과와 그 길이 */
  current: { result: Outcome; length: number } | null
  wins: number; draws: number; losses: number
}

export function teamMarks(games: StreakGame[], key: string): TeamGameMark[] {
  return games
    .filter(g => g.home === key || g.away === key)
    .sort((a, b) => a.date.localeCompare(b.date) || a.slot - b.slot)
    .map(g => {
      const isHome = g.home === key
      const f = isHome ? g.home_score : g.away_score
      const a = isHome ? g.away_score : g.home_score
      return { date: g.date, slot: g.slot, result: f > a ? 'W' : f < a ? 'L' : 'D', opp: isHome ? g.away : g.home, for: f, against: a }
    })
}

export function summarizeStreaks(marks: TeamGameMark[]): StreakSummary {
  let longestWin = 0, longestLoss = 0, run = 0
  let prev: Outcome | null = null
  let wins = 0, draws = 0, losses = 0
  for (const m of marks) {
    if (m.result === 'W') wins++; else if (m.result === 'L') losses++; else draws++
    run = m.result === prev ? run + 1 : 1
    prev = m.result
    if (m.result === 'W') longestWin = Math.max(longestWin, run)
    if (m.result === 'L') longestLoss = Math.max(longestLoss, run)
  }
  return { marks, longestWin, longestLoss, current: prev ? { result: prev, length: run } : null, wins, draws, losses }
}
