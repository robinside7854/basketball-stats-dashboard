// 실행: node --test --import jiti/register src/lib/stats/advanced.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { calcUsg } from './advanced'

test('USG% = 본인 (FGA+0.44FTA+TOV) / 팀 소유권 × 100', () => {
  // 팀 40 FGA 중 본인 10 FGA → 25.0
  assert.equal(calcUsg({ fga: 10, fta: 0, tov: 0 }, 40), 25.0)
})

test('팀 분모 0 이면 null (화면에 — 표시)', () => {
  assert.equal(calcUsg({ fga: 0, fta: 0, tov: 0 }, 0), null)
})
