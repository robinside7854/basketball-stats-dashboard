import { redirect } from 'next/navigation'

type Params = { orgSlug: string; leagueId: string }
type SearchParams = { quarter?: string }

// 박스스코어 목록(일자별 목록 + 분기 필터 → /boxscore/[date] 이동)은 '일정' 서브탭과
// 완전히 중복이었다 — 일정 쪽이 상위집합(같은 목록 + 예정/미실시까지 + 편집 기능)이라
// 2026-08-09 통합하며 이 경로를 '일정' 으로 흡수했다. 삭제하지 않고 리다이렉트로 남기는
// 이유: 이 목록 화면은 2026-08-08 에 배포돼 이미 공유된 링크가 있을 수 있다.
// ?quarter= 는 그대로 보존(일정 쪽 분기 필터로 이어짐), ?page=(이 목록 전용 5일 페이지네이션)는
// 일정 쪽에 대응 개념이 없어 버린다. /boxscore/[date](실제 박스스코어 상세)는 이 파일과 무관 — 그대로 유지.
// 데이터 조회가 전혀 없는 순수 리다이렉트라 비공개 리그 게이트(isLeaguePrivateGated)도
// 불필요하다 — 목적지(/schedule)가 자기 자신의 게이트를 이미 갖고 있다.
export default async function BoxscoreIndexRedirect({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}) {
  const { orgSlug, leagueId } = await params
  const { quarter } = await searchParams
  const qs = quarter ? `?quarter=${encodeURIComponent(quarter)}` : ''
  redirect(`/league/${orgSlug}/${leagueId}/schedule${qs}`)
}
