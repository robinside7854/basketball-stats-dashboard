// 리그 공지사항 공용 타입 · API 응답 형태와 1:1
export interface LeagueAnnouncement {
  id: string
  title: string
  body_markdown: string
  pinned: boolean
  published_at: string
  created_by: string | null
  updated_at: string
}
