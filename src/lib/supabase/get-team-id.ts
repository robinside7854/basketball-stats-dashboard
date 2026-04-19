import { createClient } from '@/lib/supabase/client'

// 메모리 캐시 — 프로세스 수명 동안 동일 org 반복 조회 방지
const cache = new Map<string, string>()

/**
 * orgSlug → teams.id (UUID) 반환
 * 예) getTeamId('paranalgae') → 'xxxxxxxx-...'
 * sub_type(youth/senior)은 teams 테이블이 아닌 players/tournaments 컬럼으로 구분
 */
export async function getTeamId(orgSlug = 'paranalgae'): Promise<string | null> {
  if (cache.has(orgSlug)) return cache.get(orgSlug)!

  const supabase = createClient()
  const { data, error } = await supabase
    .from('teams')
    .select('id')
    .eq('org_slug', orgSlug)
    .single()

  if (error || !data) return null
  cache.set(orgSlug, data.id)
  return data.id
}
