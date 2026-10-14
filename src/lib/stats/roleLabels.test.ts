// 실행: node --test --import jiti/register src/lib/stats/roleLabels.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { computeRoleLabels, topCut, competitionRank, roleLabelsPublic, type RoleInput } from './roleLabels'

// 배경 선수 — 번호가 클수록 모든 값(하루 평균·슛 비중)이 조금씩 크다. p0 가 가장 낮다.
//   (값이 전부 같으면 전원이 1등 동률이라 전원이 「상위」가 된다 — 규칙상 맞지만 시험이 안 된다)
//   야투는 하루 5개 이상(최소 시도 충족). 시험 대상은 p0·p1 에 큰 값을 덮어쓴다.
const bg = (i: number): Partial<RoleInput> => ({
  pts: 20 + i, reb: 8 + i, oreb: 1 + Math.floor(i / 2), ast: 4 + i, stl: 2 + i, blk: 1 + i,
  fga: 30 - i,
})
const base = (id: string, over: Partial<RoleInput> = {}): RoleInput => ({
  player_id: id, gp: 4,
  pts: 20, reb: 8, oreb: 2, ast: 4, tov: 4, stl: 2, blk: 1,
  fga: 30, fg3a: 5, fg3m: 2, fta: 4,
  ds_a: 5, lu_a: 5, md_a: 5,
  ...over,
})
const pool = (n: number, mk: (i: number) => Partial<RoleInput> = () => ({})) =>
  Array.from({ length: n }, (_, i) => base(`p${i}`, { ...bg(i), ...mk(i) }))
const keys = (r: ReturnType<typeof computeRoleLabels>, id: string) => r.byPlayer.get(id)!.labels.map(l => l.key)

test('상위 10% 자리 = 올림', () => {
  assert.equal(topCut(25, 0.1), 3)
  assert.equal(topCut(20, 0.1), 2)
  assert.equal(topCut(5, 0.1), 1)
  assert.equal(topCut(11, 0.2), 3)
  assert.equal(topCut(0, 0.1), 0)
})

test('경쟁 순위: 동률은 같은 자리', () => {
  assert.equal(competitionRank([9, 7, 7, 5], 7), 2)
  assert.equal(competitionRank([9, 7, 7, 5], 5), 4)
  assert.equal(competitionRank([9, 7, 7, 5], 9), 1)
})

test('아무것도 안 튀면 팀플레이어', () => {
  const r = computeRoleLabels(pool(10))
  assert.deepEqual(keys(r, 'p0'), ['teamplayer'])
})

test('스코어러: N=10 → 1등만, 경계 동률은 둘 다', () => {
  const r = computeRoleLabels(pool(10, i => (i === 0 ? { pts: 60 } : {})))
  assert.deepEqual(keys(r, 'p0'), ['scorer'])
  const tie = computeRoleLabels(pool(10, i => (i < 2 ? { pts: 60 } : {})))
  assert.deepEqual(keys(tie, 'p0'), ['scorer'])
  assert.deepEqual(keys(tie, 'p1'), ['scorer'])
  // 2등은 N=10 에서 상위 10%(1자리) 밖
  const two = computeRoleLabels(pool(10, i => (i === 0 ? { pts: 60 } : i === 1 ? { pts: 50 } : {})))
  assert.deepEqual(keys(two, 'p1'), ['teamplayer'])
})

test('최대 2개: 자리 백분율이 작은 순', () => {
  // p0 는 득점·리바·스틸 1등(모두 1/10) — 동률이면 정의 순서(스코어러 → 리바운더 → 스틸러)
  const r = computeRoleLabels(pool(10, i => (i === 0 ? { pts: 60, reb: 30, stl: 12 } : {})))
  assert.deepEqual(keys(r, 'p0'), ['scorer', 'rebounder'])
  assert.deepEqual(r.byPlayer.get('p0')!.qualified, ['scorer', 'rebounder', 'stealer'])
})

test('올라운더는 들면 항상 둘 중 하나', () => {
  // N=10 → 상위 20% = 2자리. p0 득점·리바·어시 1등이고 스틸·블락도 1등
  const r = computeRoleLabels(pool(10, i => (i === 0 ? { pts: 60, reb: 30, ast: 20, stl: 12, blk: 9 } : {})))
  const ks = keys(r, 'p0')
  assert.equal(ks.length, 2)
  assert.equal(ks[0], 'allround')
  // 올라운더만(나머지 상위 10% 아님): 득점·리바·어시 2등
  const r2 = computeRoleLabels(pool(10, i => (
    i === 0 ? { pts: 60, reb: 30, ast: 20 } : i === 1 ? { pts: 50, reb: 25, ast: 16 } : {}
  )))
  assert.deepEqual(keys(r2, 'p1'), ['allround'])
})

test('플레이메이커: 어시/실책이 리그 평균 미만이면 안 된다', () => {
  const ok = computeRoleLabels(pool(10, i => (i === 0 ? { ast: 20, tov: 4 } : {})))
  assert.deepEqual(keys(ok, 'p0'), ['playmaker'])
  const sloppy = computeRoleLabels(pool(10, i => (i === 0 ? { ast: 20, tov: 30 } : {})))
  assert.deepEqual(keys(sloppy, 'p0'), ['teamplayer'])
})

test('슛 비중 라벨은 야투 최소 시도 충족자만 (N 도 그 인원)', () => {
  // p0 는 3점 비중 최고지만 야투가 하루 2개(기준 5개 미만)
  const low = computeRoleLabels(pool(10, i => (i === 0 ? { fga: 8, fg3a: 8, fg3m: 5, ds_a: 0, lu_a: 0, md_a: 0 } : {})))
  assert.deepEqual(keys(low, 'p0'), ['teamplayer'])
  assert.equal(low.byPlayer.get('p0')!.metrics.share3.rank, null)
  assert.equal(low.shotPoolSize, 9)
})

test('3점 슈터: 비중 상위 + 성공률 ≥ 리그 평균 + 3점 최소 시도', () => {
  const sniper = { fga: 24, fg3a: 20, fg3m: 10, ds_a: 2, lu_a: 1, md_a: 1 }
  const r = computeRoleLabels(pool(10, i => (i === 0 ? sniper : {})))
  assert.deepEqual(keys(r, 'p0'), ['shooter3'])
  // 성공률이 평균 아래
  const cold = computeRoleLabels(pool(10, i => (i === 0 ? { ...sniper, fg3m: 2 } : {})))
  assert.deepEqual(keys(cold, 'p0'), ['teamplayer'])
})

test('골밑 해결사·미드레인지 장인', () => {
  const r = computeRoleLabels(pool(10, i => (
    i === 0 ? { fg3a: 0, fg3m: 0, ds_a: 12, lu_a: 12, md_a: 0 }
      : i === 1 ? { fg3a: 0, fg3m: 0, ds_a: 0, lu_a: 0, md_a: 24 } : {}
  )))
  assert.deepEqual(keys(r, 'p0'), ['finisher'])
  assert.deepEqual(keys(r, 'p1'), ['midrange'])
})

test('값 0 은 상위에 들지 않는다 (블락 0개 모집단)', () => {
  const r = computeRoleLabels(pool(5, () => ({ blk: 0 })))
  for (let i = 0; i < 5; i++) assert.ok(!r.byPlayer.get(`p${i}`)!.qualified.includes('rim'))
})

test('공개 스위치', () => {
  assert.equal(roleLabelsPublic({ role_labels_public: true }), true)
  assert.equal(roleLabelsPublic({ role_labels_public: 'true' }), false)
  assert.equal(roleLabelsPublic(null), false)
})
