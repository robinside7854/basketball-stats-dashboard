// 미라클 후프스(게임) 능력치 — 순수 함수. 숫자는 computeLeagueStats 결과(PlayerStat)만 받는다(이벤트를 다시 세지 않는다).
// 식: 게임 저장소 docs/design.md 8-2.
//   성공률은 리그 평균으로 당긴다 (성공 + 50×리그률) ÷ (시도 + 50) · 하루 평균은 (합계 + 12×리그 하루 평균) ÷ (출전일 + 12)
//   → 순위 백분위 → 51 + 48×백분위(가운데 75) → 15일 미만 출전은 70 쪽으로 (× 출전일 ÷ 15). 능력치는 이 값 그대로(올리고 내리지 않는다).
//   슛 능력치 = 성공률 순위 2 : 하루 성공 수 순위 1 — 많이 던지기만 해서 슈터가 되지 않게(2026-11-13 운영진 피드백).
// 종합(ovr)은 능력치 평균이 아니라 **포지션 가중 점수의 순위** → 54 + 42×백분위(가운데 75, 90 이상 3명 이상).
//   가드는 블록·리바운드가 낮아도 덜 깎이고, 센터는 3점이 낮아도 괜찮고 리바운드·블록·포스트업이 더 값지다.
//   포지션에 안 맞는 능력치가 80 을 넘으면(3점 쏘는 센터 등) 그 넘은 만큼 덤을 준다.
// 결과 모양은 게임 저장소 src/roster.ts 의 PlayerCard 와 같다 — 바꾸면 두 저장소를 같이 바꾼다.
import type { PlayerStat } from '@/types/league'

export type GamePos = 'G' | 'F' | 'C'
/** 능력치 12개(2026-11-13 세분화 — 골밑 → 레이업·포스트업, 리바운드 → 공격·수비. 3대3 이라 속공·자유투·파울은 없음) */
export interface GameRatings {
  three: number; mid: number; layup: number; post: number; pass: number; handle: number
  steal: number; block: number; oreb: number; dreb: number; speed: number; stamina: number
}
/** 공격·수비 유형 — 기록이 가장 두드러진 쪽(자동). 게임은 유형에 맞는 플레이를 더 잘하게 한다 */
export type OffType = 'shooter' | 'slasher' | 'post' | 'passer'
export type DefType = 'thief' | 'rim' | 'boards' | 'perimeter'
export type Form = 'up' | 'flat' | 'down'
export interface GamePlayerCard {
  id: string; name: string; num: number; pos: GamePos; ratings: GameRatings; off: OffType; def: DefType; provisional: boolean
  /** 종합(화면 표시용 — 경기 계산엔 안 씀) */
  ovr: number
  /** 키(cm) — 없으면 null */
  height: number | null
  /** 클러치(접전 막판 2분) 40~99 — 접전 경기가 적으면 70 쪽으로 당긴다 */
  clutch: number
  /** 요즘 흐름 — 최근 4주 하루 기록(득점+리바+어시)이 시즌보다 15% 이상 위/아래 */
  form: Form
  /** 다이나믹 듀오 — 서로가 서로의 1등 어시스트 짝인 동료 id(8번 이상일 때만) */
  duo: string | null
  duoCount: number
  /** 실제 슛 비중(합 1) — 컴퓨터가 이 선수를 움직일 때 이 비율로 공격을 고른다. 시도가 적으면 리그 평균 쪽으로 당긴다 */
  shotMix: { three: number; mid: number; layup: number; post: number }
  /** 공을 잡았을 때 슛 대신 패스하는 성향 0~1 — 어시스트 ÷ (어시스트 + 야투 시도), 리그 평균 쪽으로 당김 */
  passRate: number
}
export interface GameRosterExtras {
  clutch: Record<string, { gp: number; pts: number; fgm: number; fga: number; fg3m: number }>
  assists: Record<string, Record<string, number>>
  outsideBlocks: Record<string, number>
}
const FORM_UP = 1.15, FORM_DOWN = 0.85, FORM_MIN_DAYS = 2
const DUO_MIN = 8
const CLUTCH_FULL_GP = 6

export const GAME_MIN_DAYS = 3
const FULL_DAYS = 15
const PROVISIONAL_DAYS = 8
const LOW = 51, SPAN = 48 // 51 + 48×백분위 → 가운데 75, 맨 위 99
const UNSURE = 70 // 출전이 적으면 이 쪽으로 당긴다(평균보다 조금 아래)
const clamp = (v: number) => Math.max(40, Math.min(99, v))
const OVR_LOW = 54, OVR_SPAN = 42

