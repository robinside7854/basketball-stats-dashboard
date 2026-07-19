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
  is_guest?: boolean
  photo_url?: string | null
  original_photo_url?: string | null
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
  // 현재 진행 중인 streak — 최신 경기부터 역방향 walk, 같은 결과 연속 길이
  streak?: { type: 'W' | 'L' | 'D'; count: number } | null
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
  photo_url?: string | null
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
  fg2m: number; fg2a: number; fg2_pct: number  // 2점 야투 (계산값)
  fg3m: number; fg3a: number; fg3_pct: number
  ftm: number; fta: number; ft_pct: number
  efg_pct: number
  and_one: number  // 성공한 앤드원 횟수
  // 슛 분포 (존별 made/attempted)
  ds_a: number; ds_m: number   // 골밑슛 (Dunk Spot, shot_post)
  lu_a: number; lu_m: number   // 레이업 (shot_layup)
  md_a: number; md_m: number   // 미드레인지 (shot_2p_mid)
  // TRB% 계산용
  team_reb_in_games: number    // 본인 출전 경기의 본인 팀 총 리바운드
  // USG% 계산용
  team_poss_in_games: number   // 본인 출전 경기의 본인 팀 총 소유권 (FGA + 0.44×FTA + TOV)
  // Per-40 계산용
  minutes_played: number       // 본인 총 출전 시간 (분)
  // PIE (Player Impact Estimate · NBA 공식 지표) 재료 · Advanced 탭에서 pie_num/pie_denom×100 로 사용
  //   numerator: PTS+FGM+FTM−FGA−FTA+DREB+ORB/2+AST+STL+BLK/2−PF−TO
  //   denominator: 본인 출전 게임의 리그 전체(양팀) 총합
  pie_num: number
  pie_denom: number
  // On-court +/- (2026-07-19) — 본인 출전 구간 동안 우리팀/상대팀 득점 합
  //   plus_minus = oncourt_own − oncourt_opp
  //   폴백(교체 정보 없음) 케이스는 게임 공식 스코어 사용 → 편차 없음
  //   교체 있는 게임만 이벤트 walker (구간 매칭)
  oncourt_own: number
  oncourt_opp: number
  // On/Off 임팩트 (2026-07-19) — 팀 배정 기반 참여/불참 게임 비교
  //   on_off = (on_own − on_opp)/on_n − (off_own − off_opp)/off_n  · 팀 마진 On/Off 차이
  //   def_impact = off_opp/off_n − on_opp/on_n                     · 수비 임팩트 (양수 = 상대 실점 감소)
  on_own: number
  on_opp: number
  on_n_games: number
  off_own: number
  off_opp: number
  off_n_games: number
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
