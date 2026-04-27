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
