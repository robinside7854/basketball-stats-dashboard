// 실행: node --test --import jiti/register src/lib/stats/fastBreak.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { fastBreakIds, type FastBreakEvent } from './fastBreak'

let n = 0
const ev = (team: string, type: string, t: number | null, result: string | null = null, quarter = 1, game = 'g'): FastBreakEvent =>
  ({ id: ++n, league_game_id: game, quarter, video_timestamp: t, team_id: team, type, result })

test('수비 리바운드 뒤 7초 안 득점은 속공', () => {
  const a = ev('A', 'dreb', 100), b = ev('A', 'shot_layup', 106, 'made')
  assert.deepEqual([...fastBreakIds([a, b])], [String(b.id)])
})

test('7초가 넘으면 속공 아님 · 경계 7초는 포함', () => {
  const late = [ev('A', 'steal', 10), ev('A', 'shot_layup', 17.5, 'made')]
  assert.equal(fastBreakIds(late).size, 0)
  const edge = [ev('A', 'steal', 10), ev('A', 'shot_3p', 17, 'made')]
  assert.equal(fastBreakIds(edge).size, 1)
})

test('사이에 상대 팀 기록이 있으면 끊긴다', () => {
  const list = [ev('A', 'dreb', 10), ev('B', 'steal', 12), ev('A', 'shot_layup', 14, 'made')]
  assert.equal(fastBreakIds(list).size, 0)
})

test('실패한 슛·자유투·공격 리바운드는 속공 득점이 아니다', () => {
  const list = [ev('A', 'dreb', 10), ev('A', 'shot_layup', 12, 'missed'), ev('A', 'free_throw', 13, 'made'), ev('A', 'oreb', 13)]
  assert.equal(fastBreakIds(list).size, 0)
})

test('다른 쿼터·다른 경기의 시각은 섞지 않는다', () => {
  const list = [ev('A', 'dreb', 10, null, 1), ev('A', 'shot_layup', 12, 'made', 2)]
  assert.equal(fastBreakIds(list).size, 0)
})

test('같은 초면 스틸이 먼저 · 앤드원도 속공', () => {
  const s = ev('A', 'shot_layup', 50, 'made'), st = ev('A', 'steal', 50), a1 = ev('A', 'and_one', 51, 'made')
  const ids = fastBreakIds([s, st, a1])
  assert.ok(ids.has(String(s.id)) && ids.has(String(a1.id)))
})

test('상대 팀 득점 뒤 7초 안 득점도 속공 (2026-11-08)', () => {
  const a = ev('B', 'shot_2p', 100, 'made'), b = ev('A', 'shot_layup', 106, 'made')
  assert.deepEqual([...fastBreakIds([a, b])], [String(b.id)])
  const ft = [ev('B', 'free_throw', 200, 'made'), ev('A', 'shot_3p', 205, 'made')]
  assert.equal(fastBreakIds(ft).size, 1)
  const late = [ev('B', 'shot_2p', 300, 'made'), ev('A', 'shot_layup', 308, 'made')]
  assert.equal(fastBreakIds(late).size, 0)
})

test('상대 득점 뒤 득점 팀이 다른 기록을 남기면 끊긴다 · 실패 슛은 기회가 아니다', () => {
  const cut = [ev('B', 'shot_2p', 10, 'made'), ev('B', 'foul', 11), ev('A', 'shot_layup', 13, 'made')]
  assert.equal(fastBreakIds(cut).size, 0)
  const miss = [ev('B', 'shot_2p', 10, 'missed'), ev('A', 'shot_layup', 13, 'made')]
  assert.equal(fastBreakIds(miss).size, 0)
})

test('자기 팀 득점 뒤 이어 넣은 것은 속공이 아니다', () => {
  const list = [ev('A', 'shot_2p', 10, 'made'), ev('A', 'shot_layup', 13, 'made')]
  assert.equal(fastBreakIds(list).size, 0)
})
