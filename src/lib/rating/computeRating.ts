/**
 * NBA 2K 스타일 선수 레이팅 시스템
 *
 * 구조: 16개 어트리뷰트 → 5개 카테고리 → OVR
 *
 * 계산 흐름:
 *   1. 자격 필터 (GP ≥ 5 && GP ≥ maxGP/3)
 *   2. 각 어트리뷰트 값 → 리그 퍼센타일 → 40-99 스케일 (`^0.75` 완만화)
 *   3. 카테고리 = 어트리뷰트 가중평균
 *   4. OVR = 카테고리 가중평균 (SCR 25% / PLY 20% / REB 20% / DEF 20% / EFF 15%)
 *   5. Small-sample regression: OVR = (GP·OVR + K·60) / (GP + K), K=8
 *   6. 등급 티어 할당
 */

import type { PlayerStat } from '@/types/league'

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

export type AttributeCode =
  | 'THR' | 'MID' | 'LAY' | 'FT' | 'VOL' | 'TSA'  // Scoring (6)
  | 'PSV' | 'BHD' | 'ASR'                          // Playmaking (3)
  | 'ORB' | 'DRB' | 'RBR'                          // Rebounding (3)
  | 'PMD' | 'INT'                                  // Defense (2)
  | 'EFG' | 'DIS'                                  // Efficiency (2)

export type CategoryCode = 'SCR' | 'PLY' | 'REB' | 'DEF' | 'EFF'

export type Tier = 'Elite' | 'All-Star' | 'Starter' | 'Rotation' | 'Bench' | 'Rookie' | 'Unrated'

export interface PlayerRating {
  player_id: string
  name: string
  number: number | null
  position: string | null
  gp: number
  ovr: number
  categories: Record<CategoryCode, number>
  attributes: Record<AttributeCode, number>
  tier: Tier
  rank: number             // OVR 랭킹 (1위 = 1, unqualified = 0)
  qualified: boolean
}

// ─────────────────────────────────────────────────────────────
// 라벨
// ─────────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<CategoryCode, { short: string; long: string }> = {
  SCR: { short: 'SCR', long: '득점' },
  PLY: { short: 'PLY', long: '플레이메이킹' },
  REB: { short: 'REB', long: '리바운드' },
  DEF: { short: 'DEF', long: '수비' },
  EFF: { short: 'EFF', long: '효율' },
}

export const ATTRIBUTE_LABELS: Record<AttributeCode, { short: string; long: string; cat: CategoryCode }> = {
  THR: { short: '3PT', long: '외곽슛',     cat: 'SCR' },
  MID: { short: 'MID', long: '미들레인지', cat: 'SCR' },
  LAY: { short: 'LAY', long: '골밑 마무리', cat: 'SCR' },
  FT:  { short: 'FT',  long: '자유투',     cat: 'SCR' },
  VOL: { short: 'VOL', long: '득점량',     cat: 'SCR' },
  TSA: { short: 'TS',  long: '진실야투',   cat: 'SCR' },
  PSV: { short: 'PSV', long: '패스 시야',  cat: 'PLY' },
  BHD: { short: 'BHD', long: '볼 핸들',    cat: 'PLY' },
  ASR: { short: 'ASR', long: '어시스트율', cat: 'PLY' },
  ORB: { short: 'ORB', long: '공격 리바',  cat: 'REB' },
  DRB: { short: 'DRB', long: '수비 리바',  cat: 'REB' },
  RBR: { short: 'RBR', long: '리바운드율', cat: 'REB' },
  PMD: { short: 'PMD', long: '외곽 수비',  cat: 'DEF' },
  INT: { short: 'INT', long: '내곽 수비',  cat: 'DEF' },
  EFG: { short: 'EFG', long: '유효 야투',  cat: 'EFF' },
  DIS: { short: 'DIS', long: '턴오버 관리', cat: 'EFF' },
}

