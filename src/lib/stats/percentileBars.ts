// 선수 카드 「세부 능력치」 백분위 막대 — 순수 함수 (2026-10-14).
//
// 출처: kbl-stats `lib/cardview.ts` 의 percentileBarGroups / percentileTone 과
//   `lib/teams.ts` 의 divergingFill, 그리고 `lib/metrics.ts` attemptThresholds 의 발상
//   (성공률은 시도가 충분한 선수끼리만 비교)을 이 리그 규모에 맞게 옮겼다.
//
// 규칙
//   · 값은 전부 **하루 평균**(경기한 날 기준). 성공률만 기간 합산(성공/시도).
//   · 백분위 = 레이더와 같은 식 — 자격 집단(n명) 안에서 rank 를 매겨 (n - rank + 1) / n × 100.
//     rank = 1 + (나보다 엄격히 나은 선수 수) — 동점은 같은 순위.
//     자격 집단은 호출부가 정한다(선수 카드 = 레이더와 같은 「열린 날의 30% 이상 출전」).
//   · 성공률·비율은 `PCT_MIN_ATTEMPTS` 미달이면 값은 보여 주되 백분위는 「–」이고 집단에서도 빠진다.
//     아마추어 리그라 KBL 처럼 「리그 평균 시도」로 잡으면 분기 초에 거의 전원이 빠진다 —
//     작은 절대 기준을 둔다. 기준을 바꾸면 이 상수 하나만 고친다(분기별 기록표의 굵은 글씨도 이걸 쓴다).
//   · 실책은 낮을수록 높은 백분위.

/** 성공률·비율 지표의 최소 시도(기간 합계). 분기별 기록표의 「리그 최고」 판정도 같은 값을 쓴다. */
export const PCT_MIN_ATTEMPTS = {
  /** 야투율 — 야투 시도 */
  fg: 20,
  /** 3점 성공률 — 3점 시도 */
  fg3: 10,
  /** 자유투 성공률 — 자유투 시도 */
  ft: 8,
  /** 어시/실책 — 어시 + 실책 */
  astTo: 10,
} as const

/** 백분위 계산에 쓰는 선수 한 명의 기간 합계 */
export interface PercentileInput {
  pid: string
  /** 출전일 수 (하루 평균의 분모) */
  gp: number
  pts: number; reb: number; oreb: number; dreb: number
  ast: number; stl: number; blk: number; tov: number
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
}

type Kind = 'perDay' | 'rate' | 'ratio'

interface MetricSpec {
  key: string
  label: string
  kind: Kind
  /** false = 낮을수록 좋다 */
  higherIsBetter: boolean
  /** 값 (perDay 는 하루 평균, rate 는 0~100 %, ratio 는 그대로) — 기준 미달이면 null */
  value: (p: PercentileInput) => number | null
}

const perDay = (n: number, p: PercentileInput) => (p.gp > 0 ? n / p.gp : 0)
const rate = (m: number, a: number, min: number) => (a >= min && a > 0 ? (m / a) * 100 : null)

const GROUPS: { key: string; label: string; metrics: MetricSpec[] }[] = [
  {
    key: 'scoring', label: '득점',
    metrics: [
      { key: 'ppg',  label: '득점',       kind: 'perDay', higherIsBetter: true, value: p => perDay(p.pts, p) },
      { key: 'fg3m', label: '3점 성공',   kind: 'perDay', higherIsBetter: true, value: p => perDay(p.fg3m, p) },
      { key: 'ftm',  label: '자유투 성공', kind: 'perDay', higherIsBetter: true, value: p => perDay(p.ftm, p) },
    ],
  },
  {
    key: 'shooting', label: '슈팅',
    metrics: [
      { key: 'fg_pct',  label: '야투율',     kind: 'rate', higherIsBetter: true, value: p => rate(p.fgm, p.fga, PCT_MIN_ATTEMPTS.fg) },
      { key: 'fg3_pct', label: '3점 성공률', kind: 'rate', higherIsBetter: true, value: p => rate(p.fg3m, p.fg3a, PCT_MIN_ATTEMPTS.fg3) },
      { key: 'ft_pct',  label: '자유투율',   kind: 'rate', higherIsBetter: true, value: p => rate(p.ftm, p.fta, PCT_MIN_ATTEMPTS.ft) },
    ],
  },
  {
    key: 'rebounding', label: '리바운드',
    metrics: [
      { key: 'rpg', label: '리바',      kind: 'perDay', higherIsBetter: true, value: p => perDay(p.reb, p) },
      { key: 'orp', label: '공격 리바', kind: 'perDay', higherIsBetter: true, value: p => perDay(p.oreb, p) },
      { key: 'drp', label: '수비 리바', kind: 'perDay', higherIsBetter: true, value: p => perDay(p.dreb, p) },
    ],
  },
  {
    key: 'playmaking', label: '플레이메이킹',
    metrics: [
      { key: 'apg',   label: '어시',      kind: 'perDay', higherIsBetter: true,  value: p => perDay(p.ast, p) },
      { key: 'topg',  label: '실책',      kind: 'perDay', higherIsBetter: false, value: p => perDay(p.tov, p) },
      {
        key: 'ast_to', label: '어시/실책', kind: 'ratio', higherIsBetter: true,
        // 실책 0 이면 어시 수 그대로(무한대 대신) — 기준(어시+실책)을 넘긴 선수만 본다
        value: p => (p.ast + p.tov >= PCT_MIN_ATTEMPTS.astTo ? (p.tov > 0 ? p.ast / p.tov : p.ast) : null),
      },
    ],
  },
  {
    key: 'defense', label: '수비',
    metrics: [
      { key: 'spg', label: '스틸', kind: 'perDay', higherIsBetter: true, value: p => perDay(p.stl, p) },
      { key: 'bpg', label: '블락', kind: 'perDay', higherIsBetter: true, value: p => perDay(p.blk, p) },
    ],
  },
]

