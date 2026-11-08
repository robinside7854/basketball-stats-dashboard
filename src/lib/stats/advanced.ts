// USG% — 이 리그는 출전 시간이 추정값이라 NBA 식의 분(minutes) 보정항을 뺀다.
// 분모는 computeLeagueStats 가 이미 만드는 team_poss_in_games
// (본인이 뛴 경기 · 그 경기 본인 팀의 FGA+0.44×FTA+TOV 합)를 그대로 받는다.
export function calcUsg(p: { fga: number; fta: number; tov: number }, teamPoss: number): number | null {
  if (!(teamPoss > 0)) return null
  return +((p.fga + 0.44 * p.fta + p.tov) / teamPoss * 100).toFixed(1)
}

// 턴오버율(TOV%) — 정본(2026-11-08 운영진: 팀·선수 스탯에 바로 보이게).
//   = TOV ÷ (FGA + 0.44×FTA + TOV) × 100 — 내가 공격을 끝낸 기회(슛·자유투·턴오버) 중 턴오버로 끝난 비중. 낮을수록 좋다.
//   공격 기회가 TOV_PCT_MIN_POSS 보다 적으면 null(「—」) — 한두 번 공 잡은 선수가 0%·50% 로 줄 서지 않게.
//   선수 레이더(hexRadar 리딩 축)·팀 탭 상세 지표와 같은 식이다. 화면에서 다시 쓰지 말 것.
export const TOV_PCT_MIN_POSS = 20
export function tovPct(p: { fga: number; fta: number; tov: number }, minPoss = TOV_PCT_MIN_POSS): number | null {
  const poss = p.fga + 0.44 * p.fta + p.tov
  if (!(poss > 0) || poss < minPoss) return null
  return +((p.tov / poss) * 100).toFixed(1)
}
