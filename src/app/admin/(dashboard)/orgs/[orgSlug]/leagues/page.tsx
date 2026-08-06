import { redirect } from 'next/navigation'
import { resolveOrgSlugRedirect } from '@/lib/admin/resolveOrgRedirect'

// 조직(org) 개념이 어드민 화면에서 사라졌다 (2026-08-06) — 팀별 리그·대회 목록은
// /admin/teams/[teamId] 안에 합쳐졌다 (resolveOrgSlugRedirect 참고).
export default async function AdminOrgLeaguesRedirect({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  redirect(await resolveOrgSlugRedirect(orgSlug))
}
