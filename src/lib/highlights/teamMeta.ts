// 팀 대시보드 하이라이트용 팀 메타 (server-safe — TeamContext 는 'use client' 라 RSC 에서 import 불가)
// 라벨은 TeamContext.TEAM_LABELS, 색은 TabNav 팀 액센트(blue/orange)와 동일 계열

export type TeamHighlightMeta = { label: string; color: string }

export const TEAM_HIGHLIGHT_META: Record<string, TeamHighlightMeta> = {
  youth:  { label: '청년부', color: '#3B82F6' },   // blue-500
  senior: { label: '장년부', color: '#F97316' },   // orange-500
}
