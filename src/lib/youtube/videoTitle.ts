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
  /** 제목 앞머리의 `YYMMDD`. 없으면 null (검색 자체가 날짜로 걸러져 있어 필수는 아니다). */
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
const DATE_KEY = /(?:^|\s)(\d{6})(?=\s|$)/
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
  const dateKey = dm ? dm[1] : null
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
 * 옛 규칙: 제목의 `경기 N` → 그날 N 번 슬롯.
 *
 * ⚠ **제목에 쿼터 표기가 있으면 숫자 폴백을 쓰지 않는다** (2026-08-22 사고).
 *   `260822 준비팀vs대항팀B 1쿼터` 에서 폴백이 돌면 쿼터 번호가 경기 번호로 읽혀
 *   같은 경기의 1쿼터·4쿼터가 1경기·4경기 슬롯에 따로 붙었다. 아무 경고도 없었다.
 *   틀리게 붙이느니 안 붙이는 게 낫다.
 */
export function parseLegacyGameNumber(rawTitle: string): number | null {
  const title = rawTitle.normalize('NFC')

  const explicit = title.match(/경기\s*(\d+)/)
  if (explicit) {
    const n = parseInt(explicit[1], 10)
    if (n >= 1 && n <= 9) return n
  }

  const looksLikeQuarter = /\d\s*쿼터/.test(title) || /\d\s*Q(?![a-z])/i.test(title) || /quarter/i.test(title)
  if (looksLikeQuarter) return null

  const candidates = (title.match(/\d+/g) ?? [])
    .filter(n => n.length <= 2)
    .map(Number)
    .filter(n => n >= 1 && n <= 9)
  return candidates.length > 0 ? candidates[0] : null
}
