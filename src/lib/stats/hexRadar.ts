// 선수 카드 6축 레이더 — 공격 · 수비 · 리바운드 · 슈팅 · 리딩 · 효율 (2026-10-14, 사용자 승인 스펙).
//
// 출처: kbl-stats `lib/metrics.ts` 의 RADAR_AXIS_COMPONENTS · buildGradingContext · radarScore
//   (축 = 구성 요소 백분위의 평균 → 같은 집단 안에서 그 평균을 **다시 백분위**로).
//   축 이름·순서도 그쪽과 같다. 등급(S~F)·종합 점수는 가져오지 않는다 — 배지·등급 제도는 2026-10-11 폐지.
//
// 이 파일이 6축 정의의 정본이다. 화면·라우트에서 축이나 구성 요소를 다시 정의하지 말 것.
//
// 규칙
//   · 숫자는 전부 computeLeagueStats 한 벌(「선수 숫자는 한 벌」). 카운트 요소는 **하루 평균**(÷ 출전일).
//   · 모집단 = 선수 카드 순위·세부 능력치 막대와 같다(게스트 제외 · rankMinRounds 자격) — 호출부가 넘긴다.
//   · 백분위 식은 막대와 같은 `rankPercentile`((n − 순위 + 1) / n × 100, 동점 같은 순위) — 같은 지표는
//     레이더 상세와 막대가 같은 숫자를 보인다. (kbl-stats 는 mid-rank 식이라 1위가 100 이 아니다 — 여기선 막대에 맞췄다)
//   · 낮을수록 좋은 요소(실책 비율)는 뒤집어서 센다.
//   · 야투·3점·자유투 성공률은 eligibility.ts 하루 평균 최소 시도(막대·스탯 탭과 같은 한 벌), 그 밖의 비율은 `PCT_MIN_ATTEMPTS` 미달이면 **그 선수에게서 그 요소를 뺀다**
//     (그 선수의 축 평균에서 빠지고, 다른 선수의 비교 집단에서도 빠진다).
//   · 축 원점수 = 남은 요소 백분위의 평균. 요소가 하나도 없으면 그 축은 null(레이더에서 0, 표기는 「–」).
//   · 축 값 = 모집단 각자의 축 원점수 사이에서 다시 매긴 백분위. 평균끼리는 50 근처로 모이므로 재순위해야
//     「상위 몇 %」로 읽힌다(kbl-stats 와 같은 이유).
//   · 비교 인원이 HEX_MIN_SAMPLE 미만이면 백분위를 매기지 않는다(분기 첫 주 — 1~2명끼리 100·50 이 의미 없다).
//
// 점유율 요소 — 출전 시간이 추정값이라 NBA 식의 분(minutes) 보정항을 뺐다. 분모는 그 선수가 **뛴 경기들**에서
//   그 경기 그 선수 팀의 합(computeLeagueStats 의 team_*_in_games — 경기마다 가장 많이 기록된 팀).
//   공격 점유율 = (야투 시도 + 0.44 × 자유투 시도 + 실책) ÷ 팀의 같은 합 × 100   (= 스탯 탭 USG%, advanced.ts calcUsg)
//   리바운드 점유율 = 리바운드 ÷ 팀 리바운드 × 100
//   어시 점유율 = 어시 ÷ (팀 야투 성공 − 본인 야투 성공) × 100   (동료의 성공 중 내가 도운 비율)
//   실책 비율 = 실책 ÷ (야투 시도 + 0.44 × 자유투 시도 + 실책) × 100   — 낮을수록 좋다
//
// 뺀 것
//   · TS%(진실 야투율) — +1 선수 보너스·ft_2pt(자유투 1구 2점) 때문에 득점이 부풀어 선수마다 기준이 달라진다.
//     효율 축은 득점과 무관한 eFG%(야투 성공·3점 성공만) 하나다. PER 은 출전 시간이 추정값이라 쓰지 않는다.
//   · 「상대 실책 유도」 — 스틸은 기록 화면에서 상대 실책과 짝(related_player_id)으로 입력돼 짝지은 스틸 수가
//     곧 스틸 수(입력 누락분만 적다)다. 같은 숫자를 두 번 세게 되므로 수비 축은 스틸·블록 둘이다.
import { PCT_MIN_ATTEMPTS, rankPercentile } from './percentileBars'
import { rateIfQualified, meetsAttemptMin } from './eligibility'

/** 비교 인원이 이보다 적으면 백분위를 매기지 않는다 */
export const HEX_MIN_SAMPLE = 3

