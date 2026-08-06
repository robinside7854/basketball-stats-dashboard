import { redirect } from 'next/navigation'
import { resolveOrgSlugRedirect } from '@/lib/admin/resolveOrgRedirect'

// 조직(org) 개념이 어드민 화면에서 사라졌다 (2026-08-06) — 팀 설정+대회 목록은
// 이제 /admin/teams/[teamId] 하나로 합쳐졌다. org_slug 하나로 팀을 유일하게 특정할 수
// 없는 경우(예: 파란날개)는 전체 목록으로 보낸다 — 자세한 이유는 resolveOrgSlugRedirect 참고.
export default async function AdminOrgDetailRedirect({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  redirect(await resolveOrgSlugRedirect(orgSlug))
}
