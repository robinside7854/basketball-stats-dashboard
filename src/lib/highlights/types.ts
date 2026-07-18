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
  quarter_id?: string | null        // 리그 "분기"(시즌 단위, 예 25.1Q) — 게임 쿼터 아님
  // 게임 쿼터 (1~4Q · 5 이상 연장) — 대회 로더만 채움.
  // 리그는 쿼터 개념을 쓰지 않으므로 미설정 → 쿼터 필터 UI 가 자동으로 숨겨진다.
  game_quarter?: number | null
  opponent_name?: string
  // 어시스트 (야투 성공 이벤트의 related_player_id 매핑, 자유투/앤드원은 항상 null)
  assist_player_id?: string | null
  assist_player_name?: string | null
  assist_player_number?: number | null
  // 클러치 여부 — 게임 종료(video_timestamp max) 기준 마지막 2분 & 슛 직전 |홈-원정| ≤ 3
  is_clutch?: boolean
  // 스코어보드용 (슛 직전/직후 팀 스코어) — 재생기 오버레이에서 표시
  score_home_before?: number
  score_away_before?: number
  score_home_after?: number
  score_away_after?: number
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

// 게임 쿼터 필터 옵션 (대회 전용) — 1~4Q · 5 이상 연장
export type HighlightGameQuarterOption = {
  quarter: number
  label: string   // "1Q" · "OT"
  count: number
}

export type PlayerHighlightsData = {
  player: PlayerHighlightsInfo
  clips: HighlightClip[]      // game_date desc → 같은 경기 내 video_timestamp asc
  quarters: HighlightQuarterOption[]
  shotTypes: HighlightShotTypeOption[]
}
