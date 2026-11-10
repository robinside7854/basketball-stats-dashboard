'use client'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import AdminGuideView from '@/components/league/guide/AdminGuideView'
import EmptyState from '@/components/league/ui/EmptyState'

// 어드민에게만 본문(운영 방법 안내 — 비밀은 없지만 회원에게는 쓸모가 없다). 도식화 화면은 AdminGuideView.
export default function AdminGuideClient() {
  const { isEditMode } = useLeagueEditMode()
  if (!isEditMode) return <EmptyState title="어드민만 볼 수 있어요" description="회원용 안내는 「이용 가이드」를 봐 주세요." framed />
  return <AdminGuideView />
}
