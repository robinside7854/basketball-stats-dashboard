export interface League {
  id: string
  org_slug: string
  name: string
  season_year: number
  start_date: string
  match_day: string
  season_type: 'annual' | 'quarterly'
  total_rounds?: number
  games_per_round: number
  edit_pin?: string
  youtube_channel?: string | null
  plus_one_age?: number | null
  status: 'upcoming' | 'active' | 'completed'
  created_at: string
}

export interface LeagueTeam {
  id: string
  league_id: string
  name: string
  color: string
}

export interface LeaguePlayer {
  id: string
  league_id: string
  name: string
  number: number | null
  position: string | null
  birth_date: string | null
  plus_one: boolean
  photo_url?: string | null
  created_at: string
}

export interface LeagueTeamWithPlayers extends LeagueTeam {
  players: { league_player_id: string; player_name: string; player_number: number | null; position: string | null }[]
}

export interface LeagueGame {
  id: string
  league_id: string
  home_team_id: string | null
  away_team_id: string | null
  home_team?: LeagueTeam | null
  away_team?: LeagueTeam | null
  date: string
  round_num: number
  slot_num?: number
  home_score: number
  away_score: number
  is_complete: boolean
  is_started?: boolean
  is_exhibition?: boolean
  quarter_id?: string | null
  youtube_url?: string | null
  youtube_start_offset?: number
}

export interface LeagueScheduleDate {
  id: string
  league_id: string
  date: string
  created_at: string
}

export interface LeagueStanding {
  team: LeagueTeam
  played: number
  wins: number
  draws: number
  losses: number
  points: number
  goals_for: number
  goals_against: number
  goal_diff: number
}

export type Quarter = {
  id: string
  year: number
  quarter: number
  is_current: boolean
  start_date?: string | null
  end_date?: string | null
}

export type PlayerStat = {
  player_id: string
  name: string
  number: number | null
  position: string | null
  gp: number
  pts: number; ppg: number
  reb: number; rpg: number
  oreb: number; orp: number
  dreb: number; drp: number
  ast: number; apg: number
  stl: number; spg: number
  blk: number; bpg: number
  tov: number; topg: number
  pf: number
  fgm: number; fga: number; fg_pct: number
  fg3m: number; fg3a: number; fg3_pct: number
  ftm: number; fta: number; ft_pct: number
  efg_pct: number
  and_one: number  // 성공한 앤드원 횟수
}

export type QuarterPlayer = {
  id: string
  name: string
  number: number | null
  position: string | null
  is_regular: boolean
  team_id: string | null
  plus_one: boolean
}

export type Leader = {
  team_id: string
  leader_player_id: string | null
}
