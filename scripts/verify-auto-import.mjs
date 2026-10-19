// 자동 기록 불러오기 파서 검증 — 실제 모듈(src/lib/autoImport.ts)을 그대로 임포트한다.
//
//   node scripts/verify-auto-import.mjs
//
// DB·네트워크 없음. 지키는 것: 상대 득점은 빠지고, 추정 2점은 사람이 고를 때까지 저장이 막히고,
// ±3초 안의 같은 계열 기록은 중복 의심으로 버림이 기본값이 된다.
import { parseAutoImport, markDuplicates, blocksSave, needsAttention, toEventBody } from '../src/lib/autoImport.ts'

const line = o => JSON.stringify({
  quarter: 1, video_id: 'pq4XZ7GqDIg', result: 'made', player_id: null, player_name: null, player_number: null,
  ...o,
  extra: JSON.stringify({ auto: { source: 's', confidence: 0.4, type_guess: false, ...(o.auto ?? {}) } }),
})
const roster = [{ id: 'p10', number: '10', name: '조정한' }, { id: 'p7', number: '7', name: '김칠' }]
const text = [
  line({ type: 'shot_2p_mid', video_timestamp: 516, player_number: '10', auto: { type_guess: true } }),
  line({ type: 'foul', video_timestamp: 542, result: null }),
  line({ type: 'opp_score', video_timestamp: 600 }),
  line({ type: 'shot_3p', video_timestamp: 100, player_name: '김칠' }),
  line({ type: 'free_throw', video_timestamp: 700, result: null }),
  '{깨진 줄',
].join('\n')

const { rows, skipped, oppRows } = parseAutoImport(text, roster)
const fails = []
const eq = (name, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(`${name}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`) }

eq('행 수(상대·미성공·깨진 줄 제외)', rows.length, 3)
eq('시각 순', rows.map(r => r.ts), [100, 516, 542])
eq('skipped', skipped, 2)
eq('oppRows', oppRows, 1)
eq('이름 매칭', rows[0].playerId, 'p7')
eq('번호 매칭', rows[1].playerId, 'p10')
eq('추정 2점은 type 비움', rows[1].type, null)
eq('추정 2점은 저장 막음', blocksSave(rows[1]), true)
eq('선수 없는 파울은 확인 필요', needsAttention(rows[2]), true)
eq('선수 없는 파울은 저장 가능', blocksSave(rows[2]), false)

const marked = markDuplicates(rows, [
  { type: 'shot_layup', result: 'made', video_timestamp: 518.5 }, // 516 과 2.5초 → 중복
  { type: 'shot_3p', result: 'missed', video_timestamp: 100 },     // 실패 슛 → 중복 아님
  { type: 'foul', video_timestamp: 546 },                          // 4초 → 중복 아님
])
eq('중복 판정', marked.map(r => r.duplicate), [false, true, false])
eq('중복은 버림 기본', marked.map(r => r.approved), [true, false, true])

eq('본문', toEventBody({ ...rows[0] }, 'G'), {
  game_id: 'G', quarter: 1, video_timestamp: 100, type: 'shot_3p', player_id: 'p7', result: 'made', related_player_id: null,
})
eq('파울 본문 result', toEventBody(rows[2], 'G').result, null)

// 실제 내보내기 파일이 있으면 읽어 본다(없으면 건너뜀) — 0행이면 "아무것도 안 읽은 통과"다.
import fs from 'node:fs'
const real = 'C:/Users/N_399/Desktop/ai_rob/hoops-autostat/data/export/pq4XZ7GqDIg.onball.jsonl'
if (fs.existsSync(real)) {
  const r = parseAutoImport(fs.readFileSync(real, 'utf8'), [])
  console.log(`실제 파일: 후보 ${r.rows.length} · 상대 ${r.oppRows} · 제외 ${r.skipped}`)
  if (r.rows.length === 0) fails.push('실제 파일에서 후보 0행')
}

if (fails.length) { console.log('✖ ' + fails.join('\n✖ ')); process.exit(1) }
console.log('✔ autoImport 검증 통과')
