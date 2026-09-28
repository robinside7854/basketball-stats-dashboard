// 실행: JITI_JSX=1 node --import jiti/register "src/app/league/[orgSlug]/[leagueId]/teams/_lib/teamLeaders.test.ts"
// ⚠ `node --test <경로>` 는 경로를 glob 으로 읽어 [orgSlug] 를 문자 클래스로 해석 → 0건 실행·통과로 보인다.
//   파일을 직접 실행하면 node:test 가 그대로 돈다.
import test from 'node:test'
import assert from 'node:assert/strict'
import { pickTeamLeader } from './teamLeaders'

test('1경기 뛴 비정규 선수가 PPG 가 더 높아도 정규 선수가 팀 내 1위', () => {
  const rows = [
    { player_id: 'guest-ish', gp: 1, ppg: 30 }, // 서동혁 사례: 비정규, 1경기 고득점
    { player_id: 'regular-a', gp: 8, ppg: 12 },
    { player_id: 'regular-b', gp: 8, ppg: 9 },
  ]
  const leader = pickTeamLeader(rows, new Set(['regular-a', 'regular-b']), r => r.ppg)
  assert.equal(leader?.player_id, 'regular-a')
})

test('정규 선수가 없으면 1위 없음', () => {
  assert.equal(pickTeamLeader([{ player_id: 'x', ppg: 5 }], new Set(), r => r.ppg), undefined)
})
