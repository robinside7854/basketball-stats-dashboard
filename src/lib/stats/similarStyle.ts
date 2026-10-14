// 선수 카드 「비슷한 스타일 선수」 — 순수 함수 (2026-10-14).
//
// 출처: kbl-stats `lib/similar.ts` 의 similarityScore / findSimilar
//   (Basketball-Reference "Similarity Scores" 를 단순화한 것 — 백분위 벡터의 유클리드 거리를 0~100 으로).
//   KBL 쪽은 레이더 6축 백분위 + 유형 라벨을 섞지만, 여기서는 유형 라벨을 쓰지 않는다(라벨은 운영진 결정 대기).
//
// 비교 집단
//   · 세부 능력치 막대·레이더와 **같은 자격 집단**을 호출부가 넘긴다(열린 날의 30% 이상 출전).
//     새 자격 규칙을 만들지 않는다. 집단 밖 선수는 결과 없음(qualified=false).
//   · 슛 구성 차원은 야투 시도가 `PCT_MIN_ATTEMPTS.fg` 이상일 때만 쓴다(막대의 야투율과 같은 기준).
//     미달이면 그 차원들은 빼고 나머지 비중으로 다시 나눈다(KBL combinedSimilarity 와 같은 방식).
//
// 차원 — 모두 자격 집단 안 백분위(0~100)로 맞춘다(척도가 같아야 거리가 공정하다)
//   생산 7개(하루 평균): 득점 · 공격 리바 · 수비 리바 · 어시 · 스틸 · 블락 · 실책(적을수록 높음)
//   스타일 5개: 야투 시도 중 3점·미드레인지·레이업·골밑 비중(FIELD_SHOT_TYPES 4종), 자유투 시도 ÷ 야투 시도
//
// 「얼마나 잘하나」가 아니라 「어떻게 하나」를 보이게 하는 장치 (가중치)
//   · 생산 7개는 **선수 자신의 평균을 빼고(모양만)** 비교한다 — 전부 상위인 에이스와 전부 하위인
//     벤치 선수라도 「어시가 많고 리바가 적은」 같은 모양이면 가깝게 본다. 가중치 1.
//   · 대신 수준 차원 1개(생산 7개 평균 백분위)를 가중치 0.5 로 남긴다 — 수준을 완전히 버리면
//     출전만 한 선수와 에이스가 같은 모양이라는 이유로 짝이 된다.
//   · 스타일 5개는 비중·비율이라 원래 양과 무관하다. 가중치 1.
//   집단 전원이 같은 값인 차원(예: 아무도 골밑슛을 안 쏜 기간)은 정보가 없어 통째로 뺀다.
//   유사도 = 100 × (1 − 가중 거리 ÷ 최대 거리), 최대 거리 = 100 × √(쓴 차원 가중치 합). 0 아래는 0.
//
// 「무엇이 비슷한가」 두 개
//   · 원래 백분위(모양 보정 전) 차이가 작은 차원 — 둘 다 평범(50 근처)한 차원보다 둘 다 두드러진
//     차원을 앞세운다: 정렬 키 = |차이| − 0.3 × |두 값 평균 − 50|. 수준 차원은 이유로 쓰지 않는다.

import { FIELD_SHOT_TYPES } from './boxLine'
import { PCT_MIN_ATTEMPTS, rankPercentile } from './percentileBars'

/** 선수 한 명의 기간 합계 (호출부가 이미 모은 값) */
export interface StyleInput {
  pid: string
  /** 출전일 수 (하루 평균의 분모) */
  gp: number
  pts: number; oreb: number; dreb: number; ast: number; stl: number; blk: number; tov: number
  /** 야투 시도 — FIELD_SHOT_TYPES 4종 합 */
  fga: number
  /** 야투 시도의 타입별 개수 (key = FIELD_SHOT_TYPES) */
  shotAttempts: Record<string, number>
  /** 자유투 시도 */
  fta: number
}

interface DimSpec {
  key: string
  /** 이유 문구에 쓰는 이름 */
  label: string
  group: 'volume' | 'style'
  higherIsBetter: boolean
  value: (p: StyleInput) => number | null
}

const perDay = (n: number, p: StyleInput) => (p.gp > 0 ? n / p.gp : 0)
const hasShots = (p: StyleInput) => p.fga >= PCT_MIN_ATTEMPTS.fg && p.fga > 0
const share = (type: string) => (p: StyleInput) => (hasShots(p) ? ((p.shotAttempts[type] ?? 0) / p.fga) * 100 : null)

const SHOT_LABEL: Record<string, string> = {
  shot_3p: '3점 비중',
  shot_2p_mid: '미드레인지 비중',
  shot_layup: '레이업 비중',
  shot_post: '골밑 비중',
}

const DIMS: DimSpec[] = [
  { key: 'pts',  label: '득점',      group: 'volume', higherIsBetter: true,  value: p => perDay(p.pts, p) },
  { key: 'oreb', label: '공격 리바', group: 'volume', higherIsBetter: true,  value: p => perDay(p.oreb, p) },
  { key: 'dreb', label: '수비 리바', group: 'volume', higherIsBetter: true,  value: p => perDay(p.dreb, p) },
  { key: 'ast',  label: '어시',      group: 'volume', higherIsBetter: true,  value: p => perDay(p.ast, p) },
  { key: 'stl',  label: '스틸',      group: 'volume', higherIsBetter: true,  value: p => perDay(p.stl, p) },
  { key: 'blk',  label: '블락',      group: 'volume', higherIsBetter: true,  value: p => perDay(p.blk, p) },
  { key: 'tov',  label: '실책',      group: 'volume', higherIsBetter: false, value: p => perDay(p.tov, p) },
  ...FIELD_SHOT_TYPES.map((t): DimSpec => ({
    key: t, label: SHOT_LABEL[t] ?? t, group: 'style', higherIsBetter: true, value: share(t),
  })),
  {
    key: 'ft_rate', label: '자유투 얻는 빈도', group: 'style', higherIsBetter: true,
    value: p => (hasShots(p) ? (p.fta / p.fga) * 100 : null),
  },
]