type K = Exclude<keyof GameRatings, 'stamina'>
/** 포지션별 종합 가중치 — 1 = 보통. 1 보다 작은 칸은 「그 포지션엔 덜 중요」 */
const OVR_W: Record<GamePos, Record<K, number>> = {
  G: { three: 1.5, mid: 1.2, layup: 1, post: 0.4, pass: 1.5, handle: 1.5, steal: 1.2, block: 0.3, oreb: 0.4, dreb: 0.6, speed: 1.3 },
  F: { three: 1, mid: 1, layup: 1, post: 0.9, pass: 1, handle: 1, steal: 1, block: 0.9, oreb: 1, dreb: 1, speed: 1 },
  C: { three: 0.3, mid: 0.6, layup: 1, post: 1.5, pass: 0.7, handle: 0.5, steal: 0.6, block: 1.5, oreb: 1.5, dreb: 1.5, speed: 0.5 },
}
const UNIQUE_FROM = 80, UNIQUE_K = 0.3
/** 포지션 가중 점수(순위 매기기 전) — 가중 평균 + 포지션에 안 맞는 강점 덤 */
export function posScore(pos: GamePos, r: GameRatings): number {
  const w = OVR_W[pos]
  let sw = 0, sv = 0, bonus = 0
  for (const k of Object.keys(w) as K[]) {
    sw += w[k]; sv += w[k] * r[k]
    if (w[k] < 1) bonus += (1 - w[k]) * Math.max(0, r[k] - UNIQUE_FROM) * UNIQUE_K
  }
  return sv / sw + bonus
}

/** 능력치 단순 평균(체력 뺌) — 점검용 */
export const gameOvr = (r: GameRatings) => { const { stamina: _s, ...rest } = r; const v = Object.values(rest); return v.reduce((a, b) => a + b, 0) / v.length }

export function toGamePos(p: string | null | undefined): GamePos {
  const s = (p ?? '').toUpperCase()
  if (s.includes('C') || s.includes('센터')) return 'C'
  if (s.includes('G') || s.includes('가드')) return 'G'
  return 'F'
}

/** 값 배열 → 0~1 백분위(동점은 평균 순위). 높을수록 1 */
export function pctRank(vals: number[]): number[] {
  const n = vals.length
  if (n < 2) return vals.map(() => 0.5)
  const idx = vals.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(n)
  for (let i = 0; i < n; ) {
    let j = i
    while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++
    const r = (i + j) / 2 / (n - 1)
    for (let k = i; k <= j; k++) out[idx[k][1]] = r
    i = j + 1
  }
  return out
}

const avg2 = (a: number[], b: number[]) => a.map((v, i) => (v + b[i]) / 2)

