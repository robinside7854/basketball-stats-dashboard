// URL 의 [leagueId] 파라미터를 슬러그 또는 UUID 어느 쪽이든 받아서
// 실제 league UUID 로 변환하는 헬퍼.

import type { SupabaseClient } from '@supabase/supabase-js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function looksLikeUuid(s: string): boolean {
  return UUID_RE.test(s)
}

/**
 * URL slug 또는 UUID → 실제 league UUID 변환.
 *
 * @param supabase  Supabase 클라이언트 (admin 또는 일반)
 * @param orgSlug   조직 슬러그 (예: "miracle", "paranalgae")
 * @param idOrSlug  URL [leagueId] 값. UUID 거나 슬러그
 * @returns         UUID. 못 찾으면 null
 */
export async function resolveLeagueId(
  supabase: SupabaseClient,
  orgSlug: string,
  idOrSlug: string,
): Promise<string | null> {
  if (!idOrSlug) return null
  // UUID 면 그대로 통과
  if (looksLikeUuid(idOrSlug)) return idOrSlug
  // 슬러그로 조회
  const { data } = await supabase
    .from('leagues')
    .select('id')
    .eq('org_slug', orgSlug)
    .eq('slug', idOrSlug)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

/**
 * URL slug 또는 UUID → league 전체 행 변환.
 * 자주 league 메타도 같이 필요한 페이지에서 사용.
 */
export async function resolveLeague(
  supabase: SupabaseClient,
  orgSlug: string,
  idOrSlug: string,
): Promise<{ id: string; slug: string; name: string; org_slug: string } | null> {
  if (!idOrSlug) return null
  const q = supabase
    .from('leagues')
    .select('id, slug, name, org_slug')
    .eq('org_slug', orgSlug)
  const filtered = looksLikeUuid(idOrSlug)
    ? q.eq('id', idOrSlug)
    : q.eq('slug', idOrSlug)
  const { data } = await filtered.maybeSingle()
  return (data as { id: string; slug: string; name: string; org_slug: string } | null) ?? null
}
