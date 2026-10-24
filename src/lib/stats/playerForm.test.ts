// 실행: node --test --import jiti/register src/lib/stats/playerForm.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { statForm, buildPlayerForm, formHeadline, type FormDay } from './playerForm'

const day = (i: number, pts: number, games = 4, reb = 5, ast = 2): FormDay =>
  ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, games, pts, reb, ast })

test('평소 범위는 하루 합계의 25%~75%', () => {
  const days = [10, 12, 14, 16, 18, 20, 22, 24, 26].map((p, i) => day(i, p))
  const f = statForm(days, 'pts')
  assert.equal(f.low, 14)
  assert.equal(f.high, 22)
  assert.equal(f.max, 26)
})

test('경기 수만 다르고 경기당 득점이 같으면 꾸준', () => {
  // 3경기 날 15점, 6경기 날 30점 — 하루 합계는 흔들려도 경기당 5점으로 같다
  const days = Array.from({ length: 10 }, (_, i) => (i % 2 ? day(i, 30, 6) : day(i, 15, 3)))
  assert.equal(statForm(days, 'pts').consistency, 'steady')
})

test('경기당 값이 크게 흔들리면 기복', () => {
  const days = Array.from({ length: 10 }, (_, i) => day(i, i % 2 ? 40 : 4, 4))
  assert.equal(statForm(days, 'pts').consistency, 'swingy')
})

test('표본이 적거나 평균이 작으면 판정하지 않는다', () => {
  assert.equal(statForm(Array.from({ length: 5 }, (_, i) => day(i, 20)), 'pts').consistency, null)
  assert.equal(statForm(Array.from({ length: 10 }, (_, i) => day(i, i % 2 ? 4 : 0)), 'pts').consistency, null)
})

test('지난 경기일은 평소 범위와 비교', () => {
  const days = [...[10, 12, 14, 16, 18, 20, 22, 24].map((p, i) => day(i, p)), day(8, 40)]
  const f = buildPlayerForm(days, null)!
  assert.equal(f.last!.vs.pts, 'up')
  assert.equal(f.last!.values.pts, 40)
})

test('문장 한 줄', () => {
  const c = { curLabel: '26.4Q', prevLabel: '지난 분기', cur: { pts: 20, reb: 5, ast: 2 }, prev: { pts: 16.8, reb: 5, ast: 2 } }
  assert.deepEqual(formHeadline(c), { lead: '지난 분기보다 하루 평균 ', diff: '3.2점', tail: ' 더 넣는 중' })
  assert.equal(formHeadline({ ...c, cur: { ...c.cur, pts: 17 } }).diff, '비슷하게')
})
