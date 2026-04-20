import { createClient } from '@/lib/supabase/client'

// 메모리 캐시 — "${orgSlug}:${subSlug}" 키로 process 수명 동안 재사용
const cache = new Map<string, string>()

/**
 * (orgSlug, subSlug) → teams.id (UUID) 반환
 * 예) getTeamId('paranalgae', 'youth') → 'xxxxxxxx-...'
 */
export async function getTeamId(orgSlug = 'paranalgae', subSlug = 'youth'): Promise<string | null> {
  const key = `${orgSlug}:${subSlug}`
  if (cache.has(key)) return cache.get(key)!

  const supabase = createClient()
  const { data, error } = await supabase
    .from('teams')
    .select('id')
    .eq('org_slug', orgSlug)
    .eq('sub_slug', subSlug)
    .single()

  if (error || !data) return null
  cache.set(key, data.id)
  return data.id
}
