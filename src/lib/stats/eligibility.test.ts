// 실행: node --test --import jiti/register src/lib/stats/eligibility.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { splitEligible } from './eligibility'

test('자격 경계는 gp >= minRounds, 미달은 1 이상만, gp 0 은 제외', () => {
  const ps = [{ id: 'a', gp: 3 }, { id: 'b', gp: 2 }, { id: 'c', gp: 1 }, { id: 'd', gp: 0 }, { id: 'e', gp: 5 }]
  const { eligible, ineligible } = splitEligible(ps, 3)
  assert.deepEqual(eligible.map(p => p.id), ['a', 'e'])
  assert.deepEqual(ineligible.map(p => p.id), ['b', 'c'])
})

test('성공률 최소 시도: 하루 평균 기준 × 출전일, 출전 0일은 불가', async () => {
  const { meetsAttemptMin, minAttemptsFor, MIN_ATTEMPTS_PER_DAY } = await import('./eligibility')
  const fg = MIN_ATTEMPTS_PER_DAY.fg
  assert.equal(minAttemptsFor('fg_pct', 3), Math.ceil(fg * 3))
  assert.equal(meetsAttemptMin({ gp: 3, fga: fg * 3, fg3a: 0, fta: 0 }, 'fg_pct'), true)
  assert.equal(meetsAttemptMin({ gp: 3, fga: fg * 3 - 1, fg3a: 0, fta: 0 }, 'fg_pct'), false)
  assert.equal(meetsAttemptMin({ gp: 1, fga: 20, fg3a: 1, fta: 0 }, 'fg3_pct'), false)
  assert.equal(meetsAttemptMin({ gp: 0, fga: 20, fg3a: 20, fta: 20 }, 'ft_pct'), false)
})

test('통산 순위: 같은 값은 같은 순위(1,2,2,4)', async () => {
  const { careerTop, rankIn } = await import('./careerRanks')
  const ps = [{ player_id: 'a', name: '가', v: 10 }, { player_id: 'b', name: '나', v: 8 }, { player_id: 'c', name: '다', v: 8 }, { player_id: 'd', name: '라', v: 5 }, { player_id: 'e', name: '마', v: 0 }]
  const top = careerTop(ps, p => p.v, 5)
  assert.deepEqual(top.map(r => [r.player_id, r.rank]), [['a', 1], ['b', 2], ['c', 2], ['d', 4]])
  const m = new Map(ps.map(p => [p.player_id, p.v]))
  assert.equal(rankIn(m, 'c'), 2)
  assert.equal(rankIn(m, 'e'), null)
})
