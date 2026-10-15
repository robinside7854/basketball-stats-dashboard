// 실행: node --test --import jiti/register src/lib/stats/dayRecord.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { tallyDayRecord, identityKeyOf } from './dayRecord'

const A = { key: identityKeyOf('t1', '락다운'), name: '락다운', color: '#000' }
const A2 = { key: identityKeyOf('t1', '굿모닝'), name: '굿모닝', color: '#111' } // 같은 team_id, 다른 분기 이름
const B = { key: identityKeyOf('t2', '빅현욱'), name: '빅현욱', color: '#222' }

test('친선전은 정규전이 있으면 세지 않는다', () => {
  const r = tallyDayRecord([
    { home: A, away: B, home_score: 10, away_score: 5, is_complete: true },
    { home: B, away: A, home_score: 30, away_score: 0, is_complete: true, is_exhibition: true },
  ])
  assert.equal(r.exhibitionOnly, false)
  assert.equal(r.regularGames, 1)
  assert.equal(r.exhibitionGames, 1)
  assert.deepEqual(r.teams.map(t => [t.name, t.wins, t.losses]), [['락다운', 1, 0], ['빅현욱', 0, 1]])
})

test('친선전뿐인 날은 친선전으로 세고 표시한다', () => {
  const r = tallyDayRecord([{ home: A, away: B, home_score: 1, away_score: 2, is_exhibition: true }])
  assert.equal(r.exhibitionOnly, true)
  assert.equal(r.teams[0].name, '빅현욱')
})

test('정체성 키로 묶고 승률 → 득실 순, 미마감은 제외', () => {
  const r = tallyDayRecord([
    { home: A, away: B, home_score: 10, away_score: 9 },
    { home: A2, away: B, home_score: 20, away_score: 9 },
    { home: A, away: B, home_score: 0, away_score: 50, is_complete: false },
  ])
  assert.deepEqual(r.teams.map(t => t.name), ['굿모닝', '락다운', '빅현욱'])
})