/** 선수 한 명의 기간 합계 (PlayerStat 에서 옮겨 담는다) */
export interface HexInput {
  pid: string
  /** 출전일 수 (하루 평균의 분모) */
  gp: number
  pts: number
  fgm: number; fga: number
  fg3m: number; fg3a: number
  ftm: number; fta: number
  /** 미드레인지(shot_2p_mid) 성공·시도 */
  md_m: number; md_a: number
  oreb: number; dreb: number; reb: number
  ast: number; stl: number; blk: number; tov: number
  /** 뛴 경기들에서 자기 팀의 FGA + 0.44×FTA + TOV 합 (없으면 null → 요소 빠짐) */
  team_poss: number | null
  /** 뛴 경기들에서 자기 팀 리바운드 합 */
  team_reb: number | null
  /** 뛴 경기들에서 자기 팀 야투 성공 합 (본인 포함) */
  team_fgm: number | null
}

export type HexAxisKey = 'offense' | 'defense' | 'rebounding' | 'shooting' | 'leading' | 'efficiency'

type Kind = 'perDay' | 'rate' | 'ratio'

interface ComponentSpec {
  key: string
  label: string
  kind: Kind
  /** false = 낮을수록 좋다 → 백분위를 뒤집는다 */
  higherIsBetter: boolean
  /** 값 — 최소 시도·분모 미달이면 null(그 선수에게서 이 요소를 뺀다) */
  value: (p: HexInput) => number | null
}

const perDay = (n: number, p: HexInput) => (p.gp > 0 ? n / p.gp : null)
const rate = (m: number, a: number, min: number) => (a >= min && a > 0 ? (m / a) * 100 : null)
const share = (n: number, denom: number | null) => (denom !== null && denom > 0 ? (n / denom) * 100 : null)
const possUsed = (p: HexInput) => p.fga + 0.44 * p.fta + p.tov

/** 축 정의 — 이름·순서는 kbl-stats 와 같다. 첫 축이 레이더 12시. */
export const HEX_AXES: readonly { key: HexAxisKey; label: string; components: readonly ComponentSpec[] }[] = [
  {
    key: 'offense', label: '공격',
    components: [
      { key: 'ppg',  label: '득점',        kind: 'perDay', higherIsBetter: true, value: p => perDay(p.pts, p) },
      { key: 'fgm',  label: '야투 성공',   kind: 'perDay', higherIsBetter: true, value: p => perDay(p.fgm, p) },
      { key: 'fga',  label: '야투 시도',   kind: 'perDay', higherIsBetter: true, value: p => perDay(p.fga, p) },
      { key: 'fta',  label: '자유투 시도', kind: 'perDay', higherIsBetter: true, value: p => perDay(p.fta, p) },
      { key: 'usg',  label: '공격 점유율', kind: 'rate',   higherIsBetter: true, value: p => share(possUsed(p), p.team_poss) },
    ],
  },
  {
    key: 'defense', label: '수비',
    components: [
      { key: 'spg', label: '스틸', kind: 'perDay', higherIsBetter: true, value: p => perDay(p.stl, p) },
      { key: 'bpg', label: '블록', kind: 'perDay', higherIsBetter: true, value: p => perDay(p.blk, p) },
    ],
  },
  {
    key: 'rebounding', label: '리바운드',
    components: [
      { key: 'orp',     label: '공격 리바',       kind: 'perDay', higherIsBetter: true, value: p => perDay(p.oreb, p) },
      { key: 'drp',     label: '수비 리바',       kind: 'perDay', higherIsBetter: true, value: p => perDay(p.dreb, p) },
      { key: 'reb_pct', label: '리바운드 점유율', kind: 'rate',   higherIsBetter: true, value: p => share(p.reb, p.team_reb) },
    ],
  },
  {
    key: 'shooting', label: '슈팅',
    components: [
      { key: 'fg3m',    label: '3점 성공',          kind: 'perDay', higherIsBetter: true, value: p => perDay(p.fg3m, p) },
      { key: 'fg3a',    label: '3점 시도',          kind: 'perDay', higherIsBetter: true, value: p => perDay(p.fg3a, p) },
      { key: 'fg3_pct', label: '3점 성공률',        kind: 'rate',   higherIsBetter: true, value: p => rateIfQualified(p.fg3m, p.fg3a, p.gp, 'fg3_pct') },
      { key: 'mid_a',   label: '미드레인지 시도',   kind: 'perDay', higherIsBetter: true, value: p => perDay(p.md_a, p) },
      { key: 'mid_pct', label: '미드레인지 성공률', kind: 'rate',   higherIsBetter: true, value: p => rate(p.md_m, p.md_a, PCT_MIN_ATTEMPTS.mid) },
      { key: 'ft_pct',  label: '자유투 성공률',     kind: 'rate',   higherIsBetter: true, value: p => rateIfQualified(p.ftm, p.fta, p.gp, 'ft_pct') },
    ],
  },
  {
    key: 'leading', label: '리딩',
    components: [
      { key: 'apg', label: '어시', kind: 'perDay', higherIsBetter: true, value: p => perDay(p.ast, p) },
      {
        key: 'ast_to', label: '어시/실책', kind: 'ratio', higherIsBetter: true,
        // 막대(percentileBars)와 같은 정의 — 실책 0 이면 어시 수 그대로
        value: p => (p.ast + p.tov >= PCT_MIN_ATTEMPTS.astTo ? (p.tov > 0 ? p.ast / p.tov : p.ast) : null),
      },
      {
        key: 'tov_ratio', label: '실책 비율', kind: 'rate', higherIsBetter: false,
        value: p => (possUsed(p) >= PCT_MIN_ATTEMPTS.tovRatio ? (p.tov / possUsed(p)) * 100 : null),
      },
      {
        key: 'ast_pct', label: '어시 점유율', kind: 'rate', higherIsBetter: true,
        value: p => share(p.ast, p.team_fgm === null ? null : p.team_fgm - p.fgm),
      },
    ],
  },
  {
    key: 'efficiency', label: '효율',
    components: [
      {
        key: 'efg_pct', label: 'eFG%', kind: 'rate', higherIsBetter: true,
        value: p => (meetsAttemptMin(p, 'fg_pct') ? ((p.fgm + 0.5 * p.fg3m) / p.fga) * 100 : null),
      },
    ],
  },
]