// ─────────────────────────────────────────────────────────────
// 가중치
// ─────────────────────────────────────────────────────────────

const CATEGORY_WEIGHTS: Record<CategoryCode, number> = {
  SCR: 0.25, PLY: 0.20, REB: 0.20, DEF: 0.20, EFF: 0.15,
}

const ATTRIBUTE_WEIGHTS: Record<AttributeCode, number> = {
  // SCR (합 1.0)
  VOL: 0.25, TSA: 0.20, THR: 0.20, LAY: 0.15, MID: 0.10, FT: 0.10,
  // PLY (합 1.0)
  PSV: 0.50, ASR: 0.30, BHD: 0.20,
  // REB (합 1.0)
  RBR: 0.40, DRB: 0.30, ORB: 0.30,
  // DEF (합 1.0)
  PMD: 0.55, INT: 0.45,
  // EFF (합 1.0)
  EFG: 0.60, DIS: 0.40,
}

// ─────────────────────────────────────────────────────────────
// 티어
// ─────────────────────────────────────────────────────────────

export function tierOf(ovr: number, qualified: boolean): Tier {
  if (!qualified) return 'Unrated'
  if (ovr >= 90) return 'Elite'
  if (ovr >= 85) return 'All-Star'
  if (ovr >= 75) return 'Starter'
  if (ovr >= 65) return 'Rotation'
  if (ovr >= 55) return 'Bench'
  return 'Rookie'
}

export const TIER_COLORS: Record<Tier, { bg: string; text: string; border: string; hex: string }> = {
  Elite:    { bg: 'bg-purple-950/40', text: 'text-purple-300', border: 'border-purple-500/60', hex: '#a78bfa' },
  'All-Star': { bg: 'bg-amber-950/40', text: 'text-amber-300', border: 'border-amber-500/60',  hex: '#fbbf24' },
  Starter:  { bg: 'bg-green-950/40',  text: 'text-green-300',  border: 'border-green-500/60',  hex: '#4ade80' },
  Rotation: { bg: 'bg-blue-950/40',   text: 'text-blue-300',   border: 'border-blue-500/60',   hex: '#60a5fa' },
  Bench:    { bg: 'bg-gray-800/60',   text: 'text-gray-300',   border: 'border-gray-600/60',   hex: '#9ca3af' },
  Rookie:   { bg: 'bg-gray-900/60',   text: 'text-gray-400',   border: 'border-gray-700/60',   hex: '#6b7280' },
  Unrated:  { bg: 'bg-gray-900/40',   text: 'text-gray-600',   border: 'border-gray-800/60',   hex: '#4b5563' },
}

// ─────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────

/** target 이 정렬된 배열에서 차지하는 퍼센타일 (0=최하위, 1=최상위, tie = 평균 순위). */
function percentile(sortedAsc: number[], target: number): number {
  const n = sortedAsc.length
  if (n === 0) return 0.5
  if (n === 1) return 0.5
  let below = 0, equal = 0
  for (const v of sortedAsc) {
    if (v < target) below++
    else if (v === target) equal++
  }
  // 평균 순위: below 뒤부터 below+equal 사이의 중간 지점
  const rank = below + (equal - 1) / 2
  return Math.max(0, Math.min(1, rank / (n - 1)))
}

/** 퍼센타일 → 40-99 rating. `^0.75` 로 상위 압축. */
function pctToRating(pct: number): number {
  const clamped = Math.max(0, Math.min(1, pct))
  return 40 + 55 * Math.pow(clamped, 0.75)
}

/** 두 퍼센타일을 가중결합 (기본: 정확도 70% + 볼륨 30%). */
function accVol(accPct: number, volPct: number, wAcc = 0.7): number {
  return wAcc * accPct + (1 - wAcc) * volPct
}

// ─────────────────────────────────────────────────────────────
// 어트리뷰트 파생 스탯
// ─────────────────────────────────────────────────────────────

