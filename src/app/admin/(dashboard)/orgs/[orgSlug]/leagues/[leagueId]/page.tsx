import { redirect } from 'next/navigation'

// 조직(org) 개념이 어드민 화면에서 사라졌다 (2026-08-06) — 이 화면(팀 구성·선수 배정·
// 일정·결과 입력)은 리그 하나로만 특정되지 org_slug 는 필요 없었다.
// /admin/leagues/[leagueId]/manage 로 이관.
export default async function AdminOrgLeagueDetailRedirect({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params
  redirect(`/admin/leagues/${leagueId}/manage`)
}
