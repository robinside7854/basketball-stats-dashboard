// 실행: JITI_JSX=1 node --test --import jiti/register src/components/league/statsTabs.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { getStatsGroupTabs } from './statsTabs'

test('스탯 서브탭은 리더보드 · 팀 · 기록실 3개', () => {
  const tabs = getStatsGroupTabs('/league/o/l', 'teams')
  assert.equal(tabs.length, 3)
  assert.deepEqual(tabs.map(t => t.label), ['리더보드', '팀', '기록실'])
  assert.deepEqual(tabs.map(t => t.href), ['/league/o/l/stats', '/league/o/l/teams', '/league/o/l/records'])
  assert.equal(tabs[1].active, true)
  assert.equal(tabs[0].active, false)
  assert.equal(getStatsGroupTabs('/league/o/l', 'records')[2].active, true)
})