/** 파생 지표 사전 계산 — 스탯 API 가 직접 주지 않는 값들. */
interface DerivedStats {
  ts_pct: number       // 진실야투율 (0-100)
  at_ratio: number     // A/T ratio
  ast_pct: number      // 어시스트 사용률 (0-100)
  tov_pct: number      // 턴오버 사용률 (0-100)
  three_g: number      // 3PA / gp
  mid_g: number        // md_a / gp
  lay_g: number        // (ds_a + lu_a) / gp
  ftr: number          // FTA / FGA (0-100)
  a1_rate: number      // A1 / FGM (0-100)
}

function derive(p: PlayerStat): DerivedStats {
  const gp = Math.max(1, p.gp)
  const poss = p.fga + 0.44 * p.fta + p.tov
  return {
    ts_pct:  (p.fga + 0.44 * p.fta) > 0 ? p.pts / (2 * (p.fga + 0.44 * p.fta)) * 100 : 0,
    at_ratio: p.tov > 0 ? p.ast / p.tov : (p.ast > 0 ? 99 : 0),
    ast_pct:  (poss + p.ast) > 0 ? p.ast / (poss + p.ast) * 100 : 0,
    tov_pct:  poss > 0 ? p.tov / poss * 100 : 0,
    three_g:  p.fg3a / gp,
    mid_g:    p.md_a / gp,
    lay_g:    (p.ds_a + p.lu_a) / gp,
    ftr:      p.fga > 0 ? p.fta / p.fga * 100 : 0,
    a1_rate:  p.fgm > 0 ? (p.and_one ?? 0) / p.fgm * 100 : 0,
  }
}

/**
 * 리그 컨텍스트 — 각 스탯 축에 대해 자격 선수들의 값 정렬 배열.
 * 어트리뷰트 계산 시 percentile() 을 부르는 데 사용.
 */
interface LeagueContext {
  sorted: Record<string, number[]>
}

function buildContext(qualified: PlayerStat[], derived: DerivedStats[]): LeagueContext {
  const collect = (fn: (p: PlayerStat, d: DerivedStats) => number): number[] =>
    qualified.map((p, i) => fn(p, derived[i])).sort((a, b) => a - b)

  return {
    sorted: {
      ppg:       collect((p) => p.ppg),
      ts_pct:    collect((_, d) => d.ts_pct),
      efg_pct:   collect((p) => p.efg_pct),
      // 3PT
      fg3_pct:   collect((p) => p.fg3_pct),
      three_g:   collect((_, d) => d.three_g),
      // MID
      fg2_pct:   collect((p) => p.fg2_pct),
      mid_g:     collect((_, d) => d.mid_g),
      // LAY
      lay_g:     collect((_, d) => d.lay_g),
      a1_rate:   collect((_, d) => d.a1_rate),
      // FT
      ft_pct:    collect((p) => p.ft_pct),
      ftr:       collect((_, d) => d.ftr),
      // Playmaking
      apg:       collect((p) => p.apg),
      at_ratio:  collect((_, d) => d.at_ratio),
      ast_pct:   collect((_, d) => d.ast_pct),
      // Rebounding
      orp:       collect((p) => p.orp),
      drp:       collect((p) => p.drp),
      orb_share: collect((p) => p.reb > 0 ? p.oreb / p.reb * 100 : 0),
      drb_share: collect((p) => p.reb > 0 ? p.dreb / p.reb * 100 : 0),
      trb_pct:   collect((p) => p.team_reb_in_games > 0 ? p.reb / p.team_reb_in_games * 100 : 0),
      // Defense
      spg:       collect((p) => p.spg),
      bpg:       collect((p) => p.bpg),
      // Discipline (역방향 지표는 별도)
      inv_tov_pct: collect((_, d) => -d.tov_pct),  // 낮을수록 좋으므로 부호 반전
    },
  }
}

// ─────────────────────────────────────────────────────────────
// 어트리뷰트 계산 (각 어트리뷰트 → 40-99)
// ─────────────────────────────────────────────────────────────

