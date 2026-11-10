import { isLeaguePrivateGated } from '@/lib/auth/guard'
import AdminGuideClient from './AdminGuideClient'

// 어드민(팀 운영진)용 가이드 (2026-11-10 운영진) — 본문 정본 lib/guide/adminGuide.ts,
//   그리기는 AdminGuideView(흐름도·카드·상태표 — 「글로 쭉 쓰면 읽기 싫다」 → 도식화, 캡처 그림 없음).
export const metadata = { title: '온볼 — 어드민 가이드' }

export default async function AdminGuidePage({ params }: { params: Promise<{ orgSlug: string; leagueId: string }> }) {
  const { leagueId } = await params
  if (await isLeaguePrivateGated(leagueId)) return null
  return <AdminGuideClient />
}
