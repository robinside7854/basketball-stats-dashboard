// 하이라이트 API 응답 타입 (server ↔ client 공유)

export type HighlightRound = {
  date: string                 // YYYY-MM-DD
  games_count: number          // 해당 라운드의 총 게임 수 (영상 있는 경기만)
  made_events_count: number    // 하이라이트 후보 (성공 슛) 이벤트 수
  team_names: string[]         // 대표 팀명 (중복 제거)
}

export type HighlightClip = {
  event_id: string
  video_url: string
  video_id: string
  video_timestamp: number
  clip_start: number
  clip_end: number
  player_id: string | null
  player_name: string
  player_number: number | null
  player_photo: string | null
  team_id: string | null
  team_name: string
  team_color: string
  shot_type: string
  points: number
  game_id: string
  home_team_name: string
  away_team_name: string
}

export type HighlightPlayerOption = {
  id: string
  name: string
  number: number | null
  count: number
}

export type HighlightTeamOption = {
  id: string
  name: string
  color: string
  count: number
}

export type HighlightRoundDetail = {
  date: string
  clips: HighlightClip[]
  players: HighlightPlayerOption[]
  teams: HighlightTeamOption[]
}
