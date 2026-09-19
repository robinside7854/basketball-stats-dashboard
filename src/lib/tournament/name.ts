// 대회 이름 비교 정본. **`youtube/import` 의 자동 매칭과 `tournaments` POST 의 중복 방어가
// 반드시 같은 함수를 쓴다** — 두 벌로 갈라지면 "한쪽은 같은 대회로 보고 한쪽은 새로 만드는"
// 상태가 되어, 운영 DB 에 「2026 바다배」가 두 개 생긴 그 버그가 그대로 되살아난다.

/**
 * 표기 차이를 걷어낸 비교용 키.
 *
 *   `제12회 바다배 (비선출부)` · `제 12 회  바다배(비선출부)` → 둘 다 `바다배비선출부`
 *
 * ⚠ YouTube API 는 한글을 NFD(자모 분리형)로 돌려준다 — 먼저 NFC 로 합치지 않으면
 *   DB 의 완성형 이름과 문자열 비교가 절대 성립하지 않는다(reference: 영상 제목 파싱).
 */
export function normalizeTournamentName(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .normalize('NFC')
    .replace(/제\s*\d+\s*회/g, '')          // 제12회 / 제 12 회
    // `2026년 바다배` → `2026바다배`. ⚠ **연도 숫자는 남긴다** — 숫자까지 지우면
    // `2026년 바다배`(→바다배)와 `2026 바다배`(→2026바다배)가 서로 다른 키가 되고,
    // 2025·2026 바다배를 구분하던 유일한 표지도 사라진다. 지우는 것은 `년`/`년도` 뿐이다.
    .replace(/(\d)\s*년도?/g, '$1')
    .replace(/대회/g, '')
    // 괄호·구두점 — 표기 취향일 뿐 대회를 구분하지 않는다
    .replace(/[()[\]{}<>「」『』〈〉【】·・.,'"“”‘’!?~\-–—_/\\|:;]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

/** 두 대회 이름이 같은 대회를 가리키는가(연도는 보지 않는다 — 호출부가 따로 대조한다). */
export function isSameTournamentName(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeTournamentName(a)
  if (!na) return false
  return na === normalizeTournamentName(b)
}

type NamedTournament = { name: string; year: number | null }

/**
 * 기존 대회 목록에서 같은 대회를 찾는다.
 *
 * 순서: ① 이름 정확 일치 → ② 정규화 일치 → ③ **연도가 같을 때만** 부분 포함.
 * 각 단계 안에서는 같은 연도 후보를 먼저 고른다.
 *
 * ⚠ **연도가 다른데 부분 포함만으로 묶지 않는다.** 「바다배」가 2025·2026 둘 다 있으면
 *   엉뚱한 해의 대회에 경기가 통째로 들어간다.
 */
export function findMatchingTournament<T extends NamedTournament>(
  candidates: readonly T[],
  name: string,
  year: number,
): T | null {
  const norm = normalizeTournamentName(name)
  if (!norm) return null

  const pickPreferringYear = (list: T[]): T | null =>
    list.find(t => t.year === year) ?? list[0] ?? null

  const exact = candidates.filter(t => t.name === name)
  if (exact.length > 0) return pickPreferringYear(exact)

  const normalized = candidates.filter(t => normalizeTournamentName(t.name) === norm)
  if (normalized.length > 0) return pickPreferringYear(normalized)

  const partial = candidates.filter(t => {
    if (t.year !== year) return false
    const other = normalizeTournamentName(t.name)
    if (!other) return false
    return other.includes(norm) || norm.includes(other)
  })
  return partial[0] ?? null
}
