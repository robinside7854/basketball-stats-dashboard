import { redirect } from 'next/navigation'

// 조직(org) 개념이 어드민 화면에서 사라졌다 (2026-08-06) — 드래프트 관리 화면도
// leagueId 하나로만 특정됐다(org_slug 는 뒤로가기 링크에만 쓰였음). /admin/leagues/[leagueId]/draft 로 이관.
export default async function AdminOrgDraftRedirect({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params
  redirect(`/admin/leagues/${leagueId}/draft`)
}
