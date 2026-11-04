// 실행: JITI_JSX=1 node --test --import jiti/register src/components/league/statsTabs.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { getStatsGroupTabs } from './statsTabs'

test('기록 서브탭은 명단 · 리더보드 · 팀 (명단이 맨 왼쪽)', () => {
  const tabs = getStatsGroupTabs('/league/o/l', 'teams')
  assert.deepEqual(tabs.map(t => t.label), ['명단', '리더보드', '팀'])
  assert.deepEqual(tabs.map(t => t.href), ['/league/o/l/players', '/league/o/l/stats', '/league/o/l/teams'])
  assert.equal(tabs[2].active, true)
  assert.equal(getStatsGroupTabs('/league/o/l', 'players')[0].active, true)
})

test('기록실은 운영진에게만 네 번째 서브탭', () => {
  assert.equal(getStatsGroupTabs('/league/o/l', 'records').length, 3)
  const tabs = getStatsGroupTabs('/league/o/l', 'records', true)
  assert.equal(tabs[3].href, '/league/o/l/records')
  assert.equal(tabs[3].active, true)
})
