/**
 * 선수 레이팅 시스템 — 누적 스탯 기반 (v2)
 *
 * 6개 카테고리 → OVR (40-99):
 *   ATT (참석)   15%  · 누적 GP
 *   PTS (득점)   20%  · 누적 PTS
 *   REB (리바)   15%  · 누적 REB
 *   AST (도움)   15%  · 누적 AST
 *   STB (스틸+블락) 15% · 누적 STL + BLK
 *   EFF (효율)   20%  · eFG% · TS% · TOV rate(역) · A/T ratio 복합
 *
 * 계산 흐름:
 *   1. 자격: GP >= 1 (전원 대상, 참석 자체가 가중치에 반영됨)
 *   2. 각 카테고리 값 → 리그 퍼센타일 → 40 + 59 · pct^0.75  (범위 40-99)
 *   3. OVR = 카테고리 가중평균
 *   4. Small-sample regression 없음 — 누적 스탯이 이미 GP 를 반영
 *
 * 티어 개념 제거 — 색상은 OVR 구간별 gradient (레이블 없음)
 */

import type { PlayerStat } from '@/types/league'

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

export type CategoryCode = 'ATT' | 'PTS' | 'REB' | 'AST' | 'STB' | 'EFF'

export interface PlayerRating {
  player_id: string
  name: string
  number: number | null
  position: string | null
  gp: number
  ovr: number
  categories: Record<CategoryCode, number>
  rank: number       // OVR 랭킹 (1위=1, unrated=0)
  qualified: boolean // gp >= 1
}

// ─────────────────────────────────────────────────────────────
// 라벨
// ─────────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<CategoryCode, { short: string; long: string; description: string }> = {
  ATT: { short: 'ATT', long: '참석',   description: '누적 참석 경기 (GP)' },
  PTS: { short: 'PTS', long: '득점',   description: '누적 득점' },
  REB: { short: 'REB', long: '리바',   description: '누적 리바운드' },
  AST: { short: 'AST', long: '도움',   description: '누적 어시스트' },
  STB: { short: 'STB', long: '스틸+블락', description: '누적 스틸 + 블락' },
  EFF: { short: 'EFF', long: '효율',   description: 'eFG% · TS% · TOV 관리 · A/T 복합' },
}

// ─────────────────────────────────────────────────────────────
// 가중치
// ─────────────────────────────────────────────────────────────

const CATEGORY_WEIGHTS: Record<CategoryCode, number> = {
  ATT: 0.15,
  PTS: 0.20,
  REB: 0.15,
  AST: 0.15,
  STB: 0.15,
  EFF: 0.20,
}

// ─────────────────────────────────────────────────────────────
// OVR 색상 (티어 대신, 값 gradient 만)
// ─────────────────────────────────────────────────────────────

export interface OvrStyle {
  bg: string; text: string; border: string; hex: string
}

export function ovrStyle(ovr: number, qualified: boolean = true): OvrStyle {
  if (!qualified || ovr <= 0) return { bg: 'bg-gray-900/40', text: 'text-gray-600', border: 'border-gray-800/60', hex: '#4b5563' }
  if (ovr >= 85) return { bg: 'bg-purple-950/40', text: 'text-purple-300', border: 'border-purple-500/60', hex: '#a78bfa' }
  if (ovr >= 78) return { bg: 'bg-amber-950/40',  text: 'text-amber-300',  border: 'border-amber-500/60',  hex: '#fbbf24' }
  if (ovr >= 70) return { bg: 'bg-green-950/40',  text: 'text-green-300',  border: 'border-green-500/60',  hex: '#4ade80' }
  if (ovr >= 60) return { bg: 'bg-blue-950/40',   text: 'text-blue-300',   border: 'border-blue-500/60',   hex: '#60a5fa' }
  if (ovr >= 50) return { bg: 'bg-gray-800/60',   text: 'text-gray-300',   border: 'border-gray-600/60',   hex: '#9ca3af' }
  return           { bg: 'bg-gray-900/60',   text: 'text-gray-400',   border: 'border-gray-700/60',   hex: '#6b7280' }
}

// ─────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────

/** 정렬된 배열에서 target 의 퍼센타일 (0=최하위, 1=최상위, tie 는 평균 rank). */
function percentile(sortedAsc: number[], target: number): number {
  const n = sortedAsc.length
  if (n === 0) return 0.5
  if (n === 1) return 0.5
  let below = 0, equal = 0
  for (const v of sortedAsc) {
    if (v < target) below++
    else if (v === target) equal++
  }
  const rank = below + (equal - 1) / 2
  return Math.max(0, Math.min(1, rank / (n - 1)))
}

/** 퍼센타일 → 40-99 rating. */
function pctToRating(pct: number): number {
  const clamped = Math.max(0, Math.min(1, pct))
  return 40 + 59 * Math.pow(clamped, 0.75)
}

