import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toChosung, matchesLabel } from './hangul.ts'

test('toChosung: 한글 음절을 초성으로', () => {
  assert.equal(toChosung('필스위치'), 'ㅍㅅㅇㅊ')
  assert.equal(toChosung('헬프로테이션'), 'ㅎㅍㄹㅌㅇㅅ')
})

test('toChosung: 겹자음 초성', () => {
  assert.equal(toChosung('까치'), 'ㄲㅊ')
  assert.equal(toChosung('빵'), 'ㅃ')
})

test('toChosung: 비한글은 그대로 통과', () => {
  assert.equal(toChosung('ABC'), 'ABC')
  assert.equal(toChosung('3점'), '3ㅈ')
  assert.equal(toChosung(''), '')
})

test('matchesLabel: 초성 질의', () => {
  assert.equal(matchesLabel('ㅍ', '필스위치'), true)
  assert.equal(matchesLabel('ㅍㅅ', '필스위치'), true)
  assert.equal(matchesLabel('ㅎ', '필스위치'), false)
})

test('matchesLabel: 초성 질의는 prefix 매칭만 (중간 초성은 불일치)', () => {
  assert.equal(matchesLabel('ㅅㅇ', '필스위치'), false)
})

test('matchesLabel: 일반 질의는 부분문자열 매칭', () => {
  assert.equal(matchesLabel('스위', '필스위치'), true)
  assert.equal(matchesLabel('필', '필스위치'), true)
  assert.equal(matchesLabel('로테', '헬프로테이션'), true)
  assert.equal(matchesLabel('없는말', '필스위치'), false)
})

test('matchesLabel: 대소문자 무시', () => {
  assert.equal(matchesLabel('zone', 'ZONE 2-3'), true)
  assert.equal(matchesLabel('ZO', 'zone press'), true)
})

test('matchesLabel: 빈 질의는 전부 통과', () => {
  assert.equal(matchesLabel('', '필스위치'), true)
  assert.equal(matchesLabel('   ', '필스위치'), true)
})