export interface PercentileBarRow {
  key: string
  label: string
  /** 선수 값 표기 ("4.2", "38.5%", "1.80") — 기준 미달은 "–" */
  valueText: string
  /** 0~100 · 기준 미달·자격 밖이면 null(막대 없이 「–」) */
  pct: number | null
  /** 낮을수록 좋은 지표(실책) — 화면 주석용 */
  lowerIsBetter?: boolean
}

export interface PercentileBarGroup {
  key: string
  label: string
  /** 묶음 백분위 = 백분위가 있는 행의 평균 (전부 없으면 null) */
  groupPct: number | null
  rows: PercentileBarRow[]
}

export interface PercentileBarsResult {
  groups: PercentileBarGroup[]
  /** 비교 집단 인원 (자격을 채운 선수 수) */
  sample: number
  /** 이 선수가 자격 집단 안에 있는가 — 밖이면 모든 백분위가 null */
  qualified: boolean
}

/**
 * 자격 집단 안 순위 → 백분위 (레이더와 같은 식). 값이 없으면 null.
 * values 에는 그 지표 기준을 채운 선수들의 값만 넣는다(나 포함).
 */
export function rankPercentile(values: readonly number[], mine: number, higherIsBetter = true): number | null {
  const n = values.length
  if (n === 0) return null
  let better = 0
  for (const v of values) if (higherIsBetter ? v > mine : v < mine) better++
  const rank = better + 1
  return Math.round(((n - rank + 1) / n) * 100)
}

function valueText(kind: Kind, v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '–'
  if (kind === 'rate') return `${v.toFixed(1)}%`
  if (kind === 'ratio') return v.toFixed(2)
  return v.toFixed(1)
}

/**
 * 자격 집단(pool) 과 선수(me) → 묶음별 막대.
 * me 가 pool 에 없으면(출전일 부족) 값만 보여 주고 백분위는 전부 null.
 */
export function buildPercentileBars(pool: readonly PercentileInput[], me: PercentileInput | null): PercentileBarsResult {
  const qualified = !!me && pool.some(p => p.pid === me.pid)
  const groups: PercentileBarGroup[] = GROUPS.map(g => {
    const rows: PercentileBarRow[] = g.metrics.map(m => {
      const mine = me ? m.value(me) : null
      let pct: number | null = null
      if (qualified && mine !== null) {
        const vals: number[] = []
        for (const p of pool) {
          const v = m.value(p)
          if (v !== null && Number.isFinite(v)) vals.push(v)
        }
        pct = rankPercentile(vals, mine, m.higherIsBetter)
      }
      return {
        key: m.key,
        label: m.label,
        valueText: valueText(m.kind, mine),
        pct,
        ...(m.higherIsBetter ? {} : { lowerIsBetter: true }),
      }
    })
    const have = rows.map(r => r.pct).filter((v): v is number => v !== null)
    return {
      key: g.key,
      label: g.label,
      groupPct: have.length > 0 ? Math.round(have.reduce((s, v) => s + v, 0) / have.length) : null,
      rows,
    }
  })
  return { groups, sample: pool.length, qualified }
}

/** 백분위 → 발산형 색 위치 -1(0) ~ 0(50) ~ 1(100) */
export function percentileTone(pct: number): number {
  return Math.max(-1, Math.min(1, (pct - 50) / 50))
}

/**
 * 발산형 채움색 — 낮음 청록 · 가운데 회색 · 높음 빨강(Baseball Savant 관행).
 * 토큰만 섞는다(다크 모드에서 토큰이 바뀌면 같이 바뀐다).
 */
export function divergingFill(t: number): string {
  const v = Math.max(-1, Math.min(1, Number.isFinite(t) ? t : 0))
  // 미라클 화면은 빨강=나쁨이라 KBL(새번트식 빨강=높음)과 반대로: 높음=초록(positive) · 낮음=빨강(negative)
  const pole = v >= 0 ? 'var(--mm-positive)' : 'var(--mm-negative)'
  const share = Math.round(Math.abs(v) * 100)
  return `color-mix(in oklab, ${pole} ${share}%, var(--mm-muted))`
}
