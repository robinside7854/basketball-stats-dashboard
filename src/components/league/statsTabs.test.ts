// 실행: JITI_JSX=1 node --test --import jiti/register src/components/league/statsTabs.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { getStatsGroupTabs, getVideoGroupTabs } from './statsTabs'

test('기록 서브탭은 리더보드 · 선수 · 팀 3개', () => {
  const tabs = getStatsGroupTabs('/league/o/l', 'teams')
  assert.deepEqual(tabs.map(t => t.label), ['리더보드', '선수', '팀'])
  assert.deepEqual(tabs.map(t => t.href), ['/league/o/l/stats', '/league/o/l/players', '/league/o/l/teams'])
  assert.equal(tabs[2].active, true)
  assert.equal(getStatsGroupTabs('/league/o/l', 'players')[1].active, true)
})

test('영상 서브탭(기록실)은 운영진에게만', () => {
  assert.equal(getVideoGroupTabs('/league/o/l', 'records', false).length, 0)
  const tabs = getVideoGroupTabs('/league/o/l', 'records', true)
  assert.deepEqual(tabs.map(t => t.href), ['/league/o/l/highlights', '/league/o/l/records'])
  assert.equal(tabs[1].active, true)
})
