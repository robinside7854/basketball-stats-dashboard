// 미라클 후프스(게임) 능력치 — 순수 함수. 숫자는 computeLeagueStats 결과(PlayerStat)만 받는다(이벤트를 다시 세지 않는다).
// 식: 게임 저장소 docs/design.md 8-2.
//   성공률은 리그 평균으로 당긴다 (성공 + 50×리그률) ÷ (시도 + 50) · 하루 평균은 (합계 + 12×리그 하루 평균) ÷ (출전일 + 12)
//   → 순위 백분위 → 51 + 48×백분위(가운데 75) → 15일 미만 출전은 70 쪽으로 (× 출전일 ÷ 15).
//   → 종합(체력 뺀 14개 평균)을 다시 순위로 줄 세워 51 + 48×백분위 로 맞춘다(능력치 전체를 같은 만큼 올리고 내림).
//     평균은 순위를 뭉개서 그대로 두면 90 넘는 선수가 안 나온다 — 운영진 기준(2026-11-13): 리그 평균 ≈ 75, 90 이상 최소 3명.
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
export type DefType = 'thief' | 'rim' | 'boards'
export interface GamePlayerCard { id: string; name: string; num: number; pos: GamePos; ratings: GameRatings; off: OffType; def: DefType; provisional: boolean }

export const GAME_MIN_DAYS = 3
const FULL_DAYS = 15
const PROVISIONAL_DAYS = 8
const LOW = 51, SPAN = 48 // 51 + 48×백분위 → 가운데 75, 맨 위 99
const UNSURE = 70 // 출전이 적으면 이 쪽으로 당긴다(평균보다 조금 아래)
const clamp = (v: number) => Math.max(40, Math.min(99, v))
/** 종합 — 게임 화면(players.ts ovr)과 같은 정의: 체력 뺀 나머지 평균 */
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

export function buildGameRoster(stats: PlayerStat[]): GamePlayerCard[] {
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
  const shot = (m: (p: PlayerStat) => number, a: (p: PlayerStat) => number) =>
    pctRank(avg2(pctRank(rate(m, a)), pctRank(perDay(m))))

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
  const raw = ps.map((p, i) => Object.fromEntries(Object.entries(P).map(([k, v]) => [k, pull(p.gp, LOW + SPAN * v[i])])) as unknown as GameRatings)
  // 종합을 순위로 다시 펴고, 각 선수의 능력치를 같은 만큼 옮긴다(장단점 모양은 그대로). 99·40 에 막히면 몇 번 더 옮긴다
  const target = pctRank(raw.map(gameOvr)).map((v, i) => pull(ps[i].gp, LOW + SPAN * v))
  return ps.map((p, i) => {
    let d = 0, ratings = raw[i]
    for (let t = 0; t < 4; t++) {
      ratings = Object.fromEntries(Object.entries(raw[i]).map(([k, v]) => [k, k === 'stamina' ? Math.round(v) : Math.round(clamp(v + d))])) as unknown as GameRatings
      d += target[i] - gameOvr(ratings)
    }
    // 유형은 리그 안 순위(백분위)로 고른다 — 종합을 올리고 내린 뒤의 숫자가 아니라 「이 사람이 상대적으로 뭘 잘하나」
    const off = best<OffType>({ shooter: (P.three[i] + P.mid[i]) / 2, slasher: (P.layup[i] + P.speed[i]) / 2, post: (P.post[i] + P.oreb[i]) / 2, passer: P.pass[i] })
    const def = best<DefType>({ thief: P.steal[i], rim: P.block[i], boards: P.dreb[i] })
    return { id: p.player_id, name: p.name, num: p.number ?? 0, pos: toGamePos(p.position), ratings, off, def, provisional: p.gp < PROVISIONAL_DAYS }
  })
}

const best = <K extends string>(o: Record<K, number>): K => (Object.entries(o) as [K, number][]).sort((a, b) => b[1] - a[1])[0][0]
