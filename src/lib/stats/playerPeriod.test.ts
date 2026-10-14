// 실행: node --test --import jiti/register src/lib/stats/playerPeriod.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  periodOpts, quarterPeriod, gameInPeriod, pickPlayerRow, rankMinRounds, rankOf, sumLines,
} from './playerPeriod'
import type { PlayerStat } from '@/types/league'

test('기간 → 옵션: 전체 / 날짜 / 분기 폴백', () => {
  assert.deepEqual(periodOpts('all'), {})
  assert.deepEqual(periodOpts({ from: '2026-07-01', to: '2026-09-30' }), { from: '2026-07-01', to: '2026-09-30' })
  assert.deepEqual(periodOpts({ quarterId: 'q3' }), { quarterId: 'q3' })
})

test('분기 기간: 날짜가 둘 다 있으면 날짜 범위, 아니면 quarter_id', () => {
  assert.deepEqual(quarterPeriod({ id: 'q', start_date: '2026-07-01', end_date: '2026-09-30' }), { from: '2026-07-01', to: '2026-09-30' })
  assert.deepEqual(quarterPeriod({ id: 'q', start_date: '2026-07-01', end_date: null }), { quarterId: 'q' })
})

test('경기 고르기: 날짜 범위는 quarter_id 를 보지 않는다(뒤늦게 채워진 옛 분기 id)', () => {
  const p = { from: '2026-07-01', to: '2026-09-30' }
  assert.equal(gameInPeriod({ date: '2026-07-05', quarter_id: 'q2' }, p), true)
  assert.equal(gameInPeriod({ date: '2026-10-01', quarter_id: 'q3' }, p), false)
  assert.equal(gameInPeriod({ date: '2026-10-01', quarter_id: 'q3' }, { quarterId: 'q3' }), true)
  assert.equal(gameInPeriod({ date: null, quarter_id: null }, 'all'), true)
})

test('게스트도 본인 줄은 찾는다(순위 모집단에는 없다)', () => {
  const a = { player_id: 'a', gp: 3 } as PlayerStat
  const g = { player_id: 'g', gp: 2 } as PlayerStat
  assert.equal(pickPlayerRow({ players: [a], guests: [g] }, 'g'), g)
  assert.equal(pickPlayerRow({ players: [a] }, 'a'), a)
  assert.equal(pickPlayerRow({ players: [a], guests: [g] }, 'x'), null)
})

test('순위 자격 = 열린 날의 30% (최소 1)', () => {
  assert.equal(rankMinRounds(10, []), 3)
  assert.equal(rankMinRounds(1, []), 1)
  assert.equal(rankMinRounds(0, [{ gp: 7 }]), 3)
})

test('순위: 내림차순 자리, 없으면 0', () => {
  const pool = [{ player_id: 'a', v: 5 }, { player_id: 'b', v: 9 }, { player_id: 'c', v: 7 }]
  assert.equal(rankOf(pool, 'b', p => p.v), 1)
  assert.equal(rankOf(pool, 'a', p => p.v), 3)
  assert.equal(rankOf(pool, 'z', p => p.v), 0)
})

test('리그 통산 = 리그 시즌 줄의 합', () => {
  const s = sumLines([
    { gp: 10, pts: 100, reb: 20, ast: 5, stl: 1, blk: 0 },
    { gp: 4, pts: 30, reb: 8, ast: 2, stl: 0, blk: 1 },
  ])
  assert.deepEqual(s, { gp: 14, pts: 130, reb: 28, ast: 7, stl: 1, blk: 1 })
  assert.deepEqual(sumLines([]), { gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 })
})
