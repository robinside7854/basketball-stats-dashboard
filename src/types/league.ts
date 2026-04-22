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
  created_at: string
}

export interface LeagueTeamWithPlayers extends LeagueTeam {
  players: { league_player_id: string; player_name: string; player_number: number | null; position: string | null }[]
}

export interface LeagueGame {
  id: string
  league_id: string
  home_team_id: string
  away_team_id: string
  home_team?: LeagueTeam
  away_team?: LeagueTeam
  date: string
  round_num: number
  home_score: number
  away_score: number
  is_complete: boolean
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
