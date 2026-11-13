// 실행: node --test --import jiti/register src/lib/game/ratings.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGameRoster, pctRank } from './ratings'
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

test('능력치: 범위·당기기·제외·포지션', () => {
  const r = buildGameRoster([
    p('shooter', { fg3m: 30, fg3a: 60, position: 'G' }),
    p('mid', {}),
    p('big', { fg3m: 0, fg3a: 30, reb: 120, blk: 30, position: 'C' }),
    p('rookie', { gp: 5, fg3m: 2, fg3a: 10 }),
    p('twoday', { gp: 2 }),
  ])
  assert.equal(r.length, 4, '3일 미만 제외')
  const by = Object.fromEntries(r.map(c => [c.id, c]))
  assert.equal(by.shooter.ratings.three, 99)
  assert.equal(by.big.ratings.three, 40)
  assert.equal(by.big.ratings.rebound, 99)
  assert.equal(by.big.pos, 'C')
  assert.ok(by.shooter.ratings.speed > by.big.ratings.speed, '가드가 더 빠름')
  for (const v of Object.values(by.rookie.ratings)) assert.ok(Math.abs(v - 55) <= (99 - 55) * 5 / 15 + 0.5, '15일 미만은 55 쪽')
  assert.equal(by.rookie.provisional, true)
  for (const c of r) for (const v of Object.values(c.ratings)) assert.ok(v >= 40 && v <= 99)
})
