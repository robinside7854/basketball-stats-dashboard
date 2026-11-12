// 팀 탭 「순위판 · 레이더 · 라커룸」(2026-11-12 운영진 개편)의 숫자 — 한 벌.
//   재료 = 정체성별 선수 줄(팀 선수 합계) + 경기 수(statGp) + 마감 전적(득실). 비교 대상은 「고른 분기의 팀끼리만」(운영진).
import type { PlayerStat } from '@/types/league'
import { teamRatingsFromLines, tovPct } from '@/lib/stats/advanced'

export type BoardTeam = {
  key: string; name: string; color: string
  w: number; d: number; l: number; gf: number; ga: number; statGp: number | null
  players: PlayerStat[]
}

/** 지표 하나 — better: 'high' 높을수록 좋음 / 'low' 낮을수록 좋음 */
export type MetricDef = { key: MetricKey; label: string; hint: string; better: 'high' | 'low'; fmt: (v: number) => string }
export type MetricKey = 'net' | 'ortg' | 'drtg' | 'efg' | 'rpg' | 'astRatio' | 'tovPct' | 'spg' | 'bpg' | 'fbpg'

const f1 = (v: number) => v.toFixed(1)
const pct = (v: number) => `${v.toFixed(1)}%`
const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`

/** 순위판 박스 순서(8칸 — 폰 2칸·PC 4칸) */
export const BOARD_METRICS: MetricDef[] = [
  { key: 'net', label: '종합', hint: '순 레이팅 · 공격 100번당 득실', better: 'high', fmt: signed },
  { key: 'ortg', label: '공격', hint: '공격 레이팅 · 100번당 득점', better: 'high', fmt: f1 },
  { key: 'drtg', label: '수비', hint: '수비 레이팅 · 100번당 실점', better: 'low', fmt: f1 },
  { key: 'efg', label: '슛 정확도', hint: '유효 야투율 · 3점은 1.5개로', better: 'high', fmt: pct },
  { key: 'rpg', label: '리바운드', hint: '경기당 리바운드', better: 'high', fmt: f1 },
  { key: 'astRatio', label: '팀플레이', hint: '넣은 슛 중 어시스트 비율', better: 'high', fmt: pct },
  { key: 'tovPct', label: '볼 보호', hint: '턴오버율 · 낮을수록 좋음', better: 'low', fmt: pct },
  { key: 'spg', label: '디플렉션', hint: '경기당 스틸', better: 'high', fmt: f1 },
]

/** 레이더 6축 */
export const RADAR_METRICS: MetricKey[] = ['ortg', 'drtg', 'rpg', 'efg', 'tovPct', 'astRatio']
export const RADAR_LABEL: Record<MetricKey, string> = {
  net: '종합', ortg: '공격', drtg: '수비', efg: '슛', rpg: '리바운드', astRatio: '팀플레이', tovPct: '볼 보호', spg: '디플렉션', bpg: '블록', fbpg: '속공',
}

export function teamMetrics(t: BoardTeam): Partial<Record<MetricKey, number>> {
  const played = t.w + t.d + t.l
  const gp = (t.statGp ?? played) || 0
  const sum = (k: keyof PlayerStat) => t.players.reduce((s, p) => s + (Number(p[k]) || 0), 0)
  const fga = sum('fga'), fgm = sum('fgm'), fg3m = sum('fg3m'), fta = sum('fta'), tov = sum('tov'), ast = sum('ast')
  const out: Partial<Record<MetricKey, number>> = {}
  const r = teamRatingsFromLines(t.players, gp, played, t.gf, t.ga)
  if (r) { out.net = r.net; out.ortg = r.ortg; out.drtg = r.drtg }
  if (fga > 0) out.efg = (fgm + 0.5 * fg3m) / fga * 100
  if (fgm > 0) out.astRatio = ast / fgm * 100
  const tp = tovPct({ fga, fta, tov }, 1)
  if (tp != null) out.tovPct = tp
  if (gp > 0) {
    out.rpg = sum('reb') / gp
    out.spg = sum('stl') / gp
    out.bpg = sum('blk') / gp
    out.fbpg = t.players.reduce((s, p) => s + (p.fb_pts ?? 0), 0) / gp
  }
  return out
}

/** 지표 하나로 팀 줄 세우기 — 값이 없는 팀은 뒤로, 같은 값은 공동 순위 */
export function rankTeams(teams: BoardTeam[], all: Map<string, Partial<Record<MetricKey, number>>>, m: MetricDef) {
  const rows = teams.map(t => ({ team: t, v: all.get(t.key)?.[m.key] ?? null }))
  rows.sort((a, b) => {
    if (a.v == null) return 1
    if (b.v == null) return -1
    return m.better === 'high' ? b.v - a.v : a.v - b.v
  })
  let prev: number | null = null, rank = 0
  return rows.map((r, i) => {
    const shown = r.v == null ? null : Math.round(r.v * 10) / 10
    if (shown !== prev) { rank = i + 1; prev = shown }
    return { ...r, rank: r.v == null ? null : rank }
  })
}

/** 레이더 축 값 0~100 — 고른 분기 팀 중 가장 좋은 팀 = 100(낮을수록 좋은 지표는 뒤집어 비율로) */
export function radarScore(v: number | undefined, best: number | undefined, better: 'high' | 'low'): number {
  if (v == null || best == null || v <= 0 || best <= 0) return 0
  return Math.max(0, Math.min(100, better === 'high' ? v / best * 100 : best / v * 100))
}

/** 라커룸 기여도 — 선수가 팀 합계에서 차지한 몫(%). 수비 = 수비 리바운드 + 스틸 + 블록(운영진) */
export type Contribution = { pts: number; reb: number; ast: number; def: number; avg: number }
export function contributions(players: PlayerStat[]): Map<string, Contribution> {
  const tot = { pts: 0, reb: 0, ast: 0, def: 0 }
  const defOf = (p: PlayerStat) => (p.dreb ?? 0) + (p.stl ?? 0) + (p.blk ?? 0)
  for (const p of players) { tot.pts += p.pts; tot.reb += p.reb; tot.ast += p.ast; tot.def += defOf(p) }
  const share = (v: number, t: number) => (t > 0 ? v / t * 100 : 0)
  const out = new Map<string, Contribution>()
  for (const p of players) {
    const c = { pts: share(p.pts, tot.pts), reb: share(p.reb, tot.reb), ast: share(p.ast, tot.ast), def: share(defOf(p), tot.def) }
    out.set(p.player_id, { ...c, avg: (c.pts + c.reb + c.ast + c.def) / 4 })
  }
  return out
}

/** 상대 전적표 재료 — [a][b] = a 기준 승·무·패 */
export type H2HCell = { w: number; d: number; l: number }
