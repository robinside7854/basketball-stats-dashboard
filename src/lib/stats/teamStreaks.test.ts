// 실행: node --test --import jiti/register src/lib/stats/teamStreaks.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { teamMarks, summarizeStreaks, type StreakGame } from './teamStreaks'

const g = (date: string, slot: number, home: string, away: string, hs: number, as: number): StreakGame =>
  ({ date, slot, home, away, home_score: hs, away_score: as })

test('날짜 → 슬롯 순으로 줄 세우고 홈/원정 모두 센다', () => {
  const games = [g('2026-10-10', 2, 'B', 'A', 5, 10), g('2026-10-03', 1, 'A', 'B', 10, 5), g('2026-10-10', 1, 'A', 'C', 8, 8)]
  assert.deepEqual(teamMarks(games, 'A').map(m => m.result), ['W', 'D', 'W'])
})

test('최장 연승·연패, 무승부에서 끊긴다, 지금 흐름', () => {
  const r = (s: string) => s.split('').map((x, i) => g(`2026-10-${String(i + 1).padStart(2, '0')}`, 1, 'A', 'B', x === 'W' ? 10 : x === 'L' ? 5 : 7, x === 'W' ? 5 : x === 'L' ? 10 : 7))
  const s = summarizeStreaks(teamMarks(r('WWWDWWLLLLWW'), 'A'))
  assert.equal(s.longestWin, 3)
  assert.equal(s.longestLoss, 4)
  assert.deepEqual(s.current, { result: 'W', length: 2 })
  assert.deepEqual([s.wins, s.draws, s.losses], [7, 1, 4])
})

test('경기가 없으면 흐름 없음', () => {
  const s = summarizeStreaks([])
  assert.equal(s.current, null)
  assert.equal(s.longestWin, 0)
})
