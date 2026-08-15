/**
 * 슈팅 성공률 색상 기준선 — 실측 분포에서 뽑은 단일 원본 (2026-08-15)
 *
 * 왜 이 파일이 필요한가
 *   기준선이 화면마다 하드코딩돼 있으면 같은 선수가 화면 따라 다른 색으로 보인다.
 *   2026-08-15 감사에서 실제로 그런 상태였고(박스스코어는 50% 하나로 통일, 슛차트는 45/30),
 *   그때 값을 FG40/3P33/FT70 으로 맞췄지만 **그 값 자체가 실측 근거가 없었다**.
 *   지금 값은 전부 DB 재집계 결과다 — `node scripts/shooting-baseline.mjs` 로 언제든 재산출한다.
 *
 * 기준선의 뜻
 *   `good` = 해당 모집단의 **평균 성공률**. 이 이상이면 초록(평균 이상), 미만이면 노랑.
 *   "프로 기준으로 잘 쏜다"가 아니라 "이 리그에서 평균 이상이다"라는 뜻이다.
 *   프로 기준(FG45/3P36/FT75)을 그대로 쓰면 전원이 노랑이 되어 색이 정보를 잃는다.
 *
 * 모집단이 둘로 갈리는 이유 (합치면 안 된다)
 *   club   = `game_events`        — 미라클모닝 팀 대시보드 `/[org]/[team]/*`
 *   league = `league_game_events` — 리그 화면 `/league/*`
 *   FG·3P 는 비슷하지만 **FT 가 64% vs 43% 로 크게 다르다.** 리그 쪽 자유투는 표본이
 *   423개뿐이고 그중 385개가 `ft_2pt`(1구 2점) 합성 이벤트라 실제 자유투 분포가 아니다.
 *   (→ `reference_league_event_synthesis` 참고) 그래서 한 값으로 통일하지 않는다.
 *   같은 선수가 두 화면에서 다른 색일 수 있지만, 그건 **다른 대회의 다른 기록**이므로 정상이다.
 */

export interface ShootingBaseline {
  /** 전체 야투 성공률 평균 (%) */
  fg: number
  /** 3점 성공률 평균 (%) */
  fg3: number
  /** 자유투 성공률 평균 (%) */
  ft: number
  /** 존별 야투 성공률 평균 (%) — 존마다 난이도가 달라 한 선으로 재면 안 된다 */
  zone: { post: number; layup: number; mid: number; three: number }
}

/**
 * 미라클모닝 팀 대시보드 (`game_events`, 2026-08-15 기준)
 *   FG 665/1774 = 37.5 · 3P 186/724 = 25.7 · FT 300/467 = 64.2
 *   골밑 157/288 = 54.5 · 레이업 202/352 = 57.4 · 미들 120/410 = 29.3
 */
export const CLUB_BASELINE: ShootingBaseline = {
  fg: 38,
  fg3: 26,
  ft: 64,
  zone: { post: 55, layup: 57, mid: 29, three: 26 },
}

/**
 * 미라클 리그 (`league_game_events`, 2026-08-15 기준)
 *   FG 3074/8766 = 35.1 · 3P 454/2091 = 21.7 · FT 184/423 = 43.5 (표본 부족·합성 주의)
 *   골밑 663/1202 = 55.2 · 레이업 957/1971 = 48.6 · 미들 1000/3502 = 28.6
 */
export const LEAGUE_BASELINE: ShootingBaseline = {
  fg: 35,
  fg3: 22,
  ft: 44,
  zone: { post: 55, layup: 49, mid: 29, three: 22 },
}

export type PctKind = 'fg' | 'fg3' | 'ft'

/**
 * 2단계 색 판정 (박스스코어·시즌 스탯 표)
 * 기준선을 정한 적 없는 지표(eFG%·TS%)는 `kind` 를 넘기지 않으면 무채색이 된다 —
 * 근거 없는 값으로 칭찬/감점하지 않기 위해서다.
 */
export function isAboveBaseline(val: number, kind: PctKind, base: ShootingBaseline): boolean {
  return val >= base[kind]
}

export type Tier = 'high' | 'mid' | 'low' | 'none'

/** '평균 대비 잘함/못함'으로 볼 여유 폭 (±15%) */
const MARGIN = 0.15

/**
 * 3단계 색 판정의 공통 규칙 — 절대값이 아니라 **주어진 평균 대비**로 잰다.
 * 시도 3회 미만은 판정하지 않는다(1/1 = 100% 같은 표본 노이즈).
 */
export function tierAgainst(pct: number, attempts: number, avg: number): Tier {
  if (attempts < 3) return 'none'
  if (pct >= avg * (1 + MARGIN)) return 'high'
  if (pct < avg * (1 - MARGIN)) return 'low'
  return 'mid'
}

/**
 * 존별 색 판정 (슛 차트·존별 표)
 * 미들 30% 는 평균 이상이고 골밑 45% 는 평균 미만인데,
 * 45/30 한 선으로 재면 정확히 반대로 표시된다.
 */
export function zoneTier(
  pct: number,
  attempts: number,
  zone: keyof ShootingBaseline['zone'],
  base: ShootingBaseline,
): Tier {
  return tierAgainst(pct, attempts, base.zone[zone])
}

/** 화면 하단 캡션용 — 색이 무슨 뜻인지 밝히지 않으면 "40%인데 왜 초록?" 이 된다 */
export function baselineCaption(base: ShootingBaseline): string {
  return `색 기준: 평균 성공률(FG ${base.fg}% · 3P ${base.fg3}% · FT ${base.ft}%) 이상이면 초록`
}
