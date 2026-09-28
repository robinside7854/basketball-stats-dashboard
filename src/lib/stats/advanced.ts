// USG% — 이 리그는 출전 시간이 추정값이라 NBA 식의 분(minutes) 보정항을 뺀다.
// 분모는 computeLeagueStats 가 이미 만드는 team_poss_in_games
// (본인이 뛴 경기 · 그 경기 본인 팀의 FGA+0.44×FTA+TOV 합)를 그대로 받는다.
export function calcUsg(p: { fga: number; fta: number; tov: number }, teamPoss: number): number | null {
  if (!(teamPoss > 0)) return null
  return +((p.fga + 0.44 * p.fta + p.tov) / teamPoss * 100).toFixed(1)
}