export function buildGameRoster(stats: PlayerStat[], heights?: Record<string, number | null>, extras?: GameRosterExtras, recent?: PlayerStat[]): GamePlayerCard[] {
  const ps = stats.filter(p => p.gp >= GAME_MIN_DAYS)
  if (ps.length === 0) return []
  const sum = (f: (p: PlayerStat) => number) => ps.reduce((s, p) => s + f(p), 0)
  const days = sum(p => p.gp)

  // 성공률을 리그 평균으로 당긴 값
  const rate = (m: (p: PlayerStat) => number, a: (p: PlayerStat) => number) => {
    const lg = sum(a) > 0 ? sum(m) / sum(a) : 0
    return ps.map(p => (m(p) + 50 * lg) / (a(p) + 50))
  }
  // 하루 평균을 리그 평균으로 당긴 값
  const perDay = (f: (p: PlayerStat) => number) => {
    const lg = sum(f) / days
    return ps.map(p => (f(p) + 12 * lg) / (p.gp + 12))
  }
  // 슛 능력치 = 성공률 순위와 하루 성공 수 순위의 평균을 다시 순위로
  const shot = (m: (p: PlayerStat) => number, a: (p: PlayerStat) => number) => {
    const pr = pctRank(rate(m, a)), vr = pctRank(perDay(m))
    return pctRank(pr.map((v, i) => (2 * v + vr[i]) / 3))
  }

  const stealP = pctRank(perDay(p => p.stl))
  const posV = ps.map(p => ({ G: 1, F: 0.5, C: 0 })[toGamePos(p.position)])
  // 볼 지키기 = 턴오버율, 낮을수록 높게(부호를 뒤집어 순위)
  const tovRate = ps.map(p => { const d = p.fga + 0.44 * p.fta + p.tov; return d > 0 ? -p.tov / d : 0 })

  const P = {
    three: shot(p => p.fg3m, p => p.fg3a),
    mid: shot(p => p.md_m, p => p.md_a),
    layup: shot(p => p.lu_m, p => p.lu_a),
    post: shot(p => p.ds_m, p => p.ds_a),
    pass: pctRank(perDay(p => p.ast)),
    handle: pctRank(tovRate),
    steal: stealP,
    block: pctRank(perDay(p => p.blk)),
    oreb: pctRank(perDay(p => p.oreb)),
    dreb: pctRank(perDay(p => p.dreb)),
    speed: pctRank(avg2(stealP, posV)), // 스피드 = 스틸과 포지션의 평균
    stamina: pctRank(ps.map(p => p.gp)),
  }

  const pull = (gp: number, s: number) => (gp < FULL_DAYS ? UNSURE + (s - UNSURE) * (gp / FULL_DAYS) : s)
  const ratings = ps.map((p, i) => Object.fromEntries(Object.entries(P).map(([k, v]) => [k, Math.round(clamp(pull(p.gp, LOW + SPAN * v[i])))])) as unknown as GameRatings)
  const ovr = pctRank(ps.map((p, i) => posScore(toGamePos(p.position), ratings[i]))).map((v, i) => Math.round(pull(ps[i].gp, OVR_LOW + OVR_SPAN * v)))
  // 클러치 = 접전 eFG(리그 접전 평균으로 15번 시도만큼 당김) 2 : 접전 경기당 득점 1 → 순위
  const cl = ps.map(p => extras?.clutch[p.player_id] ?? { gp: 0, pts: 0, fgm: 0, fga: 0, fg3m: 0 })
  const lgFga = cl.reduce((a, c) => a + c.fga, 0), lgEfg = lgFga ? cl.reduce((a, c) => a + c.fgm + 0.5 * c.fg3m, 0) / lgFga : 0
  const lgGp = cl.reduce((a, c) => a + c.gp, 0), lgPpg = lgGp ? cl.reduce((a, c) => a + c.pts, 0) / lgGp : 0
  const ce = pctRank(cl.map(c => (c.fgm + 0.5 * c.fg3m + 15 * lgEfg) / (c.fga + 15)))
  const cp = pctRank(cl.map(c => (c.pts + 3 * lgPpg) / (c.gp + 3)))
  const clutchP = pctRank(ce.map((v, i) => (2 * v + cp[i]) / 3))
  const outsideP = pctRank(perDay(p => extras?.outsideBlocks[p.player_id] ?? 0))
  const recentBy = Object.fromEntries((recent ?? []).map(r => [r.player_id, r]))
  const prod = (p: PlayerStat) => (p.pts + p.reb + p.ast) / Math.max(1, p.gp)
  const eligible = new Set(ps.map(p => p.player_id))
  const MIX_K = 20
  const mixOf = (p: PlayerStat) => [p.fg3a, p.md_a, p.lu_a, p.ds_a]
  const lgMix = [0, 1, 2, 3].map(j => ps.reduce((a, p) => a + mixOf(p)[j], 0))
  const lgMixSum = lgMix.reduce((a, b) => a + b, 0) || 1
  const lgPass = (() => { const a = ps.reduce((s, p) => s + p.ast, 0), f = ps.reduce((s, p) => s + p.fga, 0); return a + f ? a / (a + f) : 0.2 })()
  const r3 = (v: number) => Math.round(v * 1000) / 1000
  const topMate = (id: string): [string, number] | null => {
    const m = Object.entries(extras?.assists[id] ?? {}).filter(([x]) => eligible.has(x)).sort((a, b) => b[1] - a[1])[0]
    return m && m[1] >= DUO_MIN ? m : null
  }

  return ps.map((p, i) => {
    const m = mixOf(p), tot = m.reduce((a, b) => a + b, 0)
    const mix = m.map((v, j) => (v + MIX_K * lgMix[j] / lgMixSum) / (tot + MIX_K))
    const shotMix = { three: r3(mix[0]), mid: r3(mix[1]), layup: r3(mix[2]), post: r3(mix[3]) }
    const passRate = r3((p.ast + 10 * lgPass) / (p.ast + p.fga + 10))
    const rc = recentBy[p.player_id]
    const ratio = rc && rc.gp >= FORM_MIN_DAYS && prod(p) > 0 ? prod(rc) / prod(p) : 1
    const form: Form = ratio >= FORM_UP ? 'up' : ratio <= FORM_DOWN ? 'down' : 'flat'
    // 듀오는 「서로가 서로의 1등 짝」일 때만 — 한쪽만 1등이면 득점원에게 모두 몰린다(실측 2026-11-13: 서로 1등 3쌍)
    const [duo, duoCount] = topMate(p.player_id) && topMate(topMate(p.player_id)![0])?.[0] === p.player_id ? topMate(p.player_id)! : [null, 0]
    const clutch = Math.round(clamp(70 + (LOW + SPAN * clutchP[i] - 70) * Math.min(1, cl[i].gp / CLUTCH_FULL_GP)))
    // 유형 = 리그 안 순위(백분위)로 「이 사람이 상대적으로 뭘 잘하나」
    const off = best<OffType>({ shooter: (P.three[i] + P.mid[i]) / 2, slasher: (P.layup[i] + P.speed[i]) / 2, post: (P.post[i] + P.oreb[i]) / 2, passer: P.pass[i] })
    const def = best<DefType>({ thief: P.steal[i], rim: P.block[i], boards: P.dreb[i], perimeter: outsideP[i] })
    return { id: p.player_id, name: p.name, num: p.number ?? 0, pos: toGamePos(p.position), ratings: ratings[i], ovr: ovr[i], height: heights?.[p.player_id] ?? null, clutch, form, duo, duoCount, shotMix, passRate, off, def, provisional: p.gp < PROVISIONAL_DAYS }
  })
}

const best = <K extends string>(o: Record<K, number>): K => (Object.entries(o) as [K, number][]).sort((a, b) => b[1] - a[1])[0][0]
