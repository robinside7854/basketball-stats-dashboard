// 실행: node --test --import jiti/register src/lib/stats/playStyle.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPlayStyle, pairBlockedShots, type StyleInput } from './playStyle'

const P = (pid: string, o: Partial<StyleInput>): StyleInput => ({ pid, gp: 10, oreb: 10, dreb: 20, stl: 10, blk: 3, ast: 15, fga: 80, lu_a: 25, ds_a: 15, md_a: 25, fg3a: 15, ...o })
const pool = Array.from({ length: 10 }, (_, i) => P(`p${i}`, { blk: i, stl: 10 - i, oreb: 5 + i, dreb: 25 - i }))

test('블록은 같은 경기·쿼터·상대 팀의 가장 가까운 놓친 슛과 짝짓는다', () => {
  const r = pairBlockedShots(
    [{ game: 'g', quarter: 1, t: 100, team: 'A' }, { game: 'g', quarter: 1, t: 300, team: 'A' }],
    [
      { game: 'g', quarter: 1, t: 98, team: 'B', type: 'shot_layup' },
      { game: 'g', quarter: 1, t: 101, team: 'A', type: 'shot_3p' }, // 우리 팀 슛은 제외
      { game: 'g', quarter: 2, t: 300, team: 'B', type: 'shot_3p' }, // 다른 쿼터 제외
    ])
  assert.deepEqual(r, { total: 2, zones: { rim: 1, mid: 0, three: 0 }, unknown: 1 })
})

test('블록 많고 골밑에서 막으면 림 프로텍터, 공격 리바 비중이 높으면 공격 리바운드 가담', () => {
  const me = P('me', { blk: 30, stl: 2, oreb: 30, dreb: 15 })
  const s = buildPlayStyle([...pool, me], me, { total: 30, zones: { rim: 20, mid: 5, three: 1 }, unknown: 4 })
  const keys = s.tags.map(t => t.key)
  assert.ok(keys.includes('rim-protector'), keys.join(','))
  assert.ok(keys.includes('reb-off'), keys.join(','))
  assert.equal(s.defense.lean, 'rim')
  assert.equal(s.defense.rim_share, 77)
})

test('스틸 위주는 외곽 압박형, 3점 비중이 높으면 3점 슈터', () => {
  const me = P('me', { blk: 0, stl: 40, fg3a: 50, lu_a: 10, ds_a: 5, md_a: 15 })
  const s = buildPlayStyle([...pool, me], me, { total: 0, zones: { rim: 0, mid: 0, three: 0 }, unknown: 0 })
  const keys = s.tags.map(t => t.key)
  assert.ok(keys.includes('def-perimeter') && keys.includes('off-three'), keys.join(','))
  assert.equal(s.defense.rim_share, null)
})

test('리바운드 성향은 공격 리바 비중을 선수끼리 줄 세워 정한다 — 리그 평균과 7%p 차이여도 아래 1/3 이면 수비 위주', () => {
  // 실측 분포 흉내: 공격 리바 비중 13~58%, 리그 약 31%
  const shares = [13, 14, 21, 22, 23, 26, 27, 29, 30, 31, 31, 32, 33, 33, 34, 35, 36, 37, 41, 44, 48, 58]
  const pool = shares.map((sh, i) => P(`r${i}`, { oreb: sh, dreb: 100 - sh }))
  const me = P('me', { oreb: 24, dreb: 76 })
  const s = buildPlayStyle([...pool, me], me, { total: 0, zones: { rim: 0, mid: 0, three: 0 }, unknown: 0 })
  assert.equal(s.rebound.lean, 'defense')
  assert.ok(s.ranked && s.rebound.dreb_rank >= 1)
})
