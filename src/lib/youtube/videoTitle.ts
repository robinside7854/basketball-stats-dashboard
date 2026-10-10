// 영상 제목 파서 — 제목 한 줄에서 "어느 대진의 몇 쿼터인가"를 읽는다.
//
// 배경 (2026-09-07)
//   미라클 업로더의 제목 규칙이 바뀌었다.
//     예전: `260801 경기 3`        → 그날 3번 슬롯 (경기 = 영상 1개)
//     지금: `260905 지피티vs빅현욱 1Q` → 그 대진의 1쿼터 (경기 = 영상 3~4개)
//   경기 진행 방식 자체가 "하루 9경기 로테이션" → "3대진 × 3~4쿼터" 로 바뀐 결과다.
//
// ⚠ 이 파일은 **문자열만 다룬다.** 팀 이름을 팀 id 로 바꾸는 일은 teamNameIndex.ts 가 한다.
//   제목 해석과 팀 판정이 한 함수에 섞이면 "왜 안 붙었나"를 구분할 수 없게 된다 —
//   제목을 못 읽은 것과 팀을 못 찾은 것은 운영자가 해야 할 조치가 완전히 다르다.

/** 제목에서 읽어낸 쿼터형 정보. */
export interface QuarterTitle {
  /** 제목 앞머리의 날짜를 `YYMMDD` 로 맞춘 값(`20261010` 도 `261010`). 없으면 null. */
  dateKey: string | null
  /** 제목에 적힌 순서 그대로 — 홈/어웨이를 뜻하지 않는다. */
  teamA: string
  teamB: string
  /** 1~4쿼터 · 5~6 연장. league_game_videos.quarter 와 같은 축. */
  quarter: number
}

/**
 * 팀 이름 비교용 정규화.
 *
 * ⚠ **NFC 정규화가 먼저다.** YouTube API 는 한글 제목을 NFD(자모 분리형)로 돌려준다.
 *   화면에는 똑같이 보여도 `빅현욱` 이 U+1107 U+1175 ... 라 완성형과 절대 일치하지 않는다.
 *   2026-08-22 에 쿼터 가드를 넣고도 뚫린 원인이 정확히 이것이었다.
 */
export function normalizeName(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\s·・ㆍ.,_\-–—()[\]{}'"]/g, '')
    .toLowerCase()
}

