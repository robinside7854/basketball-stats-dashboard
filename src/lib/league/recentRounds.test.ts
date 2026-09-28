// 실행: JITI_JSX=1 node --test --import jiti/register src/lib/league/recentRounds.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { pickRecentRounds, RECENT_ROUNDS } from './recentRounds'

test('기간과 무관하게 기록이 있는 최신 4일만 고른다', () => {
  // 6일치 · 30일 전 날짜가 최신 4일 안에 들어가는 경우(휴관으로 공백)
  const days = ['2026-09-27', '2026-08-29', '2026-08-28', '2026-08-01', '2026-07-15', '2026-07-01']
  const games = days.flatMap(date => [{ date, id: date + 'a' }, { date, id: date + 'b' }])
  const rounds = pickRecentRounds(games.reverse())
  assert.equal(RECENT_ROUNDS, 4)
  assert.deepEqual(rounds.map(([d]) => d), ['2026-09-27', '2026-08-29', '2026-08-28', '2026-08-01'])
  assert.equal(rounds[1][1].length, 2)
})