export interface HexComponentRow {
  label: string
  /** 값 표기 ("4.2", "38.5%", "1.80") — 기준 미달은 "–" */
  valueText: string
  /** 0~100 · 기준 미달·자격 밖이면 null */
  pct: number | null
  lowerIsBetter?: boolean
}

export interface HexAxisResult {
  key: HexAxisKey
  label: string
  /** 0~100 (모집단 안 재백분위) · 매길 수 없으면 null */
  value: number | null
  components: HexComponentRow[]
}

export interface HexRadarResult {
  axes: HexAxisResult[]
  /** 비교 인원(모집단) */
  sample: number
  /** 이 선수가 모집단 안에 있는가 — 밖이면 값만, 백분위는 전부 null */
  qualified: boolean
}

function valueText(kind: Kind, v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '–'
  if (kind === 'rate') return `${v.toFixed(1)}%`
  if (kind === 'ratio') return v.toFixed(2)
  return v.toFixed(1)
}

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null)

/** 요소마다 모집단 값 배열 (그 요소 기준을 채운 선수만) */
function componentRefs(pool: readonly HexInput[]): number[][][] {
  return HEX_AXES.map(axis => axis.components.map(c => {
    const vals: number[] = []
    for (const p of pool) {
      const v = c.value(p)
      if (v !== null && Number.isFinite(v)) vals.push(v)
    }
    return vals
  }))
}

/** 한 선수의 요소 백분위 + 축 원점수 */
function scoreOne(p: HexInput, refs: number[][][]) {
  return HEX_AXES.map((axis, ai) => {
    const comps = axis.components.map((c, ci) => {
      const v = c.value(p)
      const pct = v !== null && Number.isFinite(v) ? rankPercentile(refs[ai][ci], v, c.higherIsBetter) : null
      return { v, pct }
    })
    return { comps, raw: mean(comps.map(x => x.pct).filter((x): x is number => x !== null)) }
  })
}

/**
 * 모집단(pool)과 선수(me) → 6축.
 * me 가 pool 에 없으면(출전일 부족·게스트) 값만 보여 주고 백분위·축 값은 null.
 */
export function buildHexRadar(pool: readonly HexInput[], me: HexInput | null): HexRadarResult {
  const qualified = !!me && pool.some(p => p.pid === me.pid)
  const enough = pool.length >= HEX_MIN_SAMPLE
  const refs = componentRefs(pool)
  // 축 원점수 — 모집단 각자 (재백분위의 비교 대상)
  const poolRaw: number[][] = HEX_AXES.map(() => [])
  if (enough) {
    for (const p of pool) {
      scoreOne(p, refs).forEach((a, i) => { if (a.raw !== null) poolRaw[i].push(a.raw) })
    }
  }
  const mine = me ? scoreOne(me, refs) : null
  const ranked = qualified && enough

  const axes: HexAxisResult[] = HEX_AXES.map((axis, ai) => {
    const m = mine?.[ai]
    return {
      key: axis.key,
      label: axis.label,
      value: ranked && m && m.raw !== null ? rankPercentile(poolRaw[ai], m.raw, true) : null,
      components: axis.components.map((c, ci) => ({
        label: c.label,
        valueText: valueText(c.kind, m?.comps[ci].v ?? null),
        pct: ranked ? (m?.comps[ci].pct ?? null) : null,
        ...(c.higherIsBetter ? {} : { lowerIsBetter: true }),
      })),
    }
  })
  return { axes, sample: pool.length, qualified }
}
