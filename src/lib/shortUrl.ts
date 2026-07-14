// URL 축약 클라이언트 유틸 — POST /api/short-url 래퍼
// 목적: 카카오톡·SNS 공유 편의 (긴 필터 URL → /h/{code})
//
// 사용:
//   const short = await shortenUrl(window.location.href, { source: 'highlights' })
//   navigator.clipboard.writeText(short)

/**
 * 원본 URL(절대 or 상대)을 짧은 URL(같은 origin 의 /h/{code}) 로 축약.
 * 실패 시 원본 URL 을 그대로 반환 (호출부는 항상 유효한 URL 을 받음).
 */
export async function shortenUrl(
  target: string,
  meta?: Record<string, unknown>,
): Promise<string> {
  try {
    const res = await fetch('/api/short-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, meta: meta ?? null }),
    })
    if (!res.ok) return target
    const data = (await res.json()) as { url?: string }
    return data.url || target
  } catch {
    return target
  }
}
