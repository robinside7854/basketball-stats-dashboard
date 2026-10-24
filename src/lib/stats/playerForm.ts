// 선수 카드 「최근 트렌드 → 요즘 흐름」 (2026-10-24 운영진) — 순수 함수만.
//
// 무엇을 보여 주나 (토스 소비 리포트 · 달다방 주기 리포트 · 다음 날씨를 참고)
//   ① 문장 한 줄   : 「지난 분기보다 하루 평균 3.2점 더 넣는 중」 — 분기 하루 평균은 정본(computeLeagueStats)에서 받는다
//   ② 평소 범위    : 하루 기록을 줄 세운 가운데 절반(25%~75%) — 「평소 15~27점」
//   ③ 꾸준함 판정  : 꾸준 · 보통 · 기복 — 아래 식
//   ④ 지난 경기일  : 그날 기록이 평소 범위보다 위·안·아래인지
//
// 꾸준함 식
//   하루 합계는 그날 뛴 경기 수(승자 잔류라 3~6경기로 날마다 다르다)에 끌려가므로 **경기당 값**으로 흔들림을 잰다.
//   변동계수 = 경기당 값의 표준편차 ÷ 평균. 2026-10-24 미라클 실측(8일 이상 · 득점 22명의 3등분 지점 0.42/0.52)으로 정했다:
//     < STEADY_CV → 꾸준 / > SWINGY_CV → 기복 / 그 사이 보통.
//   평균이 작으면 작은 차이도 크게 보여(하루 2점 선수가 0점·4점을 오가면 계수 1.0) 판정하지 않는다 — MIN_MEAN.
//   표본이 적으면 판정하지 않는다 — MIN_DAYS.

export type FormStatKey = 'pts' | 'reb' | 'ast'
export type FormDay = { date: string; games: number; pts: number; reb: number; ast: number }
export type Consistency = 'steady' | 'normal' | 'swingy'

export const FORM_STATS: { key: FormStatKey; label: string; unit: string }[] = [
  { key: 'pts', label: '득점', unit: '점' },
  { key: 'reb', label: '리바', unit: '개' },
  { key: 'ast', label: '어시', unit: '개' },
]

export const MIN_DAYS = 8
export const STEADY_CV = 0.42
export const SWINGY_CV = 0.55
/** 판정에 필요한 하루 평균 최소값 — 이보다 작으면 범위만 보여 준다 */
export const MIN_MEAN: Record<FormStatKey, number> = { pts: 6, reb: 3, ast: 1.5 }

export const CONSISTENCY_LABEL: Record<Consistency, string> = { steady: '꾸준', normal: '보통', swingy: '기복' }

/** 정렬된 배열의 분위수(선형 보간) */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos), hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export type StatForm = {
  key: FormStatKey
  /** 하루 평균 */
  mean: number
  /** 평소 범위(하루 합계 25%~75%) — 정수로 반올림 */
  low: number
  high: number
  max: number
  /** 경기당 변동계수(판정 재료) — 판정 못 하면 null */
  cv: number | null
  consistency: Consistency | null
}

export function statForm(days: FormDay[], key: FormStatKey): StatForm {
  const vals = days.map(d => d[key])
  const sorted = [...vals].sort((a, b) => a - b)
  const mean = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0
  const perGame = days.filter(d => d.games > 0).map(d => d[key] / d.games)
  let cv: number | null = null
  if (days.length >= MIN_DAYS && mean >= MIN_MEAN[key] && perGame.length >= MIN_DAYS) {
    const m = perGame.reduce((s, v) => s + v, 0) / perGame.length
    const sd = Math.sqrt(perGame.reduce((s, v) => s + (v - m) ** 2, 0) / (perGame.length - 1))
    cv = m > 0 ? +(sd / m).toFixed(2) : null
  }
  const consistency: Consistency | null = cv == null ? null : cv < STEADY_CV ? 'steady' : cv > SWINGY_CV ? 'swingy' : 'normal'
  return {
    key,
    mean: +mean.toFixed(1),
    low: Math.round(quantile(sorted, 0.25)),
    high: Math.round(quantile(sorted, 0.75)),
    max: sorted.length ? sorted[sorted.length - 1] : 0,
    cv,
    consistency,
  }
}

export type PlayerForm = {
  days: number
  stats: StatForm[]
  /** 가장 최근 경기일 — 평소 범위보다 위(up)·안(same)·아래(down) */
  last: { date: string; values: Record<FormStatKey, number>; vs: Record<FormStatKey, 'up' | 'same' | 'down'> } | null
  /** 분기 비교 — 정본 하루 평균. 비교할 분기가 없으면 null */
  compare: { curLabel: string; prevLabel: string; cur: Record<FormStatKey, number>; prev: Record<FormStatKey, number> } | null
}

/** days 는 오래된 → 최근 순 */
export function buildPlayerForm(
  days: FormDay[],
  compare: PlayerForm['compare'],
): PlayerForm | null {
  if (days.length === 0) return null
  const stats = FORM_STATS.map(s => statForm(days, s.key))
  const lastDay = days[days.length - 1]
  const vs = {} as Record<FormStatKey, 'up' | 'same' | 'down'>
  const values = {} as Record<FormStatKey, number>
  for (const s of stats) {
    const v = lastDay[s.key]
    values[s.key] = v
    vs[s.key] = v > s.high ? 'up' : v < s.low ? 'down' : 'same'
  }
  return { days: days.length, stats, last: { date: lastDay.date, values, vs }, compare }
}

/** 문장 한 줄 — 득점 기준. 차이가 거의 없으면(0.5 미만) 「비슷하게」 */
export function formHeadline(c: NonNullable<PlayerForm['compare']>, key: FormStatKey = 'pts'): { lead: string; diff: string; tail: string } {
  const unit = FORM_STATS.find(s => s.key === key)!.unit
  const d = +(c.cur[key] - c.prev[key]).toFixed(1)
  const verb = key === 'pts' ? '넣는 중' : key === 'reb' ? '잡는 중' : '돕는 중'
  if (Math.abs(d) < 0.5) return { lead: `${c.prevLabel}와 `, diff: '비슷하게', tail: ` ${verb}` }
  return { lead: `${c.prevLabel}보다 하루 평균 `, diff: `${Math.abs(d)}${unit}`, tail: ` ${d > 0 ? '더' : '덜'} ${verb}` }
}
