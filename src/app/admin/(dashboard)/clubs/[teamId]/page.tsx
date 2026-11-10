import ClubDetail from '@/components/admin/club/ClubDetail'

// CEO 콘솔 동호회 상세 (2026-11-10 온볼 플랫폼화 1·2단계) — 기본 정보 · 운영 설정 · 기능 · 시즌 · 사람
export default async function AdminClubPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params
  return <ClubDetail teamId={teamId} />
}
