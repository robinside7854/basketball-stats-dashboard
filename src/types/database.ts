export type EventType =
  | 'shot_3p'
  | 'shot_2p_mid'
  | 'shot_2p_drive'
  | 'shot_layup'
  | 'shot_post'
  | 'free_throw'
  | 'oreb'
  | 'dreb'
  | 'assist'
  | 'steal'
  | 'block'
  | 'turnover'
  | 'foul'
  | 'opp_score'
  | 'sub_in'
  | 'sub_out'
  | 'quarter_start'
  | 'quarter_end'

export type EventResult = 'made' | 'missed'
export type TournamentType = 'pro' | 'amateur'
export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C' | ''

export interface Player {
  id: string
  number: string
  name: string
  position?: string
  birthdate?: string
  height_cm?: number
  weight_kg?: number
  is_pro?: boolean
  photo_url?: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export interface Tournament {
  id: string
  name: string
  year: number
  type: TournamentType
  description?: string
  created_at?: string
}

export interface Game {
  id: string
  tournament_id: string
  date: string
  opponent: string
  round?: string
  venue?: string
  youtube_url?: string
  youtube_start_offset: number
  our_score: number
  opponent_score: number
  is_complete: boolean
  notes?: string
  created_at?: string
  tournament?: Tournament
}

export interface TournamentPlayer {
  tournament_id: string
  player_id: string
}

export interface GameEvent {
  id: string
  game_id: string
  quarter: number
  video_timestamp?: number
  type: EventType
  player_id?: string
  result?: EventResult
  related_player_id?: string
  points: number
  notes?: string
  created_at?: string
  player?: Player
  related_player?: Player
}

export interface PlayerMinutes {
  id: string
  game_id: string
  player_id: string
  quarter: number
  in_time: number
  out_time?: number
  created_at?: string
}

// 박스스코어 집계 결과 타입
export interface PlayerBoxScore {
  player_id: string
  player_name: string
  player_number: string
  min: number
  pts: number
  fgm: number
  fga: number
  fg_pct: number
  fg3m: number
  fg3a: number
  fg3_pct: number
  ftm: number
  fta: number
  ft_pct: number
  oreb: number
  dreb: number
  reb: number
  ast: number
  stl: number
  blk: number
  tov: number
  pf: number
  plus_minus: number
  efg_pct: number
  ts_pct: number
  ast_tov: number
  double_double: boolean
  triple_double: boolean
  usg_pct?: number
}

export const EVENT_LABELS: Record<EventType, string> = {
  shot_3p: '3점슛',
  shot_2p_mid: '중거리 2점',
  shot_2p_drive: '드라이브',
  shot_layup: '레이업',
  shot_post: '골밑슛',
  free_throw: '자유투',
  oreb: '공격 리바운드',
  dreb: '수비 리바운드',
  assist: '어시스트',
  steal: '스틸',
  block: '블락',
  turnover: '턴오버',
  foul: '파울',
  opp_score: '상대팀 득점',
  sub_in: '교체 투입',
  sub_out: '교체 퇴장',
  quarter_start: '쿼터 시작',
  quarter_end: '쿼터 종료',
}

export const SHOT_EVENTS: EventType[] = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'free_throw']
export const SCORING_EVENTS: EventType[] = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'free_throw']
export const REBOUND_EVENTS: EventType[] = ['oreb', 'dreb']
export const SUB_EVENTS: EventType[] = ['sub_in', 'sub_out']
export const FLOW_EVENTS: EventType[] = ['quarter_start', 'quarter_end', 'sub_in', 'sub_out']
