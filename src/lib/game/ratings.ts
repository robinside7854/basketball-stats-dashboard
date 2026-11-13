// 미라클 후프스(게임) 능력치 — 순수 함수. 숫자는 computeLeagueStats 결과(PlayerStat)만 받는다(이벤트를 다시 세지 않는다).
// 식: 게임 저장소 docs/design.md 8-2.
//   성공률은 리그 평균으로 당긴다 (성공 + 50×리그률) ÷ (시도 + 50) · 하루 평균은 (합계 + 12×리그 하루 평균) ÷ (출전일 + 12)
//   → 순위 백분위 → 40 + 59×백분위 → 15일 미만 출전은 55 쪽으로 (× 출전일 ÷ 15).
// 결과 모양은 게임 저장소 src/roster.ts 의 PlayerCard 와 같다 — 바꾸면 두 저장소를 같이 바꾼다.
import type { PlayerStat } from '@/types/league'

export type GamePos = 'G' | 'F' | 'C'
export interface GameRatings {
  three: number; mid: number; inside: number; pass: number; handle: number
  steal: number; block: number; rebound: number; speed: number; stamina: number
}
export interface GamePlayerCard { id: string; name: string; num: number; pos: GamePos; ratings: GameRatings; provisional: boolean }

export const GAME_MIN_DAYS = 3
const FULL_DAYS = 15
const PROVISIONAL_DAYS = 8

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

  const inM = (p: PlayerStat) => p.ds_m + p.lu_m
  const inA = (p: PlayerStat) => p.ds_a + p.lu_a
  const stealP = pctRank(perDay(p => p.stl))
  const posV = ps.map(p => ({ G: 1, F: 0.5, C: 0 })[toGamePos(p.position)])
  // 볼 지키기 = 턴오버율, 낮을수록 높게(부호를 뒤집어 순위)
  const tovRate = ps.map(p => { const d = p.fga + 0.44 * p.fta + p.tov; return d > 0 ? -p.tov / d : 0 })

  const P = {
    three: shot(p => p.fg3m, p => p.fg3a),
    mid: shot(p => p.md_m, p => p.md_a),
    inside: shot(inM, inA),
    pass: pctRank(perDay(p => p.ast)),
    handle: pctRank(tovRate),
    steal: stealP,
    block: pctRank(perDay(p => p.blk)),
    rebound: pctRank(perDay(p => p.reb)),
    speed: pctRank(avg2(stealP, posV)),
    stamina: pctRank(ps.map(p => p.gp)),
  }

  return ps.map((p, i) => {
    const score = (pct: number) => {
      const s = 40 + 59 * pct
      return Math.round(p.gp < FULL_DAYS ? 55 + (s - 55) * (p.gp / FULL_DAYS) : s)
    }
    const ratings = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, score(v[i])])) as unknown as GameRatings
    return { id: p.player_id, name: p.name, num: p.number ?? 0, pos: toGamePos(p.position), ratings, provisional: p.gp < PROVISIONAL_DAYS }
  })
}
