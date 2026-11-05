// 게임 로그 플레이 뷰어 판정 검증 — 실제 모듈(src/lib/playViewer.ts)을 그대로 임포트한다.
//
//   node scripts/verify-play-viewer.mjs
//
// DB·네트워크 없음. 지키는 것: 성공 슛만 하이라이트 여유(앞 10초)를 쓰고, 나머지는 앞 6·뒤 3초,
// 시각 없는 기록은 재생 불가, 교체는 「교체」 칩을 눌러야만 보인다.
import { chipOf, playWindow, matchesFilter } from '../src/lib/playViewer.ts'

const fails = []
const eq = (name, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(`${name}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`) }

const ev = (type, o = {}) => ({ type, result: null, quarter: 1, video_timestamp: 100, player_id: 'p1', related_player_id: null, ...o })
const events = [
  ev('shot_3p', { result: 'made', related_player_id: 'p3' }),   // 어시스트는 성공 슛에 달린다
  ev('shot_layup', { result: 'missed' }),
  ev('free_throw', { result: 'made', quarter: 2 }),
  ev('assist', { player_id: 'p2', related_player_id: 'p1' }),
  ev('dreb'), ev('oreb'), ev('steal'), ev('block'), ev('turnover'), ev('foul'),
  ev('sub_in'), ev('opp_score'), ev('quarter_start'),
]

eq('칩', events.map(chipOf), ['made', 'missed', 'made', 'ast', 'reb', 'reb', 'stlblk', 'stlblk', 'tov', 'foul', 'sub', null, null])

eq('성공 3점 구간', playWindow(events[0]), { start: 90, end: 108 })
eq('성공 자유투 구간', playWindow(events[2]), { start: 90, end: 106 })
eq('실패 슛 구간', playWindow(events[1]), { start: 94, end: 103 })
eq('리바 구간', playWindow(events[4]), { start: 94, end: 103 })
eq('0초 근처는 0으로', playWindow(ev('steal', { video_timestamp: 2 })), { start: 0, end: 5 })
eq('시각 없음', playWindow(ev('steal', { video_timestamp: null })), null)

const pick = f => events.filter(e => matchesFilter(e, f)).map(e => e.type)
const none = new Set()
eq('기본 = 교체만 숨김', pick({ chips: none, quarter: null, playerId: '' }).includes('sub_in'), false)
eq('기본 개수', pick({ chips: none, quarter: null, playerId: '' }).length, events.length - 1)
eq('교체 칩', pick({ chips: new Set(['sub']), quarter: null, playerId: '' }), ['sub_in'])
eq('득점+스틸블록', pick({ chips: new Set(['made', 'stlblk']), quarter: null, playerId: '' }), ['shot_3p', 'free_throw', 'steal', 'block'])
eq('쿼터', pick({ chips: new Set(['made']), quarter: 2, playerId: '' }), ['free_throw'])
eq('어시 칩 = 어시 달린 성공 슛 + assist', pick({ chips: new Set(['ast']), quarter: null, playerId: '' }), ['shot_3p', 'assist'])
eq('어시한 선수로 거르면 그 슛이 나온다', pick({ chips: new Set(['made']), quarter: null, playerId: 'p3' }), ['shot_3p'])
eq('다른 선수', pick({ chips: none, quarter: null, playerId: 'p9' }), [])

if (fails.length) { console.log('✖ ' + fails.join('\n✖ ')); process.exit(1) }
console.log(`✔ playViewer 검증 통과 (이벤트 ${events.length}건)`)
