// 하이라이트 API 응답 타입 (server ↔ client 공유)

export type HighlightRound = {
  date: string                 // YYYY-MM-DD
  games_count: number          // 해당 라운드의 총 게임 수
  games_with_video: number     // 유튜브 영상 매핑된 게임 수
  clips_count: number          // 하이라이트 재생 가능 클립 수 (timestamp 있는 성공 슛)
  team_names: string[]         // 대표 팀명 (중복 제거)
  status: 'ready' | 'pending_record' | 'pending_video'
  // ready = 재생 가능 (clips_count > 0)
  // pending_record = 영상 있으나 timestamp 기록 없음 (기록 대기)
  // pending_video = 영상 없음 (매핑 대기)
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
  // 선수별 페이지에서 채움 (라운드 상세 로더는 optional 미설정)
  game_date?: string
  quarter_id?: string | null
  opponent_name?: string
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

// === 선수별 하이라이트 ============================================

export type PlayerHighlightsInfo = {
  id: string
  name: string
  number: number | null
  photo_url: string | null
}

export type HighlightQuarterOption = {
  id: string
  year: number
  quarter: number
  label: string   // "25.1Q"
  count: number
}

export type HighlightShotTypeOption = {
  type: string
  label: string
  count: number
}

export type PlayerHighlightsData = {
  player: PlayerHighlightsInfo
  clips: HighlightClip[]      // game_date desc → 같은 경기 내 video_timestamp asc
  quarters: HighlightQuarterOption[]
  shotTypes: HighlightShotTypeOption[]
}