/** 볼륨이 부족한 어트리뷰트는 중립 60 반환. */
const NEUTRAL = 60

function computeAttributes(p: PlayerStat, d: DerivedStats, ctx: LeagueContext): Record<AttributeCode, number> {
  const pct = (key: string, v: number): number => percentile(ctx.sorted[key] ?? [], v)

  const attrs: Record<AttributeCode, number> = {} as Record<AttributeCode, number>

  // ── SCR ──────────────────────────────────────────────────
  attrs.VOL = pctToRating(pct('ppg', p.ppg))
  attrs.TSA = pctToRating(pct('ts_pct', d.ts_pct))

  // 3PT: 3PA total >= 3 필요 (충분한 volume)
  attrs.THR = p.fg3a >= 3
    ? pctToRating(accVol(pct('fg3_pct', p.fg3_pct), pct('three_g', d.three_g)))
    : NEUTRAL

  // MID: 미들 attempts >= 3
  attrs.MID = p.md_a >= 3
    ? pctToRating(accVol(pct('fg2_pct', p.fg2_pct), pct('mid_g', d.mid_g)))
    : NEUTRAL

  // LAY: 골밑+드라이브 attempts >= 3
  const layA = p.ds_a + p.lu_a
  attrs.LAY = layA >= 3
    ? pctToRating(
        0.5 * pct('fg2_pct', p.fg2_pct) +
        0.35 * pct('lay_g', d.lay_g) +
        0.15 * pct('a1_rate', d.a1_rate)
      )
    : NEUTRAL

  // FT: FTA >= 3
  attrs.FT = p.fta >= 3
    ? pctToRating(accVol(pct('ft_pct', p.ft_pct), pct('ftr', d.ftr)))
    : NEUTRAL

  // ── PLY ──────────────────────────────────────────────────
  attrs.PSV = pctToRating(pct('apg', p.apg))
  attrs.ASR = pctToRating(pct('ast_pct', d.ast_pct))
  // BHD: A/T + TOV 억제
  attrs.BHD = pctToRating(0.6 * pct('at_ratio', d.at_ratio) + 0.4 * pct('inv_tov_pct', -d.tov_pct))

  // ── REB ──────────────────────────────────────────────────
  attrs.ORB = pctToRating(0.5 * pct('orp', p.orp) + 0.5 * pct('orb_share', p.reb > 0 ? p.oreb / p.reb * 100 : 0))
  attrs.DRB = pctToRating(0.5 * pct('drp', p.drp) + 0.5 * pct('drb_share', p.reb > 0 ? p.dreb / p.reb * 100 : 0))
  attrs.RBR = pctToRating(pct('trb_pct', p.team_reb_in_games > 0 ? p.reb / p.team_reb_in_games * 100 : 0))

  // ── DEF ──────────────────────────────────────────────────
  attrs.PMD = pctToRating(pct('spg', p.spg))
  attrs.INT = pctToRating(pct('bpg', p.bpg))

  // ── EFF ──────────────────────────────────────────────────
  attrs.EFG = pctToRating(pct('efg_pct', p.efg_pct))
  attrs.DIS = pctToRating(pct('inv_tov_pct', -d.tov_pct))

  return attrs
}

// ─────────────────────────────────────────────────────────────
// 카테고리 · OVR 계산
// ─────────────────────────────────────────────────────────────

