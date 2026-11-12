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

/** 팀 공격 횟수(포제션) — 야투 시도 − 공격 리바운드 + 턴오버 + 자유투 시도(2026-11-12 운영진).
 *  NBA 는 자유투에 0.44 를 곱하지만(파울 한 번에 2구) 미라클은 1구로 끝나는 세트가 대부분이라 1 로 센다
 *  (실측 시도 513 · 세트 493). */
export function teamPossessions(p: { fga: number; oreb: number; tov: number; fta: number }): number {
  return Math.max(0, p.fga - p.oreb + p.tov + p.fta)
}

/** 공격·수비 레이팅 = 경기당 득점·실점 ÷ 경기당 공격 횟수 × 100. 상대 공격 횟수는 같은 경기에서 거의 같아 우리 것으로 쓴다.
 *  +1 보너스·1구 2점 규칙 때문에 NBA 숫자와 비교하지 않는다 — 미라클 팀끼리만. 공격 횟수가 없으면 null. */
export function teamRatings(ptsPg: number, oppPtsPg: number, possPg: number): { ortg: number; drtg: number; net: number } | null {
  if (!(possPg > 0)) return null
  const ortg = ptsPg / possPg * 100, drtg = oppPtsPg / possPg * 100
  return { ortg: +ortg.toFixed(1), drtg: +drtg.toFixed(1), net: +(ortg - drtg).toFixed(1) }
}

/** 선수 줄 합계 + 경기 수·득실로 팀 레이팅 — 팀 상세 「팀 스탯」과 「팀 전적」 카드가 같이 쓴다(2026-11-12).
 *  statGp = 선수 기록과 같은 경기 집합의 경기 수, played·gf·ga = 마감 경기 전적. */
export function teamRatingsFromLines(
  lines: Array<{ fga: number; oreb: number; tov: number; fta: number }>,
  statGp: number, played: number, gf: number, ga: number,
): { ortg: number; drtg: number; net: number } | null {
  if (!(played > 0) || !(statGp > 0)) return null
  const tot = lines.reduce((s, p) => ({ fga: s.fga + p.fga, oreb: s.oreb + p.oreb, tov: s.tov + p.tov, fta: s.fta + p.fta }), { fga: 0, oreb: 0, tov: 0, fta: 0 })
  return teamRatings(gf / played, ga / played, teamPossessions(tot) / statGp)
}
