'use client'
// 「영상」 탭 서브탭 줄 — 운영진에게만 보인다(하이라이트 · 기록실). 하이라이트 페이지는 서버 컴포넌트라
//   편집 모드 판정을 여기(클라이언트)서 한다. 회원에게는 아무것도 그리지 않는다.
import LeagueGroupTabs from './LeagueGroupTabs'
import { getVideoGroupTabs, type VideoTabKey } from './statsTabs'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'

export default function VideoAdminTabs({ base, active }: { base: string; active: VideoTabKey }) {
  const { isEditMode } = useLeagueEditMode()
  const tabs = getVideoGroupTabs(base, active, isEditMode)
  if (tabs.length === 0) return null
  return <LeagueGroupTabs tabs={tabs} />
}
