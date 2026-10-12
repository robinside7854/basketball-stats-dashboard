import type { MinRow } from './types'

// 「지난 경기와 같은 선발」 — 선발은 출전시간 표에 in_time 0 으로 들어간다(doStartGame).
//   경기 중 영상 없이 교체하면 교체도 in_time 0 이 될 수 있어, 첫 줄이 저장된 시각 근처(15초)에
//   함께 들어간 행만 선발로 본다.
export function startersFromMinutes(rows: MinRow[]): Set<string> {
  const zero = rows.filter(r => r.in_time === 0)
  if (zero.length === 0) return new Set()
  const firstQ = Math.min(...zero.map(r => r.quarter ?? 1))
  const inQ = zero.filter(r => (r.quarter ?? 1) === firstQ)
  const times = inQ.map(r => (r.created_at ? Date.parse(r.created_at) : NaN)).filter(Number.isFinite)
  if (times.length === 0) return new Set(inQ.map(r => r.league_player_id))
  const first = Math.min(...times)
  return new Set(inQ
    .filter(r => !r.created_at || Date.parse(r.created_at) - first <= 15_000)
    .map(r => r.league_player_id))
}
