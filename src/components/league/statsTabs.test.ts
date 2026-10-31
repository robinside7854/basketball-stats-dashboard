// 실행: JITI_JSX=1 node --test --import jiti/register src/components/league/statsTabs.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { getStatsGroupTabs } from './statsTabs'

test('스탯 서브탭은 ← 선수 · 리더보드 · 팀 · 기록실 4개', () => {
  const tabs = getStatsGroupTabs('/league/o/l', 'teams')
  assert.equal(tabs.length, 4)
  assert.deepEqual(tabs.map(t => t.label), ['← 선수', '리더보드', '팀', '기록실'])
  assert.deepEqual(tabs.map(t => t.href), ['/league/o/l/players', '/league/o/l/stats', '/league/o/l/teams', '/league/o/l/records'])
  assert.equal(tabs[2].active, true)
  assert.equal(tabs[0].active, false)
  assert.equal(getStatsGroupTabs('/league/o/l', 'records')[3].active, true)
})
