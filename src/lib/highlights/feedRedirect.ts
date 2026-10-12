// 옛 하이라이트 주소 → 피드(/highlights?…) 주소 (리뉴얼 4단계, 2026-10-12).
// 옛 탭·상세 페이지는 이걸로 redirect 만 한다. 기존 쿼리(type·team·clip·quarter 등 안쪽 필터)는
// 그대로 넘긴다 — 짧은 링크(/h/…)와 공유된 주소가 같은 클립을 가리키도록.
export function highlightsFeedHref(
  orgSlug: string,
  leagueId: string,
  feed: Record<string, string>,
  existing: Record<string, string | string[] | undefined>,
): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(existing)) {
    if (k in feed) continue
    const s = Array.isArray(v) ? v[0] : v
    if (s) p.set(k, s)
  }
  for (const [k, v] of Object.entries(feed)) p.set(k, v)
  const qs = p.toString()
  return `/league/${orgSlug}/${leagueId}/highlights${qs ? `?${qs}` : ''}`
}
