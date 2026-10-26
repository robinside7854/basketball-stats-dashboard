// 실행: node --test --import jiti/register src/lib/stats/hexRadar.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHexRadar, HEX_AXES, HEX_MIN_SAMPLE, type HexInput } from './hexRadar'

const base = (pid: string, over: Partial<HexInput> = {}): HexInput => ({
  pid, gp: 5,
  pts: 50, fgm: 20, fga: 50, fg3m: 5, fg3a: 15, ftm: 5, fta: 10, md_m: 4, md_a: 12,
  oreb: 5, dreb: 15, reb: 20, ast: 10, stl: 5, blk: 2, tov: 8,
  team_poss: 300, team_reb: 100, team_fgm: 100,
  ...over,
})

const axis = (r: ReturnType<typeof buildHexRadar>, key: string) => r.axes.find(a => a.key === key)!
const comp = (r: ReturnType<typeof buildHexRadar>, key: string, label: string) =>
  axis(r, key).components.find(c => c.label === label)!

test('축 이름·순서는 공격 · 수비 · 리바운드 · 슈팅 · 리딩 · 효율, TS% 는 없다', () => {
  assert.deepEqual(HEX_AXES.map(a => a.label), ['공격', '수비', '리바운드', '슈팅', '리딩', '효율'])
  const labels = HEX_AXES.flatMap(a => a.components.map(c => c.label))
  assert.ok(!labels.some(l => /TS/.test(l)))
  assert.deepEqual(HEX_AXES.find(a => a.key === 'efficiency')!.components.map(c => c.label), ['eFG%'])
})

test('실책 비율은 낮을수록 높은 백분위', () => {
  const pool = [
    base('a', { tov: 2 }),   // 실책 적음
    base('b', { tov: 8 }),
    base('c', { tov: 20 }),  // 실책 많음
  ]
  const ra = buildHexRadar(pool, pool[0])
  const rc = buildHexRadar(pool, pool[2])
  assert.equal(comp(ra, 'leading', '실책 비율').pct, 100)
  assert.equal(comp(rc, 'leading', '실책 비율').pct, 33)
  assert.equal(comp(ra, 'leading', '실책 비율').lowerIsBetter, true)
})

test('최소 시도 미달 요소는 그 선수에게서 빠지고(–) 축 평균에도 안 들어간다', () => {
  const pool = [
    base('a', { fg3a: 3, fg3m: 3 }),  // 3점 3/3 = 100% 지만 시도 부족
    base('b', { fg3a: 20, fg3m: 8 }),
    base('c', { fg3a: 20, fg3m: 4 }),
  ]
  const ra = buildHexRadar(pool, pool[0])
  const c = comp(ra, 'shooting', '3점 성공률')
  assert.equal(c.pct, null)
  assert.equal(c.valueText, '–')
  // b 는 시도 부족 선수 a 와 비교되지 않는다 → 2명 중 1위
  const rb = buildHexRadar(pool, pool[1])
  assert.equal(comp(rb, 'shooting', '3점 성공률').pct, 100)
  // 분모가 없으면(팀 합 없음) 점유율 요소도 빠진다
  const rn = buildHexRadar(pool.map(p => ({ ...p, team_poss: null })), pool[0])
  assert.equal(comp(rn, 'offense', '공격 점유율').pct, null)
})

test('축 값은 축 원점수(요소 평균)를 모집단 안에서 다시 매긴 백분위', () => {
  // 수비 축: 스틸·블록 둘 다 a > b > c > d
  const pool = [
    base('a', { stl: 20, blk: 10 }),
    base('b', { stl: 15, blk: 8 }),
    base('c', { stl: 10, blk: 4 }),
    base('d', { stl: 5, blk: 1 }),
  ]
  const ra = buildHexRadar(pool, pool[0])
  const rd = buildHexRadar(pool, pool[3])
  assert.equal(axis(ra, 'defense').value, 100)
  assert.equal(axis(rd, 'defense').value, 25)
  // 요소 평균만 쓰면 a 와 b 가 가까워도 재순위하면 1위·2위로 갈린다
  const rb = buildHexRadar(pool, pool[1])
  assert.equal(axis(rb, 'defense').value, 75)
})

test('모집단 밖 선수는 값만 있고 백분위·축 값은 비어 있다', () => {
  const pool = [base('a'), base('b'), base('c')]
  const r = buildHexRadar(pool, base('g', { stl: 40 }))
  assert.equal(r.qualified, false)
  assert.equal(r.sample, 3)
  assert.ok(r.axes.every(a => a.value === null))
  assert.equal(comp(r, 'defense', '스틸').valueText, '8.0')
  assert.equal(comp(r, 'defense', '스틸').pct, null)
})

test('비교 인원이 너무 적으면 백분위를 매기지 않는다', () => {
  const pool = [base('a'), base('b')].slice(0, HEX_MIN_SAMPLE - 1)
  const r = buildHexRadar(pool, pool[0])
  assert.equal(r.qualified, true)
  assert.ok(r.axes.every(a => a.value === null))
  assert.ok(r.axes.every(a => a.components.every(c => c.pct === null)))
  const empty = buildHexRadar([], null)
  assert.equal(empty.sample, 0)
  assert.ok(empty.axes.every(a => a.value === null && a.components.every(c => c.valueText === '–')))
})

test('점유율 정의: 어시 점유율 분모는 팀 야투 성공 − 본인 야투 성공', () => {
  const pool = [base('a', { ast: 16, fgm: 20, team_fgm: 100 }), base('b'), base('c')]
  const r = buildHexRadar(pool, pool[0])
  assert.equal(comp(r, 'leading', '어시 점유율').valueText, '20.0%')
  // 공격 점유율 = (50 + 0.44×10 + 8) ÷ 300
  assert.equal(comp(r, 'offense', '공격 점유율').valueText, `${((62.4 / 300) * 100).toFixed(1)}%`)
})