function computeCategories(attrs: Record<AttributeCode, number>): Record<CategoryCode, number> {
  const cats: Record<CategoryCode, number> = { SCR: 0, PLY: 0, REB: 0, DEF: 0, EFF: 0 }
  const catWeightSum: Record<CategoryCode, number> = { SCR: 0, PLY: 0, REB: 0, DEF: 0, EFF: 0 }

  for (const code of Object.keys(ATTRIBUTE_LABELS) as AttributeCode[]) {
    const cat = ATTRIBUTE_LABELS[code].cat
    const w = ATTRIBUTE_WEIGHTS[code]
    cats[cat] += w * attrs[code]
    catWeightSum[cat] += w
  }
  // 정규화 (모든 어트리뷰트 가중치의 합이 1이지만 방어적으로)
  for (const cat of Object.keys(cats) as CategoryCode[]) {
    if (catWeightSum[cat] > 0) cats[cat] = cats[cat] / catWeightSum[cat]
    cats[cat] = Math.round(cats[cat] * 10) / 10
  }
  return cats
}

function computeOVR(cats: Record<CategoryCode, number>, gp: number): number {
  const rawOvr =
    CATEGORY_WEIGHTS.SCR * cats.SCR +
    CATEGORY_WEIGHTS.PLY * cats.PLY +
    CATEGORY_WEIGHTS.REB * cats.REB +
    CATEGORY_WEIGHTS.DEF * cats.DEF +
    CATEGORY_WEIGHTS.EFF * cats.EFF
  // Small-sample regression toward league median (60)
  const K = 8
  const adjusted = (gp * rawOvr + K * 60) / (gp + K)
  return Math.round(adjusted)
}

// ─────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────

export interface ComputeRatingOptions {
  /** 최소 경기 수 (기본 5) */
  minGP?: number
  /** 리그 최다 출전 대비 최소 비율 (기본 1/3) */
  minGPRatio?: number
}

export function computeRatings(
  players: PlayerStat[],
  options: ComputeRatingOptions = {}
): PlayerRating[] {
  const { minGP = 5, minGPRatio = 1 / 3 } = options

  // 자격 필터: 리그 최다 출전자의 minGPRatio 이상 & 최소 minGP
  const maxGP = players.reduce((m, p) => Math.max(m, p.gp), 0)
  const gpThreshold = Math.max(minGP, Math.ceil(maxGP * minGPRatio))

  const qualifiedList = players.filter(p => p.gp >= gpThreshold)
  const qualifiedDerived = qualifiedList.map(derive)

  // 자격자가 3명 미만이면 percentile 이 무의미 → 모두 unrated
  if (qualifiedList.length < 3) {
    return players.map(p => makeUnrated(p))
  }

  const ctx = buildContext(qualifiedList, qualifiedDerived)

  const ratings: PlayerRating[] = players.map(p => {
    if (p.gp < gpThreshold) return makeUnrated(p)
    const d = derive(p)
    const attrs = computeAttributes(p, d, ctx)
    const cats = computeCategories(attrs)
    const ovr = computeOVR(cats, p.gp)
    return {
      player_id: p.player_id,
      name: p.name,
      number: p.number,
      position: p.position,
      gp: p.gp,
      ovr,
      categories: cats,
      attributes: Object.fromEntries(
        Object.entries(attrs).map(([k, v]) => [k, Math.round(v)])
      ) as Record<AttributeCode, number>,
      tier: tierOf(ovr, true),
      rank: 0,
      qualified: true,
    }
  })

  // 랭킹 부여 (자격자만)
  const qualifiedRatings = ratings.filter(r => r.qualified).sort((a, b) => b.ovr - a.ovr)
  qualifiedRatings.forEach((r, i) => { r.rank = i + 1 })

  return ratings
}

function makeUnrated(p: PlayerStat): PlayerRating {
  const emptyAttrs: Record<AttributeCode, number> = Object.fromEntries(
    (Object.keys(ATTRIBUTE_LABELS) as AttributeCode[]).map(k => [k, 0])
  ) as Record<AttributeCode, number>
  return {
    player_id: p.player_id,
    name: p.name,
    number: p.number,
    position: p.position,
    gp: p.gp,
    ovr: 0,
    categories: { SCR: 0, PLY: 0, REB: 0, DEF: 0, EFF: 0 },
    attributes: emptyAttrs,
    tier: 'Unrated',
    rank: 0,
    qualified: false,
  }
}