const W_SHAPE = 1
const W_LEVEL = 0.5
const W_STYLE = 1
/** 이유 정렬에서 「둘 다 두드러짐」을 앞세우는 정도 */
const DISTINCT_BONUS = 0.3

export const SIMILAR_STYLE_COUNT = 3

interface StyleVector {
  pid: string
  /** 차원 key → 백분위 (없으면 키 없음) */
  pct: Record<string, number>
  /** 생산 7개 평균 백분위 */
  level: number
}

export interface SimilarStyleMatch {
  pid: string
  /** 0~100 정수 */
  score: number
  /** 가장 비슷한 차원 이름 두 개 (예: ['3점 비중', '스틸']) */
  reasons: string[]
}

export interface SimilarStyleResult {
  /** 이 선수가 자격 집단 안에 있는가 — 밖이면 matches 는 빈 배열 */
  qualified: boolean
  /** 비교 집단 인원 (나 포함) */
  sample: number
  matches: SimilarStyleMatch[]
}

function buildVectors(pool: readonly StyleInput[]): StyleVector[] {
  // 차원별 값 목록(기준을 채운 선수만)
  const dimValues = DIMS.map(d => {
    const vals: number[] = []
    for (const p of pool) {
      const v = d.value(p)
      if (v !== null && Number.isFinite(v)) vals.push(v)
    }
    return vals
  })
  // 모두 같은 값인 차원은 정보가 없다(전원 공동 1위) — 거리에도 이유에도 쓰지 않는다
  const informative = dimValues.map(vals => vals.length >= 2 && Math.min(...vals) < Math.max(...vals))
  return pool.map(p => {
    const pct: Record<string, number> = {}
    DIMS.forEach((d, i) => {
      if (!informative[i]) return
      const v = d.value(p)
      if (v === null || !Number.isFinite(v)) return
      const r = rankPercentile(dimValues[i], v, d.higherIsBetter)
      if (r !== null) pct[d.key] = r
    })
    const vol = DIMS.filter(d => d.group === 'volume').map(d => pct[d.key]).filter((v): v is number => v !== undefined)
    const level = vol.length > 0 ? vol.reduce((s, v) => s + v, 0) / vol.length : 50
    return { pid: p.pid, pct, level }
  })
}

/** 두 벡터 유사도 0~100 (위 머리말 공식) */
function styleSimilarity(a: StyleVector, b: StyleVector): number {
  let d2 = 0
  let wSum = 0
  for (const d of DIMS) {
    const va = a.pct[d.key]
    const vb = b.pct[d.key]
    if (va === undefined || vb === undefined) continue
    if (d.group === 'volume') {
      const diff = (va - a.level) - (vb - b.level)
      d2 += W_SHAPE * diff * diff
      wSum += W_SHAPE
    } else {
      d2 += W_STYLE * (va - vb) ** 2
      wSum += W_STYLE
    }
  }
  d2 += W_LEVEL * (a.level - b.level) ** 2
  wSum += W_LEVEL
  const maxDist = 100 * Math.sqrt(wSum)
  return Math.max(0, 100 * (1 - Math.sqrt(d2) / maxDist))
}

function closestDims(a: StyleVector, b: StyleVector): string[] {
  const keyed: { label: string; key: number }[] = []
  for (const d of DIMS) {
    const va = a.pct[d.key]
    const vb = b.pct[d.key]
    if (va === undefined || vb === undefined) continue
    keyed.push({ label: d.label, key: Math.abs(va - vb) - DISTINCT_BONUS * Math.abs((va + vb) / 2 - 50) })
  }
  return keyed.sort((x, y) => x.key - y.key).slice(0, 2).map(k => k.label)
}

/**
 * 자격 집단(pool)에서 targetPid 와 스타일이 가장 비슷한 다른 선수 n 명.
 * 점수 높은 순, 같으면 pid 순(결과가 요청마다 흔들리지 않게).
 */
export function findSimilarStyle(pool: readonly StyleInput[], targetPid: string, n = SIMILAR_STYLE_COUNT): SimilarStyleResult {
  const vectors = buildVectors(pool)
  const me = vectors.find(v => v.pid === targetPid)
  if (!me) return { qualified: false, sample: pool.length, matches: [] }
  const matches = vectors
    .filter(v => v.pid !== targetPid)
    .map(v => ({ v, score: styleSimilarity(me, v) }))
    .sort((x, y) => y.score - x.score || x.v.pid.localeCompare(y.v.pid))
    .slice(0, n)
    .map(({ v, score }) => ({ pid: v.pid, score: Math.round(score), reasons: closestDims(me, v) }))
  return { qualified: true, sample: pool.length, matches }
}

/** 이유 두 개 → 「3점 비중·스틸이 비슷」 */
export function similarReasonText(reasons: readonly string[]): string {
  if (reasons.length === 0) return ''
  const last = reasons[reasons.length - 1]
  // 받침 있으면 「이」, 없으면 「가」 — 마지막 글자 기준
  const code = last.charCodeAt(last.length - 1) - 0xac00
  const josa = code >= 0 && code <= 11171 && code % 28 !== 0 ? '이' : '가'
  return `${reasons.join('·')}${josa} 비슷`
}
