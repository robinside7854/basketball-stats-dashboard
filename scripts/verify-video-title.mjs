// 영상 제목 파서 검증 — 실제 모듈(src/lib/youtube/videoTitle.ts)을 그대로 임포트한다.
//
//   node scripts/verify-video-title.mjs
//
// DB 도 네트워크도 쓰지 않는다. 여기서 지키는 것은 하나다:
//   **제목 규칙은 두 가지이고 둘 다 살아 있다.**
//     번호형 `260919 경기1`              → 그날 1번 슬롯
//     쿼터형 `260905 지피티vs빅현욱 1Q`  → 그 대진의 1쿼터
//   업로더의 습관이 날마다 달라서(9/5 쿼터형 · 9/19 번호형) 한쪽만 맞으면 그날 영상이
//   통째로 안 붙는다. 그런데 안 붙어도 에러가 안 나고 토스트도 그럴듯해서 아무도 모른다 —
//   9/12 에 9개 중 3개만 붙은 것을 사람이 재생목록을 세어 보고서야 알았다.
//   규칙을 손댈 때마다 이 스크립트를 돌린다.
import { parseQuarterTitle, parseLegacyGameNumber, MAX_LEGACY_GAME_NUMBER } from '../src/lib/youtube/videoTitle.ts'

let failed = 0
function check(name, fn) {
  let r
  try { r = fn() } catch (e) { console.log(`✖ ${name}\n    예외: ${e.message}`); failed++; return }
  if (r === true) console.log(`✔ ${name}`)
  else { console.log(`✖ ${name}\n    ${r}`); failed++ }
}
const eq = (actual, expected) => actual === expected || `기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`

// ── 번호형 (2026-09-19 업로드 형식) ────────────────────────────────
check('`260919 경기1` → 1번 슬롯 (띄어쓰기 없음)', () => eq(parseLegacyGameNumber('260919 경기1'), 1))
check('`260801 경기 3` → 3번 슬롯 (띄어쓰기 있음)', () => eq(parseLegacyGameNumber('260801 경기 3'), 3))
check('`260919 경기9` → 9번 슬롯', () => eq(parseLegacyGameNumber('260919 경기9'), 9))
// 예전에는 9 까지만 읽었다 — 하루 9경기 로테이션 시절의 숫자다. 10칸을 넘긴 날 조용히 빠졌다.
check('`260919 경기10` → 10번 슬롯 (두 자리도 읽는다)', () => eq(parseLegacyGameNumber('260919 경기10'), 10))
check(`\`경기${MAX_LEGACY_GAME_NUMBER}\` 까지 읽는다 (하루 슬롯 상한)`, () =>
  eq(parseLegacyGameNumber(`260919 경기${MAX_LEGACY_GAME_NUMBER}`), MAX_LEGACY_GAME_NUMBER))
check(`\`경기${MAX_LEGACY_GAME_NUMBER + 1}\` 은 읽지 않는다 (슬롯 상한 밖)`, () =>
  eq(parseLegacyGameNumber(`260919 경기${MAX_LEGACY_GAME_NUMBER + 1}`), null))
check('`260919 경기모음` 은 번호가 아니다 (재생목록 제목)', () => eq(parseLegacyGameNumber('260919 경기모음'), null))
// 글자 없는 숫자 폴백은 옛 범위(1~9)에 묶여 있다 — `15분` 을 15번 슬롯으로 읽으면 조용히 틀린다.
check('`260919 15분 하이라이트` 는 15번 슬롯이 아니다', () => eq(parseLegacyGameNumber('260919 15분 하이라이트'), null))

// ── 쿼터형 (2026-09-05 업로드 형식) ────────────────────────────────
check('`260905 지피티vs빅현욱 1Q` → 대진 + 1쿼터', () => {
  const p = parseQuarterTitle('260905 지피티vs빅현욱 1Q')
  if (!p) return '읽지 못함'
  return (p.teamA === '지피티' && p.teamB === '빅현욱' && p.quarter === 1 && p.dateKey === '260905')
    || `실제 ${JSON.stringify(p)}`
})
check('`2쿼터` 표기도 읽는다', () => eq(parseQuarterTitle('260905 락다운vs빅현욱 2쿼터')?.quarter, 2))
// ⚠ YouTube API 는 한글 제목을 NFD(자모 분리형)로 돌려준다. NFC 정규화를 빼면 정규식이
//   맞아도 절대 안 걸린다 — 2026-08-22 에 쿼터 가드를 넣고도 그대로 뚫린 원인이다.
check('NFD(자모 분리형) 제목도 읽는다 — YouTube API 가 주는 형태', () =>
  eq(parseQuarterTitle('260905 지피티vs빅현욱 1쿼터'.normalize('NFD'))?.quarter, 1))
check('꼬리말이 붙어도 읽는다', () => eq(parseQuarterTitle('260905 지피티vs빅현욱 3Q (풀영상)')?.quarter, 3))

// ── 두 규칙이 서로를 침범하지 않는다 ───────────────────────────────
// 쿼터 번호가 경기 번호로 읽히면 같은 경기의 1·4쿼터가 1경기·4경기 슬롯에 따로 붙는다(8/22 사고).
check('쿼터형 제목은 경기 번호로 읽지 않는다', () =>
  eq(parseLegacyGameNumber('260822 준비팀vs대항팀B 1쿼터'), null))
check('번호형 제목은 쿼터형으로 읽지 않는다', () => eq(parseQuarterTitle('260919 경기1'), null))

console.log(failed === 0 ? '\n전부 통과' : `\n실패 ${failed}건`)
process.exit(failed === 0 ? 0 : 1)
