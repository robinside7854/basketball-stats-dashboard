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
