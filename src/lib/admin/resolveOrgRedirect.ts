import { createClient } from '@/lib/supabase/admin'

// 옛 /admin/orgs/[orgSlug]/* 경로가 남긴 org_slug 하나로는 팀을 유일하게 특정할 수
// 없다 — 파란날개(paranalgae)처럼 청년부·장년부가 org_slug 를 공유하는 경우가 있다.
// 그래서 리다이렉트 대상도 "이 org_slug 에 팀이 몇 개인가"로 갈린다:
//   1개  → 그 팀의 새 상세 페이지로 바로 보낸다 (URL 이 실제로 가리키던 팀이 명확하므로)
//   0/2+ → 전체 목록(/admin/leagues)으로 보낸다 (어느 팀인지 URL만으로는 알 수 없으므로,
//          예전 org 상세 페이지가 여러 팀을 한 화면에 같이 보여주던 것과 같은 상황)
export async function resolveOrgSlugRedirect(orgSlug: string): Promise<string> {
  const supabase = createClient()
  const { data: teams, error } = await supabase.from('teams').select('id').eq('org_slug', orgSlug)
  if (error || !teams || teams.length !== 1) return '/admin/leagues'
  return `/admin/teams/${teams[0].id}`
}