// ─────────────────────────────────────────────────────────────
// 파생 스탯
// ─────────────────────────────────────────────────────────────

function tsPct(p: PlayerStat): number {
  const denom = 2 * (p.fga + 0.44 * p.fta)
  return denom > 0 ? p.pts / denom * 100 : 0
}

function tovRate(p: PlayerStat): number {
  // TOV per possession — 낮을수록 좋음. 볼륨(fga/fta/tov) 이 있는 선수만 유의미
  const poss = p.fga + 0.44 * p.fta + p.tov
  return poss > 0 ? p.tov / poss * 100 : 0
}

function atRatio(p: PlayerStat): number {
  return p.tov > 0 ? p.ast / p.tov : (p.ast > 0 ? 99 : 0)
}

// ─────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────

export function computeRatings(players: PlayerStat[]): PlayerRating[] {
  // 자격: 최소 1경기. Q3 처럼 이제 시작하는 시점에도 표시.
  const eligible = players.filter(p => p.gp >= 1)

  if (eligible.length < 3) {
    return players.map(makeUnrated)
  }

  // ── 각 카테고리별 정렬 배열 ──────────────────────────────────
  const gpArr  = eligible.map(p => p.gp).sort((a, b) => a - b)
  const ptsArr = eligible.map(p => p.pts).sort((a, b) => a - b)
  const rebArr = eligible.map(p => p.reb).sort((a, b) => a - b)
  const astArr = eligible.map(p => p.ast).sort((a, b) => a - b)
  const stbArr = eligible.map(p => p.stl + p.blk).sort((a, b) => a - b)

  // 효율 sub-metrics — 볼륨 있는 선수만 percentile 대상 (야투 시도 없으면 볼륨 없음 = 중립)
  const efgArr    = eligible.filter(p => p.fga > 0).map(p => p.efg_pct).sort((a, b) => a - b)
  const tsArr     = eligible.filter(p => (p.fga + p.fta) > 0).map(tsPct).sort((a, b) => a - b)
  const invTovArr = eligible.filter(p => (p.fga + p.fta + p.tov) > 0).map(p => -tovRate(p)).sort((a, b) => a - b)
  const atArr     = eligible.map(atRatio).sort((a, b) => a - b)

  const ratings: PlayerRating[] = players.map(p => {
    if (p.gp < 1) return makeUnrated(p)

    // 카테고리 값
    const attR = pctToRating(percentile(gpArr, p.gp))
    const ptsR = pctToRating(percentile(ptsArr, p.pts))
    const rebR = pctToRating(percentile(rebArr, p.reb))
    const astR = pctToRating(percentile(astArr, p.ast))
    const stbR = pctToRating(percentile(stbArr, p.stl + p.blk))

    // 효율 복합 — 볼륨 없는 경우 중립(0.5) 처리
    const efgP    = p.fga > 0 ? percentile(efgArr, p.efg_pct) : 0.5
    const tsP     = (p.fga + p.fta) > 0 ? percentile(tsArr, tsPct(p)) : 0.5
    const invTovP = (p.fga + p.fta + p.tov) > 0 ? percentile(invTovArr, -tovRate(p)) : 0.5
    const atP     = percentile(atArr, atRatio(p))

    const effR = pctToRating(0.30 * efgP + 0.30 * tsP + 0.25 * invTovP + 0.15 * atP)

    const ovr = Math.round(
      CATEGORY_WEIGHTS.ATT * attR +
      CATEGORY_WEIGHTS.PTS * ptsR +
      CATEGORY_WEIGHTS.REB * rebR +
      CATEGORY_WEIGHTS.AST * astR +
      CATEGORY_WEIGHTS.STB * stbR +
      CATEGORY_WEIGHTS.EFF * effR
    )

    return {
      player_id: p.player_id,
      name: p.name,
      number: p.number,
      position: p.position,
      gp: p.gp,
      ovr,
      categories: {
        ATT: Math.round(attR * 10) / 10,
        PTS: Math.round(ptsR * 10) / 10,
        REB: Math.round(rebR * 10) / 10,
        AST: Math.round(astR * 10) / 10,
        STB: Math.round(stbR * 10) / 10,
        EFF: Math.round(effR * 10) / 10,
      },
      rank: 0,
      qualified: true,
    }
  })

  // OVR 랭킹 부여
  const sorted = ratings.filter(r => r.qualified).sort((a, b) => b.ovr - a.ovr)
  sorted.forEach((r, i) => { r.rank = i + 1 })

  return ratings
}

function makeUnrated(p: PlayerStat): PlayerRating {
  return {
    player_id: p.player_id,
    name: p.name,
    number: p.number,
    position: p.position,
    gp: p.gp,
    ovr: 0,
    categories: { ATT: 0, PTS: 0, REB: 0, AST: 0, STB: 0, EFF: 0 },
    rank: 0,
    qualified: false,
  }
}
