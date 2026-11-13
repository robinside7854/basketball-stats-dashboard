// 실행: node --test --import jiti/register src/lib/game/ratings.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGameRoster, pctRank, gameOvr } from './ratings'
import type { PlayerStat } from '@/types/league'

const p = (id: string, over: Partial<PlayerStat>): PlayerStat => ({
  player_id: id, name: id, number: 1, position: 'F', gp: 20,
  pts: 0, ppg: 0, reb: 20, rpg: 0, oreb: 0, orp: 0, dreb: 0, drp: 0, ast: 10, apg: 0, stl: 5, spg: 0, blk: 2, bpg: 0,
  tov: 10, topg: 0, pf: 0, fgm: 0, fga: 100, fg_pct: 0, fg2m: 0, fg2a: 0, fg2_pct: 0, fg3m: 10, fg3a: 40, fg3_pct: 0,
  ftm: 0, fta: 0, ft_pct: 0, efg_pct: 0, and_one: 0, ds_a: 10, ds_m: 5, lu_a: 10, lu_m: 5, md_a: 10, md_m: 4,
  team_reb_in_games: 0, team_poss_in_games: 0, minutes_played: 0, minutes_est: 0, minutes_est_used: false, pie_num: 0, pie_denom: 0,
  ...over,
} as PlayerStat)

test('pctRank: 동점은 평균, 범위 0~1', () => {
  assert.deepEqual(pctRank([1, 2, 2, 3]), [0, 0.5, 0.5, 1])
})

// 가짜 리그 30명 — 실력이 i 에 따라 고르게 다르다
const league = Array.from({ length: 30 }, (_, i) => p(`p${i}`, {
  gp: i % 6 === 0 ? 6 : 20, position: ['G', 'F', 'C'][i % 3],
  fg3m: i, fg3a: 40, md_m: (i * 7) % 30, md_a: 30, lu_m: i, lu_a: 30, ds_m: (i * 11) % 30, ds_a: 30, oreb: i, dreb: i * 3, pf: 30 - i, ftm: i, fta: 40, fb_pts: (i * 13) % 50, ast: i * 2, stl: (i * 3) % 40, blk: (i * 5) % 30, reb: i * 4, tov: 40 - i,
}))

test('능력치: 평균 ≈ 75 · 90 이상 3명 이상 · 범위 · 제외', () => {
  const r = buildGameRoster([...league, p('twoday', { gp: 2 })])
  assert.equal(r.length, 30, '3일 미만 제외')
  const o = r.map(c => gameOvr(c.ratings)).sort((a, b) => a - b)
  assert.ok(Math.abs(o[15] - 75) <= 3, `가운데 종합 ${o[15]}`)
  assert.ok(o.filter(v => v >= 90).length >= 3, `90 이상 ${o.filter(v => v >= 90).length}명`)
  for (const c of r) for (const v of Object.values(c.ratings)) assert.ok(v >= 40 && v <= 99)
  assert.equal(r.find(c => c.id === 'p0')!.provisional, true)
  assert.equal(Object.keys(r[0].ratings).length, 15)
  assert.ok(new Set(r.map(c => c.off)).size >= 2, '공격 유형이 한 가지로 몰리지 않음')
})
