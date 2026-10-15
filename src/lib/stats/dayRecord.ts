// 「그날 팀 승패」 한 벌 (2026-10-15).
//
// 왜 한 곳인가
//   같은 숫자가 네 화면에 있었는데 규칙이 제각각이었다 — 홈(친선 제외 · 승률→득실),
//   일정(친선 제외 · 이름으로 묶음 · 승−패 순), 하이라이트 날짜 카드(친선 포함 · 승 순),
//   박스스코어 「경기결과」(친선 포함 · team_id 로 묶음). 같은 날을 두 화면에서 보면 승패가 달랐다.
//   ⚠ 화면에서 다시 세지 말 것 — 하나만 빠져도 그 화면만 조용히 다른 숫자가 된다
//   (isPlusOneFor · resolveGameVideo 와 같은 병).
//
// 규칙
//   · 마감된 경기만 센다(is_complete 가 false 면 제외. 값이 없으면 호출부가 이미 마감만 골랐다고 본다).
//   · **친선전은 센다에서 뺀다** — 순위·개인 스탯과 같은 원칙(CLAUDE.md 「친선전」).
//     단, 그날 경기가 **친선전뿐**이면 숨기지 않고 친선전으로 세어 `exhibitionOnly` 로 알린다 —
//     화면은 「친선전」 라벨을 붙인다(숨기면 그날 무슨 일이 있었는지가 사라진다).
//   · 팀은 정체성 키로 묶는다 — `${team_id}::${표시 이름}` = teamIdentity.ts 의 ResolvedIdentity.key.
//     분기마다 같은 team_id 가 다른 팀이 되므로(락다운→굿모닝) team_id 만으로도, 이름만으로도 안 된다.
//   · 정렬 = 승률 ↓ → 득실차 ↓ → 이름. 홈 순위표(computeCurrentQuarterStandings)와 같은 순서.

export interface DayRecordSide {
  /** 정체성 키 — identityKeyOf(team_id, 표시 이름) 또는 resolver(...).key */
  key: string
  name: string
  color: string | null
}

export interface DayRecordGame {
  home: DayRecordSide | null
  away: DayRecordSide | null
  home_score: number | null
  away_score: number | null
  is_complete?: boolean | null
  is_exhibition?: boolean | null
}

export interface DayTeamRecord {
  key: string
  name: string
  color: string | null
  wins: number
  losses: number
  draws: number
  ptsFor: number
  ptsAgainst: number
}

export interface DayRecord {
  teams: DayTeamRecord[]
  /** 센 정규전 수 */
  regularGames: number
  /** 그날 마감된 친선전 수(센 것과 무관하게 — 화면의 「친선 N경기」용) */
  exhibitionGames: number
  /** 정규전이 하나도 없어 친선전으로 셌다 — 화면은 「친선전」 라벨을 붙인다 */
  exhibitionOnly: boolean
}

/** teamIdentity.ts 의 키 규칙과 같다 — 서버 resolver 없이 (team_id, 이미 분기로 푼 이름)만 있을 때 */
export function identityKeyOf(teamId: string, displayName: string): string {
  return `${teamId}::${displayName}`
}

function tally(games: DayRecordGame[]): DayTeamRecord[] {
  const agg = new Map<string, DayTeamRecord>()
  const ensure = (s: DayRecordSide) => {
    let t = agg.get(s.key)
    if (!t) {
      t = { key: s.key, name: s.name, color: s.color, wins: 0, losses: 0, draws: 0, ptsFor: 0, ptsAgainst: 0 }
      agg.set(s.key, t)
    }
    return t
  }
  for (const g of games) {
    if (!g.home || !g.away) continue
    const h = ensure(g.home)
    const a = ensure(g.away)
    const hs = g.home_score ?? 0
    const as_ = g.away_score ?? 0
    h.ptsFor += hs; h.ptsAgainst += as_
    a.ptsFor += as_; a.ptsAgainst += hs
    if (hs > as_) { h.wins++; a.losses++ }
    else if (hs < as_) { a.wins++; h.losses++ }
    else { h.draws++; a.draws++ }
  }
  return [...agg.values()]
    .filter(t => t.wins + t.losses + t.draws > 0)
    .sort(compareDayTeams)
}

/** 승률 ↓ → 득실차 ↓ → 이름 */
export function compareDayTeams(a: DayTeamRecord, b: DayTeamRecord): number {
  const ar = a.wins / Math.max(1, a.wins + a.losses + a.draws)
  const br = b.wins / Math.max(1, b.wins + b.losses + b.draws)
  if (br !== ar) return br - ar
  const md = (b.ptsFor - b.ptsAgainst) - (a.ptsFor - a.ptsAgainst)
  if (md !== 0) return md
  return a.name.localeCompare(b.name, 'ko')
}

/** 하루치 경기 → 팀별 승패. 위 규칙 그대로. */
export function tallyDayRecord(games: DayRecordGame[]): DayRecord {
  const done = games.filter(g => g.is_complete !== false && g.home && g.away)
  const regular = done.filter(g => !g.is_exhibition)
  const exhibition = done.filter(g => !!g.is_exhibition)
  if (regular.length > 0) {
    return { teams: tally(regular), regularGames: regular.length, exhibitionGames: exhibition.length, exhibitionOnly: false }
  }
  return {
    teams: tally(exhibition),
    regularGames: 0,
    exhibitionGames: exhibition.length,
    exhibitionOnly: exhibition.length > 0,
  }
}
