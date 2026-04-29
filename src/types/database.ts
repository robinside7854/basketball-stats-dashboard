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
  game_score?: number
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

// ── Shot Zone (코트 구역) ──────────────────────────────────────
export type ShotZone =
  | 'paint'
  | 'mid_baseline_l' | 'mid_elbow_l' | 'mid_top' | 'mid_elbow_r' | 'mid_baseline_r'
  | '3p_corner_l' | '3p_wing_l' | '3p_top' | '3p_wing_r' | '3p_corner_r'

export const SHOT_ZONE_LABELS: Record<ShotZone, string> = {
  paint:           '페인트',
  mid_baseline_l:  '좌 베이스라인',
  mid_elbow_l:     '좌 엘보우',
  mid_top:         '자유투 라인',
  mid_elbow_r:     '우 엘보우',
  mid_baseline_r:  '우 베이스라인',
  '3p_corner_l':   '좌 코너 3',
  '3p_wing_l':     '좌 윙 3',
  '3p_top':        '탑 3',
  '3p_wing_r':     '우 윙 3',
  '3p_corner_r':   '우 코너 3',
}

// 미드/3P 슛은 5존 picker 대상; layup/post/drive는 'paint' 자동 추론
export const MID_ZONES: ShotZone[] = ['mid_baseline_l', 'mid_elbow_l', 'mid_top', 'mid_elbow_r', 'mid_baseline_r']
export const THREE_ZONES: ShotZone[] = ['3p_corner_l', '3p_wing_l', '3p_top', '3p_wing_r', '3p_corner_r']

// 슛 타입에서 자동 추론되는 존 (없으면 picker 또는 NULL)
export function inferShotZone(eventType: EventType): ShotZone | null {
  switch (eventType) {
    case 'shot_layup':
    case 'shot_post':
    case 'shot_2p_drive':
      return 'paint'
    default:
      return null
  }
}

// picker가 필요한 슛 타입
export function needsZonePicker(eventType: EventType): boolean {
  return eventType === 'shot_2p_mid' || eventType === 'shot_3p'
}

export function zonesFor(eventType: EventType): ShotZone[] {
  if (eventType === 'shot_2p_mid') return MID_ZONES
  if (eventType === 'shot_3p') return THREE_ZONES
  return []
}
