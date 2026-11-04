'use client'
// 「기록」 탭 서브탭 줄 — 명단 · 리더보드 · 팀 · (운영진) 기록실. 운영진 판정을 여기서 한다.
import LeagueGroupTabs from './LeagueGroupTabs'
import { getStatsGroupTabs, type StatsTabKey } from './statsTabs'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'

export default function StatsGroupTabs({ base, active }: { base: string; active: StatsTabKey }) {
  const { isEditMode } = useLeagueEditMode()
  return <LeagueGroupTabs tabs={getStatsGroupTabs(base, active, isEditMode)} />
}
