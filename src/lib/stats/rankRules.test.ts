// 실행: node --test --import jiti/register src/lib/stats/rankRules.test.ts
// 순위 자격·공동 순위·성공률 최소 시도·마일스톤 눈금 — 2026-10-15 통합 규칙
import test from 'node:test'
import assert from 'node:assert/strict'
import { leagueMinRounds, leaderMinRounds, competitionRank, rateIfQualified, MIN_ATTEMPTS_PER_DAY } from './eligibility'
import { nextMilestone } from './milestoneLadder'

test('순위 자격: 열린 날의 30% 올림, 최다 출전자보다 높으면 낮춘다', () => {
  assert.equal(leagueMinRounds(10, [{ gp: 10 }]), 3)
  assert.equal(leagueMinRounds(13, [{ gp: 12 }]), 4)
  // 분기 초 — 열린 날은 10일인데 최다 출전이 2일이면 2일까지 낮춘다
  assert.equal(leagueMinRounds(10, [{ gp: 2 }, { gp: 1 }]), 2)
  // total_rounds 모름 → 최다 출전 기준
  assert.equal(leagueMinRounds(0, [{ gp: 7 }]), 3)
  assert.equal(leagueMinRounds(0, []), 1)
  // 옛 이름도 같은 규칙
  assert.equal(leaderMinRounds([{ gp: 10 }], 10), leagueMinRounds(10, [{ gp: 10 }]))
})

test('공동 순위 1, 2, 2, 4 · 모집단 밖·값 없음은 0', () => {
  const pool = [{ player_id: 'a', v: 10 }, { player_id: 'b', v: 8 }, { player_id: 'c', v: 8 }, { player_id: 'd', v: 5 }]
  assert.deepEqual(['a', 'b', 'c', 'd'].map(id => competitionRank(pool, id, p => p.v)), [1, 2, 2, 4])
  assert.equal(competitionRank(pool, 'z', p => p.v), 0)
  assert.equal(competitionRank(pool, 'd', p => p.v, false), 1)
})

test('성공률: 하루 평균 최소 시도 미달이면 null', () => {
  const need = MIN_ATTEMPTS_PER_DAY.fg3 * 4
  assert.equal(rateIfQualified(1, 1, 4, 'fg3_pct'), null)
  assert.equal(rateIfQualified(need / 2, need, 4, 'fg3_pct'), 50)
  assert.equal(rateIfQualified(3, 10, 0, 'fg_pct'), null)
})

test('마일스톤 다음 눈금', () => {
  assert.deepEqual(nextMilestone('pts', 600), { next: 1000, prev: 500 })
  assert.deepEqual(nextMilestone('pts', 50), { next: 100, prev: 0 })
  assert.equal(nextMilestone('blk', 9999), null)
})