// 쿼터 표기 두 형태. `1Q` · `1쿼터` · `Q1`.
//   뒤에 글자가 이어지면(`1Quarterback` 같은) 쿼터가 아니다 — 경계를 확인한다.
const Q_SUFFIX = /(?:^|[\s([\-_])(\d)\s*(?:q|쿼터)(?![0-9a-z가-힣])/i
const Q_PREFIX = /(?:^|[\s([\-_])q\s*(\d)(?![0-9a-z가-힣])/i
const DATE_KEY = /(?:^|\s)(\d{8}|\d{6})(?=\s|$)/
const VS_SPLIT = /^\s*(.+?)\s*vs\s*(.+?)\s*$/i

/**
 * `260905 지피티vs빅현욱 1Q` → `{ dateKey:'260905', teamA:'지피티', teamB:'빅현욱', quarter:1 }`
 *
 * 쿼터형이 아니면 null — 옛 `경기 N` 제목은 호출부가 따로 처리한다.
 *
 * 파싱 방식: 쿼터 토큰과 날짜 토큰을 **덜어낸 나머지**를 대진으로 본다.
 *   정규식 하나로 전체를 매칭하면 `(풀영상)` 같은 꼬리말 하나에 통째로 실패한다.
 */
export function parseQuarterTitle(rawTitle: string): QuarterTitle | null {
  const title = rawTitle.normalize('NFC').trim()
  if (!title) return null

  const qm = title.match(Q_SUFFIX) ?? title.match(Q_PREFIX)
  if (!qm) return null
  const quarter = Number(qm[1])
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 6) return null

  let rest = title.replace(qm[0], ' ')

  const dm = rest.match(DATE_KEY)
  const dateKey = dm ? toShortDateKey(dm[1]) : null
  if (dm) rest = rest.replace(dm[0], ' ')

  const vm = rest.match(VS_SPLIT)
  if (!vm) return null
  const teamA = vm[1].trim()
  const teamB = vm[2].trim()
  if (!teamA || !teamB) return null
  // 같은 팀끼리의 대진은 있을 수 없다 — 제목을 잘못 읽은 것이다.
  if (normalizeName(teamA) === normalizeName(teamB)) return null

  return { dateKey, teamA, teamB, quarter }
}

/**
 * 한 날짜에 둘 수 있는 슬롯 상한. `games` 라우트의 `MAX_SLOTS_PER_DATE` 와 같은 값이다.
 *
 * ⚠ 예전에는 이 파서가 9 까지만 읽었다 — 하루 9경기 로테이션 시절의 숫자다.
 *   2026-09-19 에 업로더가 `260919 경기1` ~ `경기9` 형식으로 돌아왔는데, 그날처럼
 *   10칸을 넘기면 `경기10` 부터가 조용히 안 붙는다. 상한을 슬롯 상한과 맞춰 둔다.
 */
export const MAX_LEGACY_GAME_NUMBER = 30

/**
 * 옛 규칙: 제목의 `경기 N` → 그날 N 번 슬롯.
 *
 * ⚠ **제목에 쿼터 표기가 있으면 숫자 폴백을 쓰지 않는다** (2026-08-22 사고).
 *   `260822 준비팀vs대항팀B 1쿼터` 에서 폴백이 돌면 쿼터 번호가 경기 번호로 읽혀
 *   같은 경기의 1쿼터·4쿼터가 1경기·4경기 슬롯에 따로 붙었다. 아무 경고도 없었다.
 *   틀리게 붙이느니 안 붙이는 게 낫다.
 *
 * 범위가 두 가지인 이유: `경기 N` 이라고 **적혀 있으면** 슬롯 번호가 확실하므로 1~30 을 읽지만,
 *   글자 없이 숫자만 있는 폴백은 `15분 하이라이트` 같은 제목을 15번 슬롯으로 오독할 수 있어
 *   옛 범위(1~9)에 묶어 둔다.
 */
export function parseLegacyGameNumber(rawTitle: string): number | null {
  const title = rawTitle.normalize('NFC')

  const explicit = title.match(/경기\s*(\d+)/)
  if (explicit) {
    const n = parseInt(explicit[1], 10)
    if (n >= 1 && n <= MAX_LEGACY_GAME_NUMBER) return n
  }

  const looksLikeQuarter = /\d\s*쿼터/.test(title) || /\d\s*Q(?![a-z])/i.test(title) || /quarter/i.test(title)
  if (looksLikeQuarter) return null

  const candidates = (title.match(/\d+/g) ?? [])
    .filter(n => n.length <= 2)
    .map(Number)
    .filter(n => n >= 1 && n <= 9)
  return candidates.length > 0 ? candidates[0] : null
}

// ── 제목의 날짜 ─────────────────────────────────────────────────────
//
// 날짜 표기도 두 가지다 (2026-10-10).
//   `261010 경기 1`   — 6자리 YYMMDD (9월까지의 습관)
//   `20261010 경기 1` — 8자리 YYYYMMDD (10/10 부터, "한동안 이 방식" — 운영진 확인)
// ⚠ YouTube 검색은 단어 단위라 `261010` 으로 찾으면 `20261010` 제목이 **걸리지 않는다.**
//   10/10 영상이 하나도 안 붙은 원인이 이것이다. 검색은 반드시 두 표기를 다 쓴다(searchByDate.ts).

const DATE_TOKEN = /(?<!\d)(\d{8}|\d{6})(?!\d)/g

/** `20261010` → `261010`, `261010` → 그대로. */
function toShortDateKey(token: string): string {
  return token.length === 8 ? token.slice(2) : token
}

/** `YYYY-MM-DD` → 검색어 두 벌 `{ short:'261010', long:'20261010' }`. */
export function dateSearchKeys(date: string): { short: string; long: string } {
  const long = date.slice(0, 4) + date.slice(5, 7) + date.slice(8, 10)
  return { short: long.slice(2), long }
}

/**
 * 제목에 **다른 날짜**가 적혀 있으면 true.
 *
 * YouTube 검색은 느슨해서 `261010` 을 찾아도 앞뒤 일주일 영상이 섞여 들어올 수 있다.
 * 번호형은 `경기 1` 만 보고 1번 슬롯에 꽂으므로, 남의 날짜 영상이 섞이면 조용히 엉뚱한
 * 날에 붙는다. 날짜가 **없는** 제목은 그대로 둔다(종전 동작 — 검색어로 이미 걸러졌다).
 */
export function isOtherDateTitle(rawTitle: string, date: string): boolean {
  const tokens = rawTitle.normalize('NFC').match(DATE_TOKEN)
  if (!tokens || tokens.length === 0) return false
  const want = dateSearchKeys(date).short
  return !tokens.some(t => toShortDateKey(t) === want)
}
