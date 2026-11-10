'use client'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import GuideContent from '@/components/league/guide/GuideContent'
import EmptyState from '@/components/league/ui/EmptyState'
import { ADMIN_GUIDE } from '@/lib/guide/adminGuide'

export default function AdminGuideClient({ images }: { images: string[] }) {
  const { isEditMode } = useLeagueEditMode()
  if (!isEditMode) return <EmptyState title="어드민만 볼 수 있어요" description="회원용 안내는 「이용 가이드」를 봐 주세요." framed />
  return <GuideContent images={images} sections={ADMIN_GUIDE} title="어드민 가이드" subtitle="운영진이 하는 일만 모았어요. 대부분은 자동이에요." share={false} />
}
